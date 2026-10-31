import type {
  AgentEvent, Blueprint, CreateWorkspaceInput, IdeaDetailBundle, Idea, Job, JudgePersona, JudgeSession, Source, StageName,
  SystemStatus, Workspace, WorkspaceBundle, WorkspaceConfig, WorkspaceSummary,
} from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, (data as { details?: unknown } | null)?.details);
  }
  return data as T;
}

export const api = {
  status: () => request<SystemStatus>('GET', '/status'),
  listWorkspaces: () => request<WorkspaceSummary[]>('GET', '/workspaces'),
  createWorkspace: (input: CreateWorkspaceInput) => request<WorkspaceBundle>('POST', '/workspaces', input),
  getWorkspace: (id: string) => request<WorkspaceBundle>('GET', `/workspaces/${id}`),
  updateWorkspace: (id: string, patch: { name?: string; config?: Partial<WorkspaceConfig>; manualText?: string }) =>
    request<Workspace>('PATCH', `/workspaces/${id}`, patch),
  deleteWorkspace: (id: string) => request<void>('DELETE', `/workspaces/${id}`),
  run: (id: string, stage: StageName | 'full', wait = false) => request<Job>('POST', `/workspaces/${id}/run`, { stage, wait }),
  jobs: (id: string) => request<Job[]>('GET', `/workspaces/${id}/jobs`),
  events: (id: string, after?: string, limit = 200) =>
    request<AgentEvent[]>('GET', `/workspaces/${id}/events?limit=${limit}${after ? `&after=${encodeURIComponent(after)}` : ''}`),
  setIntelField: (id: string, field: string, value: unknown) => request<Workspace>('PUT', `/workspaces/${id}/intel/${field}`, { value }),
  sources: (id: string) => request<Source[]>('GET', `/workspaces/${id}/sources`),
  addSource: (id: string, input: { url?: string; title?: string; text?: string }) => request<Source>('POST', `/workspaces/${id}/sources`, input),
  idea: (id: string, ideaId: string) => request<IdeaDetailBundle>('GET', `/workspaces/${id}/ideas/${ideaId}`),
  patchIdea: (id: string, ideaId: string, patch: { status: 'shortlisted' | 'eliminated' | 'generated' }) =>
    request<Idea>('PATCH', `/workspaces/${id}/ideas/${ideaId}`, patch),
  validateIdea: (id: string, ideaId: string) => request<Job>('POST', `/workspaces/${id}/ideas/${ideaId}/validate`),
  recommendIdea: (id: string, ideaId: string) => request<Workspace>('POST', `/workspaces/${id}/ideas/${ideaId}/recommend`),
  judgeSessions: (id: string, ideaId: string) => request<JudgeSession[]>('GET', `/workspaces/${id}/ideas/${ideaId}/judge`),
  startJudge: (id: string, ideaId: string, body: { personas?: JudgePersona[]; maxFollowUps?: number }) =>
    request<JudgeSession>('POST', `/workspaces/${id}/ideas/${ideaId}/judge`, body),
  judgeSession: (id: string, sessionId: string) => request<JudgeSession>('GET', `/workspaces/${id}/judge/${sessionId}`),
  answerJudge: (id: string, sessionId: string, turnId: string, answer: string) =>
    request<JudgeSession>('POST', `/workspaces/${id}/judge/${sessionId}/answer`, { turnId, answer }),
  finishJudge: (id: string, sessionId: string) => request<JudgeSession>('POST', `/workspaces/${id}/judge/${sessionId}/finish`),
  generateBlueprint: (id: string, ideaId: string, body: { hours?: number; teamSize?: number } = {}) =>
    request<Blueprint>('POST', `/workspaces/${id}/ideas/${ideaId}/blueprint`, body),
  getBlueprint: (id: string, ideaId: string) => request<Blueprint>('GET', `/workspaces/${id}/ideas/${ideaId}/blueprint`),
  blueprintMarkdownUrl: (id: string, ideaId: string) => `/api/workspaces/${id}/ideas/${ideaId}/blueprint.md`,
};
