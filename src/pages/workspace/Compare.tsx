import { useMemo, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { GitCompare, Trophy } from 'lucide-react';
import type { Idea } from '../../../shared/types';
import { CRITERIA, CRITERION_LABELS } from '../../../shared/types';
import { useWorkspace } from '../../lib/workspace-context';
import { Badge, Card, CardBody, CardHeader, EmptyState, Spinner } from '../../components/ui';
import { cn } from '../../lib/format';
import { RadarChart, SERIES_COLORS } from '../../components/ideas/RadarChart';
import { bestIndices, summariseWinner, weightedContribution } from '../../components/ideas/compare-logic';
import { DEPTH_TONE, FEAS_TONE, IdeaStatusBadge, LEVEL_TONE, SEVERITY_TONE, TIER_SHORT, sortIdeasByRank } from '../../components/ideas/shared';

const MAX = 4;
const LEVEL_NUM = { low: 1, medium: 2, high: 3 } as const;

interface Row {
  key: string;
  label: string;
  cells: ReactNode[];
  values?: (number | null)[];
  higherIsBetter?: boolean;
}

export default function Compare() {
  const { wid = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { bundle } = useWorkspace();
  const all = useMemo(() => [...(bundle?.ideas ?? [])].sort(sortIdeasByRank), [bundle]);

  if (!bundle) return <Spinner label="Loading ideas…" />;

  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const selected = ids.map((id) => all.find((i) => i.id === id)).filter((i): i is Idea => !!i).slice(0, MAX);
  const setIds = (next: string[]) => {
    const p = new URLSearchParams(params);
    if (next.length) p.set('ids', next.join(','));
    else p.delete('ids');
    setParams(p, { replace: true });
  };
  const toggle = (id: string) => {
    const cur = selected.map((i) => i.id);
    if (cur.includes(id)) setIds(cur.filter((x) => x !== id));
    else if (cur.length < MAX) setIds([...cur, id]);
  };

  const picker = (
    <Card className="mb-5">
      <CardHeader title="Choose ideas to compare" subtitle={`Pick 2–${MAX}. ${selected.length} selected.`} />
      <CardBody>
        {all.length === 0 ? (
          <p className="text-sm text-muted">No ideas yet — generate ideas first.</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ideas available to compare">
            {all.map((i) => {
              const on = selected.some((s) => s.id === i.id);
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && selected.length >= MAX}
                  onClick={() => toggle(i.id)}
                  className={cn(
                    'max-w-full truncate rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40',
                    on ? 'border-accent bg-accent/20 text-fg' : 'border-line-strong bg-surface-2 text-muted hover:text-fg',
                  )}
                >
                  {i.rank ? `#${i.rank} ` : ''}
                  {i.title}
                </button>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );

  const header = (
    <div className="mb-5">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
        <GitCompare className="h-5 w-5 text-accent" aria-hidden /> Compare ideas
      </h1>
      <p className="mt-1 text-sm text-muted">Side-by-side view. Scores are AI-assisted estimates, not a prediction of winning.</p>
    </div>
  );

  if (selected.length < 2) {
    return (
      <div>
        {header}
        {picker}
        <EmptyState icon={<GitCompare className="h-8 w-8" aria-hidden />} title="Select at least two ideas">
          Choose 2–{MAX} ideas above, or select them with the checkboxes on the <Link className="text-info underline" to={`/w/${wid}/ideas`}>idea board</Link>.
        </EmptyState>
      </div>
    );
  }

  const summary = summariseWinner(selected);
  const topSeverity = (i: Idea) => [...i.risks].sort((a, b) => LEVEL_NUM[b.severity] - LEVEL_NUM[a.severity]).slice(0, 2);

  const rows: Row[] = [
    { key: 'pitch', label: 'Pitch', cells: selected.map((i) => <span key={i.id} className="text-xs leading-relaxed text-muted">{i.pitch}</span>) },
    { key: 'tier', label: 'Tier', cells: selected.map((i) => <Badge key={i.id}>{TIER_SHORT[i.tier]}</Badge>) },
    { key: 'status', label: 'Status', cells: selected.map((i) => <IdeaStatusBadge key={i.id} status={i.status} />) },
    {
      key: 'total',
      label: 'Total score',
      higherIsBetter: true,
      values: selected.map((i) => i.scores?.total ?? null),
      cells: selected.map((i) => <span key={i.id} className="font-mono text-base font-semibold tabular-nums">{i.scores ? i.scores.total.toFixed(1) : '—'}<span className="text-xs text-faint"> /100</span></span>),
    },
    ...CRITERIA.map<Row>((c) => ({
      key: c,
      label: CRITERION_LABELS[c],
      higherIsBetter: true,
      values: selected.map((i) => i.scores?.criteria[c].score ?? null),
      cells: selected.map((i) => {
        const s = i.scores;
        return (
          <span key={i.id} className="font-mono tabular-nums">
            {s ? s.criteria[c].score.toFixed(1) : '—'}
            {s && <span className="ml-1 text-[11px] text-faint">w{s.weights[c]}% → {weightedContribution(s.criteria[c].score, s.weights[c]).toFixed(1)}</span>}
          </span>
        );
      }),
    })),
    {
      key: 'complexity',
      label: 'Complexity / est. hours',
      higherIsBetter: false,
      values: selected.map((i) => i.complexity.estimatedHours),
      cells: selected.map((i) => (
        <span key={i.id} className="inline-flex items-center gap-1.5">
          <Badge tone={LEVEL_TONE[i.complexity.level]}>{i.complexity.level}</Badge>
          <span className="font-mono text-xs">{i.complexity.estimatedHours}h</span>
        </span>
      )),
    },
    {
      key: 'feasibility',
      label: 'Feasibility',
      higherIsBetter: true,
      values: selected.map((i) => LEVEL_NUM[i.feasibility.level]),
      cells: selected.map((i) => <Badge key={i.id} tone={FEAS_TONE[i.feasibility.level]}>{i.feasibility.level}</Badge>),
    },
    {
      key: 'sponsors',
      label: 'Sponsor integrations',
      higherIsBetter: true,
      values: selected.map((i) => i.sponsorIntegration.filter((s) => s.depth !== 'superficial').length),
      cells: selected.map((i) => (
        <ul key={i.id} className="space-y-1">
          {i.sponsorIntegration.length === 0 && <li className="text-xs text-faint">None</li>}
          {i.sponsorIntegration.map((s, k) => (
            <li key={k} className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-fg">{s.sponsor}</span>
              <Badge tone={DEPTH_TONE[s.depth]}>{s.depth}</Badge>
            </li>
          ))}
        </ul>
      )),
    },
    {
      key: 'mvp',
      label: 'MVP features',
      values: selected.map((i) => i.mvpFeatures.length),
      cells: selected.map((i) => <span key={i.id} className="font-mono">{i.mvpFeatures.length}</span>),
    },
    {
      key: 'risks',
      label: 'Top risks',
      cells: selected.map((i) => (
        <ul key={i.id} className="space-y-1">
          {topSeverity(i).map((r, k) => (
            <li key={k} className="text-xs text-muted">
              <Badge tone={SEVERITY_TONE[r.severity]} className="mr-1">{r.severity}</Badge>
              {r.risk}
            </li>
          ))}
          {i.risks.length === 0 && <li className="text-xs text-faint">None recorded</li>}
        </ul>
      )),
    },
    {
      key: 'alternatives',
      label: 'Existing alternatives',
      higherIsBetter: false,
      values: selected.map((i) => i.alternatives.length),
      cells: selected.map((i) => <span key={i.id} className="font-mono">{i.alternatives.length}</span>),
    },
    { key: 'diff', label: 'Differentiation', cells: selected.map((i) => <span key={i.id} className="text-xs leading-relaxed text-muted">{i.differentiation}</span>) },
  ];

  return (
    <div>
      {header}
      {picker}

      <div className="mb-5 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader title="Criteria radar" subtitle="Scores out of 10" />
          <CardBody>
            <RadarChart ideas={selected} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Trophy className="h-4 w-4 text-warn" aria-hidden /> Why the leader leads</span>} subtitle="Weighted contribution = score ÷ 10 × criterion weight" />
          <CardBody className="space-y-3 text-sm">
            {summary ? (
              <>
                <p>
                  <strong>{summary.winner.title}</strong> leads <strong>{summary.runnerUp.title}</strong> by{' '}
                  <span className="font-mono">{summary.totalDelta.toFixed(1)}</span> points ({summary.winner.scores!.total.toFixed(1)} vs {summary.runnerUp.scores!.total.toFixed(1)}
                  {selected.length > 2 ? '; compared with the next-best idea' : ''}).
                </p>
                {summary.totalDelta === 0 && <p className="text-muted">The two are tied on total score; differences below cancel out.</p>}
                {summary.leads.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-good">Where it gains</div>
                    <ul className="space-y-1">
                      {summary.leads.map((d) => (
                        <li key={d.criterion} className="text-xs text-muted">
                          <span className="text-fg">{d.label}</span>: {d.winnerScore.toFixed(1)} vs {d.otherScore.toFixed(1)} → <span className="font-mono text-good">+{d.delta.toFixed(1)}</span> pts
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.trails.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-medium text-warn">Where it gives up ground</div>
                    <ul className="space-y-1">
                      {summary.trails.map((d) => (
                        <li key={d.criterion} className="text-xs text-muted">
                          <span className="text-fg">{d.label}</span>: {d.winnerScore.toFixed(1)} vs {d.otherScore.toFixed(1)} → <span className="font-mono text-warn">{d.delta.toFixed(1)}</span> pts
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-faint">Small gaps are within the noise of an AI-assisted estimate; treat close calls as ties and let evidence decide.</p>
              </>
            ) : (
              <p className="text-muted">At least two scored ideas are needed to explain a lead. Run idea generation to score them.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Side-by-side comparison of selected ideas. Best value in each row is marked.</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="w-40 px-3 py-2.5 text-left text-xs font-medium text-faint">Dimension</th>
              {selected.map((i, k) => (
                <th key={i.id} scope="col" className="px-3 py-2.5 text-left align-top">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES_COLORS[k % 4] }} aria-hidden />
                    <div className="min-w-0">
                      <Link to={`/w/${wid}/ideas/${i.id}`} className="text-sm font-semibold text-fg hover:underline">{i.title}</Link>
                      <div className="mt-0.5 text-[11px] font-normal text-faint">{i.rank ? `Rank #${i.rank}` : 'Unranked'}</div>
                      <button type="button" onClick={() => toggle(i.id)} className="mt-0.5 text-[11px] font-normal text-faint underline hover:text-fg" aria-label={`Remove ${i.title} from comparison`}>Remove</button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const best = r.values ? bestIndices(r.values, r.higherIsBetter ?? true) : new Set<number>();
              return (
                <tr key={r.key} className="border-t border-line align-top">
                  <th scope="row" className="px-3 py-2.5 text-left text-xs font-medium text-muted">{r.label}</th>
                  {r.cells.map((cell, idx) => (
                    <td key={idx} className={cn('px-3 py-2.5', best.has(idx) && 'bg-good/10')}>
                      {cell}
                      {best.has(idx) && <span className="ml-1.5 text-[10px] font-medium uppercase text-good">best</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
