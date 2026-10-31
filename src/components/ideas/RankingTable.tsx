import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Crown } from 'lucide-react';
import type { Criterion, Idea } from '../../../shared/types';
import { CRITERIA, CRITERION_LABELS } from '../../../shared/types';
import { cn } from '../../lib/format';
import { IdeaStatusBadge, TIER_SHORT, criterionScore, heatStyle, sortIdeasByRank } from './shared';
import { IdeaQuickActions, SelectBox, type IdeaActions } from './IdeaBoard';
import { Badge } from '../ui';

type SortKey = 'rank' | 'total' | Criterion;

export function RankingTable({ ideas, a }: { ideas: Idea[]; a: IdeaActions }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rank', dir: 'asc' });

  const rows = useMemo(() => {
    const val = (i: Idea): number => {
      if (sort.key === 'rank') return i.rank ?? Number.POSITIVE_INFINITY;
      if (sort.key === 'total') return i.scores?.total ?? -1;
      return criterionScore(i, sort.key) ?? -1;
    };
    const list = [...ideas].sort((x, y) => {
      const d = val(x) - val(y);
      if (d !== 0 && Number.isFinite(d)) return sort.dir === 'asc' ? d : -d;
      if (!Number.isFinite(d) && d !== 0) return sort.dir === 'asc' ? (d > 0 ? 1 : -1) : d > 0 ? -1 : 1;
      return sortIdeasByRank(x, y);
    });
    return list;
  }, [ideas, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'rank' ? 'asc' : 'desc' }));

  const Th = ({ k, label, short, className }: { k: SortKey; label: string; short?: string; className?: string }) => {
    const active = sort.key === k;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-2 py-2 text-left font-medium', className)}>
        <button type="button" onClick={() => toggle(k)} title={`Sort by ${label}`} aria-label={`Sort by ${label}`} className={cn('inline-flex items-center gap-1 whitespace-nowrap hover:text-fg', active && 'text-fg')}>
          {short ?? label}
          {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[1040px] border-collapse text-xs">
        <caption className="sr-only">Idea ranking with per-criterion scores out of 10</caption>
        <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-faint">
          <tr>
            <th scope="col" className="w-8 px-2 py-2">
              <span className="sr-only">Select</span>
            </th>
            <Th k="rank" label="Rank" short="#" />
            <th scope="col" className="px-2 py-2 text-left font-medium">Idea</th>
            <Th k="total" label="Total" />
            {CRITERIA.map((c) => (
              <Th key={c} k={c} label={CRITERION_LABELS[c]} short={CRITERION_LABELS[c].split(' ')[0]} className="text-center" />
            ))}
            <th scope="col" className="px-2 py-2 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} className={cn('border-t border-line', i.id === a.recommendedId && 'bg-good/5', i.status === 'eliminated' && 'opacity-60')}>
              <td className="px-2 py-2"><SelectBox idea={i} a={a} /></td>
              <td className="px-2 py-2 font-mono text-faint">{i.rank ?? '—'}</td>
              <td className="max-w-[18rem] px-2 py-2">
                <div className="flex items-center gap-1.5">
                  {i.id === a.recommendedId && <Crown className="h-3.5 w-3.5 shrink-0 text-good" aria-label="Recommended" />}
                  <Link to={`/w/${a.wid}/ideas/${i.id}`} className="truncate font-medium text-fg hover:text-[#b3aaff] hover:underline">{i.title}</Link>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>{TIER_SHORT[i.tier]}</Badge>
                  <IdeaStatusBadge status={i.status} />
                </div>
              </td>
              <td className="px-2 py-2 font-mono text-sm font-semibold tabular-nums">{i.scores ? i.scores.total.toFixed(1) : '—'}</td>
              {CRITERIA.map((c) => {
                const s = criterionScore(i, c);
                return (
                  <td key={c} className="px-1 py-1 text-center font-mono tabular-nums" style={heatStyle(s)}>
                    {s === null ? '—' : s.toFixed(1)}
                  </td>
                );
              })}
              <td className="px-2 py-2"><IdeaQuickActions idea={i} a={a} /></td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={12} className="px-3 py-8 text-center text-faint">No ideas match the filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
