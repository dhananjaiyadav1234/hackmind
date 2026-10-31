import {
  CRITERIA, type Claim, type Critique, type EvidenceItem, type Idea, type IdeaTier, type Revision, type ScoreCard, type Workspace,
} from '../../shared/types';
import { applyEvidenceAdjustments, buildScoreCard, deriveWeights, evidenceCoverage } from '../../shared/scoring';
import { CRITIC_AGENTS, type IdeaDraft, type ScoreDraft } from '../agents/engine';
import { keyTerms } from '../agents/heuristic/text';
import { now, uid } from '../lib/ids';
import { HttpError, SourceBook, getWorkspace, mapLimit, markStale, saveWorkspace, sortIdeas, type Deps, type StageCtx } from './core';

export function workspaceWeights(ws: Workspace) {
  const f = ws.intel.judgingCriteria;
  return deriveWeights(f.value, f.status === 'verified');
}

function toCard(ws: Workspace, draft: ScoreDraft, basis: ScoreCard['basis'], scoredBy: string): ScoreCard {
  const { weights, basis: weightBasis } = workspaceWeights(ws);
  return buildScoreCard({ criteria: draft, weights, weightBasis, basis, scoredBy });
}

function ideaScoreContext(deps: Deps, wsId: string) {
  return { sponsors: deps.store.list('sponsor', wsId), opportunities: deps.store.list('opportunity', wsId) };
}

function deleteIdeaScoped(deps: Deps, wsId: string): void {
  for (const k of ['idea', 'claim', 'evidence', 'judge', 'blueprint'] as const) deps.store.deleteKind(k, wsId);
}

// ───────────────────────── Stage 4: generate + rank ─────────────────────────

export function tierCounts(n: number): Record<IdeaTier, number> {
  const safe = Math.ceil(n * 0.4);
  const innovative = Math.ceil(n * 0.4);
  return { safe, innovative, moonshot: Math.max(0, n - safe - innovative) };
}

export async function runIdeas(ctx: StageCtx): Promise<string> {
  const { deps, wsId, log, progress } = ctx;
  const ws = getWorkspace(deps, wsId);
  const { sponsors, opportunities } = ideaScoreContext(deps, wsId);
  const hasContext = !!(ws.intel.problemStatements.value?.length || ws.intel.themes.value?.length || ws.manualText || ws.intel.objectives.value?.length);
  if (!hasContext) throw new HttpError(422, 'No hackathon context available. Run Hackathon Intelligence (or enter themes/problem statements) first.');

  const counts = tierCounts(ws.config.initialIdeas);
  const agents: Record<IdeaTier, string> = { safe: 'Safe-Winner Strategist', innovative: 'Innovation Agent', moonshot: 'Moonshot Architect' };
  const drafts: { tier: IdeaTier; agent: string; d: IdeaDraft }[] = [];
  const seenTitles: string[] = [];
  let tierIdx = 0;
  for (const tier of ['safe', 'innovative', 'moonshot'] as IdeaTier[]) {
    if (!counts[tier]) continue;
    log(agents[tier], `Generating ${counts[tier]} ${tier} idea(s)…`);
    const out = await deps.engine.generateIdeas({ workspace: ws, sponsors, opportunities, tier, count: counts[tier], existingTitles: [...seenTitles], agent: agents[tier], batchIndex: tierIdx++ });
    for (const d of out) {
      if (seenTitles.some((t) => t.toLowerCase() === d.title.toLowerCase())) continue;
      seenTitles.push(d.title);
      drafts.push({ tier, agent: agents[tier], d: { ...d, tier } });
    }
    log(agents[tier], `${out.length} ${tier} idea(s) drafted.`, 'success');
    progress(tierIdx, 3, `Generated ${tier}`);
  }
  if (!drafts.length) throw new HttpError(502, 'The idea generator returned no usable ideas.');

  deleteIdeaScoped(deps, wsId);
  const ts = now();
  const ideas: Idea[] = drafts.map(({ agent, d }) => ({
    ...d, id: uid('idea'), workspaceId: wsId, status: 'generated', scores: null, version: 1, revisions: [], rank: null,
    eliminatedReason: null, recommendationRationale: null, generatedBy: agent, engine: deps.engine.kind, createdAt: ts, updatedAt: ts,
  }));

  log('Judging Evaluator', `Scoring ${ideas.length} ideas against the ${workspaceWeights(ws).basis.startsWith('Official') ? 'official' : 'default'} criteria…`);
  const scoreDrafts = await deps.engine.scoreIdeas({ workspace: ws, sponsors, opportunities, ideas, weights: workspaceWeights(ws).weights });
  for (const idea of ideas) {
    const sd = scoreDrafts[idea.id];
    if (sd) idea.scores = toCard(ws, sd, 'initial', deps.engine.label);
  }
  rankAndShortlist(ideas, ws.config.shortlistSize);
  for (const i of ideas) deps.store.put('idea', wsId, i.id, i);

  const fresh = getWorkspace(deps, wsId);
  fresh.recommendedIdeaId = null;
  markStale(fresh, 'ideas');
  saveWorkspace(deps, fresh);
  const short = ideas.filter((i) => i.status === 'shortlisted');
  log('Judging Evaluator', `Ranked ${ideas.length} ideas; shortlisted ${short.length}: ${short.slice(0, 3).map((i) => i.title).join(' · ')}…`, 'success');
  return `${ideas.length} ideas · ${short.length} shortlisted`;
}

/** Rank by score; shortlist top K with at least one per tier when available; others marked eliminated with a reason. */
export function rankAndShortlist(ideas: Idea[], k: number): void {
  const sorted = sortIdeas(ideas);
  const picked = new Set(sorted.slice(0, k).map((i) => i.id));
  if (k >= 3) {
    for (const tier of ['safe', 'innovative', 'moonshot'] as IdeaTier[]) {
      if ([...picked].some((id) => ideas.find((i) => i.id === id)?.tier === tier)) continue;
      const best = sorted.find((i) => i.tier === tier);
      if (!best) continue;
      const lowest = [...picked].map((id) => ideas.find((i) => i.id === id)!).sort((a, b) => (a.scores?.total ?? 0) - (b.scores?.total ?? 0))[0];
      picked.delete(lowest.id);
      picked.add(best.id);
    }
  }
  const cut = sorted.filter((i) => picked.has(i.id)).map((i) => i.scores?.total ?? 0);
  const cutScore = cut.length ? Math.min(...cut) : 0;
  sorted.forEach((idea, idx) => {
    idea.rank = idx + 1;
    if (picked.has(idea.id)) {
      idea.status = 'shortlisted';
      idea.eliminatedReason = null;
    } else {
      idea.status = 'eliminated';
      idea.eliminatedReason = `Ranked #${idx + 1} of ${ideas.length} (score ${(idea.scores?.total ?? 0).toFixed(1)} vs shortlist cut ${cutScore.toFixed(1)}). You can restore it manually.`;
    }
  });
}

// ───────────────────────── Stage 5: evolution ─────────────────────────

const PATCHABLE = ['title', 'pitch', 'problem', 'audience', 'solution', 'differentiation', 'alternatives', 'sponsorIntegration', 'architecture', 'stack', 'mvpFeatures', 'stretchGoals', 'feasibility', 'risks', 'complexity', 'judgingAppeal'] as const;

const brief = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 240 ? `${s.slice(0, 239)}…` : s;
};

export async function runEvolve(ctx: StageCtx): Promise<string> {
  const { deps, wsId, log, progress } = ctx;
  const ws = getWorkspace(deps, wsId);
  const { sponsors, opportunities } = ideaScoreContext(deps, wsId);
  let ideas = deps.store.list('idea', wsId).filter((i) => i.status === 'shortlisted' || i.status === 'validated' || i.status === 'recommended');
  if (!ideas.length) throw new HttpError(422, 'No shortlisted ideas. Run Idea Generation first.');
  const rounds = ws.config.evolutionRounds;
  if (rounds < 1) return 'Evolution disabled (0 rounds)';
  const weights = workspaceWeights(ws).weights;
  let totalDelta = 0;

  for (let round = 1; round <= rounds; round++) {
    log('Idea Evolver', `Round ${round}/${rounds}: critiquing ${ideas.length} idea(s)…`);
    await mapLimit(ideas, 3, async (idea) => {
      const critiques: Critique[] = (
        await Promise.all(CRITIC_AGENTS.map((critic) => deps.engine.critiqueIdea({ workspace: ws, sponsors, opportunities, idea, critic })))
      ).flat();
      const serious = critiques.filter((c) => c.severity !== 'low');
      log('Critics', `“${idea.title}”: ${critiques.length} critique(s), ${serious.length} serious.`);

      const rev = await deps.engine.reviseIdea({ workspace: ws, sponsors, idea, critiques, round });
      const changes: Revision['changes'] = [];
      const next: Idea = { ...idea };
      for (const key of PATCHABLE) {
        const val = (rev.patch as Record<string, unknown>)[key];
        if (val === undefined || val === null) continue;
        if (JSON.stringify(val) === JSON.stringify(idea[key])) continue;
        (next as unknown as Record<string, unknown>)[key] = val;
        changes.push({ field: key, before: brief(idea[key]), after: brief(val), reason: rev.reasons[key] ?? rev.summary });
      }
      const before = idea.scores?.total ?? null;
      if (changes.length) {
        const sd = (await deps.engine.scoreIdeas({ workspace: ws, sponsors, opportunities, ideas: [next], weights }))[idea.id];
        if (sd) next.scores = toCard(ws, sd, 'evolved', deps.engine.label);
        next.version = idea.version + 1;
      }
      const revision: Revision = {
        id: uid('rev'), round, version: next.version, at: now(), critiques, changes, scoreBefore: before, scoreAfter: next.scores?.total ?? before,
        summary: rev.summary, agent: 'Idea Evolver',
      };
      next.revisions = [...idea.revisions, revision];
      next.updatedAt = now();
      deps.store.put('idea', wsId, next.id, next);
      if (changes.length && before !== null && next.scores) totalDelta += next.scores.total - before;
      log('Idea Evolver', `“${next.title}” v${next.version}: ${changes.length} change(s)${before !== null && next.scores ? `, score ${before.toFixed(1)} → ${next.scores.total.toFixed(1)}` : ''}.`, changes.length ? 'success' : 'info');
    });
    ideas = deps.store.list('idea', wsId).filter((i) => ideas.some((x) => x.id === i.id));
    progress(round, rounds, `Evolution round ${round}`);
  }

  // re-rank all ideas by current score, keep statuses
  const all = deps.store.list('idea', wsId);
  sortIdeas(all).forEach((i, idx) => deps.store.put('idea', wsId, i.id, { ...i, rank: idx + 1 }));
  const fresh = getWorkspace(deps, wsId);
  markStale(fresh, 'evolve');
  saveWorkspace(deps, fresh);
  return `${ideas.length} ideas evolved over ${rounds} round(s); net score change ${totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(1)}`;
}

// ───────────────────────── Stage 6: deep validation ─────────────────────────

export async function validateIdea(ctx: StageCtx, ideaId: string, book: SourceBook): Promise<void> {
  const { deps, wsId, log } = ctx;
  const ws = getWorkspace(deps, wsId);
  const idea0 = deps.store.get('idea', ideaId);
  if (!idea0 || idea0.workspaceId !== wsId) throw new HttpError(404, 'Idea not found');
  const sponsors = deps.store.list('sponsor', wsId);
  log('Validation Lead', `Deep-validating “${idea0.title}”…`);

  // wipe prior validation artefacts for this idea
  for (const c of deps.store.list('claim', wsId).filter((c) => c.ideaId === ideaId)) deps.store.delete('claim', c.id);
  for (const e of deps.store.list('evidence', wsId).filter((e) => e.ideaId === ideaId)) deps.store.delete('evidence', e.id);

  const plan = await deps.engine.planValidationResearch({ workspace: ws, idea: idea0 });
  const evidence: EvidenceItem[] = [];
  const addEvidence = (e: Omit<EvidenceItem, 'id' | 'workspaceId' | 'ideaId' | 'createdAt'>) => {
    const item: EvidenceItem = { ...e, id: uid('ev'), workspaceId: wsId, ideaId, createdAt: now() };
    evidence.push(item);
    deps.store.put('evidence', wsId, item.id, item);
  };
  const ideaSourceIds = new Set<string>();

  log('Competitive Analyst', `Searching for competitors (${plan.competitorQueries.length} queries)…`);
  const compHits = (await mapLimit(plan.competitorQueries.slice(0, 4), 2, (q) => ctx.research.webSearch(q, 5))).flat();
  const alternatives = [...idea0.alternatives];
  for (const h of dedupeBy(compHits, (x) => x.url).slice(0, 8)) {
    const s = book.add({ url: h.url, title: h.title, kind: h.provider === 'demo-fixture' ? 'demo' : 'web', provider: h.provider, snippet: h.snippet, content: `${h.title}\n${h.snippet}` });
    ideaSourceIds.add(s.id);
    addEvidence({ category: 'competitor', title: h.title, summary: h.snippet || 'Found via search; relevance not analysed.', url: h.url, sourceId: s.id, status: 'sourced' });
    if (!alternatives.some((a) => a.url === h.url) && alternatives.length < 6) alternatives.push({ name: h.title, url: h.url, note: h.snippet.slice(0, 200) || 'Found via search; relevance not analysed.', sourceIds: [s.id] });
  }

  log('Technical Feasibility Agent', 'Collecting repositories, sponsor docs and papers…');
  const repoHits = await ctx.research.repoSearch(keyTerms(`${idea0.title} ${idea0.pitch}`, 5).join(' '), 4);
  for (const h of repoHits) {
    const s = book.add({ url: h.url, title: h.title, kind: h.provider === 'demo-fixture' ? 'demo' : 'repo', provider: h.provider, snippet: h.snippet, content: `${h.title}\n${h.snippet}`, meta: h.meta });
    ideaSourceIds.add(s.id);
    addEvidence({ category: 'repository', title: h.title, summary: h.snippet || 'Open-source repository.', url: h.url, sourceId: s.id, status: 'sourced' });
  }
  const paperHits = (await mapLimit(plan.paperQueries.slice(0, 2), 2, (q) => ctx.research.paperSearch(q, 3))).flat();
  for (const h of dedupeBy(paperHits, (x) => x.url).slice(0, 4)) {
    const s = book.add({ url: h.url, title: h.title, kind: 'paper', provider: h.provider, snippet: h.snippet, content: `${h.title}\n${h.snippet}`, meta: h.meta });
    ideaSourceIds.add(s.id);
    addEvidence({ category: 'paper', title: h.title, summary: h.snippet.slice(0, 300), url: h.url, sourceId: s.id, status: 'sourced' });
  }
  for (const integ of idea0.sponsorIntegration) {
    const sp = sponsors.find((x) => x.name === integ.sponsor);
    for (const sid of sp?.sourceIds ?? []) {
      const s = book.get(sid);
      if (!s) continue;
      ideaSourceIds.add(sid);
      addEvidence({ category: 'sponsor_doc', title: `${integ.sponsor}: ${s.title}`, summary: s.snippet, url: s.url, sourceId: sid, status: 'sourced' });
    }
  }
  for (const w of ctx.research.drainWarnings()) log('Research', w, 'warn');

  // claims
  const idea1: Idea = { ...idea0, alternatives };
  const drafts = await deps.engine.extractClaims({ workspace: ws, idea: idea1, sponsors });
  log('Claim Auditor', `Verifying ${drafts.length} claim(s) against ${ideaSourceIds.size} source(s)…`);
  const evidenceSources = [...ideaSourceIds].map((id) => book.get(id)!).filter(Boolean).map((s) => ({ sourceId: s.id, url: s.url, title: s.title, text: s.content }));
  const claims: Claim[] = await mapLimit(drafts.slice(0, 14), 3, async (draft) => {
    const pool = draft.kind === 'sponsor' ? evidenceSources.filter((s) => book.get(s.sourceId)?.kind !== 'repo') : evidenceSources;
    const v = await deps.engine.verifyClaim({ claim: draft, idea: idea1, sources: pool });
    const claim: Claim = { id: uid('clm'), workspaceId: wsId, ideaId, text: draft.text, kind: draft.kind, importance: draft.importance, status: v.status, sourceIds: v.sourceIds, supportingQuotes: v.quotes, note: v.note, method: v.method, checkedAt: now() };
    deps.store.put('claim', wsId, claim.id, claim);
    return claim;
  });
  for (const c of claims.filter((x) => x.status === 'unverified' || x.status === 'contradicted')) {
    addEvidence({ category: c.status === 'contradicted' ? 'unverified' : 'unverified', title: `${c.status === 'contradicted' ? 'Contradicted' : 'Unverified'}: ${c.text.slice(0, 80)}`, summary: c.note, status: 'unverified' });
  }
  for (const r of idea1.risks.filter((r) => /assum/i.test(r.risk))) addEvidence({ category: 'assumption', title: r.risk, summary: r.mitigation, status: 'assumption' });

  // re-score with evidence
  const adjusted = idea1.scores ? applyEvidenceAdjustments({ ...idea1.scores, basis: idea1.scores.basis }, claims) : null;
  const cov = evidenceCoverage(claims);
  const next: Idea = { ...idea1, scores: adjusted, status: idea1.status === 'recommended' ? 'recommended' : 'validated', supportingResearch: [...idea1.supportingResearch, { note: `Deep validation: ${cov.verified}/${cov.total} important claims supported`, sourceIds: [...ideaSourceIds].slice(0, 6) }], updatedAt: now() };
  deps.store.put('idea', wsId, next.id, next);
  log('Claim Auditor', `“${next.title}”: ${cov.verified}/${cov.total} important claims supported; ${claims.filter((c) => c.status === 'contradicted').length} contradicted.${adjusted?.adjustments.length ? ` ${adjusted.adjustments.length} score cap(s) applied.` : ''}`, 'success');
}

function dedupeBy<T>(arr: T[], key: (t: T) => string): T[] {
  return [...new Map(arr.map((a) => [key(a), a])).values()];
}

/** Pick the recommended idea among validated ones and store the rationale. */
export async function recommend(deps: Deps, wsId: string, log: StageCtx['log']): Promise<void> {
  const ws = getWorkspace(deps, wsId);
  const validated = deps.store.list('idea', wsId).filter((i) => i.status === 'validated' || i.status === 'recommended');
  if (!validated.length) return;
  const claimsAll = deps.store.list('claim', wsId);
  const ranked = sortIdeas(validated).map((idea) => {
    const claims = claimsAll.filter((c) => c.ideaId === idea.id);
    return { idea, claims, coverage: evidenceCoverage(claims) };
  });
  const rationale = await deps.engine.explainRecommendation({ workspace: ws, ranked });
  for (const r of ranked) {
    const isTop = r.idea.id === ranked[0].idea.id;
    deps.store.put('idea', wsId, r.idea.id, { ...r.idea, status: isTop ? 'recommended' : 'validated', recommendationRationale: isTop ? rationale : null });
  }
  const fresh = getWorkspace(deps, wsId);
  fresh.recommendedIdeaId = ranked[0].idea.id;
  saveWorkspace(deps, fresh);
  log('Validation Lead', `Recommended: “${ranked[0].idea.title}”.`, 'success');
}

export async function runValidate(ctx: StageCtx): Promise<string> {
  const { deps, wsId, log, progress } = ctx;
  const ws = getWorkspace(deps, wsId);
  const pool = sortIdeas(deps.store.list('idea', wsId).filter((i) => i.status !== 'eliminated'));
  if (!pool.length) throw new HttpError(422, 'No shortlisted ideas to validate. Run Idea Generation first.');
  const targets = pool.slice(0, Math.max(1, ws.config.deepValidateCount));
  const book = new SourceBook(deps, wsId);
  let done = 0;
  for (const t of targets) {
    await validateIdea(ctx, t.id, book);
    progress(++done, targets.length, `Validated ${t.title}`);
  }
  await recommend(deps, wsId, log);
  const fresh = getWorkspace(deps, wsId);
  return `${targets.length} validated · recommended: ${deps.store.get('idea', fresh.recommendedIdeaId ?? '')?.title ?? 'none'}`;
}

export { CRITERIA };
