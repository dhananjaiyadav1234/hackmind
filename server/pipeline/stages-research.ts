import type { Fact, HackathonIntel, Opportunity, SourceKind, SponsorProfile, SponsorRef, Workspace } from '../../shared/types';
import type { IntelDraft, PageText, TopicResearch } from '../agents/engine';
import { containsQuote, keyTerms } from '../agents/heuristic/text';
import { DEMO_SPONSOR_URLS } from '../research/demo';
import { UnsafeUrlError } from '../research/ssrf';
import { now, uid } from '../lib/ids';
import { HttpError, SourceBook, getWorkspace, mapLimit, markStale, saveWorkspace, type StageCtx } from './core';

interface PageRef extends PageText {
  kind: SourceKind;
}

const USER_NOTE = 'Entered by user';
const isUserFact = (f: Fact<unknown>) => f.note?.startsWith(USER_NOTE) ?? false;

function buildFact<T>(value: T | null, quotes: string[] | undefined, pages: PageRef[], computedNote?: string): Fact<T> {
  const empty = value === null || (Array.isArray(value) && value.length === 0) || value === '';
  if (empty) return { value: null, status: 'unavailable', sourceIds: [], note: 'Not found in the available sources.' };
  const matched = pages.filter((p) => (quotes ?? []).some((q) => containsQuote(p.text, q)));
  if (matched.length) {
    const manual = matched.every((p) => p.kind === 'manual');
    return { value, status: 'verified', sourceIds: matched.map((p) => p.sourceId), note: manual ? 'Provided by the user (manual entry).' : undefined };
  }
  return { value, status: 'assumed', sourceIds: [], note: computedNote ?? 'Inferred — no verbatim supporting text found in the sources. Verify manually.' };
}

export function applyIntelDraft(ws: Workspace, draft: IntelDraft, pages: PageRef[]): void {
  const next = ws.intel;
  const q = draft.quotes;
  const keep = <K extends keyof HackathonIntel>(key: K, fact: HackathonIntel[K]) => {
    if (!isUserFact(next[key] as Fact<unknown>)) next[key] = fact;
  };
  keep('name', buildFact(draft.name, q.name, pages));
  keep('objectives', buildFact(draft.objectives, q.objectives, pages));
  keep('themes', buildFact(draft.themes, q.themes, pages));
  keep('problemStatements', buildFact(draft.problemStatements, q.problemStatements, pages));
  keep('judgingCriteria', buildFact(draft.judgingCriteria, q.judgingCriteria, pages));
  keep('submissionRequirements', buildFact(draft.submissionRequirements, q.submissionRequirements, pages));
  keep('restrictions', buildFact(draft.restrictions, q.restrictions, pages));
  keep('mandatoryTech', buildFact(draft.mandatoryTech, q.mandatoryTech, pages));
  keep('prizes', buildFact(draft.prizes, q.prizes, pages));
  keep('startDate', buildFact(draft.startDate, q.startDate, pages));
  keep('endDate', buildFact(draft.endDate, q.endDate, pages));
  keep('durationHours', buildFact(draft.durationHours, q.durationHours, pages, 'Computed from the start and end dates.'));
  keep('organizers', buildFact(draft.organizers, q.organizers, pages));
  keep('sponsors', buildFact(draft.sponsors, q.sponsors, pages));
}

// ───────────────────────── Stage 1: intel ─────────────────────────

const RELEVANT_LINK = /rules|judg|criteria|prize|faq|track|challenge|sponsor|schedule|requirements|resources/i;

export async function runIntel(ctx: StageCtx): Promise<string> {
  const { deps, wsId, log } = ctx;
  const ws = getWorkspace(deps, wsId);
  const book = new SourceBook(deps, wsId);
  const pages: PageRef[] = [];

  if (ws.url) {
    log('Intel Analyst', `Fetching ${ws.url}`);
    try {
      const page = await ctx.research.fetchPage(ws.url);
      if (page) {
        const demo = ws.mode === 'demo' || page.url.startsWith('demo://');
        const src = book.add({ url: page.url, title: page.title || ws.name, kind: demo ? 'demo' : 'web', provider: demo ? 'demo-fixture' : 'fetch', snippet: page.description || page.text.slice(0, 300), content: page.text });
        pages.push({ sourceId: src.id, url: src.url, title: src.title, text: page.text, kind: src.kind });
        // follow a few same-site links that look like rules/judging pages
        const host = new URL(page.url, 'http://x').host;
        const follow = page.links.filter((l) => RELEVANT_LINK.test(`${l.text} ${l.href}`) && safeHost(l.href) === host && l.href !== page.url).slice(0, 3);
        for (const l of follow) {
          try {
            const sub = await ctx.research.fetchPage(l.href);
            if (!sub) continue;
            const s = book.add({ url: sub.url, title: sub.title || l.text, kind: 'web', provider: 'fetch', snippet: sub.text.slice(0, 300), content: sub.text });
            pages.push({ sourceId: s.id, url: s.url, title: s.title, text: sub.text, kind: 'web' });
            log('Intel Analyst', `Also read ${l.text || l.href}`);
          } catch {
            /* optional pages */
          }
        }
      } else {
        log('Intel Analyst', `Could not retrieve ${ws.url} (page unavailable or not HTML).`, 'warn');
      }
    } catch (e) {
      const msg = e instanceof UnsafeUrlError ? `URL rejected by safety checks: ${e.message}` : `Fetch failed: ${(e as Error).message}`;
      log('Intel Analyst', msg, 'warn');
    }
    for (const w of ctx.research.drainWarnings()) log('Research', w, 'warn');
  }
  if (ws.manualText) {
    const src = book.add({ url: `manual://${wsId}/hackathon-info`, title: 'Manual hackathon information', kind: 'manual', provider: 'manual', content: ws.manualText });
    pages.push({ sourceId: src.id, url: src.url, title: src.title, text: ws.manualText, kind: 'manual' });
  }
  // user-added sources are also context
  for (const s of book.all()) if (s.kind === 'manual' && !pages.some((p) => p.sourceId === s.id) && !s.url.endsWith('/hackathon-info')) {
    pages.push({ sourceId: s.id, url: s.url, title: s.title, text: s.content, kind: 'manual' });
  }
  if (!pages.length) throw new HttpError(422, 'No usable hackathon information: the URL could not be read and no manual text was provided. Add a URL or paste the hackathon details.');

  log(deps.engine.label, `Extracting hackathon intelligence from ${pages.length} source(s)…`);
  const hint = (ws.intel.sponsors.value ?? []).map((s) => s.name);
  const draft = await deps.engine.extractIntel({ workspace: ws, pages, manualText: null, hintSponsors: hint });
  // re-read workspace: it may have been edited meanwhile
  const fresh = getWorkspace(deps, wsId);
  applyIntelDraft(fresh, draft, pages);
  if (draft.name && /^(untitled|new hackathon)/i.test(fresh.name)) fresh.name = draft.name;
  markStale(fresh, 'intel');
  saveWorkspace(deps, fresh);

  const facts = Object.values(fresh.intel) as Fact<unknown>[];
  const v = facts.filter((f) => f.status === 'verified').length;
  const a = facts.filter((f) => f.status === 'assumed').length;
  const u = facts.filter((f) => f.status === 'unavailable').length;
  log('Intel Analyst', `Intel built: ${v} verified, ${a} assumed, ${u} unavailable fields.`, 'success');
  return `${v} verified · ${a} assumed · ${u} unavailable`;
}

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return '';
  }
}

// ───────────────────────── Stage 2: sponsors ─────────────────────────

async function sponsorPages(ctx: StageCtx, ws: Workspace, sponsor: SponsorRef, book: SourceBook): Promise<PageRef[]> {
  const out: PageRef[] = [];
  const urls: string[] = [];
  let hits: { title: string; url: string; snippet: string }[] = [];
  if (sponsor.url) urls.push(sponsor.url);
  if (ws.mode === 'demo') {
    const u = DEMO_SPONSOR_URLS[sponsor.name.toLowerCase()];
    if (u) urls.push(u);
  } else {
    hits = await ctx.research.webSearch(`${sponsor.name} developer platform documentation API`, 5);
    urls.push(...hits.filter((h) => !/linkedin|facebook|twitter|x\.com|youtube|wikipedia/i.test(h.url)).slice(0, 3).map((h) => h.url));
  }
  for (const url of [...new Set(urls)].slice(0, 4)) {
    try {
      const page = await ctx.research.fetchPage(url);
      if (!page) continue;
      const demo = url.startsWith('demo://');
      const kind: SourceKind = demo ? 'demo' : /docs?\.|\/docs|developer/i.test(url) ? 'docs' : 'web';
      const s = book.add({ url: page.url, title: page.title || sponsor.name, kind, provider: demo ? 'demo-fixture' : 'fetch', snippet: page.description || page.text.slice(0, 300), content: page.text });
      out.push({ sourceId: s.id, url: s.url, title: s.title, text: page.text, kind });
      // follow doc links a bit (demo fixtures included)
      for (const l of page.links.filter((l) => /doc|quickstart|guide|api/i.test(`${l.text} ${l.href}`)).slice(0, 2)) {
        try {
          const sub = await ctx.research.fetchPage(l.href);
          if (sub) {
            const ss = book.add({ url: sub.url, title: sub.title || l.text, kind: 'docs', provider: sub.url.startsWith('demo://') ? 'demo-fixture' : 'fetch', content: sub.text });
            out.push({ sourceId: ss.id, url: ss.url, title: ss.title, text: sub.text, kind: 'docs' });
          }
        } catch {
          /* optional */
        }
      }
    } catch (e) {
      ctx.log('Sponsor Analyst', `Skipped ${url}: ${(e as Error).message}`, 'warn');
    }
  }
  // snippet-only context from search hits we did not fetch
  for (const h of hits.slice(0, 3)) {
    if (out.some((p) => p.url === h.url)) continue;
    const s = book.add({ url: h.url, title: h.title, kind: 'web', provider: 'search', snippet: h.snippet, content: h.snippet });
    out.push({ sourceId: s.id, url: s.url, title: s.title, text: `${h.title}\n${h.snippet}`, kind: 'web' });
  }
  return out;
}

export async function runSponsors(ctx: StageCtx): Promise<string> {
  const { deps, wsId, log, progress } = ctx;
  const ws = getWorkspace(deps, wsId);
  const sponsors = (ws.intel.sponsors.value ?? []).slice(0, 8);
  deps.store.deleteKind('sponsor', wsId);
  if (!sponsors.length) {
    log('Sponsor Analyst', 'No sponsors identified in the hackathon intel. Add sponsors on the Intelligence page and re-run.', 'warn');
    return 'No sponsors identified';
  }
  const book = new SourceBook(deps, wsId);
  let done = 0;
  await mapLimit(sponsors, 3, async (sp) => {
    log('Sponsor Analyst', `Researching ${sp.name}…`);
    const pages = await sponsorPages(ctx, ws, sp, book);
    const draft = await deps.engine.profileSponsor({ workspace: ws, sponsor: sp, pages });
    const sourceIds = pages.map((p) => p.sourceId);
    const status: SponsorProfile['status'] = pages.length === 0 ? 'unavailable' : draft.products.length ? 'researched' : 'partial';
    const profile: SponsorProfile = {
      id: uid('sp'), workspaceId: wsId, name: sp.name, website: sp.url ?? pages[0]?.url, status,
      summary: draft.summary || (pages.length ? '' : 'No information could be retrieved.'),
      products: draft.products, techEcosystem: draft.techEcosystem, devTools: draft.devTools, apis: draft.apis, docs: draft.docs, latest: draft.latest,
      previousHackathons: draft.previousHackathons.map((p) => ({ note: p.note, sourceIds })),
      opportunities: draft.opportunities.map((o) => ({ ...o, sourceIds })),
      gaps: draft.gaps, sourceIds, engine: deps.engine.kind, updatedAt: now(),
    };
    deps.store.put('sponsor', wsId, profile.id, profile);
    progress(++done, sponsors.length, `Sponsor ${sp.name}`);
    log('Sponsor Analyst', `${sp.name}: ${status}, ${profile.opportunities.length} integration opportunit${profile.opportunities.length === 1 ? 'y' : 'ies'}.`, status === 'unavailable' ? 'warn' : 'success');
  });
  for (const w of ctx.research.drainWarnings()) log('Research', w, 'warn');
  const fresh = getWorkspace(deps, wsId);
  markStale(fresh, 'sponsors');
  saveWorkspace(deps, fresh);
  return `${sponsors.length} sponsors profiled`;
}

// ───────────────────────── Stage 3: opportunities ─────────────────────────

export async function runOpportunities(ctx: StageCtx): Promise<string> {
  const { deps, wsId, log, progress } = ctx;
  const ws = getWorkspace(deps, wsId);
  const problems = ws.intel.problemStatements.value ?? [];
  const topics = problems.length
    ? problems.slice(0, 5).map((p) => ({ topic: p.title, description: p.description, sponsor: p.sponsor }))
    : (ws.intel.themes.value ?? []).slice(0, 5).map((t) => ({ topic: t, description: `Theme: ${t}`, sponsor: undefined }));
  if (!topics.length) throw new HttpError(422, 'No problem statements or themes available. Run Hackathon Intelligence first or add them manually.');

  const book = new SourceBook(deps, wsId);
  let done = 0;
  const research: TopicResearch[] = await mapLimit(topics, 2, async (t) => {
    log('Opportunity Researcher', `Investigating “${t.topic}”…`);
    const terms = keyTerms(`${t.topic} ${t.description}`, 6).join(' ');
    const [web, repos, papers] = await Promise.all([
      ctx.research.webSearch(`${t.topic} existing solutions tools`, 6),
      ctx.research.repoSearch(terms || t.topic, 4),
      ctx.research.paperSearch(terms || t.topic, 3),
    ]);
    const reg = (h: (typeof web)[number], kind: SourceKind) =>
      book.add({ url: h.url, title: h.title, kind, provider: h.provider, snippet: h.snippet, content: `${h.title}\n${h.snippet}`, meta: h.meta });
    const r: TopicResearch = {
      topic: t.topic, description: t.description, sponsor: t.sponsor,
      web: web.map((h) => ({ sourceId: reg(h, h.provider === 'demo-fixture' ? 'demo' : 'web').id, title: h.title, url: h.url, snippet: h.snippet })),
      repos: repos.map((h) => ({ sourceId: reg(h, h.provider === 'demo-fixture' ? 'demo' : 'repo').id, title: h.title, url: h.url, snippet: h.snippet, stars: typeof h.meta?.stars === 'number' ? h.meta.stars : undefined })),
      papers: papers.map((h) => ({ sourceId: reg(h, 'paper').id, title: h.title, url: h.url, snippet: h.snippet, authors: String(h.meta?.authors ?? ''), year: String(h.meta?.year ?? '') })),
    };
    progress(++done, topics.length, `Researched ${t.topic}`);
    log('Opportunity Researcher', `“${t.topic}”: ${r.web.length} web, ${r.repos.length} repos, ${r.papers.length} papers.`);
    return r;
  });
  for (const w of ctx.research.drainWarnings()) log('Research', w, 'warn');

  const sponsors = deps.store.list('sponsor', wsId);
  const drafts = await deps.engine.discoverOpportunities({ workspace: ws, sponsors, research });
  deps.store.deleteKind('opportunity', wsId);
  for (const d of drafts) {
    const o: Opportunity = { ...d, id: uid('opp'), workspaceId: wsId, engine: deps.engine.kind };
    deps.store.put('opportunity', wsId, o.id, o);
  }
  const fresh = getWorkspace(deps, wsId);
  markStale(fresh, 'opportunities');
  saveWorkspace(deps, fresh);
  log('Opportunity Researcher', `${drafts.length} opportunity areas mapped.`, 'success');
  const none = research.every((r) => !r.web.length && !r.repos.length && !r.papers.length);
  if (none) log('Opportunity Researcher', 'No external research results were retrieved (offline or no providers). Competitor lists are empty — nothing was invented.', 'warn');
  return `${drafts.length} opportunities${none ? ' (no external results)' : ''}`;
}
