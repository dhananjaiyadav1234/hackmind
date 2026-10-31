import type { Milestone } from '../../../shared/types';

const COLORS = ['bg-accent', 'bg-accent-2', 'bg-info', 'bg-warn', 'bg-good', 'bg-bad'];

/** Percentage geometry for a milestone bar on a timeline of `total` hours. */
export function barGeometry(m: Pick<Milestone, 'startHour' | 'endHour'>, total: number) {
  const t = Math.max(total, 1);
  const start = Math.min(Math.max(m.startHour, 0), t);
  const end = Math.min(Math.max(m.endHour, start), t);
  return { left: (start / t) * 100, width: Math.max(((end - start) / t) * 100, 0.8) };
}

export function Timeline({ milestones, timelineHours, timelineBasis }: { milestones: Milestone[]; timelineHours: number; timelineBasis: string }) {
  const step = timelineHours <= 12 ? 2 : timelineHours <= 30 ? 6 : timelineHours <= 60 ? 12 : 24;
  const ticks: number[] = [];
  for (let h = 0; h <= timelineHours; h += step) ticks.push(h);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        <span className="font-medium text-fg/80">{timelineHours}h total.</span> {timelineBasis}
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[34rem]" role="list" aria-label="Milestone timeline">
          <div className="relative mb-1 ml-36 h-4 text-[10px] text-faint">
            {ticks.map((h) => (
              <span key={h} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(h / timelineHours) * 100}%` }}>{h}h</span>
            ))}
          </div>
          {milestones.map((m, i) => {
            const g = barGeometry(m, timelineHours);
            return (
              <div key={`${m.name}-${i}`} role="listitem" className="flex items-center gap-2 py-1">
                <div className="w-[8.5rem] shrink-0 truncate text-xs text-fg/90" title={m.name}>{m.name}</div>
                <div className="relative h-6 flex-1 rounded bg-surface-2">
                  <div
                    data-testid="milestone-bar"
                    data-left={g.left.toFixed(2)}
                    data-width={g.width.toFixed(2)}
                    className={`absolute top-0 flex h-6 items-center overflow-hidden rounded px-1.5 text-[10px] font-medium text-bg ${COLORS[i % COLORS.length]}`}
                    style={{ left: `${g.left}%`, width: `${g.width}%` }}
                    title={`${m.name}: hour ${m.startHour} to ${m.endHour}`}
                  >
                    <span className="truncate tabular-nums">{m.startHour}-{m.endHour}h</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
        {milestones.map((m, i) => (
          <div key={`${m.name}-g-${i}`} className="rounded-lg border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{m.name}</h4>
              <span className="text-xs tabular-nums text-faint">{m.endHour - m.startHour}h</span>
            </div>
            <div className="text-xs text-muted">Owner: {m.owner}</div>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-fg/90">{m.goals.map((g, j) => <li key={j}>{g}</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
