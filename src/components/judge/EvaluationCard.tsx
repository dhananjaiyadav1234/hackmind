import { JUDGE_DIMENSIONS, JUDGE_DIMENSION_LABELS, type TurnEvaluation } from '../../../shared/types';
import { Badge, ScoreBar } from '../ui';
import { scoreTone } from '../../lib/format';

export function EvaluationCard({ evaluation }: { evaluation: TurnEvaluation }) {
  const tone = scoreTone(evaluation.overall);
  return (
    <div className="hm-in space-y-3 rounded-lg border border-line bg-surface-2/60 p-3" aria-label="Evaluation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-wider text-faint">Judge score</span>
          <span data-testid="eval-overall" className={`text-2xl font-semibold tabular-nums text-${tone}`}>{evaluation.overall.toFixed(1)}</span>
          <span className="text-xs text-faint">/ 10</span>
        </div>
        <Badge tone={evaluation.engine === 'llm' ? 'accent' : 'warn'}>{evaluation.engine === 'llm' ? 'LLM judge' : 'Rule-based'}</Badge>
      </div>
      {evaluation.engine === 'heuristic' && (
        <p className="rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
          Heuristic evaluation: rule-based and shallow (it checks length, specificity and keywords, not true correctness). Treat the score as a rough signal only.
        </p>
      )}
      <div className="space-y-1.5">
        {JUDGE_DIMENSIONS.map((d) => {
          const dim = evaluation.dimensions[d];
          return (
            <div key={d} title={dim?.comment || undefined}>
              <ScoreBar score={dim?.score ?? null} label={JUDGE_DIMENSION_LABELS[d]} />
              {dim?.score == null ? (
                <p className="ml-0 pl-0 text-[11px] text-faint sm:pl-[10.75rem]">No signal from this answer</p>
              ) : (
                dim.comment && <p className="text-[11px] text-faint sm:pl-[10.75rem]">{dim.comment}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <BulletList title="Strengths" items={evaluation.strengths} tone="text-good" />
        <BulletList title="Weaknesses" items={evaluation.weaknesses} tone="text-bad" />
      </div>
      {evaluation.suggestion && (
        <p className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-2 text-sm text-fg/90">
          <span className="font-medium text-[#b3aaff]">Suggestion: </span>
          {evaluation.suggestion}
        </p>
      )}
    </div>
  );
}

function BulletList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h5 className={`mb-1 text-xs font-semibold ${tone}`}>{title}</h5>
      <ul className="list-disc space-y-0.5 pl-4 text-sm text-fg/90">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
