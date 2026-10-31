/**
 * Transparent scoring mechanics. Pure functions — used by the server pipeline,
 * and re-used by the client to explain scores.
 */
import { CRITERIA, type Claim, type Criterion, type CriterionScore, type JudgingCriterion, type ScoreCard } from './types';

export const SCORE_DISCLAIMER =
  'AI-assisted estimate against the hackathon criteria. It is a prioritisation aid, not a prediction of the judges’ scores or of winning.';

export const DEFAULT_WEIGHTS: Record<Criterion, number> = {
  alignment: 16,
  innovation: 16,
  sponsor: 10,
  feasibility: 16,
  impact: 14,
  differentiation: 14,
  demo: 14,
};

const KEYWORDS: Record<Criterion, string[]> = {
  alignment: ['theme', 'track', 'relevan', 'alignment', 'problem statement', 'fit'],
  innovation: ['innovat', 'creativ', 'novel', 'original'],
  sponsor: ['sponsor', 'api', 'use of', 'integration', 'tool usage', 'technology use', 'platform'],
  feasibility: ['technical', 'complex', 'implementation', 'execution', 'engineering', 'feasib', 'functional', 'working', 'quality', 'architecture'],
  impact: ['impact', 'real-world', 'social', 'value', 'usefulness', 'market', 'business', 'potential', 'scalab', 'viab'],
  differentiation: ['differentiat', 'competit', 'unique'],
  demo: ['demo', 'present', 'pitch', 'design', 'ux', 'user experience', 'polish', 'communication', 'storytelling'],
};

/** Match a free-text judging criterion to the platform criterion it most plausibly covers. */
export function mapCriterion(name: string, description = ''): Criterion | null {
  const text = `${name} ${description}`.toLowerCase();
  const nameLower = name.toLowerCase();
  let best: { c: Criterion; score: number } | null = null;
  for (const c of CRITERIA) {
    let score = 0;
    for (const kw of KEYWORDS[c]) {
      if (nameLower.includes(kw)) score += 3;
      else if (text.includes(kw)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}

function normalise(raw: Record<Criterion, number>): Record<Criterion, number> {
  const sum = CRITERIA.reduce((s, c) => s + raw[c], 0);
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  const out = {} as Record<Criterion, number>;
  let running = 0;
  CRITERIA.forEach((c, i) => {
    if (i === CRITERIA.length - 1) out[c] = Math.round((100 - running) * 10) / 10;
    else {
      out[c] = Math.round(((raw[c] / sum) * 100) * 10) / 10;
      running += out[c];
    }
  });
  return out;
}

/**
 * Derive evaluation weights from the official judging criteria when available,
 * otherwise fall back to balanced defaults. Returns the basis for transparency.
 */
export function deriveWeights(
  criteria: JudgingCriterion[] | null,
  verified: boolean,
): { weights: Record<Criterion, number>; basis: string } {
  if (!criteria || criteria.length === 0) {
    return { weights: { ...DEFAULT_WEIGHTS }, basis: 'No judging criteria found — balanced default weights (assumption).' };
  }
  const known = criteria.filter((c) => typeof c.weight === 'number' && c.weight! > 0);
  const knownTotal = known.reduce((s, c) => s + (c.weight as number), 0);
  const unknown = criteria.filter((c) => !(typeof c.weight === 'number' && c.weight! > 0));
  const remaining = Math.max(0, 100 - knownTotal);
  const fill = unknown.length ? (remaining > 0 ? remaining : 100 / criteria.length) / unknown.length : 0;

  const raw = Object.fromEntries(CRITERIA.map((c) => [c, 0])) as Record<Criterion, number>;
  let mapped = 0;
  for (const jc of criteria) {
    const target = mapCriterion(jc.name, jc.description);
    const w = typeof jc.weight === 'number' && jc.weight > 0 ? jc.weight : fill;
    if (target) {
      raw[target] += w;
      mapped++;
    }
  }
  if (mapped === 0) {
    return { weights: { ...DEFAULT_WEIGHTS }, basis: 'Judging criteria could not be mapped to evaluation axes — balanced default weights.' };
  }
  // Unmapped axes keep a small floor so they remain visible in the ranking.
  const FLOOR = 4;
  const total = CRITERIA.reduce((s, c) => s + raw[c], 0);
  const floorTotal = CRITERIA.filter((c) => raw[c] === 0).length * FLOOR;
  const scale = (100 - floorTotal) / (total || 1);
  const scaled = {} as Record<Criterion, number>;
  for (const c of CRITERIA) scaled[c] = raw[c] === 0 ? FLOOR : raw[c] * scale;
  const weights = normalise(scaled);
  const basis = `${verified ? 'Official' : 'Assumed'} judging criteria (${criteria.map((c) => c.name).join(', ')}) mapped to evaluation axes; unmapped axes keep a ${FLOOR}% floor.`;
  return { weights, basis };
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

export function computeTotal(criteria: Record<Criterion, CriterionScore>, weights: Record<Criterion, number>): number {
  let total = 0;
  for (const c of CRITERIA) total += (clampScore(criteria[c].score) / 10) * weights[c];
  return Math.round(total * 10) / 10;
}

export function buildScoreCard(args: {
  criteria: Record<Criterion, CriterionScore>;
  weights: Record<Criterion, number>;
  weightBasis: string;
  basis: ScoreCard['basis'];
  scoredBy: string;
  adjustments?: ScoreCard['adjustments'];
}): ScoreCard {
  const criteria = {} as Record<Criterion, CriterionScore>;
  for (const c of CRITERIA) criteria[c] = { ...args.criteria[c], score: clampScore(args.criteria[c].score) };
  return {
    criteria,
    weights: args.weights,
    weightBasis: args.weightBasis,
    total: computeTotal(criteria, args.weights),
    basis: args.basis,
    scoredBy: args.scoredBy,
    disclaimer: SCORE_DISCLAIMER,
    adjustments: args.adjustments ?? [],
  };
}

/**
 * Evidence-based adjustments applied after deep validation. Rules are explicit so the
 * user can see exactly why a score moved.
 */
export function applyEvidenceAdjustments(card: ScoreCard, claims: Claim[]): ScoreCard {
  const criteria = Object.fromEntries(CRITERIA.map((c) => [c, { ...card.criteria[c] }])) as Record<Criterion, CriterionScore>;
  // Undo caps from a previous validation so re-validating is idempotent and the record is rebuilt from evidence.
  for (const a of card.adjustments.filter((a) => a.reason.startsWith('[validation]'))) {
    criteria[a.criterion] = {
      ...criteria[a.criterion],
      score: a.from,
      rationale: criteria[a.criterion].rationale.replace(/ \(Capped at [^)]*\)$/, ''),
    };
  }
  const adjustments: ScoreCard['adjustments'] = [...card.adjustments.filter((a) => !a.reason.startsWith('[validation]'))];

  const cap = (criterion: Criterion, max: number, reason: string) => {
    const cur = criteria[criterion].score;
    if (cur > max) {
      adjustments.push({ criterion, from: cur, to: max, reason: `[validation] ${reason}` });
      criteria[criterion] = {
        ...criteria[criterion],
        score: max,
        rationale: `${criteria[criterion].rationale} (Capped at ${max}: ${reason})`,
      };
    }
  };

  const contradicted = (kind: Claim['kind']) => claims.filter((c) => c.kind === kind && c.status === 'contradicted');
  const diff = [...contradicted('differentiation'), ...contradicted('competitor')];
  if (diff.length) cap('differentiation', 4, `evidence contradicts: “${diff[0].text.slice(0, 120)}”`);
  const spon = contradicted('sponsor');
  if (spon.length) cap('sponsor', 4, `sponsor claim contradicted: “${spon[0].text.slice(0, 120)}”`);
  const tech = contradicted('technical');
  if (tech.length) cap('feasibility', 5, `technical claim contradicted: “${tech[0].text.slice(0, 120)}”`);
  const stat = [...contradicted('statistic'), ...contradicted('problem')];
  if (stat.length) cap('impact', 5, `problem/statistic claim contradicted: “${stat[0].text.slice(0, 120)}”`);

  // Unverified high-importance claims lower confidence rather than silently moving the score.
  const unverifiedHigh = claims.filter((c) => c.importance === 'high' && c.status === 'unverified');
  if (unverifiedHigh.length) {
    for (const crit of ['differentiation', 'impact'] as Criterion[]) {
      if (claims.some((c) => c.importance === 'high' && c.status === 'unverified' && claimTouches(c, crit))) {
        criteria[crit] = { ...criteria[crit], confidence: 'low' };
      }
    }
  }

  return buildScoreCard({
    criteria,
    weights: card.weights,
    weightBasis: card.weightBasis,
    basis: 'validated',
    scoredBy: card.scoredBy,
    adjustments,
  });
}

function claimTouches(c: Claim, crit: Criterion): boolean {
  if (crit === 'differentiation') return c.kind === 'differentiation' || c.kind === 'competitor';
  if (crit === 'impact') return c.kind === 'problem' || c.kind === 'statistic';
  return false;
}

/** Share of high/medium-importance claims that are at least partially verified. */
export function evidenceCoverage(claims: Claim[]): { verified: number; total: number; ratio: number } {
  const relevant = claims.filter((c) => c.importance !== 'low');
  const verified = relevant.filter((c) => c.status === 'verified' || c.status === 'partially_verified').length;
  return { verified, total: relevant.length, ratio: relevant.length ? verified / relevant.length : 0 };
}

// ───────────────────────── Timeline ─────────────────────────

export interface TimelinePhase {
  key: 'setup' | 'core' | 'integration' | 'polish' | 'freeze';
  name: string;
  startHour: number;
  endHour: number;
}

const PHASES: { key: TimelinePhase['key']; name: string; from: number; to: number }[] = [
  { key: 'setup', name: 'Lock scope & scaffold', from: 0, to: 0.08 },
  { key: 'core', name: 'Core MVP build', from: 0.08, to: 0.52 },
  { key: 'integration', name: 'Sponsor integration & hardening', from: 0.52, to: 0.7 },
  { key: 'polish', name: 'Polish, demo path & docs', from: 0.7, to: 0.88 },
  { key: 'freeze', name: 'Feature freeze, rehearsal & submission', from: 0.88, to: 1 },
];

const half = (n: number) => Math.round(n * 2) / 2;

/** Split the available hackathon time into proportional phases. Requires hours > 0. */
export function timelinePhases(totalHours: number): TimelinePhase[] {
  const hours = Math.max(1, totalHours);
  return PHASES.map((p, i) => ({
    key: p.key,
    name: p.name,
    startHour: i === 0 ? 0 : half(hours * p.from),
    endHour: i === PHASES.length - 1 ? hours : half(hours * p.to),
  }));
}
