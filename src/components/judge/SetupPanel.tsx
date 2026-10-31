import { useState } from 'react';
import { Check } from 'lucide-react';
import { JUDGE_PERSONAS, JUDGE_PERSONA_LABELS, type JudgePersona } from '../../../shared/types';
import { cn } from '../../lib/format';
import { Button, Card, CardBody, CardHeader, Label } from '../ui';
import { PersonaAvatar } from './PersonaAvatar';
import { PERSONA_META } from './personas';

export function SetupPanel({ starting, onStart }: { starting: boolean; onStart: (personas: JudgePersona[], maxFollowUps: number) => void }) {
  const [selected, setSelected] = useState<JudgePersona[]>([...JUDGE_PERSONAS]);
  const [depth, setDepth] = useState(1);

  function toggle(p: JudgePersona) {
    setSelected((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  return (
    <Card>
      <CardHeader title="Assemble your panel" subtitle="Each judge asks one opening question tailored to your idea." />
      <CardBody className="space-y-5">
        <div role="group" aria-label="Judge personas" className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {JUDGE_PERSONAS.map((p) => {
            const on = selected.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                disabled={starting}
                onClick={() => toggle(p)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent',
                  on ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface-2/40 hover:border-line-strong',
                )}
              >
                <PersonaAvatar persona={p} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                    {JUDGE_PERSONA_LABELS[p]}
                    {on && <Check className="h-4 w-4 text-accent" aria-hidden />}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{PERSONA_META[p].blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <Label htmlFor="followup-depth" hint="How many times a judge may press on a weak answer">Follow-up depth</Label>
          <div id="followup-depth" role="radiogroup" aria-label="Follow-up depth" className="inline-flex overflow-hidden rounded-lg border border-line-strong">
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={depth === n}
                onClick={() => setDepth(n)}
                disabled={starting}
                className={cn('px-4 py-1.5 text-sm tabular-nums', depth === n ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-fg')}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={starting} disabled={selected.length === 0} onClick={() => onStart(JUDGE_PERSONAS.filter((p) => selected.includes(p)), depth)}>
            {starting ? 'Judges are reading your idea…' : 'Start judging session'}
          </Button>
          {selected.length === 0 && <span className="text-xs text-bad">Select at least one judge.</span>}
          {starting && <span className="text-xs text-muted">Generating one contextual opening question per judge. This can take a few seconds.</span>}
        </div>
      </CardBody>
    </Card>
  );
}
