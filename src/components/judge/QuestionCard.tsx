import { useEffect, useRef, useState } from 'react';
import { JUDGE_DIMENSION_LABELS, JUDGE_PERSONA_LABELS, type JudgeTurn } from '../../../shared/types';
import { Badge, Button, Card, Label, Textarea } from '../ui';
import { PersonaAvatar } from './PersonaAvatar';
import { MIN_ANSWER_CHARS } from './personas';

export function QuestionHeader({ turn }: { turn: JudgeTurn }) {
  return (
    <div className="flex items-start gap-3">
      <PersonaAvatar persona={turn.persona} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-fg">{JUDGE_PERSONA_LABELS[turn.persona]}</span>
          <Badge tone="info">{JUDGE_DIMENSION_LABELS[turn.dimension]}</Badge>
          {turn.depth > 0 && <Badge tone="accent">Follow-up {turn.depth}</Badge>}
        </div>
        {turn.followUpReason && (
          <div className="mt-1.5">
            <Badge tone="warn" className="whitespace-normal">Follow-up: {turn.followUpReason}</Badge>
          </div>
        )}
      </div>
    </div>
  );
}

/** The currently selected open question with its answer box. */
export function OpenQuestion({ turn, submitting, onSubmit }: { turn: JudgeTurn; submitting: boolean; onSubmit: (answer: string) => void }) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_ANSWER_CHARS;

  useEffect(() => {
    setText('');
    setTouched(false);
  }, [turn.id]);

  function submit() {
    if (submitting) return;
    setTouched(true);
    if (tooShort) {
      ref.current?.focus();
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <Card className="hm-in border-accent/40">
      <div className="space-y-3 p-4">
        <QuestionHeader turn={turn} />
        <blockquote className="border-l-2 border-accent pl-3 text-base font-medium leading-relaxed text-fg">{turn.question}</blockquote>
        <div className="rounded-md bg-surface-2/70 px-3 py-2 text-xs text-muted">
          <span className="font-semibold text-fg/80">What this judge is probing: </span>
          {turn.intent}
        </div>
        <div>
          <Label htmlFor={`answer-${turn.id}`} hint="Cmd/Ctrl+Enter to submit">Your answer</Label>
          <Textarea
            id={`answer-${turn.id}`}
            ref={ref}
            value={text}
            disabled={submitting}
            rows={6}
            aria-invalid={touched && tooShort}
            aria-describedby={`answer-help-${turn.id}`}
            placeholder="Answer as you would on stage: be specific, name trade-offs, cite evidence."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <div id={`answer-help-${turn.id}`} className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={touched && tooShort ? 'text-bad' : 'text-faint'} role={touched && tooShort ? 'alert' : undefined}>
              {touched && tooShort ? `Please write at least ${MIN_ANSWER_CHARS} characters.` : `${trimmed.length} characters`}
            </span>
            <Button variant="primary" onClick={submit} loading={submitting} disabled={submitting}>
              {submitting ? 'Judge is considering your answer…' : 'Submit answer'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
