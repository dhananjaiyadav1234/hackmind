/**
 * The Engine is the "brain" behind each pipeline stage. Two implementations exist:
 *  - LlmEngine       — specialised LLM agents (requires ANTHROPIC_API_KEY)
 *  - HeuristicEngine — deterministic, offline, rule-based fallback used for demo mode & tests
 * The pipeline (research, persistence, scoring math, orchestration) is shared.
 */
import type {
  Blueprint, BlueprintSections, Claim, Critique, Criterion, CriterionScore, EngineKind, HackathonIntel, Idea, IdeaTier,
  JudgeDimension, JudgePersona, JudgeSession, JudgeTurn, JudgingCriterion, Opportunity, ProblemStatement, SponsorOpportunity,
  SponsorProfile, SponsorRef, TurnEvaluation, Workspace,
} from '../../shared/types';

export interface PageText {
  sourceId: string;
  url: string;
  title: string;
  text: string;
}

// ── Stage 1: hackathon intelligence ──
export interface IntelDraft {
  name: string | null;
  objectives: string[];
  themes: string[];
  problemStatements: ProblemStatement[];
  judgingCriteria: JudgingCriterion[];
  submissionRequirements: string[];
  restrictions: string[];
  mandatoryTech: string[];
  prizes: string[];
  startDate: string | null;
  endDate: string | null;
  durationHours: number | null;
  organizers: string[];
  sponsors: SponsorRef[];
  /** Verbatim supporting quotes per field. A field is "verified" only if a quote is found in a fetched/manual source. */
  quotes: Partial<Record<keyof HackathonIntel, string[]>>;
}

// ── Stage 2: sponsors ──
export interface SponsorDraft {
  summary: string;
  products: string[];
  techEcosystem: string[];
  devTools: string[];
  apis: string[];
  docs: { title: string; url: string }[];
  latest: { title: string; summary: string; url?: string; date?: string }[];
  previousHackathons: { note: string }[];
  opportunities: Omit<SponsorOpportunity, 'sourceIds'>[];
  gaps: string[];
}

// ── Stage 3: opportunities ──
export interface TopicResearch {
  topic: string;
  description: string;
  sponsor?: string;
  web: { sourceId: string; title: string; url: string; snippet: string }[];
  repos: { sourceId: string; title: string; url: string; snippet: string; stars?: number }[];
  papers: { sourceId: string; title: string; url: string; snippet: string; authors?: string; year?: string }[];
}

export type OpportunityDraft = Omit<Opportunity, 'id' | 'workspaceId' | 'engine'>;

// ── Stage 4/5: ideas ──
export type IdeaDraft = Omit<
  Idea,
  | 'id' | 'workspaceId' | 'status' | 'scores' | 'version' | 'revisions' | 'rank' | 'eliminatedReason'
  | 'recommendationRationale' | 'generatedBy' | 'engine' | 'createdAt' | 'updatedAt'
>;

export interface GenerateIdeasInput {
  workspace: Workspace;
  sponsors: SponsorProfile[];
  opportunities: Opportunity[];
  tier: IdeaTier;
  count: number;
  existingTitles: string[];
  /** Agent lens, e.g. "Innovation Agent". */
  agent: string;
  /** Offset to vary heuristic selection between batches. */
  batchIndex: number;
}

export interface ScoreIdeasInput {
  workspace: Workspace;
  sponsors: SponsorProfile[];
  opportunities: Opportunity[];
  ideas: Idea[];
  weights: Record<Criterion, number>;
}
export type ScoreDraft = Record<Criterion, CriterionScore>;

export const CRITIC_AGENTS = [
  { id: 'competitive', name: 'Competitive Analyst', kind: 'competitor' as const },
  { id: 'feasibility', name: 'Feasibility Engineer', kind: 'feasibility' as const },
  { id: 'sponsor', name: 'Sponsor Alignment Agent', kind: 'sponsor' as const },
  { id: 'skeptic', name: 'Skeptic', kind: 'assumption' as const },
  { id: 'product', name: 'Product Viability Agent', kind: 'weakness' as const },
];
export type CriticId = (typeof CRITIC_AGENTS)[number]['id'];

export interface CritiqueInput {
  workspace: Workspace;
  sponsors: SponsorProfile[];
  opportunities: Opportunity[];
  idea: Idea;
  critic: (typeof CRITIC_AGENTS)[number];
}

export interface ReviseInput {
  workspace: Workspace;
  sponsors: SponsorProfile[];
  idea: Idea;
  critiques: Critique[];
  round: number;
}
export interface ReviseResult {
  /** Fields of the idea to overwrite. Only evolvable content fields are honoured. */
  patch: Partial<Pick<Idea, 'title' | 'pitch' | 'problem' | 'audience' | 'solution' | 'differentiation' | 'alternatives' | 'sponsorIntegration' | 'architecture' | 'stack' | 'mvpFeatures' | 'stretchGoals' | 'feasibility' | 'risks' | 'complexity' | 'judgingAppeal'>>;
  reasons: Record<string, string>;
  summary: string;
}

// ── Stage 6: validation ──
export interface ClaimDraft {
  text: string;
  kind: Claim['kind'];
  importance: Claim['importance'];
}
export interface ClaimEvidenceSource {
  sourceId: string;
  url: string;
  title: string;
  text: string;
}
export interface ClaimVerdict {
  status: Claim['status'];
  sourceIds: string[];
  quotes: string[];
  note: string;
  method: Claim['method'];
}

export interface ValidationResearchPlan {
  competitorQueries: string[];
  techQueries: string[];
  paperQueries: string[];
}

// ── Judge Arena ──
export interface JudgeContext {
  workspace: Workspace;
  sponsors: SponsorProfile[];
  idea: Idea;
  claims: Claim[];
}
export interface JudgeQuestion {
  question: string;
  intent: string;
  dimension: JudgeDimension;
}
export interface OpeningQuestionInput extends JudgeContext {
  persona: JudgePersona;
  asked: string[];
}
export interface AnswerReviewInput extends JudgeContext {
  persona: JudgePersona;
  turn: JudgeTurn;
  answer: string;
  history: JudgeTurn[];
  followUpsRemaining: number;
}
export interface AnswerReview {
  evaluation: TurnEvaluation;
  followUp: (JudgeQuestion & { reason: string }) | null;
}
export interface ReportInput extends JudgeContext {
  session: JudgeSession;
  byDimension: Record<JudgeDimension, { avg: number | null; samples: number }>;
}
export interface ReportText {
  strengths: string[];
  weakAreas: { dimension: JudgeDimension; why: string; prep: string[] }[];
  preparationPlan: string[];
}

// ── Blueprint ──
export interface BlueprintInput extends JudgeContext {
  sources: { id: string; title: string; url: string }[];
  hours: number;
  teamSize: number;
  phases: { key: string; name: string; startHour: number; endHour: number }[];
}
export type BlueprintDraft = Omit<BlueprintSections, 'milestones'> & {
  milestoneGoals: Record<string, { goals: string[]; owner: string }>;
};

export interface RecommendInput {
  workspace: Workspace;
  ranked: { idea: Idea; coverage: { verified: number; total: number; ratio: number }; claims: Claim[] }[];
}

export interface Engine {
  readonly kind: EngineKind;
  readonly label: string;

  extractIntel(input: { workspace: Workspace; pages: PageText[]; manualText: string | null; hintSponsors: string[] }): Promise<IntelDraft>;
  profileSponsor(input: { workspace: Workspace; sponsor: SponsorRef; pages: PageText[] }): Promise<SponsorDraft>;
  discoverOpportunities(input: { workspace: Workspace; sponsors: SponsorProfile[]; research: TopicResearch[] }): Promise<OpportunityDraft[]>;

  generateIdeas(input: GenerateIdeasInput): Promise<IdeaDraft[]>;
  scoreIdeas(input: ScoreIdeasInput): Promise<Record<string, ScoreDraft>>;
  critiqueIdea(input: CritiqueInput): Promise<Critique[]>;
  reviseIdea(input: ReviseInput): Promise<ReviseResult>;

  planValidationResearch(input: { workspace: Workspace; idea: Idea }): Promise<ValidationResearchPlan>;
  extractClaims(input: { workspace: Workspace; idea: Idea; sponsors: SponsorProfile[] }): Promise<ClaimDraft[]>;
  verifyClaim(input: { claim: ClaimDraft; idea: Idea; sources: ClaimEvidenceSource[] }): Promise<ClaimVerdict>;
  explainRecommendation(input: RecommendInput): Promise<string>;

  openingQuestion(input: OpeningQuestionInput): Promise<JudgeQuestion>;
  reviewAnswer(input: AnswerReviewInput): Promise<AnswerReview>;
  writeReport(input: ReportInput): Promise<ReportText>;

  writeBlueprint(input: BlueprintInput): Promise<BlueprintDraft>;
}

export type { Blueprint, JudgeSession };
