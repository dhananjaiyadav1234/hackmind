import { useEffect, useRef } from 'react';
import { useWorkspace } from '../lib/workspace-context';
import { Badge, Card, CardHeader, type Tone } from './ui';
import { clockTime } from '../lib/format';

const levelTone: Record<string, Tone> = { info: 'neutral', success: 'good', warn: 'warn', error: 'bad' };

/** Live feed of agent events (SSE + polling). Reusable anywhere inside the workspace layout. */
export function AgentActivity({ compact = false, maxHeight = 'max-h-[60vh]' }: { compact?: boolean; maxHeight?: string }) {
  const { events, busy, activeJobs } = useWorkspace();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [events.length]);

  return (
    <Card>
      <CardHeader
        title="Agent activity"
        subtitle={busy ? `${activeJobs.length} job running` : 'Idle — events appear here as agents work'}
        right={busy ? <span className="hm-pulse text-xs text-info">● live</span> : undefined}
      />
      <ol className={`${maxHeight} space-y-2 overflow-auto p-3`} aria-live="polite">
        {events.length === 0 && <li className="text-xs text-faint">No activity yet. Run a stage to see agents work.</li>}
        {events.map((e) => (
          <li key={e.id} className="hm-in rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <Badge tone={levelTone[e.level] ?? 'neutral'}>{e.agent}</Badge>
              <span className="font-mono text-[10px] text-faint">{clockTime(e.at)}</span>
            </div>
            <p className={`mt-1.5 text-xs leading-relaxed ${compact ? 'text-muted' : 'text-fg/90'}`}>{e.message}</p>
          </li>
        ))}
        <div ref={endRef} />
      </ol>
    </Card>
  );
}
