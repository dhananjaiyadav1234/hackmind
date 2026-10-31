import { useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { CRITERIA, CRITERION_LABELS, type Fact, type HackathonIntel, type JudgingCriterion, type ProblemStatement, type Source, type SponsorRef } from '../../../shared/types';
import { deriveWeights } from '../../../shared/scoring';
import { api } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace-context';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorBanner, Input, PageHeader, ProgressBar, Spinner, StatusBadge, Textarea } from '../../components/ui';
import { Bullets, Chips, ExtLink, SourceChips, parseLines } from '../../components/workspace/common';

type Kind = 'string' | 'number' | 'list' | 'criteria' | 'problems' | 'sponsors';
const FIELDS: { key: keyof HackathonIntel; label: string; kind: Kind }[] = [
  { key: 'name', label: 'Name', kind: 'string' },
  { key: 'objectives', label: 'Objectives', kind: 'list' },
  { key: 'themes', label: 'Themes & tracks', kind: 'list' },
  { key: 'problemStatements', label: 'Problem statements', kind: 'problems' },
  { key: 'judgingCriteria', label: 'Judging criteria', kind: 'criteria' },
  { key: 'submissionRequirements', label: 'Submission requirements', kind: 'list' },
  { key: 'restrictions', label: 'Restrictions', kind: 'list' },
  { key: 'mandatoryTech', label: 'Mandatory technology', kind: 'list' },
  { key: 'prizes', label: 'Prizes', kind: 'list' },
  { key: 'startDate', label: 'Start date', kind: 'string' },
  { key: 'endDate', label: 'End date', kind: 'string' },
  { key: 'durationHours', label: 'Duration (hours)', kind: 'number' },
  { key: 'organizers', label: 'Organizers', kind: 'list' },
  { key: 'sponsors', label: 'Sponsors', kind: 'sponsors' },
];

function CriteriaTable({ rows }: { rows: JudgingCriterion[] }) {
  const total = rows.reduce((s, r) => s + (r.weight ?? 0), 0);
  const unweighted = rows.filter((r) => r.weight == null).length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
            <th className="pb-1.5 pr-3 font-medium">Criterion</th>
            <th className="pb-1.5 pr-3 font-medium">Weight</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.name}-${i}`} className="border-t border-line align-top">
              <td className="py-2 pr-3">
                <div className="font-medium">{r.name}</div>
                {r.description && <div className="text-xs text-muted">{r.description}</div>}
              </td>
              <td className="w-44 py-2">
                {r.weight == null ? (
                  <span className="text-xs text-faint">not stated</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <ProgressBar value={r.weight} max={100} className="flex-1" />
                    <span className="w-10 text-right font-mono text-xs">{r.weight}%</span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line-strong text-xs text-muted">
            <td className="pt-2">Total of stated weights{unweighted > 0 ? ` (${unweighted} criteria without a weight)` : ''}</td>
            <td className="pt-2 text-right font-mono">{total}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FactValue({ field, fact }: { field: (typeof FIELDS)[number]; fact: Fact<unknown> }) {
  const v = fact.value;
  if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) {
    return <p className="text-sm italic text-faint">No value — {fact.status === 'unavailable' ? 'this could not be found in the available sources.' : 'nothing recorded.'}</p>;
  }
  switch (field.kind) {
    case 'criteria':
      return <CriteriaTable rows={v as JudgingCriterion[]} />;
    case 'problems':
      return (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          {(v as ProblemStatement[]).map((p, i) => (
            <div key={`${p.title}-${i}`} className="rounded-lg border border-line bg-surface-2/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <h5 className="text-sm font-medium">{p.title}</h5>
                {p.sponsor && <Badge tone="info">{p.sponsor}</Badge>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{p.description}</p>
            </div>
          ))}
        </div>
      );
    case 'sponsors':
      return (
        <ul className="flex flex-wrap gap-1.5">
          {(v as SponsorRef[]).map((s, i) => (
            <li key={`${s.name}-${i}`} className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs">
              <ExtLink href={s.url}>{s.name}</ExtLink>
              {s.tier && <span className="ml-1 text-faint">· {s.tier}</span>}
            </li>
          ))}
        </ul>
      );
    case 'number':
      return <p className="text-sm font-medium tabular-nums">{String(v)} hours</p>;
    case 'string':
      return <p className="text-sm">{String(v)}</p>;
    case 'list': {
      const items = v as string[];
      return items.length > 6 || items.some((x) => x.length > 40) ? <Bullets items={items} /> : <Chips items={items} />;
    }
  }
}

function toEditText(kind: Kind, v: unknown): string {
  if (v == null) return '';
  switch (kind) {
    case 'list': return (v as string[]).join('\n');
    case 'sponsors': return (v as SponsorRef[]).map((s) => s.name).join('\n');
    case 'problems': return (v as ProblemStatement[]).map((p) => [p.title, p.description, p.sponsor ?? ''].join(' | ').replace(/( \| )+$/, '')).join('\n');
    default: return String(v);
  }
}

function FieldEditor({ field, fact, onSave, onCancel }: { field: (typeof FIELDS)[number]; fact: Fact<unknown>; onSave: (value: unknown) => Promise<void>; onCancel: () => void }) {
  const [text, setText] = useState(toEditText(field.kind, fact.value));
  const [rows, setRows] = useState<{ name: string; weight: string; description: string }[]>(() =>
    ((fact.value as JudgingCriterion[] | null) ?? []).map((r) => ({ name: r.name, weight: r.weight == null ? '' : String(r.weight), description: r.description ?? '' })),
  );
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setErr(null);
    let value: unknown;
    switch (field.kind) {
      case 'string': value = text.trim(); if (!value) return setErr('Value cannot be empty.'); break;
      case 'number': { const n = Number(text); if (!text.trim() || !Number.isFinite(n) || n <= 0) return setErr('Enter a positive number.'); value = n; break; }
      case 'list': value = parseLines(text); break;
      case 'sponsors': {
        const old = (fact.value as SponsorRef[] | null) ?? [];
        value = parseLines(text).map((name) => old.find((o) => o.name === name) ?? { name });
        break;
      }
      case 'problems':
        value = parseLines(text).map((l) => {
          const [title, description, sponsor] = l.split('|').map((s) => s.trim());
          return { title, description: description ?? '', ...(sponsor ? { sponsor } : {}) };
        });
        break;
      case 'criteria': {
        const out: JudgingCriterion[] = [];
        for (const r of rows) {
          if (!r.name.trim()) continue;
          let weight: number | null = null;
          if (r.weight.trim()) {
            weight = Number(r.weight);
            if (!Number.isFinite(weight) || weight < 0 || weight > 100) return setErr(`Weight for “${r.name}” must be between 0 and 100.`);
          }
          out.push({ name: r.name.trim(), weight, ...(r.description.trim() ? { description: r.description.trim() } : {}) });
        }
        value = out;
        break;
      }
    }
    setSaving(true);
    try {
      await onSave(value);
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  const idBase = `edit-${field.key}`;
  return (
    <div className="space-y-2">
      {field.kind === 'criteria' ? (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[12rem_5rem_1fr_auto]">
              <Input aria-label={`Criterion ${i + 1} name`} placeholder="Name" value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label={`Criterion ${i + 1} weight`} type="number" min={0} max={100} placeholder="%" value={r.weight} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))} />
              <Input className="col-span-2 sm:col-span-1" aria-label={`Criterion ${i + 1} description`} placeholder="Description (optional)" value={r.description} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <Button size="sm" variant="ghost" aria-label={`Remove criterion ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <Button size="sm" onClick={() => setRows([...rows, { name: '', weight: '', description: '' }])}>Add criterion</Button>
        </div>
      ) : field.kind === 'string' || field.kind === 'number' ? (
        <Input id={idBase} aria-label={field.label} type={field.kind === 'number' ? 'number' : 'text'} value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <>
          <Textarea id={idBase} aria-label={field.label} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-xs text-faint">
            {field.kind === 'problems' ? 'One per line: title | description | sponsor (optional).' : 'One item per line.'}
          </p>
        </>
      )}
      <ErrorBanner error={err} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" loading={saving} onClick={submit}>Save</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <span className="text-xs text-faint">Saved values are marked verified (“Entered by user”).</span>
      </div>
    </div>
  );
}

function FieldCard({ field, fact, onSave, sources }: { field: (typeof FIELDS)[number]; fact: Fact<unknown>; onSave: (key: string, value: unknown) => Promise<void>; sources: Source[] }) {
  const [editing, setEditing] = useState(false);
  return (
    <Card as="section">
      <CardHeader
        title={field.label}
        right={
          <>
            <StatusBadge status={fact.status} />
            {!editing && (
              <Button size="sm" variant="ghost" aria-label={`Edit ${field.label}`} onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" aria-hidden /> Edit
              </Button>
            )}
          </>
        }
      />
      <CardBody className="space-y-3">
        {editing ? (
          <FieldEditor field={field} fact={fact} onCancel={() => setEditing(false)} onSave={async (v) => { await onSave(field.key, v); setEditing(false); }} />
        ) : (
          <FactValue field={field} fact={fact} />
        )}
        {fact.note && <p className="text-xs text-muted">Note: {fact.note}</p>}
        <SourceChips ids={fact.sourceIds} sources={sources} />
      </CardBody>
    </Card>
  );
}

function Legend() {
  const rows: { s: string; t: ReactNode }[] = [
    { s: 'verified', t: 'Found in a cited source, or entered by you.' },
    { s: 'assumed', t: 'Inferred or defaulted — plausible but not confirmed. Treat with caution.' },
    { s: 'unavailable', t: 'Could not be found. HACKMIND does not fill the gap with guesses.' },
  ];
  return (
    <Card>
      <CardBody className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.s} className="flex items-start gap-2 text-xs text-muted">
            <StatusBadge status={r.s} /> <span>{r.t}</span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function DerivedWeights({ fact }: { fact: Fact<JudgingCriterion[]> }) {
  const { weights, basis } = deriveWeights(fact.value, fact.status === 'verified');
  const sorted = [...CRITERIA].sort((a, b) => weights[b] - weights[a]);
  return (
    <Card className="border-accent/30">
      <CardHeader title="How ideas will be scored" subtitle="Official criteria are mapped to HACKMIND’s seven evaluation axes. These weights drive every idea’s total." />
      <CardBody className="space-y-2">
        {sorted.map((c) => (
          <div key={c} className="flex items-center gap-3">
            <div className="w-44 shrink-0 truncate text-xs text-muted">{CRITERION_LABELS[c]}</div>
            <ProgressBar value={weights[c]} max={Math.max(...CRITERIA.map((k) => weights[k]), 1)} className="flex-1" />
            <div className="w-12 shrink-0 text-right font-mono text-xs tabular-nums">{weights[c]}%</div>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted">{basis}</p>
        <p className="text-xs text-faint">Scores are AI-assisted estimates for prioritising ideas, not predictions of the judges’ marks.</p>
      </CardBody>
    </Card>
  );
}

export default function Intelligence() {
  const { bundle, loading, error, clearError, refresh, busy, runStage } = useWorkspace();
  if (!bundle) return loading ? <Spinner label="Loading intelligence…" /> : <ErrorBanner error={error ?? 'Workspace unavailable'} />;
  const w = bundle.workspace;
  const notRun = w.stages.intel.status === 'idle';
  const allEmpty = FIELDS.every((f) => (w.intel[f.key] as Fact<unknown>).value == null);

  const save = async (key: string, value: unknown) => {
    await api.setIntelField(w.id, key, value);
    await refresh();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hackathon intelligence"
        subtitle="Everything HACKMIND believes about the rules, judging and logistics, with where each claim came from."
        right={
          <Button variant={notRun ? 'primary' : 'secondary'} disabled={busy} onClick={() => void runStage('intel')}>
            {notRun ? 'Run intelligence' : 'Re-run intelligence'}
          </Button>
        }
      />
      <ErrorBanner error={error} onDismiss={clearError} />
      <Legend />
      {notRun && allEmpty ? (
        <EmptyState title="Intelligence has not been gathered yet">
          Run the Hackathon Intelligence stage to extract rules, themes and judging criteria from the hackathon page and any notes you pasted on the Overview. You can also fill any field in by hand below once it appears.
        </EmptyState>
      ) : (
        <>
          <DerivedWeights fact={w.intel.judgingCriteria} />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.kind === 'criteria' || f.kind === 'problems' ? 'lg:col-span-2' : ''}>
                <FieldCard field={f} fact={w.intel[f.key] as Fact<unknown>} onSave={save} sources={bundle.sources} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
