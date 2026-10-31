import { DEFAULT_CONFIG, STAGE_ORDER, type CreateWorkspaceInput, type Fact, type HackathonIntel, type StageName, type Workspace, type WorkspaceSummary } from '../../shared/types';
import { DEMO_URL } from '../research/demo';
import { assertPublicUrl, UnsafeUrlError } from '../research/ssrf';
import { now, uid } from '../lib/ids';
import { HttpError, saveWorkspace, type Deps } from '../pipeline/core';

const none = <T>(): Fact<T> => ({ value: null, status: 'unavailable', sourceIds: [] });

export function emptyIntel(): HackathonIntel {
  return {
    name: none(), objectives: none(), themes: none(), problemStatements: none(), judgingCriteria: none(), submissionRequirements: none(),
    restrictions: none(), mandatoryTech: none(), prizes: none(), startDate: none(), endDate: none(), durationHours: none(), organizers: none(), sponsors: none(),
  };
}

const user = <T>(value: T): Fact<T> => ({ value, status: 'verified', sourceIds: [], note: 'Entered by user' });

export async function createWorkspace(deps: Deps, input: CreateWorkspaceInput, allowPrivate: boolean): Promise<Workspace> {
  const id = uid('ws');
  const ts = now();
  const stages = Object.fromEntries(STAGE_ORDER.map((s) => [s, { status: 'idle' }])) as Workspace['stages'];
  const config = { ...DEFAULT_CONFIG, ...(input.config ?? {}) };
  const intel = emptyIntel();
  let url = input.url?.trim() || null;
  let name = input.name?.trim() || '';
  let mode: Workspace['mode'] = 'live';

  if (input.demo) {
    mode = 'demo';
    url = DEMO_URL;
    name = name || 'Resilient Cities Build Sprint 2026 (sample data)';
  } else if (url) {
    if (url.startsWith('demo://')) throw new HttpError(400, 'demo:// URLs are reserved for the sample workspace');
    try {
      url = (await assertPublicUrl(url, allowPrivate)).toString();
    } catch (e) {
      throw new HttpError(400, e instanceof UnsafeUrlError ? `URL not allowed: ${e.message}` : 'Invalid URL');
    }
    name = name || new URL(url).hostname.replace(/^www\./, '');
  }
  if (!input.demo && !url && !input.manualText?.trim()) throw new HttpError(400, 'Provide a hackathon URL or paste its details manually.');
  if (input.durationHours) intel.durationHours = user(input.durationHours);
  if (input.sponsors?.length) intel.sponsors = user(input.sponsors.map((s) => ({ name: s })));

  const ws: Workspace = {
    id, name: name || 'Untitled hackathon', url, mode, manualText: input.manualText?.trim() || null, config, intel, stages,
    recommendedIdeaId: null, createdAt: ts, updatedAt: ts,
  };
  return saveWorkspace(deps, ws);
}

export function summarise(deps: Deps, ws: Workspace): WorkspaceSummary {
  const ideas = deps.store.list('idea', ws.id);
  return {
    id: ws.id, name: ws.name, url: ws.url, mode: ws.mode, stages: ws.stages, recommendedIdeaId: ws.recommendedIdeaId,
    updatedAt: ws.updatedAt, createdAt: ws.createdAt,
    counts: {
      sources: deps.store.count('source', ws.id), sponsors: deps.store.count('sponsor', ws.id), ideas: ideas.length,
      shortlisted: ideas.filter((i) => i.status === 'shortlisted' || i.status === 'validated' || i.status === 'recommended').length,
      validated: ideas.filter((i) => i.status === 'validated' || i.status === 'recommended').length,
    },
  };
}

export type { StageName };
