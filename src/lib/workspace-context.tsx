import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentEvent, Idea, Job, StageName, WorkspaceBundle } from '../../shared/types';
import { api } from './api';

interface WorkspaceCtx {
  id: string;
  bundle: WorkspaceBundle | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  events: AgentEvent[];
  activeJobs: Job[];
  busy: boolean;
  /** Start a pipeline stage (or 'full') and refresh state. Errors are surfaced via `error`. */
  runStage: (stage: StageName | 'full') => Promise<void>;
  clearError: () => void;
  setError: (msg: string | null) => void;
  ideaById: (id: string) => Idea | undefined;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return v;
}

export function WorkspaceProvider({ id, children }: { id: string; children: ReactNode }) {
  const [bundle, setBundle] = useState<WorkspaceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const seen = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const b = await api.getWorkspace(id);
      setBundle(b);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const addEvents = useCallback((incoming: AgentEvent[]) => {
    const fresh = incoming.filter((e) => !seen.current.has(e.id));
    if (!fresh.length) return;
    fresh.forEach((e) => seen.current.add(e.id));
    setEvents((prev) => [...prev, ...fresh].slice(-500));
  }, []);

  // Initial load + reset when switching workspaces.
  useEffect(() => {
    seen.current = new Set();
    setEvents([]);
    setBundle(null);
    setLoading(true);
    void refresh();
    api.events(id).then(addEvents).catch(() => undefined);
  }, [id, refresh, addEvents]);

  // Live agent activity via SSE; refresh bundle whenever a job changes.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api/workspaces/${id}/events/stream`);
    es.addEventListener('agent', (m) => addEvents([JSON.parse((m as MessageEvent).data) as AgentEvent]));
    es.addEventListener('job', () => void refresh());
    return () => es.close();
  }, [id, addEvents, refresh]);

  const activeJobs = useMemo(() => (bundle?.jobs ?? []).filter((j) => j.status === 'running' || j.status === 'queued'), [bundle]);
  const busy = activeJobs.length > 0;

  // Poll while jobs run (SSE job events may be missed behind proxies).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      void refresh();
      const last = events[events.length - 1];
      api.events(id, last?.id).then(addEvents).catch(() => undefined);
    }, 2500);
    return () => clearInterval(t);
  }, [busy, id, refresh, events, addEvents]);

  const runStage = useCallback(
    async (stage: StageName | 'full') => {
      try {
        await api.run(id, stage);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
      await refresh();
    },
    [id, refresh],
  );

  const ideaById = useCallback((iid: string) => bundle?.ideas.find((i) => i.id === iid), [bundle]);

  const value: WorkspaceCtx = {
    id, bundle, loading, error, refresh, events, activeJobs, busy, runStage,
    clearError: () => setError(null), setError, ideaById,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
