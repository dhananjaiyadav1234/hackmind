import { useMemo, useState } from 'react';
import { CheckCircle2, Flag } from 'lucide-react';
import { JUDGE_PERSONA_LABELS, type Idea, type JudgePersona, type JudgeSession, type JudgeTurn } from '../../../shared/types';
import { api } from '../../lib/api';
import { cn } from '../../lib/format';
import { Badge, Button, Card, CardBody, CardHeader, ErrorBanner, ProgressBar, Spinner } from '../ui';
import { EvaluationCard } from './EvaluationCard';
import { PersonaAvatar } from './PersonaAvatar';
import { OpenQuestion, QuestionHeader } from './QuestionCard';

export function personaStats(turns: JudgeTurn[], persona: JudgePersona) {
  const mine = turns.filter((t) => t.persona === persona);
  const answered = mine.filter((t) => t.answer !== undefined);
  const scores = answered.map((t) => t.evaluation?.overall).filter((n): n is number => typeof n === 'number');
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return { asked: mine.length, answered: answered.length, avg };
}

export function SessionView({ wid, idea, session, onUpdate }: { wid: string; idea: Idea | undefined; session: JudgeSession; onUpdate: (s: JudgeSession) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [lastAnswered, setLastAnswered] = useState<string | null>(null);

  const open = useMemo(() => session.turns.filter((t) => t.answer === undefined), [session.turns]);
  const answeredTurns = useMemo(() => session.turns.filter((t) => t.answer !== undefined), [session.turns]);
  const current = open.find((t) => t.id === picked) ?? open[0];
  const total = session.turns.length;
  const finished = session.status === 'finished';

  async function submit(answer: string) {
    if (!current || submitting) return;
    const turnId = current.id;
    setSubmitting(true);
    setError(null);
    try {
      const next = await api.answerJudge(wid, session.id, turnId, answer);
      setLastAnswered(turnId);
      const followUp = next.turns.find((t) => t.parentTurnId === turnId && t.answer === undefined);
      setPicked(followUp?.id ?? null);
      onUpdate(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    try {
      onUpdate(await api.finishJudge(wid, session.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside aria-label="Judge panel" className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">The panel</h2>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {session.personas.map((p) => {
            const s = personaStats(session.turns, p);
            const waiting = open.some((t) => t.persona === p);
            return (
              <Card key={p} className={cn('p-3', waiting && 'border-accent/40')}>
                <div className="flex items-center gap-2.5">
                  <PersonaAvatar persona={p} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{JUDGE_PERSONA_LABELS[p]}</div>
                    <div className="text-xs text-muted">{s.answered}/{s.asked} answered</div>
                  </div>
                  <div className="text-right font-mono text-sm tabular-nums" aria-label={`Average score ${s.avg === null ? 'none' : s.avg.toFixed(1)}`}>
                    {s.avg === null ? '—' : s.avg.toFixed(1)}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-faint">Defending</div>
                <div className="truncate text-sm font-semibold">{idea?.title ?? 'Idea'}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums text-muted" data-testid="progress-label">{answeredTurns.length}/{total} answered</span>
                <Button
                  variant="primary"
                  onClick={finish}
                  loading={finishing}
                  disabled={answeredTurns.length < 1 || submitting || finished}
                  title={answeredTurns.length < 1 ? 'Answer at least one question first' : undefined}
                >
                  <Flag className="h-4 w-4" aria-hidden /> Finish &amp; get report
                </Button>
              </div>
            </div>
            <ProgressBar value={answeredTurns.length} max={Math.max(total, 1)} tone="good" />
            <p className="text-xs text-faint">Answer in any order. Goal: understand and defend your project, not memorise answers.</p>
          </CardBody>
        </Card>

        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {finishing && <Spinner label="Compiling your report…" />}

        {open.length > 0 && !finished && (
          <section aria-label="Open questions" className="space-y-3">
            {open.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Unanswered questions">
                {open.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPicked(t.id)}
                    disabled={submitting}
                    aria-pressed={current?.id === t.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      current?.id === t.id ? 'border-accent bg-accent/15 text-fg' : 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/20',
                    )}
                  >
                    {JUDGE_PERSONA_LABELS[t.persona]}
                    {t.depth > 0 && <span className="text-[10px] opacity-80">follow-up</span>}
                  </button>
                ))}
              </div>
            )}
            {current && <OpenQuestion turn={current} submitting={submitting} onSubmit={(a) => void submit(a)} />}
            {submitting && <Spinner label="Judge is considering your answer…" />}
          </section>
        )}

        {open.length === 0 && !finished && (
          <Card>
            <CardBody className="flex items-center gap-2 text-sm text-good">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Every question is answered. Finish to get your report.
            </CardBody>
          </Card>
        )}

        <section aria-label="Transcript" className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">Transcript</h2>
          {answeredTurns.length === 0 && <p className="text-sm text-muted">No answers yet. Evaluations appear here right after you answer.</p>}
          {[...answeredTurns]
            .sort((a, b) => (a.id === lastAnswered ? -1 : b.id === lastAnswered ? 1 : 0))
            .map((t) => (
              <Card key={t.id} className={cn(t.id === lastAnswered && 'border-good/30')}>
                <CardHeader title={<QuestionHeader turn={t} />} right={t.evaluation && <Badge tone="neutral">{t.evaluation.overall.toFixed(1)}/10</Badge>} />
                <CardBody className="space-y-3">
                  <p className="text-sm font-medium text-fg">{t.question}</p>
                  <div className="rounded-md bg-surface-2/70 px-3 py-2 text-sm text-fg/90">
                    <div className="mb-0.5 text-[11px] uppercase tracking-wider text-faint">Your answer</div>
                    <p className="whitespace-pre-wrap">{t.answer}</p>
                  </div>
                  {t.evaluation ? <EvaluationCard evaluation={t.evaluation} /> : <p className="text-xs text-muted">No evaluation recorded.</p>}
                </CardBody>
              </Card>
            ))}
        </section>
      </div>
    </div>
  );
}
