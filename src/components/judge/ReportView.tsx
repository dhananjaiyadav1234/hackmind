import { Link } from 'react-router-dom';
import { JUDGE_DIMENSIONS, JUDGE_DIMENSION_LABELS, JUDGE_PERSONA_LABELS, type JudgePersona, type JudgeReport } from '../../../shared/types';
import { scoreTone } from '../../lib/format';
import { Badge, Button, Card, CardBody, CardHeader, Stat } from '../ui';
import { ScoreBar } from '../ui';
import { PersonaAvatar } from './PersonaAvatar';

export function ReportView({ report, wid, ideaId, onRestart, onReview }: { report: JudgeReport; wid: string; ideaId: string; onRestart: () => void; onReview: () => void }) {
  const tone = report.overall === null ? 'neutral' : scoreTone(report.overall);
  const personas = Object.entries(report.byPersona) as [JudgePersona, { avg: number | null; samples: number }][];
  return (
    <div className="hm-in space-y-4">
      <Card>
        <CardBody className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wider text-faint">Overall</div>
            <div data-testid="report-overall" className={`text-3xl font-semibold tabular-nums ${tone === 'neutral' ? 'text-fg' : `text-${tone}`}`}>
              {report.overall === null ? '—' : report.overall.toFixed(1)}
              <span className="ml-1 text-sm text-faint">/ 10</span>
            </div>
          </div>
          <Stat label="Questions answered" value={report.answered} />
          <Stat label="Evaluation engine" value={<Badge tone={report.engine === 'llm' ? 'accent' : 'warn'}>{report.engine === 'llm' ? 'LLM' : 'Rule-based'}</Badge>} />
        </CardBody>
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          Goal: understand and defend your project, not memorise answers. Use this report to find the gaps in your own understanding.
        </p>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Score by dimension" />
          <CardBody className="space-y-2">
            {JUDGE_DIMENSIONS.map((d) => (
              <ScoreBar key={d} score={report.byDimension[d]?.avg ?? null} label={`${JUDGE_DIMENSION_LABELS[d]} (${report.byDimension[d]?.samples ?? 0})`} />
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Score by judge" />
          <CardBody className="space-y-2.5">
            {personas.length === 0 && <p className="text-sm text-muted">No judge scores.</p>}
            {personas.map(([p, v]) => (
              <div key={p} className="flex items-center gap-2">
                <PersonaAvatar persona={p} size="sm" />
                <ScoreBar className="flex-1" score={v.avg} label={`${JUDGE_PERSONA_LABELS[p]} (${v.samples})`} />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Strengths" />
          <CardBody>
            {report.strengths.length ? (
              <ul className="list-disc space-y-1 pl-4 text-sm">{report.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
            ) : (
              <p className="text-sm text-muted">No standout strengths identified.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Weak areas" subtitle="Where a real judge is most likely to push" />
          <CardBody className="space-y-3">
            {report.weakAreas.length === 0 && <p className="text-sm text-muted">No weak areas flagged.</p>}
            {report.weakAreas.map((w) => (
              <div key={w.dimension} className="rounded-lg border border-bad/20 bg-bad/5 p-3">
                <div className="text-sm font-semibold text-bad">{JUDGE_DIMENSION_LABELS[w.dimension]}</div>
                <p className="mt-1 text-sm text-fg/90">{w.why}</p>
                {w.prep.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-muted">{w.prep.map((p, i) => <li key={i}>{p}</li>)}</ul>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Preparation plan" />
        <CardBody>
          <ul className="space-y-2">
            {report.preparationPlan.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <input type="checkbox" id={`prep-${i}`} className="mt-1 h-4 w-4 accent-[var(--color-accent)]" />
                <label htmlFor={`prep-${i}`}>{p}</label>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs text-muted">{report.caveat}</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onRestart}>Run another session</Button>
        <Link to={`/w/${wid}/blueprint/${ideaId}`} className="inline-flex items-center rounded-lg border border-line-strong bg-surface-3 px-3.5 py-2 text-sm font-medium hover:bg-line">
          Generate Blueprint
        </Link>
        <Button variant="ghost" onClick={onReview}>Review transcript</Button>
      </div>
    </div>
  );
}
