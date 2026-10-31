import type { Claim, Criterion, Idea, IdeaDetailBundle, Source, StageName, WorkspaceBundle } from '../../shared/types';
import { CRITERIA, DEFAULT_CONFIG } from '../../shared/types';
import { DEFAULT_WEIGHTS, SCORE_DISCLAIMER, buildScoreCard } from '../../shared/scoring';

export function makeIdea(over: Partial<Idea> & { id: string; title: string }, scoreBase = 7): Idea {
  const criteria = Object.fromEntries(
    CRITERIA.map((c, i) => [c, { score: Math.min(10, Math.max(0, scoreBase + ((i % 3) - 1) * 0.7)), rationale: `Because ${c}`, evidenceIds: i === 0 ? ['s1'] : [], confidence: 'medium' as const }]),
  ) as Record<Criterion, { score: number; rationale: string; evidenceIds: string[]; confidence: 'medium' }>;
  return {
    workspaceId: 'w1',
    tier: 'safe',
    status: 'generated',
    pitch: `${over.title} pitch`,
    problem: 'A problem',
    audience: 'Developers',
    solution: 'A solution',
    differentiation: 'Different because X',
    alternatives: [{ name: 'Rival', note: 'Does a bit', sourceIds: ['s1'] }],
    sponsorIntegration: [{ sponsor: 'Acme', technology: 'Acme API', how: 'calls it', justification: 'needed', depth: 'superficial' }],
    architecture: { summary: 'Web + API', components: [{ name: 'API', responsibility: 'serves', tech: 'Node' }] },
    stack: [{ layer: 'Frontend', choice: 'React', reason: 'fast' }],
    mvpFeatures: ['Feature A', 'Feature B'],
    stretchGoals: ['Stretch'],
    feasibility: { level: 'high', assessment: 'Doable' },
    risks: [{ risk: 'Latency', severity: 'medium', mitigation: 'Cache' }],
    complexity: { level: 'medium', estimatedHours: 24, rationale: 'Medium' },
    judgingAppeal: 'Judges like it',
    supportingResearch: [],
    scores: buildScoreCard({ criteria, weights: DEFAULT_WEIGHTS, weightBasis: 'Default weights', basis: 'initial', scoredBy: 'heuristic' }),
    version: 1,
    revisions: [],
    rank: null,
    eliminatedReason: null,
    recommendationRationale: null,
    generatedBy: 'Idea Agent',
    engine: 'heuristic',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

export const FIXTURE_IDEAS: Idea[] = [
  makeIdea({ id: 'i1', title: 'Safe Alpha', tier: 'safe', rank: 1, status: 'recommended' }, 8),
  makeIdea({ id: 'i2', title: 'Innovative Beta', tier: 'innovative', rank: 2, status: 'shortlisted' }, 7),
  makeIdea({ id: 'i3', title: 'Moonshot Gamma', tier: 'moonshot', rank: 3 }, 5.5),
  makeIdea({ id: 'i4', title: 'Eliminated Delta', tier: 'safe', rank: 4, status: 'eliminated', eliminatedReason: 'Too small' }, 4),
];

export function makeBundle(ideas: Idea[] = FIXTURE_IDEAS, stageStatus: 'idle' | 'done' = 'done'): WorkspaceBundle {
  const stages = Object.fromEntries(
    (['intel', 'sponsors', 'opportunities', 'ideas', 'evolve', 'validate'] as StageName[]).map((s) => [s, { status: stageStatus }]),
  );
  return {
    workspace: {
      id: 'w1', name: 'Test Hack', url: null, mode: 'demo', manualText: null, config: DEFAULT_CONFIG,
      intel: {} as never, stages: stages as never, recommendedIdeaId: 'i1', createdAt: '', updatedAt: '2026-01-01T00:00:00Z',
    },
    sources: [], sponsors: [], opportunities: [], ideas, jobs: [],
  };
}

export const SOURCE: Source = {
  id: 's1', workspaceId: 'w1', url: 'https://example.com/doc', title: 'Example doc', kind: 'web', provider: 'fetch',
  snippet: 'A snippet', content: 'Captured page text <b>not html</b>', fetchedAt: '2026-01-01T00:00:00Z',
};

export function makeClaim(over: Partial<Claim> & { id: string; text: string; status: Claim['status'] }): Claim {
  return {
    workspaceId: 'w1', ideaId: 'i1', kind: 'problem', importance: 'high', sourceIds: [], supportingQuotes: [], note: '', method: 'keyword', checkedAt: '', ...over,
  };
}

export function makeDetail(idea: Idea, claims: Claim[] = []): IdeaDetailBundle {
  return { idea, claims, evidence: [], sources: [SOURCE] };
}

export { SCORE_DISCLAIMER };
