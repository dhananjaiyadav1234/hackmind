/**
 * LLM-backed Engine: one focused specialist prompt per method, lenient schema parsing, then strict
 * normalisation (no fabricated sources, all criteria present, clamped numbers).
 */
import type { LLM } from '../llm';
import { clampScore } from '../../shared/scoring';
import {
  CRITERIA, JUDGE_DIMENSIONS,
  type Claim, type Critique, type EngineKind, type Idea, type JudgeDimension, type Opportunity, type SponsorProfile,
  type SponsorRef, type TurnEvaluation, type Workspace,
} from '../../shared/types';
import type {
  AnswerReview, AnswerReviewInput, BlueprintDraft, BlueprintInput, ClaimDraft, ClaimEvidenceSource,
  ClaimVerdict, CritiqueInput, Engine, GenerateIdeasInput, IdeaDraft, IntelDraft, JudgeQuestion,
  OpeningQuestionInput, OpportunityDraft, PageText, RecommendInput, ReportInput, ReportText,
  ReviseInput, ReviseResult, ScoreDraft, ScoreIdeasInput, SponsorDraft, TopicResearch,
  ValidationResearchPlan,
} from './engine';
import {
  blueprintNarrativeSchema, blueprintTechSchema, claimsSchema, critiqueSchema, ideasSchema, intelSchema, openingSchema,
  opportunitySchema, planSchema, recommendSchema, reportSchema, reviewSchema, reviseSchema, scoresSchema, sponsorSchema,
  verdictSchema, type IdeaOut,
} from './llm-schemas';
import {
  UNVERIFIED_NOTE, PERSONA_DEFAULT_DIMENSION, blueprintNarrativePrompt, blueprintTechPrompt, claimsPrompt, critiquePrompt, ideasPrompt,
  intelPrompt, openingPrompt, opportunityPrompt, planPrompt, recommendPrompt, reportPrompt, revisePrompt, reviewPrompt,
  scorePrompt, sponsorPrompt, verifyPrompt,
} from './prompts';

// ───────────── small helpers ─────────────

const IDEA_BATCH = 4;
const SCORE_BATCH = 5;
const CONCURRENCY = 3;

/** Run `fn` over items with at most `limit` in flight; results keep input order. Failures are captured, not thrown. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Unwrap settled results: keep successes; if everything failed, rethrow the first error. */
function successes<R>(results: PromiseSettledResult<R>[]): R[] {
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!ok.length && results.length) {
    const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw first?.reason instanceof Error ? first.reason : new Error(String(first?.reason));
  }
  return ok;
}

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s: string) => new Set(normText(s).split(' ').filter((w) => w.length > 2));

/** Exact or near-duplicate (Jaccard over word sets). */
function similar(a: string, b: string, threshold = 0.8): boolean {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter) >= threshold;
}

/** Whitespace/quote/case-normalised form used to check that a quote is a verbatim excerpt. */
const squash = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

const normUrl = (u: string) => u.trim().replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
const keep = (ids: string[], allowed: Set<string>) => [...new Set(ids.filter((i) => allowed.has(i)))];

interface Refs {
  ids: Set<string>;
  urls: Set<string>;
}

/** Source ids and URLs the prompt exposed for sponsors/opportunities — the only ones the model may cite. */
function contextRefs(sponsors: SponsorProfile[], opportunities: Opportunity[], extra: Idea[] = []): Refs {
  const ids = new Set<string>();
  const urls = new Set<string>();
  const addUrl = (u?: string) => u && urls.add(normUrl(u));
  for (const s of sponsors) {
    s.sourceIds.forEach((i) => ids.add(i));
    s.opportunities.forEach((o) => o.sourceIds.forEach((i) => ids.add(i)));
    s.previousHackathons.forEach((p) => p.sourceIds.forEach((i) => ids.add(i)));
    addUrl(s.website);
    s.docs.forEach((d) => addUrl(d.url));
  }
  for (const o of opportunities) {
    o.sourceIds.forEach((i) => ids.add(i));
    o.existingSolutions.forEach((e) => addUrl(e.url));
    o.openSource.forEach((e) => addUrl(e.url));
    o.papers.forEach((p) => addUrl(p.url));
  }
  for (const idea of extra) {
    idea.supportingResearch.forEach((r) => r.sourceIds.forEach((i) => ids.add(i)));
    idea.alternatives.forEach((a) => {
      a.sourceIds.forEach((i) => ids.add(i));
      addUrl(a.url);
    });
  }
  return { ids, urls };
}

type AltOut = IdeaOut['alternatives'][number];

function cleanAlternatives(alts: AltOut[], refs: Refs): Idea['alternatives'] {
  return alts
    .filter((a) => a.name)
    .map((a) => {
      const sourceIds = keep(a.sourceIds, refs.ids);
      const url = a.url && refs.urls.has(normUrl(a.url)) ? a.url : undefined;
      const sourced = sourceIds.length > 0 || !!url;
      const note = !sourced && !/unverified/i.test(a.note) ? `${a.note ? `${a.note} ` : ''}(${UNVERIFIED_NOTE})` : a.note;
      return { name: a.name, ...(url ? { url } : {}), note, sourceIds };
    });
}

function toDraftFields(o: IdeaOut, refs: Refs, maxHours: number | null) {
  const hours = maxHours ? Math.min(o.complexity.estimatedHours, maxHours) : o.complexity.estimatedHours;
  return {
    alternatives: cleanAlternatives(o.alternatives, refs),
    sponsorIntegration: o.sponsorIntegration.filter((s) => s.sponsor || s.technology),
    complexity: { ...o.complexity, estimatedHours: Math.max(1, Math.round(hours)) },
  };
}

const maxHoursFor = (ws: { intel: { durationHours: { value: number | null } }; config: { teamSize: number } }) => {
  const h = ws.intel.durationHours.value;
  return h && h > 0 ? h * Math.max(1, ws.config.teamSize) : null;
};

function trimWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  const cut = words.slice(0, maxWords).join(' ');
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > cut.length * 0.5 ? cut.slice(0, end + 1) : `${cut}…`;
}

const avg = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null);

// ───────────── engine ─────────────

export class LlmEngine implements Engine {
  readonly kind: EngineKind = 'llm';
  readonly label = 'Claude agents';

  constructor(private readonly llm: LLM) {}

  // ── Stage 1 ──
  async extractIntel(input: { workspace: Workspace; pages: PageText[]; manualText: string | null; hintSponsors: string[] }): Promise<IntelDraft> {
    const hints: SponsorRef[] = input.hintSponsors.map((name) => ({ name }));
    const empty: IntelDraft = {
      name: null, objectives: [], themes: [], problemStatements: [], judgingCriteria: [], submissionRequirements: [], restrictions: [],
      mandatoryTech: [], prizes: [], startDate: null, endDate: null, durationHours: null, organizers: [], sponsors: hints, quotes: {},
    };
    if (!input.pages.length && !input.manualText?.trim()) return empty;

    const { system, prompt } = intelPrompt(input);
    const o = await this.llm.json({ task: 'extract-intel', system, prompt, schema: intelSchema, maxTokens: 6000 });

    const sponsors: SponsorRef[] = [];
    for (const s of [...o.sponsors.map((x) => ({ name: x.name, url: x.url ?? undefined, tier: x.tier ?? undefined })), ...hints]) {
      if (!s.name) continue;
      const existing = sponsors.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
      if (existing) {
        existing.url ??= s.url;
        existing.tier ??= s.tier;
      } else sponsors.push({ ...s });
    }

    // Weights given as fractions (0.3) rather than percents.
    const weights = o.judgingCriteria.map((c) => c.weight).filter((w): w is number => w != null);
    const fractional = weights.length > 0 && weights.every((w) => w <= 1) && Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 0.1;

    return {
      name: o.name,
      objectives: o.objectives,
      themes: o.themes,
      problemStatements: o.problemStatements.filter((p) => p.title || p.description).map((p) => ({ title: p.title, description: p.description, ...(p.sponsor ? { sponsor: p.sponsor } : {}) })),
      judgingCriteria: o.judgingCriteria.filter((c) => c.name).map((c) => ({
        name: c.name,
        weight: c.weight == null ? null : fractional ? Math.round(c.weight * 100) : c.weight,
        ...(c.description ? { description: c.description } : {}),
      })),
      submissionRequirements: o.submissionRequirements,
      restrictions: o.restrictions,
      mandatoryTech: o.mandatoryTech,
      prizes: o.prizes,
      startDate: o.startDate,
      endDate: o.endDate,
      durationHours: o.durationHours ?? hoursBetween(o.startDate, o.endDate),
      organizers: o.organizers,
      sponsors,
      quotes: o.quotes,
    };
  }

  // ── Stage 2 ──
  async profileSponsor(input: { workspace: Workspace; sponsor: SponsorRef; pages: PageText[] }): Promise<SponsorDraft> {
    if (!input.pages.length) {
      return {
        summary: '', products: [], techEcosystem: [], devTools: [], apis: [], docs: [], latest: [], previousHackathons: [], opportunities: [],
        gaps: ['No documentation page retrieved', 'No pages were retrieved for this sponsor, so no profile could be grounded'],
      };
    }
    const { system, prompt } = sponsorPrompt(input);
    const o = await this.llm.json({ task: 'profile-sponsor', system, prompt, schema: sponsorSchema, maxTokens: 5000 });

    const pageUrls = new Set(input.pages.map((p) => normUrl(p.url)));
    const corpus = input.pages.map((p) => p.text.toLowerCase()).join('\n');
    const urlOk = (u: string | null | undefined) => !!u && (pageUrls.has(normUrl(u)) || corpus.includes(u.trim().toLowerCase()));

    const gaps = [...o.gaps];
    if (!o.docs.some((d) => urlOk(d.url)) && !gaps.some((g) => /doc/i.test(g))) gaps.push('No documentation page retrieved');
    return {
      summary: o.summary,
      products: o.products,
      techEcosystem: o.techEcosystem,
      devTools: o.devTools,
      apis: o.apis,
      docs: o.docs.filter((d) => d.title && urlOk(d.url)),
      latest: o.latest.filter((l) => l.title).map((l) => ({ title: l.title, summary: l.summary, ...(urlOk(l.url) ? { url: l.url as string } : {}), ...(l.date ? { date: l.date } : {}) })),
      previousHackathons: o.previousHackathons.filter((p) => p.note),
      opportunities: o.opportunities.filter((p) => p.title && p.integration),
      gaps,
    };
  }

  // ── Stage 3 ──
  async discoverOpportunities(input: { workspace: Workspace; sponsors: SponsorProfile[]; research: TopicResearch[] }): Promise<OpportunityDraft[]> {
    const settled = await mapLimit(input.research, CONCURRENCY, async (research): Promise<OpportunityDraft> => {
      const { system, prompt } = opportunityPrompt({ workspace: input.workspace, sponsors: input.sponsors, research });
      const o = await this.llm.json({ task: 'discover-opportunities', system, prompt, schema: opportunitySchema, maxTokens: 3500 });

      const web = new Map(research.web.map((w) => [w.sourceId, w]));
      const repos = new Map(research.repos.map((w) => [w.sourceId, w]));
      const papers = new Map(research.papers.map((w) => [w.sourceId, w]));
      const allowed = new Set([...web.keys(), ...repos.keys(), ...papers.keys()]);

      const once = <T extends { sourceId: string }>(rows: T[], pool: Map<string, unknown>) => {
        const seen = new Set<string>();
        return rows.filter((r) => pool.has(r.sourceId) && !seen.has(r.sourceId) && !!seen.add(r.sourceId));
      };

      const existingSolutions = once(o.existing, web).map((e) => {
        const w = web.get(e.sourceId)!;
        return { name: w.title, url: w.url, note: e.note || w.snippet.slice(0, 200) };
      });
      const openSource = once(o.repos, repos).map((e) => {
        const r = repos.get(e.sourceId)!;
        return { name: r.title, url: r.url, ...(r.stars != null ? { stars: r.stars } : {}), note: e.note || r.snippet.slice(0, 200) };
      });
      const paperRows = once(o.papers, papers).map((e) => {
        const p = papers.get(e.sourceId)!;
        return { title: p.title, url: p.url, ...(p.authors ? { authors: p.authors } : {}), ...(p.year ? { year: p.year } : {}) };
      });
      const used = keep([...o.sourceIds, ...o.existing.map((e) => e.sourceId), ...o.repos.map((e) => e.sourceId), ...o.papers.map((e) => e.sourceId)], allowed);

      return {
        title: o.title || research.topic,
        problem: o.problem || research.description,
        whyNow: o.whyNow,
        audience: o.audience,
        existingSolutions,
        openSource,
        papers: paperRows,
        developments: o.developments,
        gaps: o.gaps,
        technicalOpportunities: o.technicalOpportunities,
        sourceIds: used,
        strength: o.strength,
        verification: o.verification === 'verified' && used.length > 0 ? 'verified' : 'assumed',
      };
    });
    return successes(settled);
  }

  // ── Stage 4: ideas ──
  async generateIdeas(input: GenerateIdeasInput): Promise<IdeaDraft[]> {
    if (input.count <= 0) return [];
    const nBatches = Math.ceil(input.count / IDEA_BATCH);
    const base = Math.floor(input.count / nBatches);
    const sizes = Array.from({ length: nBatches }, (_, i) => base + (i < input.count % nBatches ? 1 : 0));
    const refs = contextRefs(input.sponsors, input.opportunities);
    const maxHours = maxHoursFor(input.workspace);

    const settled = await mapLimit(sizes, CONCURRENCY, async (count, index) => {
      const { system, prompt } = ideasPrompt(input, count, { index, total: nBatches });
      const o = await this.llm.json({ task: 'generate-ideas', system, prompt, schema: ideasSchema, maxTokens: 12000 });
      return o.ideas;
    });
    const batches = successes(settled);

    const seen = [...input.existingTitles];
    const out: IdeaDraft[] = [];
    for (const raw of batches.flat()) {
      if (out.length >= input.count) break;
      if (!raw.title || !raw.solution) continue;
      if (seen.some((t) => similar(t, raw.title))) continue;
      seen.push(raw.title);
      const f = toDraftFields(raw, refs, maxHours);
      out.push({
        tier: input.tier,
        title: raw.title,
        pitch: raw.pitch,
        problem: raw.problem,
        audience: raw.audience,
        solution: raw.solution,
        differentiation: raw.differentiation,
        alternatives: f.alternatives,
        sponsorIntegration: f.sponsorIntegration,
        architecture: raw.architecture,
        stack: raw.stack,
        mvpFeatures: raw.mvpFeatures,
        stretchGoals: raw.stretchGoals,
        feasibility: raw.feasibility,
        risks: raw.risks.filter((r) => r.risk),
        complexity: f.complexity,
        judgingAppeal: raw.judgingAppeal,
        supportingResearch: raw.supportingResearch
          .map((r) => ({ note: r.note, sourceIds: keep(r.sourceIds, refs.ids) }))
          .filter((r) => r.note && r.sourceIds.length),
      });
    }
    if (!out.length) throw new Error('LLM returned no usable ideas');
    return out;
  }

  async scoreIdeas(input: ScoreIdeasInput): Promise<Record<string, ScoreDraft>> {
    const refs = contextRefs(input.sponsors, input.opportunities);
    const settled = await mapLimit(chunk(input.ideas, SCORE_BATCH), CONCURRENCY, async (ideas) => {
      const { system, prompt } = scorePrompt(input, ideas);
      const o = await this.llm.json({ task: 'score-ideas', system, prompt, schema: scoresSchema, maxTokens: 7000 });
      return { ideas, scores: o.scores };
    });

    const result: Record<string, ScoreDraft> = {};
    for (const { ideas, scores } of successes(settled)) {
      for (const idea of ideas) {
        const own = contextRefs([], [], [idea]);
        const allowed = new Set([...refs.ids, ...own.ids]);
        const got = scores.find((s) => s.ideaId === idea.id);
        const draft = {} as ScoreDraft;
        for (const c of CRITERIA) {
          const s = got?.criteria[c];
          draft[c] = s && s.score !== null
            ? { score: clampScore(s.score), rationale: s.rationale || 'No rationale given', evidenceIds: keep(s.evidenceIds, allowed), confidence: s.rationale ? s.confidence : 'low' }
            : { score: 5, rationale: 'Not assessed', evidenceIds: [], confidence: 'low' };
        }
        result[idea.id] = draft;
      }
    }
    return result;
  }

  // ── Stage 5: evolve ──
  async critiqueIdea(input: CritiqueInput): Promise<Critique[]> {
    const { system, prompt } = critiquePrompt(input);
    const o = await this.llm.json({ task: 'critique-idea', system, prompt, schema: critiqueSchema, maxTokens: 2500 });
    return o.critiques
      .filter((c) => c.text)
      .map((c) => ({ agent: input.critic.name, kind: c.kind ?? input.critic.kind, text: c.text, severity: c.severity }));
  }

  async reviseIdea(input: ReviseInput): Promise<ReviseResult> {
    const { system, prompt } = revisePrompt(input);
    const o = await this.llm.json({ task: 'revise-idea', system, prompt, schema: reviseSchema, maxTokens: 7000 });
    const refs = contextRefs(input.sponsors, [], [input.idea]);
    const patch: ReviseResult['patch'] = { ...o.patch };

    if (patch.alternatives) patch.alternatives = cleanAlternatives(patch.alternatives as AltOut[], refs);
    if (patch.complexity) {
      const cap = maxHoursFor(input.workspace);
      if (cap) patch.complexity = { ...patch.complexity, estimatedHours: Math.max(1, Math.min(patch.complexity.estimatedHours, cap)) };
    }
    const reasons = Object.fromEntries(Object.entries(o.reasons).filter(([k]) => k in patch));
    return { patch, reasons, summary: o.summary || 'Revised in response to critiques.' };
  }

  // ── Stage 6: validate ──
  async planValidationResearch(input: { workspace: Workspace; idea: Idea }): Promise<ValidationResearchPlan> {
    const { system, prompt } = planPrompt(input);
    const o = await this.llm.json({ task: 'plan-validation', system, prompt, schema: planSchema, maxTokens: 1200 });
    const t = input.idea.title;
    return {
      competitorQueries: o.competitorQueries.length ? o.competitorQueries : [`${t} alternatives`, `${t} competitors`, `${input.idea.pitch} existing tools`],
      techQueries: o.techQueries.length ? o.techQueries : input.idea.sponsorIntegration.slice(0, 2).map((s) => `${s.technology} API documentation`),
      paperQueries: o.paperQueries.length ? o.paperQueries : [`${t} research`],
    };
  }

  async extractClaims(input: { workspace: Workspace; idea: Idea; sponsors: SponsorProfile[] }): Promise<ClaimDraft[]> {
    const { system, prompt } = claimsPrompt(input);
    const o = await this.llm.json({ task: 'extract-claims', system, prompt, schema: claimsSchema, maxTokens: 3000 });
    const out: ClaimDraft[] = [];
    for (const c of o.claims) {
      if (c.text && !out.some((x) => similar(x.text, c.text, 0.9))) out.push({ text: c.text, kind: c.kind, importance: c.importance });
    }
    return out;
  }

  async verifyClaim(input: { claim: ClaimDraft; idea: Idea; sources: ClaimEvidenceSource[] }): Promise<ClaimVerdict> {
    if (!input.sources.length) {
      return { status: 'unverified', sourceIds: [], quotes: [], note: 'No sources retrieved', method: 'llm' };
    }
    const { system, prompt } = verifyPrompt({ claim: input.claim, sources: input.sources });
    const o = await this.llm.json({ task: 'verify-claim', system, prompt, schema: verdictSchema, maxTokens: 1500 });

    const haystacks = input.sources.map((s) => ({ id: s.sourceId, text: squash(s.text) }));
    const quotes: string[] = [];
    const quoteSources = new Set<string>();
    for (const q of o.quotes) {
      const needle = squash(q);
      if (needle.length < 8) continue;
      const hits = haystacks.filter((h) => h.text.includes(needle));
      if (!hits.length) continue;
      quotes.push(q);
      hits.forEach((h) => quoteSources.add(h.id));
    }

    let status = o.verdict;
    let note = o.note;
    if (status !== 'unverified' && quotes.length === 0) {
      note = `${note ? `${note} ` : ''}[Downgraded to unverified: no supporting quote could be matched verbatim in the sources.]`.trim();
      status = 'unverified';
    }
    const provided = new Set(input.sources.map((s) => s.sourceId));
    const sourceIds = status === 'unverified' ? keep(o.sourceIds, provided) : [...quoteSources];
    return { status, sourceIds, quotes, note, method: 'llm' };
  }

  async explainRecommendation(input: RecommendInput): Promise<string> {
    if (!input.ranked.length) return 'No ideas were available to recommend.';
    const { system, prompt } = recommendPrompt(input);
    const o = await this.llm.json({ task: 'explain-recommendation', system, prompt, schema: recommendSchema, maxTokens: 800 });
    let text = trimWords(o.explanation || `${input.ranked[0].idea.title} ranks first on the weighted score.`, 150);
    if (!/(AI-assisted|estimate)/i.test(text)) text += ' Note: scores are AI-assisted estimates, not predictions of judging outcomes.';
    return text;
  }

  // ── Judge Arena ──
  async openingQuestion(input: OpeningQuestionInput): Promise<JudgeQuestion> {
    const asked = [...input.asked];
    let note: string | undefined;
    for (let attempt = 0; ; attempt++) {
      const { system, prompt } = openingPrompt(input, note);
      const o = await this.llm.json({ task: 'judge-opening', system, prompt, schema: openingSchema, maxTokens: 800 });
      const dup = asked.some((q) => similar(q, o.question, 0.7));
      if (!dup || attempt >= 1) {
        return { question: o.question, intent: o.intent || 'Probe understanding of the project.', dimension: o.dimension ?? PERSONA_DEFAULT_DIMENSION[input.persona] };
      }
      note = `Your previous attempt ("${o.question}") repeated an earlier question. Ask about a DIFFERENT aspect of the project.`;
    }
  }

  async reviewAnswer(input: AnswerReviewInput): Promise<AnswerReview> {
    const dimensions = {} as TurnEvaluation['dimensions'];
    if (!input.answer.trim()) {
      for (const d of JUDGE_DIMENSIONS) dimensions[d] = { score: null, comment: 'No answer given.' };
      return {
        evaluation: { dimensions, overall: 0, strengths: [], weaknesses: ['No answer was given.'], suggestion: 'Write down what you would say, then check each point against your architecture and evidence.', engine: 'llm' },
        followUp: null,
      };
    }
    const { system, prompt } = reviewPrompt(input);
    const o = await this.llm.json({ task: 'judge-review', system, prompt, schema: reviewSchema, maxTokens: 2500 });

    const scored: number[] = [];
    for (const d of JUDGE_DIMENSIONS) {
      const got = o.dimensions[d];
      const score = got?.score == null ? null : clampScore(got.score);
      if (score !== null) scored.push(score);
      dimensions[d] = { score, comment: got?.comment ?? '' };
    }
    const overall = clampScore(o.overall ?? avg(scored) ?? 0);

    const prior = [input.turn.question, ...input.history.map((t) => t.question)];
    const f = o.followUp;
    const followUp =
      input.followUpsRemaining > 0 && f && !prior.some((q) => similar(q, f.question, 0.7))
        ? {
            question: f.question,
            intent: f.intent || 'Probe the specifics of the previous answer.',
            dimension: f.dimension ?? input.turn.dimension,
            reason: f.reason || 'Reacting to the previous answer.',
          }
        : null;
    return {
      evaluation: { dimensions, overall, strengths: o.strengths, weaknesses: o.weaknesses, suggestion: o.suggestion, engine: 'llm' },
      followUp,
    };
  }

  async writeReport(input: ReportInput): Promise<ReportText> {
    const { system, prompt } = reportPrompt(input);
    const o = await this.llm.json({ task: 'judge-report', system, prompt, schema: reportSchema, maxTokens: 3000 });
    const eligible = (d: JudgeDimension) => {
      const s = input.byDimension[d];
      return s.avg === null || s.avg < 6.5 || s.samples <= 1;
    };
    const seen = new Set<JudgeDimension>();
    const weakAreas: ReportText['weakAreas'] = [];
    for (const w of o.weakAreas) {
      if (!w.dimension || seen.has(w.dimension) || !eligible(w.dimension) || !w.why) continue;
      seen.add(w.dimension);
      weakAreas.push({ dimension: w.dimension, why: w.why, prep: w.prep });
    }
    return { strengths: o.strengths, weakAreas, preparationPlan: o.preparationPlan };
  }

  // ── Blueprint ──
  async writeBlueprint(input: BlueprintInput): Promise<BlueprintDraft> {
    const n = blueprintNarrativePrompt(input);
    const t = blueprintTechPrompt(input);
    const [a, b] = await Promise.all([
      this.llm.json({ task: 'blueprint-narrative', system: n.system, prompt: n.prompt, schema: blueprintNarrativeSchema, maxTokens: 9000 }),
      this.llm.json({ task: 'blueprint-technical', system: t.system, prompt: t.prompt, schema: blueprintTechSchema, maxTokens: 7000 }),
    ]);
    const idea = input.idea;
    const allowedIds = new Set([...input.sources.map((s) => s.id), ...input.claims.flatMap((c) => c.sourceIds)]);

    return {
      finalPitch: a.finalPitch || idea.pitch,
      problemAndSolution: a.problemAndSolution || `${idea.problem}\n\n${idea.solution}`,
      differentiation: a.differentiation || idea.differentiation,
      researchEvidence: groundEvidence(a.researchEvidence, input.claims, allowedIds),
      architecture: b.architecture.summary ? b.architecture : idea.architecture,
      techStack: b.techStack.length ? b.techStack : idea.stack,
      databaseDesign: b.databaseDesign.filter((d) => d.table),
      apiDesign: b.apiDesign.filter((e) => e.path).map((e) => ({ method: e.method, path: e.path.startsWith('/') ? e.path : `/${e.path}`, purpose: e.purpose })),
      mvpScope: b.mvpScope.length ? b.mvpScope : idea.mvpFeatures,
      stretchGoals: b.stretchGoals.length ? b.stretchGoals : idea.stretchGoals,
      milestoneGoals: Object.fromEntries(
        input.phases.map((p) => {
          const g = a.milestoneGoals[p.key];
          return [p.key, g && g.goals.length ? { goals: g.goals, owner: g.owner || 'Team' } : { goals: [p.name], owner: g?.owner || 'Team' }];
        }),
      ),
      teamResponsibilities: a.teamResponsibilities.filter((r) => r.role).slice(0, Math.max(1, input.teamSize)),
      demoStoryline: scaleDemo(a.demoStoryline.filter((s) => s.step || s.script), 180),
      presentationOutline: a.presentationOutline.filter((s) => s.slide),
      judgeQuestions: a.judgeQuestions
        .filter((q) => q.question && q.recommendedAnswer)
        .map((q) => ({ question: q.question, recommendedAnswer: q.recommendedAnswer, groundedIn: keep(q.groundedIn, allowedIds) })),
    };
  }
}

// ───────────── blueprint helpers ─────────────

type EvidenceOut = { claimId: string | null; claim: string; status: string; sourceIds: string[] };

/**
 * Statuses/sources come from the real checked claims, never from the model: an item that matches a claim
 * inherits its status and sourceIds; anything else is an unsourced assumption. Missing key claims are appended.
 */
function groundEvidence(items: EvidenceOut[], claims: Claim[], allowed: Set<string>): BlueprintDraft['researchEvidence'] {
  const used = new Set<string>();
  const out: BlueprintDraft['researchEvidence'] = [];
  for (const it of items) {
    if (!it.claim && !it.claimId) continue;
    const match = claims.find((c) => c.id === it.claimId) ?? claims.find((c) => similar(c.text, it.claim, 0.6));
    if (match) {
      if (used.has(match.id)) continue;
      used.add(match.id);
      out.push({ claim: it.claim || match.text, status: match.status, sourceIds: keep(match.sourceIds, allowed) });
    } else {
      out.push({ claim: it.claim, status: 'assumption', sourceIds: [] });
    }
  }
  for (const c of claims) {
    if (!used.has(c.id) && c.importance !== 'low') out.push({ claim: c.text, status: c.status, sourceIds: keep(c.sourceIds, allowed) });
  }
  return out;
}

/** Rescale step durations so the demo lasts about `target` seconds. */
function scaleDemo<T extends { seconds: number }>(steps: T[], target: number): T[] {
  const sum = steps.reduce((s, x) => s + x.seconds, 0);
  if (!steps.length || (sum >= target * 0.85 && sum <= target * 1.15)) return steps;
  return steps.map((x) => ({ ...x, seconds: Math.max(5, Math.round((x.seconds * target) / sum)) }));
}

function hoursBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  const h = Math.round((b - a) / 3_600_000);
  return h >= 1 && h <= 24 * 60 ? h : null;
}
