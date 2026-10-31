import type { Blueprint, Idea, JudgeSession, JudgeTurn, TurnEvaluation, WorkspaceBundle } from '../../shared/types';
import { JUDGE_DIMENSIONS } from '../../shared/types';

export const WID = 'w1';
export const IDEA_ID = 'i1';

export function makeIdea(over: Partial<Idea> = {}): Idea {
  return { id: IDEA_ID, workspaceId: WID, title: 'Edge Copilot', pitch: 'A pitch', status: 'recommended', tier: 'innovative', scores: null, ...over } as unknown as Idea;
}

export function makeBundle(): WorkspaceBundle {
  return {
    workspace: {
      id: WID, name: 'Hack', recommendedIdeaId: IDEA_ID,
      config: { teamSize: 3, initialIdeas: 20, shortlistSize: 8, deepValidateCount: 3, evolutionRounds: 2 },
      intel: { durationHours: { value: 24, status: 'verified', sourceIds: [] } },
    },
    sources: [{ id: 's1', title: 'Spec doc' }],
    sponsors: [], opportunities: [], jobs: [],
    ideas: [makeIdea(), makeIdea({ id: 'i2', title: 'Eliminated one', status: 'eliminated' })],
  } as unknown as WorkspaceBundle;
}

export function makeEvaluation(over: Partial<TurnEvaluation> = {}): TurnEvaluation {
  const dimensions = Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, { score: d === 'sponsor' ? null : 7, comment: '' }])) as TurnEvaluation['dimensions'];
  return { dimensions, overall: 7.5, strengths: ['Clear tradeoffs'], weaknesses: ['No latency numbers'], suggestion: 'Quote a benchmark.', engine: 'heuristic', ...over };
}

export function makeTurn(over: Partial<JudgeTurn> = {}): JudgeTurn {
  return { id: 't1', persona: 'technical', question: 'Why a queue?', intent: 'Probe scalability', dimension: 'technical', depth: 0, askedAt: '2026-01-01T00:00:00Z', ...over };
}

export function makeSession(turns: JudgeTurn[] = [makeTurn()], over: Partial<JudgeSession> = {}): JudgeSession {
  return { id: 'sess1', workspaceId: WID, ideaId: IDEA_ID, personas: ['technical', 'aggressive'], maxFollowUps: 1, status: 'active', turns, report: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over };
}

export function makeBlueprint(): Blueprint {
  return {
    id: 'bp1', workspaceId: WID, ideaId: IDEA_ID, generatedAt: '2026-01-01T00:00:00Z', engine: 'heuristic', timelineHours: 24, timelineBasis: 'Based on 24h event',
    markdown: '# Plan',
    sections: {
      finalPitch: 'Pitch text', problemAndSolution: 'P&S', differentiation: 'Diff',
      researchEvidence: [{ claim: 'Market is big', status: 'assumption', sourceIds: ['s1'] }],
      architecture: { summary: 'Arch', components: [{ name: 'API', responsibility: 'serve', tech: 'Node' }] },
      techStack: [{ layer: 'FE', choice: 'React', reason: 'fast' }],
      databaseDesign: [{ table: 'users', purpose: 'accounts', columns: ['id'] }],
      apiDesign: [{ method: 'GET', path: '/api/x', purpose: 'list' }],
      mvpScope: ['a'], stretchGoals: ['b'],
      milestones: [
        { name: 'Setup', startHour: 0, endHour: 6, goals: ['scaffold'], owner: 'Lead' },
        { name: 'Build core', startHour: 6, endHour: 18, goals: ['api'], owner: 'Dev' },
      ],
      teamResponsibilities: [{ role: 'Lead', responsibilities: ['plan'] }],
      demoStoryline: [{ step: 'Intro', seconds: 30, script: 'hi' }, { step: 'Demo', seconds: 90, script: 'go' }],
      presentationOutline: [{ slide: 'Title', content: 'name' }],
      judgeQuestions: [{ question: 'Why?', recommendedAnswer: 'Because', groundedIn: ['s1'] }],
    },
  };
}
