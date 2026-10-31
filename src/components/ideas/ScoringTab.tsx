import type { Idea, Source } from '../../../shared/types';
import { CRITERIA, CRITERION_LABELS } from '../../../shared/types';
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar } from '../ui';
import { weightedContribution } from './compare-logic';
import { Section, SourceChips, scoreColor } from './shared';

const CONF_TONE = { low: 'bad', medium: 'warn', high: 'good' } as const;

function Trend({ idea }: { idea: Idea }) {
  const pts: number[] = [];
  for (const r of idea.revisions) {
    if (r.scoreBefore !== null && pts.length === 0) pts.push(r.scoreBefore);
    if (r.scoreAfter !== null) pts.push(r.scoreAfter);
  }
  if (pts.length < 2) return null;
  const W = 180, H = 44, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * (W - 8) + 4, H - 6 - ((v - min) / span) * (H - 12)] as const);
  return (
    <div>
      <svg width={W} height={H} role="img" aria-label={`Score history across revisions: ${pts.map((p) => p.toFixed(1)).join(', then ')}`}>
        <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
        {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="var(--color-accent-2)" />)}
      </svg>
      <div className="text-[11px] text-faint">{pts[0].toFixed(1)} → {pts[pts.length - 1].toFixed(1)} across {idea.revisions.length} revision(s)</div>
    </div>
  );
}

export function ScoringTab({ idea, sources, onOpenSource }: { idea: Idea; sources: Map<string, Source>; onOpenSource: (id: string) => void }) {
  const s = idea.scores;
  if (!s) {
    return <EmptyState title="Not scored yet">Run idea generation to score this idea against the hackathon criteria.</EmptyState>;
  }
  const sum = CRITERIA.reduce((t, c) => t + weightedContribution(s.criteria[c].score, s.weights[c]), 0);
  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-faint">Total (weighted, out of 100)</div>
            <div className="mt-0.5 font-mono text-3xl font-semibold tabular-nums" data-testid="total-score">{s.total.toFixed(1)}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="accent">basis: {s.basis}</Badge>
              <Badge>scored by {s.scoredBy}</Badge>
            </div>
          </div>
          <Trend idea={idea} />
        </CardBody>
        <div className="border-t border-line px-4 py-3 text-xs text-muted">
          <span className="font-medium text-fg">Weight basis: </span>{s.weightBasis}
        </div>
      </Card>

      <Card>
        <CardHeader title="Criterion breakdown" subtitle="Contribution = score ÷ 10 × weight. Contributions add up to the total." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <caption className="sr-only">Per-criterion scoring breakdown</caption>
            <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-faint">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Criterion</th>
                <th scope="col" className="px-2 py-2 font-medium">Weight</th>
                <th scope="col" className="w-44 px-2 py-2 font-medium">Score</th>
                <th scope="col" className="px-2 py-2 font-medium">Contribution</th>
                <th scope="col" className="px-2 py-2 font-medium">Confidence</th>
                <th scope="col" className="px-2 py-2 font-medium">Rationale &amp; evidence</th>
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((c) => {
                const cs = s.criteria[c];
                return (
                  <tr key={c} className="border-t border-line align-top" data-criterion={c}>
                    <th scope="row" className="px-4 py-3 text-left font-medium text-fg">{CRITERION_LABELS[c]}</th>
                    <td className="px-2 py-3 font-mono tabular-nums">{s.weights[c]}%</td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1" style={{ color: scoreColor(cs.score) }}><ProgressBar value={cs.score} max={10} tone={cs.score >= 7 ? 'good' : cs.score >= 5 ? 'warn' : 'bad'} /></div>
                        <span className="w-8 text-right font-mono tabular-nums text-fg">{cs.score.toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 font-mono tabular-nums" data-testid={`contrib-${c}`}>{weightedContribution(cs.score, s.weights[c]).toFixed(1)}</td>
                    <td className="px-2 py-3"><Badge tone={CONF_TONE[cs.confidence]}>{cs.confidence}</Badge></td>
                    <td className="px-2 py-3">
                      <p className="text-muted">{cs.rationale}</p>
                      {cs.evidenceIds.length > 0 && <div className="mt-1.5"><SourceChips ids={cs.evidenceIds} sources={sources} onOpen={onOpenSource} /></div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong bg-surface-2/60 font-medium">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-2 py-2.5 font-mono">{CRITERIA.reduce((t, c) => t + s.weights[c], 0).toFixed(0)}%</td>
                <td />
                <td className="px-2 py-2.5 font-mono tabular-nums" data-testid="contrib-sum">{sum.toFixed(1)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Evidence-based adjustments" subtitle="Caps applied after deep validation" />
        <CardBody>
          {s.adjustments.length === 0 ? (
            <p className="text-xs text-faint">No adjustments. {s.basis === 'validated' ? 'Validation found nothing that required capping a score.' : 'Adjustments appear after deep validation.'}</p>
          ) : (
            <ul className="space-y-2">
              {s.adjustments.map((a, k) => (
                <li key={k} className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs">
                  <span className="font-medium text-fg">{CRITERION_LABELS[a.criterion]}</span>{' '}
                  <span className="font-mono text-warn">{a.from.toFixed(1)} → {a.to.toFixed(1)}</span>
                  <p className="mt-0.5 text-muted">{a.reason.replace(/^\[validation\]\s*/, '')}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {idea.revisions.some((r) => r.scoreBefore !== null || r.scoreAfter !== null) && (
        <Card>
          <CardHeader title="Score history" />
          <CardBody>
            <Section title="By revision">
              <ul className="space-y-1 text-xs text-muted">
                {idea.revisions.map((r) => (
                  <li key={r.id}>Round {r.round}, v{r.version}: <span className="font-mono text-fg">{r.scoreBefore?.toFixed(1) ?? '—'} → {r.scoreAfter?.toFixed(1) ?? '—'}</span></li>
                ))}
              </ul>
            </Section>
          </CardBody>
        </Card>
      )}

      <p className="text-xs text-faint" role="note">{s.disclaimer}</p>
    </div>
  );
}
