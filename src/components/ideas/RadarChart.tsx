import type { Idea } from '../../../shared/types';
import { CRITERIA, CRITERION_LABELS } from '../../../shared/types';

export const SERIES_COLORS = ['#7b6cff', '#4dd4c1', '#f5b84b', '#ff6b7a'];

/** Inline SVG radar of the 7 criteria (0..10) with a text alternative. */
export function RadarChart({ ideas, size = 320 }: { ideas: Idea[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 52;
  const n = CRITERIA.length;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(ang) * R * (v / 10), cy + Math.sin(ang) * R * (v / 10)] as const;
  };
  const poly = (idea: Idea) => CRITERIA.map((c, i) => pt(i, idea.scores?.criteria[c].score ?? 0).join(',')).join(' ');
  const summary = ideas
    .map((i) => `${i.title}: ${CRITERIA.map((c) => `${CRITERION_LABELS[c]} ${i.scores ? i.scores.criteria[c].score.toFixed(1) : 'n/a'}`).join(', ')}`)
    .join('. ');
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[360px]" role="img" aria-label={`Radar chart of criterion scores out of 10. ${summary}`}>
        {[2, 4, 6, 8, 10].map((lvl) => (
          <polygon key={lvl} points={CRITERIA.map((_, i) => pt(i, lvl).join(',')).join(' ')} fill="none" stroke="var(--color-line)" strokeWidth={1} />
        ))}
        {CRITERIA.map((c, i) => {
          const [x, y] = pt(i, 10);
          const [lx, ly] = pt(i, 11.8);
          return (
            <g key={c}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-line)" />
              <text x={lx} y={ly} textAnchor={lx < cx - 4 ? 'end' : lx > cx + 4 ? 'start' : 'middle'} dominantBaseline="middle" fontSize={10} fill="var(--color-muted)">
                {CRITERION_LABELS[c].split(' ')[0]}
              </text>
            </g>
          );
        })}
        {ideas.map((idea, k) => (
          <polygon key={idea.id} points={poly(idea)} fill={SERIES_COLORS[k % 4]} fillOpacity={0.14} stroke={SERIES_COLORS[k % 4]} strokeWidth={2} strokeLinejoin="round" />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
        {ideas.map((idea, k) => (
          <span key={idea.id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[k % 4] }} aria-hidden />
            {idea.title}
          </span>
        ))}
      </figcaption>
      <table className="sr-only">
        <caption>Criterion scores out of 10</caption>
        <thead>
          <tr>
            <th>Idea</th>
            {CRITERIA.map((c) => <th key={c}>{CRITERION_LABELS[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {ideas.map((i) => (
            <tr key={i.id}>
              <th>{i.title}</th>
              {CRITERIA.map((c) => <td key={c}>{i.scores ? i.scores.criteria[c].score.toFixed(1) : 'n/a'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
