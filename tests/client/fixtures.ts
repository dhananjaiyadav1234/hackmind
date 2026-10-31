import type { Fact, HackathonIntel, StageName, StageState, Workspace, WorkspaceBundle } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const f = (value: unknown, status: Fact<unknown>['status'], note?: string): Fact<any> => ({ value, status, sourceIds: [], note });

export function makeBundle(): WorkspaceBundle {
  const intel: HackathonIntel = {
    name: f('Test Hack', 'verified'),
    objectives: f(['Build useful agents'], 'verified'),
    themes: f(['Agents'], 'assumed', 'Inferred from page title'),
    problemStatements: f(null, 'unavailable'),
    judgingCriteria: f([{ name: 'Innovation', weight: 60 }, { name: 'Technical complexity', weight: 40 }], 'verified'),
    submissionRequirements: f(null, 'unavailable'),
    restrictions: f(null, 'unavailable'),
    mandatoryTech: f(null, 'unavailable'),
    prizes: f(null, 'unavailable'),
    startDate: f(null, 'unavailable'),
    endDate: f(null, 'unavailable'),
    durationHours: f(48, 'assumed'),
    organizers: f(null, 'unavailable'),
    sponsors: f(null, 'unavailable'),
  };
  const stage: StageState = { status: 'idle' };
  const stages = Object.fromEntries((['intel', 'sponsors', 'opportunities', 'ideas', 'evolve', 'validate'] as StageName[]).map((s) => [s, { ...stage }])) as Record<StageName, StageState>;
  const workspace: Workspace = {
    id: 'w1', name: 'Test Hack', url: null, mode: 'demo', manualText: null, config: { ...DEFAULT_CONFIG }, intel, stages,
    recommendedIdeaId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  return { workspace, sources: [], sponsors: [], opportunities: [], ideas: [], jobs: [] };
}
