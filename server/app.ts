import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { z, ZodError } from 'zod';
import { CRITERIA, JUDGE_PERSONAS, type IdeaStatus, type Source, type SystemStatus, type WorkspaceBundle } from '../shared/types';
import type { AppConfig } from './config';
import { HttpError, getWorkspace, markStale, saveWorkspace, type Deps } from './pipeline/core';
import { JobRunner } from './pipeline/runner';
import { createWorkspace, summarise } from './services/workspaces';
import { answerTurn, finishSession, getSession, startSession } from './services/judge';
import { generateBlueprint } from './services/blueprint';
import { SourceBook } from './pipeline/core';
import { UnsafeUrlError } from './research/ssrf';
import { now } from './lib/ids';

const ID = z.string().regex(/^[a-z]+_[a-f0-9]{12}$/, 'Invalid id');

const configPatch = z.object({
  initialIdeas: z.number().int().min(3).max(40),
  shortlistSize: z.number().int().min(1).max(15),
  deepValidateCount: z.number().int().min(1).max(5),
  evolutionRounds: z.number().int().min(0).max(4),
  teamSize: z.number().int().min(1).max(12),
}).partial();

const createSchema = z.object({
  name: z.string().trim().max(120).optional(),
  url: z.string().trim().max(2000).optional(),
  manualText: z.string().max(60_000).optional(),
  config: configPatch.optional(),
  durationHours: z.number().positive().max(24 * 30).optional(),
  sponsors: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  demo: z.boolean().optional(),
});

const factStr = z.string().trim().max(500);
const strList = z.array(z.string().trim().min(1).max(600)).max(60);
const INTEL_FIELDS: Record<string, z.ZodType> = {
  name: factStr, objectives: strList, themes: strList, submissionRequirements: strList, restrictions: strList, mandatoryTech: strList,
  prizes: strList, organizers: strList, startDate: factStr, endDate: factStr, durationHours: z.number().positive().max(24 * 60),
  problemStatements: z.array(z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000), sponsor: z.string().max(100).optional() })).max(20),
  judgingCriteria: z.array(z.object({ name: z.string().trim().min(1).max(120), weight: z.number().min(0).max(100).nullable(), description: z.string().max(500).optional() })).max(15),
  sponsors: z.array(z.object({ name: z.string().trim().min(1).max(80), url: z.string().max(500).optional(), tier: z.string().max(40).optional() })).max(15),
};

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const wrap = (h: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(h(req, res)).catch(next);
};
const param = (req: Request, name: string) => {
  const r = ID.safeParse(req.params[name]);
  if (!r.success) throw new HttpError(400, `Invalid ${name}`);
  return r.data;
};

export function createApp(deps: Deps, cfg: AppConfig, runner = new JobRunner(deps)) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '300kb' }));

  const general = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false });
  const heavy = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, slow down.' } });
  app.use('/api', general);

  const api = express.Router();

  api.get('/status', wrap((_req, res) => {
    const llm = deps.engine.kind === 'llm';
    const notes: string[] = [];
    if (!llm) notes.push('No ANTHROPIC_API_KEY (or HACKMIND_FORCE_DEMO=1): using the deterministic heuristic engine. Research quality and idea depth are limited.');
    if (!cfg.tavilyApiKey && !cfg.braveApiKey) notes.push('No Tavily/Brave key: web search falls back to best-effort DuckDuckGo scraping.');
    const status: SystemStatus = {
      version: '1.0.0', engine: deps.engine.kind,
      llm: { configured: llm, provider: llm ? 'anthropic' : null, model: llm ? cfg.model : null },
      research: { providers: deps.research.status() }, demoMode: !llm, notes,
    };
    res.json(status);
  }));

  api.get('/workspaces', wrap((_req, res) => {
    res.json(deps.store.listAll('workspace').map((w) => summarise(deps, w)));
  }));

  api.post('/workspaces', heavy, wrap(async (req, res) => {
    const input = createSchema.parse(req.body);
    const ws = await createWorkspace(deps, input, cfg.allowPrivateFetch);
    res.status(201).json(bundle(ws.id));
  }));

  const bundle = (id: string): WorkspaceBundle => ({
    workspace: getWorkspace(deps, id),
    sources: deps.store.list('source', id),
    sponsors: deps.store.list('sponsor', id),
    opportunities: deps.store.list('opportunity', id),
    ideas: deps.store.list('idea', id),
    jobs: deps.store.list('job', id, { newestFirst: true, limit: 30 }),
  });

  api.get('/workspaces/:id', wrap((req, res) => res.json(bundle(param(req, 'id')))));

  api.patch('/workspaces/:id', wrap((req, res) => {
    const id = param(req, 'id');
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), config: configPatch.optional(), manualText: z.string().max(60_000).optional() }).parse(req.body);
    const ws = getWorkspace(deps, id);
    if (body.name) ws.name = body.name;
    if (body.config) ws.config = { ...ws.config, ...body.config };
    if (body.manualText !== undefined) ws.manualText = body.manualText.trim() || null;
    res.json(saveWorkspace(deps, ws));
  }));

  api.delete('/workspaces/:id', wrap((req, res) => {
    const id = param(req, 'id');
    getWorkspace(deps, id);
    if (runner.isBusy(id)) throw new HttpError(409, 'A job is running for this workspace.');
    deps.store.deleteWorkspace(id);
    res.status(204).end();
  }));

  api.post('/workspaces/:id/run', heavy, wrap(async (req, res) => {
    const id = param(req, 'id');
    const body = z.object({ stage: z.enum(['intel', 'sponsors', 'opportunities', 'ideas', 'evolve', 'validate', 'full']), wait: z.boolean().optional() }).parse(req.body);
    const { job, done } = runner.start(id, body.stage);
    if (body.wait) return res.status(200).json(await done);
    res.status(202).json(job);
  }));

  api.get('/workspaces/:id/jobs', wrap((req, res) => res.json(deps.store.list('job', param(req, 'id'), { newestFirst: true, limit: 50 }))));

  api.get('/workspaces/:id/events', wrap((req, res) => {
    const id = param(req, 'id');
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const all = deps.store.list('event', id);
    const after = typeof req.query.after === 'string' ? all.findIndex((e) => e.id === req.query.after) : -1;
    res.json((after >= 0 ? all.slice(after + 1) : all).slice(-limit));
  }));

  api.get('/workspaces/:id/events/stream', wrap((req, res) => {
    const id = param(req, 'id');
    getWorkspace(deps, id);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(': connected\n\n');
    const unsub = deps.bus.subscribe(id, (kind, payload) => res.write(`event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`));
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => { clearInterval(ping); unsub(); });
  }));

  api.put('/workspaces/:id/intel/:field', wrap((req, res) => {
    const id = param(req, 'id');
    const field = String(req.params.field);
    const schema = Object.hasOwn(INTEL_FIELDS, field) ? INTEL_FIELDS[field] : undefined;
    if (!schema) throw new HttpError(400, `Unknown intel field "${field}"`);
    const { value } = z.object({ value: z.unknown() }).parse(req.body);
    const ws = getWorkspace(deps, id);
    const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
    const parsed = empty ? null : schema.parse(value);
    (ws.intel as unknown as Record<string, unknown>)[field] = parsed === null
      ? { value: null, status: 'unavailable', sourceIds: [], note: 'Cleared by user' }
      : { value: parsed, status: 'verified', sourceIds: [], note: 'Entered by user' };
    markStale(ws, 'intel');
    res.json(saveWorkspace(deps, ws));
  }));

  api.get('/workspaces/:id/sources', wrap((req, res) => res.json(deps.store.list('source', param(req, 'id')))));

  api.post('/workspaces/:id/sources', heavy, wrap(async (req, res) => {
    const id = param(req, 'id');
    getWorkspace(deps, id);
    const body = z.object({ url: z.string().trim().max(2000).optional(), title: z.string().trim().max(200).optional(), text: z.string().max(100_000).optional() }).parse(req.body);
    const book = new SourceBook(deps, id);
    let src: Source;
    if (body.url) {
      try {
        const page = await deps.research.fetchPage(body.url);
        if (!page) throw new HttpError(422, 'The page could not be retrieved (not found, not text/HTML, or blocked).');
        src = book.add({ url: page.url, title: body.title || page.title || page.url, kind: 'web', provider: 'fetch', snippet: page.description || page.text.slice(0, 300), content: page.text });
      } catch (e) {
        if (e instanceof UnsafeUrlError) throw new HttpError(400, `URL not allowed: ${e.message}`);
        throw e;
      }
    } else if (body.text?.trim()) {
      src = book.add({ url: `manual://${id}/${Date.now()}`, title: body.title || 'Pasted note', kind: 'manual', provider: 'manual', content: body.text });
    } else {
      throw new HttpError(400, 'Provide a url or text');
    }
    res.status(201).json(src);
  }));

  const ideaOf = (wsId: string, ideaId: string) => {
    const idea = deps.store.get('idea', ideaId);
    if (!idea || idea.workspaceId !== wsId) throw new HttpError(404, 'Idea not found');
    return idea;
  };

  api.get('/workspaces/:id/ideas/:ideaId', wrap((req, res) => {
    const id = param(req, 'id');
    const idea = ideaOf(id, param(req, 'ideaId'));
    const claims = deps.store.list('claim', id).filter((c) => c.ideaId === idea.id);
    const evidence = deps.store.list('evidence', id).filter((e) => e.ideaId === idea.id);
    const ids = new Set<string>([
      ...claims.flatMap((c) => c.sourceIds), ...evidence.flatMap((e) => (e.sourceId ? [e.sourceId] : [])),
      ...idea.alternatives.flatMap((a) => a.sourceIds), ...idea.supportingResearch.flatMap((s) => s.sourceIds),
      ...CRITERIA.flatMap((c) => idea.scores?.criteria[c].evidenceIds ?? []),
    ]);
    res.json({ idea, claims, evidence, sources: deps.store.list('source', id).filter((s) => ids.has(s.id)) });
  }));

  api.patch('/workspaces/:id/ideas/:ideaId', wrap((req, res) => {
    const id = param(req, 'id');
    const idea = ideaOf(id, param(req, 'ideaId'));
    const { status } = z.object({ status: z.enum(['shortlisted', 'eliminated', 'generated']) }).parse(req.body);
    idea.status = status as IdeaStatus;
    idea.eliminatedReason = status === 'eliminated' ? 'Eliminated manually.' : null;
    idea.updatedAt = now();
    const ws = getWorkspace(deps, id);
    if (status === 'eliminated' && ws.recommendedIdeaId === idea.id) { ws.recommendedIdeaId = null; saveWorkspace(deps, ws); }
    res.json(deps.store.put('idea', id, idea.id, idea));
  }));

  api.post('/workspaces/:id/ideas/:ideaId/validate', heavy, wrap((req, res) => {
    const id = param(req, 'id');
    const idea = ideaOf(id, param(req, 'ideaId'));
    const { job } = runner.start(id, 'validate', { ideaId: idea.id });
    res.status(202).json(job);
  }));

  api.post('/workspaces/:id/ideas/:ideaId/recommend', wrap((req, res) => {
    const id = param(req, 'id');
    const idea = ideaOf(id, param(req, 'ideaId'));
    for (const i of deps.store.list('idea', id)) if (i.status === 'recommended' && i.id !== idea.id) deps.store.put('idea', id, i.id, { ...i, status: 'validated', recommendationRationale: null });
    deps.store.put('idea', id, idea.id, { ...idea, status: 'recommended', recommendationRationale: idea.recommendationRationale ?? 'Selected manually by the user.' });
    const ws = getWorkspace(deps, id);
    ws.recommendedIdeaId = idea.id;
    res.json(saveWorkspace(deps, ws));
  }));

  api.get('/workspaces/:id/ideas/:ideaId/judge', wrap((req, res) => {
    const id = param(req, 'id');
    const ideaId = param(req, 'ideaId');
    res.json(deps.store.list('judge', id, { newestFirst: true }).filter((s) => s.ideaId === ideaId));
  }));

  api.post('/workspaces/:id/ideas/:ideaId/judge', heavy, wrap(async (req, res) => {
    const id = param(req, 'id');
    const body = z.object({ personas: z.array(z.enum(JUDGE_PERSONAS)).max(6).optional(), maxFollowUps: z.number().int().min(0).max(3).optional() }).parse(req.body ?? {});
    res.status(201).json(await startSession(deps, id, param(req, 'ideaId'), body.personas, body.maxFollowUps));
  }));

  api.get('/workspaces/:id/judge/:sessionId', wrap((req, res) => res.json(getSession(deps, param(req, 'id'), param(req, 'sessionId')))));

  api.post('/workspaces/:id/judge/:sessionId/answer', heavy, wrap(async (req, res) => {
    const body = z.object({ turnId: z.string().min(3).max(40), answer: z.string().trim().min(1).max(5000) }).parse(req.body);
    res.json(await answerTurn(deps, param(req, 'id'), param(req, 'sessionId'), body.turnId, body.answer));
  }));

  api.post('/workspaces/:id/judge/:sessionId/finish', heavy, wrap(async (req, res) => {
    res.json(await finishSession(deps, param(req, 'id'), param(req, 'sessionId')));
  }));

  api.post('/workspaces/:id/ideas/:ideaId/blueprint', heavy, wrap(async (req, res) => {
    const body = z.object({ hours: z.number().positive().max(24 * 30).optional(), teamSize: z.number().int().min(1).max(12).optional() }).parse(req.body ?? {});
    res.status(201).json(await generateBlueprint(deps, param(req, 'id'), param(req, 'ideaId'), body));
  }));

  const bpOf = (wsId: string, ideaId: string) => {
    const bp = deps.store.list('blueprint', wsId).find((b) => b.ideaId === ideaId);
    if (!bp) throw new HttpError(404, 'No blueprint generated for this idea yet');
    return bp;
  };
  api.get('/workspaces/:id/ideas/:ideaId/blueprint', wrap((req, res) => res.json(bpOf(param(req, 'id'), param(req, 'ideaId')))));
  api.get('/workspaces/:id/ideas/:ideaId/blueprint.md', wrap((req, res) => {
    const bp = bpOf(param(req, 'id'), param(req, 'ideaId'));
    res.setHeader('content-type', 'text/markdown; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="hackmind-blueprint.md"');
    res.send(bp.markdown);
  }));

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use('/api', api);

  // Static client in production
  const dist = path.resolve('dist');
  if (cfg.isProduction && fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if ((err as { type?: string }).type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Malformed JSON' });
    console.error('[hackmind] unhandled', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return { app, runner };
}
