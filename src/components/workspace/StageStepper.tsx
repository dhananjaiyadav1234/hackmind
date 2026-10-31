import { STAGE_LABELS, STAGE_ORDER, type StageName, type StageState } from '../../../shared/types';
import { cn } from '../../lib/format';

const dot: Record<StageState['status'], string> = {
  idle: 'bg-surface-3 border-line-strong',
  running: 'bg-info border-info hm-pulse',
  done: 'bg-good border-good',
  failed: 'bg-bad border-bad',
  stale: 'bg-warn border-warn',
};

/** Compact 6-dot pipeline indicator. */
export function MiniStepper({ stages }: { stages: Record<StageName, StageState> }) {
  const done = STAGE_ORDER.filter((s) => stages[s]?.status === 'done').length;
  return (
    <div role="img" aria-label={`Pipeline: ${done} of ${STAGE_ORDER.length} stages complete`} className="flex items-center gap-1">
      {STAGE_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <span title={`${STAGE_LABELS[s]}: ${stages[s]?.status ?? 'idle'}`} className={cn('h-2.5 w-2.5 rounded-full border', dot[stages[s]?.status ?? 'idle'])} />
          {i < STAGE_ORDER.length - 1 && <span className="h-px w-3 bg-line-strong" />}
        </div>
      ))}
      <span className="ml-2 text-[11px] text-faint">{done}/{STAGE_ORDER.length}</span>
    </div>
  );
}
