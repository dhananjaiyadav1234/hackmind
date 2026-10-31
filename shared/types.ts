/**
 * HACKMIND shared domain types.
 * Used by the API server and the web client. Keep this file dependency-free.
 */

// ───────────────────────── Primitives ─────────────────────────

export type Verification = 'verified' | 'assumed' | 'unavailable';

/** A piece of hackathon intelligence with provenance. */
export interface Fact<T> {
  value: T | null;
  status: Verification;
  sourceIds: string[];
  note?: string;
}

export type StageName = 'intel' | 'sponsors' | 'opportunities' | 'ideas' | 'evolve' | 'validate';
export const STAGE_ORDER: StageName[] = ['intel', 'sponsors', 'opportunities', 'ideas', 'evolve', 'validate'];

export const STAGE_LABELS: Record<StageName, string> = {
  intel: 'Hackathon Intelligence',
  sponsors: 'Sponsor Intelligence',
  opportunities: 'Opportunity Discovery',
  ideas: 'Idea Generation & Ranking',
  evolve: 'Idea Evolution',
  validate: 'Deep Validation',
};

export type EngineKind = 'llm' | 'heuristic';

// ───────────────────────── Workspace ─────────────────────────

export interface WorkspaceConfig {
  /** Ideas generated in the first pass (default 20). */
  initialIdeas: number;
  /** Ideas kept for evolution (default 8). */
  shortlistSize: number;
  /** Ideas that receive deep validation (default 3). */
  deepValidateCount: number;
  /** Critique→revise iterations (default 2). */
  evolutionRounds: number;
  teamSize: number;
}

export const DEFAULT_CONFIG: WorkspaceConfig = {
  initialIdeas: 20,
  shortlistSize: 8,
  deepValidateCount: 3,
  evolutionRounds: 2,
  teamSize: 4,
};

export interface JudgingCriterion {
  name: string;
  weight: number | null; // percent if known
  description?: string;
}

export interface ProblemStatement {
  title: string;
  description: string;
  sponsor?: string;
}

export interface SponsorRef {
  name: string;
  url?: string;
  tier?: string;
}

export interface HackathonIntel {
  name: Fact<string>;
  objectives: Fact<string[]>;
  themes: Fact<string[]>;
  problemStatements: Fact<ProblemStatement[]>;
  judgingCriteria: Fact<JudgingCriterion[]>;
  submissionRequirements: Fact<string[]>;
  restrictions: Fact<string[]>;
  mandatoryTech: Fact<string[]>;
  prizes: Fact<string[]>;
  startDate: Fact<string>;
  endDate: Fact<string>;
  durationHours: Fact<number>;
  organizers: Fact<string[]>;
  sponsors: Fact<SponsorRef[]>;
}

export interface StageState {
  status: 'idle' | 'running' | 'done' | 'failed' | 'stale';
  lastRunAt?: string;
  summary?: string;
  engine?: EngineKind;
}

export interface Workspace {
  id: string;
  name: string;
  url: string | null;
  /** 'demo' workspaces use bundled sample fixtures instead of live research. */
  mode: 'live' | 'demo';
  /** Free text the user typed / pasted (manual entry). */
  manualText: string | null;
  config: WorkspaceConfig;
  intel: HackathonIntel;
  stages: Record<StageName, StageState>;
  recommendedIdeaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  url: string | null;
  mode: 'live' | 'demo';
  stages: Record<StageName, StageState>;
  counts: { sources: number; sponsors: number; ideas: number; shortlisted: number; validated: number };
  recommendedIdeaId: string | null;
  updatedAt: string;
  createdAt: string;
}

// ───────────────────────── Sources & evidence ─────────────────────────

export type SourceKind = 'web' | 'docs' | 'repo' | 'paper' | 'manual' | 'demo';

export interface Source {
  id: string;
  workspaceId: string;
  url: string;
  title: string;
  kind: SourceKind;
  /** Which provider retrieved it: fetch, tavily, brave, duckduckgo, arxiv, github, manual, demo-fixture. */
  provider: string;
  snippet: string;
  /** Truncated page text (for claim verification & inspection). */
  content: string;
  meta?: Record<string, string | number>;
  fetchedAt: string;
}

export type EvidenceCategory =
  | 'problem'
  | 'competitor'
  | 'technology'
  | 'sponsor_doc'
  | 'repository'
  | 'paper'
  | 'statistic'
  | 'assumption'
  | 'unverified';

export interface EvidenceItem {
  id: string;
  workspaceId: string;
  ideaId: string;
  category: EvidenceCategory;
  title: string;
  summary: string;
  url?: string;
  sourceId?: string;
  status: 'sourced' | 'assumption' | 'unverified';
  createdAt: string;
}

export type ClaimStatus = 'verified' | 'partially_verified' | 'unverified' | 'contradicted';

export interface Claim {
  id: string;
  workspaceId: string;
  ideaId: string;
  text: string;
  kind: 'problem' | 'competitor' | 'differentiation' | 'technical' | 'statistic' | 'sponsor';
  importance: 'high' | 'medium' | 'low';
  status: ClaimStatus;
  sourceIds: string[];
  supportingQuotes: string[];
  note: string;
  method: 'llm' | 'keyword' | 'none';
  checkedAt: string;
}

// ───────────────────────── Sponsors & opportunities ─────────────────────────

export interface SponsorOpportunity {
  title: string;
  integration: string;
  justification: string;
  technicalDepth: 'deep' | 'moderate' | 'superficial';
  sourceIds: string[];
}

export interface SponsorProfile {
  id: string;
  workspaceId: string;
  name: string;
  website?: string;
  status: 'researched' | 'partial' | 'unavailable';
  summary: string;
  products: string[];
  techEcosystem: string[];
  devTools: string[];
  apis: string[];
  docs: { title: string; url: string }[];
  latest: { title: string; summary: string; url?: string; date?: string }[];
  previousHackathons: { note: string; sourceIds: string[] }[];
  opportunities: SponsorOpportunity[];
  gaps: string[];
  sourceIds: string[];
  engine: EngineKind;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  workspaceId: string;
  title: string;
  problem: string;
  whyNow: string;
  audience: string;
  existingSolutions: { name: string; url?: string; note: string }[];
  openSource: { name: string; url: string; stars?: number; note: string }[];
  papers: { title: string; url: string; authors?: string; year?: string }[];
  developments: string[];
  gaps: string[];
  technicalOpportunities: string[];
  sourceIds: string[];
  /** AI-assessed strength; not a prediction. */
  strength: 'low' | 'medium' | 'high';
  verification: Verification;
  engine: EngineKind;
}

// ───────────────────────── Ideas ─────────────────────────

export type IdeaTier = 'safe' | 'innovative' | 'moonshot';
export type IdeaStatus = 'generated' | 'shortlisted' | 'validated' | 'recommended' | 'eliminated';

export const CRITERIA = ['alignment', 'innovation', 'sponsor', 'feasibility', 'impact', 'differentiation', 'demo'] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABELS: Record<Criterion, string> = {
  alignment: 'Hackathon alignment',
  innovation: 'Innovation',
  sponsor: 'Sponsor integration',
  feasibility: 'Technical feasibility',
  impact: 'Real-world impact',
  differentiation: 'Competitive differentiation',
  demo: 'Demo potential',
};

export interface CriterionScore {
  score: number; // 0..10
  rationale: string;
  evidenceIds: string[]; // source ids
  confidence: 'low' | 'medium' | 'high';
}

export interface ScoreCard {
  criteria: Record<Criterion, CriterionScore>;
  weights: Record<Criterion, number>; // sums to 100
  weightBasis: string; // explains where weights came from
  total: number; // 0..100 weighted
  basis: 'initial' | 'evolved' | 'validated';
  scoredBy: string;
  disclaimer: string;
  adjustments: { criterion: Criterion; from: number; to: number; reason: string }[];
}

export interface Critique {
  agent: string;
  kind: 'assumption' | 'competitor' | 'weakness' | 'feasibility' | 'sponsor' | 'alternative';
  text: string;
  severity: 'low' | 'medium' | 'high';
}

export interface Revision {
  id: string;
  round: number;
  version: number;
  at: string;
  critiques: Critique[];
  changes: { field: string; before: string; after: string; reason: string }[];
  scoreBefore: number | null;
  scoreAfter: number | null;
  summary: string;
  agent: string;
}

export interface IdeaSponsorIntegration {
  sponsor: string;
  technology: string;
  how: string;
  justification: string;
  depth: 'deep' | 'moderate' | 'superficial';
}

export interface Idea {
  id: string;
  workspaceId: string;
  tier: IdeaTier;
  status: IdeaStatus;
  title: string;
  pitch: string;
  problem: string;
  audience: string;
  solution: string;
  differentiation: string;
  alternatives: { name: string; url?: string; note: string; sourceIds: string[] }[];
  sponsorIntegration: IdeaSponsorIntegration[];
  architecture: { summary: string; components: { name: string; responsibility: string; tech: string }[] };
  stack: { layer: string; choice: string; reason: string }[];
  mvpFeatures: string[];
  stretchGoals: string[];
  feasibility: { level: 'high' | 'medium' | 'low'; assessment: string };
  risks: { risk: string; severity: 'low' | 'medium' | 'high'; mitigation: string }[];
  complexity: { level: 'low' | 'medium' | 'high'; estimatedHours: number; rationale: string };
  judgingAppeal: string;
  supportingResearch: { note: string; sourceIds: string[] }[];
  scores: ScoreCard | null;
  version: number;
  revisions: Revision[];
  rank: number | null;
  eliminatedReason: string | null;
  recommendationRationale: string | null;
  generatedBy: string;
  engine: EngineKind;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── Jobs & events ─────────────────────────

export interface AgentEvent {
  id: string;
  workspaceId: string;
  jobId?: string;
  at: string;
  agent: string;
  stage: StageName | 'system' | 'judge' | 'blueprint';
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  data?: Record<string, unknown>;
}

export interface Job {
  id: string;
  workspaceId: string;
  stage: StageName | 'full';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt?: string;
  error?: string;
  progress?: { done: number; total: number; label: string };
}

// ───────────────────────── Judge Arena ─────────────────────────

export const JUDGE_PERSONAS = ['technical', 'innovation', 'business', 'sponsor', 'product', 'aggressive'] as const;
export type JudgePersona = (typeof JUDGE_PERSONAS)[number];

export const JUDGE_PERSONA_LABELS: Record<JudgePersona, string> = {
  technical: 'Technical Judge',
  innovation: 'Innovation Judge',
  business: 'Business Judge',
  sponsor: 'Sponsor Judge',
  product: 'Product Judge',
  aggressive: 'Aggressive Judge',
};

export const JUDGE_DIMENSIONS = [
  'technical',
  'problem',
  'innovation',
  'feasibility',
  'sponsor',
  'communication',
  'evidence',
] as const;
export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export const JUDGE_DIMENSION_LABELS: Record<JudgeDimension, string> = {
  technical: 'Technical understanding',
  problem: 'Problem understanding',
  innovation: 'Innovation justification',
  feasibility: 'Feasibility',
  sponsor: 'Sponsor integration',
  communication: 'Communication',
  evidence: 'Evidence-backed reasoning',
};

export interface TurnEvaluation {
  /** null = this answer gave no signal for that dimension. */
  dimensions: Record<JudgeDimension, { score: number | null; comment: string }>;
  overall: number; // 0..10
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
  engine: EngineKind;
}

export interface JudgeTurn {
  id: string;
  persona: JudgePersona;
  question: string;
  /** What the judge is probing. */
  intent: string;
  dimension: JudgeDimension;
  depth: number; // 0 = opening question, >0 = follow-up
  parentTurnId?: string;
  askedAt: string;
  answer?: string;
  answeredAt?: string;
  evaluation?: TurnEvaluation;
  /** Why this follow-up was asked (reacting to the previous answer). */
  followUpReason?: string;
}

export interface JudgeReport {
  overall: number | null; // 0..10
  answered: number;
  byDimension: Record<JudgeDimension, { avg: number | null; samples: number }>;
  byPersona: Partial<Record<JudgePersona, { avg: number | null; samples: number }>>;
  weakAreas: { dimension: JudgeDimension; why: string; prep: string[] }[];
  strengths: string[];
  preparationPlan: string[];
  engine: EngineKind;
  caveat: string;
  generatedAt: string;
}

export interface JudgeSession {
  id: string;
  workspaceId: string;
  ideaId: string;
  personas: JudgePersona[];
  maxFollowUps: number;
  status: 'active' | 'finished';
  turns: JudgeTurn[];
  report: JudgeReport | null;
  createdAt: string;
  updatedAt: string;
}

// ───────────────────────── Blueprint ─────────────────────────

export interface Milestone {
  name: string;
  startHour: number;
  endHour: number;
  goals: string[];
  owner: string;
}

export interface BlueprintSections {
  finalPitch: string;
  problemAndSolution: string;
  differentiation: string;
  researchEvidence: { claim: string; status: ClaimStatus | 'assumption'; sourceIds: string[] }[];
  architecture: { summary: string; components: { name: string; responsibility: string; tech: string }[] };
  techStack: { layer: string; choice: string; reason: string }[];
  databaseDesign: { table: string; purpose: string; columns: string[] }[];
  apiDesign: { method: string; path: string; purpose: string }[];
  mvpScope: string[];
  stretchGoals: string[];
  milestones: Milestone[];
  teamResponsibilities: { role: string; responsibilities: string[] }[];
  demoStoryline: { step: string; seconds: number; script: string }[];
  presentationOutline: { slide: string; content: string }[];
  judgeQuestions: { question: string; recommendedAnswer: string; groundedIn: string[] }[];
}

export interface Blueprint {
  id: string;
  workspaceId: string;
  ideaId: string;
  generatedAt: string;
  engine: EngineKind;
  timelineHours: number;
  timelineBasis: string;
  sections: BlueprintSections;
  markdown: string;
}

// ───────────────────────── API shapes ─────────────────────────

export interface SystemStatus {
  version: string;
  engine: EngineKind;
  llm: { configured: boolean; provider: string | null; model: string | null };
  research: {
    providers: { id: string; label: string; configured: boolean; requiresKey: boolean; note: string }[];
  };
  demoMode: boolean;
  notes: string[];
}

export interface WorkspaceBundle {
  workspace: Workspace;
  sources: Source[];
  sponsors: SponsorProfile[];
  opportunities: Opportunity[];
  ideas: Idea[];
  jobs: Job[];
}

export interface CreateWorkspaceInput {
  name?: string;
  url?: string;
  manualText?: string;
  config?: Partial<WorkspaceConfig>;
  durationHours?: number;
  sponsors?: string[];
  demo?: boolean;
}

export interface IdeaDetailBundle {
  idea: Idea;
  claims: Claim[];
  evidence: EvidenceItem[];
  sources: Source[];
}
