/**
 * Zod schemas for LLM output. They are deliberately forgiving: model slop (wrong casing, numbers as
 * strings, missing arrays, single values instead of lists) is coerced to safe defaults rather than
 * rejected. Only fields that are essential to a task are strict, so the LLM layer's retry kicks in.
 */
import { z } from 'zod';
import { CRITERIA, JUDGE_DIMENSIONS, type HackathonIntel } from '../../shared/types';
import type { ReviseResult } from './engine';

type Json = Record<string, unknown>;
export const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

// ───────────── primitives ─────────────

export const str = (max = 2000) =>
  z.unknown().transform((v): string => {
    if (typeof v === 'string') return v.trim().slice(0, max);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  });

export const optStr = (max = 2000) => str(max).transform((s): string | null => s || null);

const toNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/[^\d.+-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};

export const num = (fallback: number, min = -Infinity, max = Infinity) =>
  z.unknown().transform((v): number => {
    const n = toNumber(v);
    return n === null ? fallback : Math.min(max, Math.max(min, n));
  });

export const optNum = (min = -Infinity, max = Infinity) =>
  z.unknown().transform((v): number | null => {
    const n = toNumber(v);
    return n === null ? null : Math.min(max, Math.max(min, n));
  });

/** Enum that tolerates casing/spacing ("Deep", "partially verified") and falls back instead of failing. */
export function en<const T extends readonly string[], F extends T[number] | null>(
  values: T,
  fallback: F,
  aliases: Record<string, T[number]> = {},
) {
  return z.unknown().transform((v): T[number] | F => {
    if (typeof v !== 'string') return fallback;
    const k = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (aliases[k]) return aliases[k];
    return (values.find((x) => x.toLowerCase() === k) as T[number] | undefined) ?? fallback;
  });
}

/** Array that drops invalid items instead of failing, wraps a single value, and caps its length. */
export const list = <S extends z.ZodType>(item: S, max = 20) =>
  z.unknown().transform((v): z.output<S>[] => {
    const arr = Array.isArray(v) ? v : v == null ? [] : [v];
    const out: z.output<S>[] = [];
    for (const x of arr) {
      const r = item.safeParse(x);
      if (r.success) out.push(r.data);
      if (out.length >= max) break;
    }
    return out;
  });

export const strList = (max = 10, itemMax = 600) =>
  list(str(itemMax), max).transform((a) => a.filter((s) => s.length > 0));

/** Missing keys become null (zod 4 rejects absent keys even for z.unknown()), so each field's own default applies. */
const fill = (keys: string[], v: unknown): Json => {
  const out: Json = isObj(v) ? { ...v } : {};
  for (const k of keys) if (out[k] === undefined) out[k] = null;
  return out;
};

/** Object whose non-object input becomes `{}` so every inner field falls back to its default. */
export const obj = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess((v) => fill(Object.keys(shape), v), z.object(shape));

/** Top-level object; a bare array at the root is treated as the value of `key`. */
export const rootObj = <T extends z.ZodRawShape>(key: string, shape: T) =>
  z.preprocess((v) => fill(Object.keys(shape), Array.isArray(v) ? { [key]: v } : v), z.object(shape));

/** Record keyed by a fixed key set; accepts an object or an array of {keyField,...}; fuzzy-matches key names. */
function keyedRecord<K extends string, S extends z.ZodType>(keys: readonly K[], item: S, keyField: string) {
  return z.unknown().transform((raw): Partial<Record<K, z.output<S>>> => {
    const entries: [string, unknown][] = Array.isArray(raw)
      ? raw.filter(isObj).map((o): [string, unknown] => [String(o[keyField] ?? o.name ?? ''), o])
      : isObj(raw)
        ? Object.entries(raw)
        : [];
    const out: Partial<Record<K, z.output<S>>> = {};
    for (const [name, value] of entries) {
      const lower = name.toLowerCase();
      const key = keys.find((k) => lower === k) ?? keys.find((k) => lower.includes(k));
      if (!key || out[key] !== undefined) continue;
      const r = item.safeParse(value);
      if (r.success) out[key] = r.data;
    }
    return out;
  });
}

// ───────────── Stage 1: intel ─────────────

export const INTEL_FIELDS = [
  'name', 'objectives', 'themes', 'problemStatements', 'judgingCriteria', 'submissionRequirements', 'restrictions',
  'mandatoryTech', 'prizes', 'startDate', 'endDate', 'durationHours', 'organizers', 'sponsors',
] as const satisfies readonly (keyof HackathonIntel)[];

const quotesSchema = z.unknown().transform((raw): Partial<Record<(typeof INTEL_FIELDS)[number], string[]>> => {
  const out: Partial<Record<(typeof INTEL_FIELDS)[number], string[]>> = {};
  if (!isObj(raw)) return out;
  for (const f of INTEL_FIELDS) {
    const r = strList(5, 800).safeParse(raw[f]);
    if (r.success && r.data.length) out[f] = r.data;
  }
  return out;
});

export const intelSchema = obj({
  name: optStr(200),
  objectives: strList(10),
  themes: strList(15, 200),
  problemStatements: list(obj({ title: str(200), description: str(1500), sponsor: optStr(120) }), 15),
  judgingCriteria: list(obj({ name: str(200), weight: optNum(0, 100), description: optStr(500) }), 12),
  submissionRequirements: strList(15),
  restrictions: strList(15),
  mandatoryTech: strList(15, 200),
  prizes: strList(12),
  startDate: optStr(80),
  endDate: optStr(80),
  durationHours: optNum(1, 24 * 60),
  organizers: strList(10, 200),
  sponsors: list(obj({ name: str(120), url: optStr(300), tier: optStr(60) }), 40),
  quotes: quotesSchema,
});

// ───────────── Stage 2: sponsor ─────────────

const depth = en(['deep', 'moderate', 'superficial'] as const, 'superficial', { shallow: 'superficial', medium: 'moderate', high: 'deep', low: 'superficial' });
const level3 = en(['low', 'medium', 'high'] as const, 'medium', { moderate: 'medium', med: 'medium' });

export const sponsorSchema = obj({
  summary: str(1500),
  products: strList(12, 200),
  techEcosystem: strList(12, 200),
  devTools: strList(12, 200),
  apis: strList(15, 200),
  docs: list(obj({ title: str(200), url: str(500) }), 12),
  latest: list(obj({ title: str(200), summary: str(600), url: optStr(500), date: optStr(60) }), 8),
  previousHackathons: list(obj({ note: str(500) }), 6),
  opportunities: list(
    obj({ title: str(200), integration: str(900), justification: str(900), technicalDepth: depth }),
    6,
  ),
  gaps: strList(10),
});

// ───────────── Stage 3: opportunities ─────────────

const refNote = obj({ sourceId: str(80), note: str(500) });

export const opportunitySchema = obj({
  title: str(200),
  problem: str(1500),
  whyNow: str(1000),
  audience: str(500),
  existing: list(refNote, 8),
  repos: list(refNote, 6),
  papers: list(obj({ sourceId: str(80) }), 5),
  developments: strList(6),
  gaps: strList(6),
  technicalOpportunities: strList(6),
  sourceIds: strList(20, 80),
  strength: level3,
  verification: en(['verified', 'assumed'] as const, 'assumed'),
});

// ───────────── Stage 4/5: ideas ─────────────

const alternative = obj({ name: str(200), url: optStr(500), note: str(700), sourceIds: strList(10, 80) });
const sponsorIntegration = obj({
  sponsor: str(120), technology: str(300), how: str(900), justification: str(900), depth,
});
const component = obj({ name: str(150), responsibility: str(400), tech: str(200) });
const architecture = obj({ summary: str(1500), components: list(component, 10) });
const stackItem = obj({ layer: str(100), choice: str(200), reason: str(400) });
const feasibility = obj({ level: level3, assessment: str(1000) });
const risk = obj({ risk: str(400), severity: level3, mitigation: str(500) });
const complexity = obj({ level: level3, estimatedHours: num(24, 1, 5000), rationale: str(600) });

/** Evolvable idea fields (also the allowed keys of a revision patch). */
export const patchFields = {
  title: str(200),
  pitch: str(400),
  problem: str(1500),
  audience: str(500),
  solution: str(2500),
  differentiation: str(1500),
  alternatives: list(alternative, 8),
  sponsorIntegration: list(sponsorIntegration, 6),
  architecture,
  stack: list(stackItem, 12),
  mvpFeatures: strList(12),
  stretchGoals: strList(8),
  feasibility,
  risks: list(risk, 8),
  complexity,
  judgingAppeal: str(1000),
} as const;

export const ideaSchema = obj({
  ...patchFields,
  supportingResearch: list(obj({ note: str(600), sourceIds: strList(10, 80) }), 8),
});
export type IdeaOut = z.output<typeof ideaSchema>;

export const ideasSchema = rootObj('ideas', { ideas: list(ideaSchema, 8) });

// ───────────── scoring ─────────────

const critScore = obj({
  score: optNum(0, 10),
  rationale: str(900),
  evidenceIds: strList(10, 80),
  confidence: en(['low', 'medium', 'high'] as const, 'low'),
});

export const scoresSchema = rootObj('scores', {
  scores: list(obj({ ideaId: str(100), criteria: keyedRecord(CRITERIA, critScore, 'criterion') }), 8),
});

// ───────────── critique & revise ─────────────

export const critiqueSchema = rootObj('critiques', {
  critiques: list(
    obj({
      kind: en(['assumption', 'competitor', 'weakness', 'feasibility', 'sponsor', 'alternative'] as const, null),
      text: str(800),
      severity: level3,
    }),
    6,
  ),
});

const PATCH_KEYS = Object.keys(patchFields) as (keyof typeof patchFields)[];

function meaningful(key: string, v: unknown): boolean {
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (!isObj(v)) return false;
  if (key === 'architecture') return typeof v.summary === 'string' && v.summary.length > 0;
  if (key === 'feasibility') return typeof v.assessment === 'string' && v.assessment.length > 0;
  return true;
}

const patchSchema = z.unknown().transform((raw): ReviseResult['patch'] => {
  const out: Json = {};
  if (!isObj(raw)) return out as ReviseResult['patch'];
  for (const key of PATCH_KEYS) {
    if (!(key in raw)) continue;
    const r = patchFields[key].safeParse(raw[key]);
    if (r.success && meaningful(key, r.data)) out[key] = r.data;
  }
  return out as ReviseResult['patch'];
});

export const reviseSchema = obj({
  patch: patchSchema,
  reasons: z.unknown().transform((raw): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!isObj(raw)) return out;
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 600);
    return out;
  }),
  summary: str(800),
});

// ───────────── validation ─────────────

export const planSchema = obj({
  competitorQueries: strList(5, 200),
  techQueries: strList(3, 200),
  paperQueries: strList(2, 200),
});

export const claimsSchema = rootObj('claims', {
  claims: list(
    obj({
      text: str(500),
      kind: en(['problem', 'competitor', 'differentiation', 'technical', 'statistic', 'sponsor'] as const, 'technical'),
      importance: level3,
    }),
    14,
  ),
});

export const verdictSchema = obj({
  verdict: en(['verified', 'partially_verified', 'unverified', 'contradicted'] as const, 'unverified'),
  quotes: strList(6, 600),
  sourceIds: strList(10, 80),
  note: str(700),
});

export const recommendSchema = obj({ explanation: str(4000) });

// ───────────── Judge Arena ─────────────

const dimension = en(JUDGE_DIMENSIONS, null);

export const openingSchema = obj({
  question: str(700).refine((s) => s.length > 0, 'question is required'),
  intent: str(400),
  dimension,
});

const dimScore = z.preprocess(
  (v) => (typeof v === 'number' || typeof v === 'string' ? { score: v } : v),
  obj({ score: optNum(0, 10), comment: str(500) }),
);

const followUp = z.unknown().transform((v) => {
  const r = obj({ question: str(700), intent: str(400), dimension, reason: str(500) }).safeParse(v);
  return r.success && r.data.question ? r.data : null;
});

export const reviewSchema = obj({
  dimensions: keyedRecord(JUDGE_DIMENSIONS, dimScore, 'dimension'),
  overall: optNum(0, 10),
  strengths: strList(5, 400),
  weaknesses: strList(5, 400),
  suggestion: str(900),
  followUp,
});

export const reportSchema = obj({
  strengths: strList(6, 500),
  weakAreas: list(obj({ dimension, why: str(700), prep: strList(5, 400) }), 6),
  preparationPlan: strList(8, 500),
});

// ───────────── Blueprint ─────────────

export const blueprintNarrativeSchema = obj({
  finalPitch: str(1500),
  problemAndSolution: str(3000),
  differentiation: str(2000),
  researchEvidence: list(
    obj({
      claimId: optStr(100),
      claim: str(600),
      status: en(['verified', 'partially_verified', 'unverified', 'contradicted', 'assumption'] as const, 'assumption'),
      sourceIds: strList(10, 80),
    }),
    30,
  ),
  milestoneGoals: z.unknown().transform((raw): Record<string, { goals: string[]; owner: string }> => {
    const entries: [string, unknown][] = Array.isArray(raw)
      ? raw.filter(isObj).map((o): [string, unknown] => [String(o.key ?? o.phase ?? ''), o])
      : isObj(raw)
        ? Object.entries(raw)
        : [];
    const out: Record<string, { goals: string[]; owner: string }> = {};
    const shape = obj({ goals: strList(8, 300), owner: str(120) });
    for (const [k, v] of entries) {
      const r = shape.safeParse(v);
      if (k && r.success) out[k] = r.data;
    }
    return out;
  }),
  teamResponsibilities: list(obj({ role: str(120), responsibilities: strList(6, 300) }), 8),
  demoStoryline: list(obj({ step: str(200), seconds: num(20, 3, 180), script: str(700) }), 10),
  presentationOutline: list(obj({ slide: str(200), content: str(700) }), 12),
  judgeQuestions: list(
    obj({ question: str(500), recommendedAnswer: str(1500), groundedIn: strList(10, 80) }),
    10,
  ),
});

export const blueprintTechSchema = obj({
  architecture,
  techStack: list(stackItem, 14),
  databaseDesign: list(obj({ table: str(100), purpose: str(300), columns: strList(15, 150) }), 10),
  apiDesign: list(
    obj({
      method: en(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const, 'GET'),
      path: str(200),
      purpose: str(300),
    }),
    16,
  ),
  mvpScope: strList(12),
  stretchGoals: strList(8),
});
