import { ArrowRight } from 'lucide-react';
import type { Idea } from '../../../shared/types';
import { Badge, Card, CardBody, EmptyState } from '../ui';
import { SEVERITY_TONE } from './shared';

function Delta({ before, after }: { before: number | null; after: number | null }) {
  if (before === null || after === null) return <span className="text-faint">score n/a</span>;
  const d = after - before;
  return (
    <span className="font-mono text-xs">
      {before.toFixed(1)} <ArrowRight className="inline h-3 w-3" aria-hidden /> {after.toFixed(1)}{' '}
      <span className={d > 0 ? 'text-good' : d < 0 ? 'text-bad' : 'text-faint'}>({d > 0 ? '+' : ''}{d.toFixed(1)})</span>
    </span>
  );
}

export function EvolutionTab({ idea }: { idea: Idea }) {
  if (idea.revisions.length === 0) {
    return (
      <EmptyState title="No evolution yet">
        The Evolve stage runs critique → revise rounds on shortlisted ideas: critic agents challenge assumptions, competitors and feasibility, then the idea is rewritten and re-scored. Shortlist this idea and run “Evolve shortlist” to see its timeline.
      </EmptyState>
    );
  }
  return (
    <ol className="relative ml-2 space-y-5 border-l border-line-strong pl-5">
      {idea.revisions.map((r) => (
        <li key={r.id} className="relative">
          <span className="absolute -left-[27px] top-2 h-3 w-3 rounded-full border-2 border-accent bg-bg" aria-hidden />
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">Round {r.round}</Badge>
                <Badge>v{r.version}</Badge>
                <span className="text-xs text-muted">{r.agent}</span>
                <span className="ml-auto"><Delta before={r.scoreBefore} after={r.scoreAfter} /></span>
              </div>
              <p className="text-sm text-fg/90">{r.summary}</p>

              {r.critiques.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Critiques</h4>
                  <ul className="space-y-1.5">
                    {r.critiques.map((c, k) => (
                      <li key={k} className="flex flex-wrap items-start gap-1.5 text-xs text-muted">
                        <Badge tone={SEVERITY_TONE[c.severity]}>{c.severity}</Badge>
                        <Badge>{c.kind}</Badge>
                        <span className="text-faint">{c.agent}:</span>
                        <span className="min-w-0 flex-1 basis-60">{c.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {r.changes.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Changes</h4>
                  <ul className="space-y-2">
                    {r.changes.map((c, k) => (
                      <li key={k} className="rounded-lg border border-line bg-surface-2/50 p-2.5 text-xs">
                        <div className="font-mono text-[11px] text-info">{c.field}</div>
                        <div className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-1.5 md:grid-cols-2">
                          <div className="whitespace-pre-wrap rounded border border-bad/20 bg-bad/5 p-2 text-muted"><span className="sr-only">Before: </span>{c.before || '(empty)'}</div>
                          <div className="whitespace-pre-wrap rounded border border-good/20 bg-good/5 p-2 text-fg/90"><span className="sr-only">After: </span>{c.after || '(empty)'}</div>
                        </div>
                        <p className="mt-1.5 text-muted"><span className="text-fg">Reason:</span> {c.reason}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>
        </li>
      ))}
    </ol>
  );
}
