import type { Store } from '../db';
import type { Engine } from '../agents/engine';
import type { Research } from '../research/types';
import { uid, now } from '../lib/ids';
import type { AgentEvent, Fact, Idea, Source, SourceKind, StageName, Workspace } from '../../shared/types';
import { STAGE_ORDER } from '../../shared/types';

export interface Deps {
  store: Store;
  engine: Engine;
  research: Research;
  /** Used for workspaces in demo mode (bundled fixtures, no network). */
  demoResearch: Research;
  bus: EventBus;
}

type Listener = (kind: 'agent' | 'job', payload: unknown) => void;

/** In-process pub/sub for SSE; persistence of events is done by `emit`. */
export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(workspaceId: string, fn: Listener): () => void {
    const set = this.listeners.get(workspaceId) ?? new Set();
    set.add(fn);
    this.listeners.set(workspaceId, set);
    return () => {
      set.delete(fn);
      if (!set.size) this.listeners.delete(workspaceId);
    };
  }

  publish(workspaceId: string, kind: 'agent' | 'job', payload: unknown): void {
    for (const fn of this.listeners.get(workspaceId) ?? []) {
      try {
        fn(kind, payload);
      } catch {
        /* a dead SSE client must not break the pipeline */
      }
    }
  }
}

export interface StageCtx {
  deps: Deps;
  research: Research;
  wsId: string;
  jobId?: string;
  log: (agent: string, message: string, level?: AgentEvent['level'], stage?: AgentEvent['stage'], data?: Record<string, unknown>) => void;
  progress: (done: number, total: number, label: string) => void;
  stage: StageName;
}

export function emit(deps: Deps, wsId: string, e: Omit<AgentEvent, 'id' | 'workspaceId' | 'at'>): AgentEvent {
  const event: AgentEvent = { ...e, id: uid('evt'), workspaceId: wsId, at: now() };
  deps.store.put('event', wsId, event.id, event);
  deps.bus.publish(wsId, 'agent', event);
  return event;
}

export function getWorkspace(deps: Deps, id: string): Workspace {
  const ws = deps.store.get('workspace', id);
  if (!ws) throw new HttpError(404, 'Workspace not found');
  return ws;
}

export function saveWorkspace(deps: Deps, ws: Workspace): Workspace {
  ws.updatedAt = now();
  return deps.store.put('workspace', ws.id, ws.id, ws);
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function markStale(ws: Workspace, after: StageName): void {
  const idx = STAGE_ORDER.indexOf(after);
  for (const s of STAGE_ORDER.slice(idx + 1)) {
    if (ws.stages[s].status === 'done') ws.stages[s] = { ...ws.stages[s], status: 'stale' };
  }
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Per-workspace source registry that dedupes by URL. */
export class SourceBook {
  private byUrl = new Map<string, Source>();
  private byId = new Map<string, Source>();

  constructor(private deps: Deps, private wsId: string) {
    for (const s of deps.store.list('source', wsId)) {
      this.byUrl.set(s.url, s);
      this.byId.set(s.id, s);
    }
  }

  all(): Source[] {
    return [...this.byId.values()];
  }
  get(id: string): Source | undefined {
    return this.byId.get(id);
  }

  add(input: { url: string; title: string; kind: SourceKind; provider: string; snippet?: string; content?: string; meta?: Source['meta'] }): Source {
    const existing = this.byUrl.get(input.url);
    if (existing) {
      // upgrade thin records with richer content
      if (input.content && input.content.length > existing.content.length) {
        const upgraded = { ...existing, content: input.content.slice(0, 12_000), title: input.title || existing.title, fetchedAt: now() };
        this.deps.store.put('source', this.wsId, upgraded.id, upgraded);
        this.byUrl.set(upgraded.url, upgraded);
        this.byId.set(upgraded.id, upgraded);
        return upgraded;
      }
      return existing;
    }
    const s: Source = {
      id: uid('src'),
      workspaceId: this.wsId,
      url: input.url,
      title: (input.title || input.url).slice(0, 200),
      kind: input.kind,
      provider: input.provider,
      snippet: (input.snippet ?? input.content ?? '').slice(0, 500),
      content: (input.content ?? input.snippet ?? '').slice(0, 12_000),
      meta: input.meta,
      fetchedAt: now(),
    };
    this.deps.store.put('source', this.wsId, s.id, s);
    this.byUrl.set(s.url, s);
    this.byId.set(s.id, s);
    return s;
  }
}

export const emptyFact = <T>(): Fact<T> => ({ value: null, status: 'unavailable', sourceIds: [] });

export function sortIdeas(ideas: Idea[]): Idea[] {
  return [...ideas].sort((a, b) => (b.scores?.total ?? -1) - (a.scores?.total ?? -1));
}
