import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Gavel, Play, RotateCcw, ScrollText, Star, Zap } from 'lucide-react';
import { STAGE_LABELS, STAGE_ORDER, type StageName, type StageState, type WorkspaceConfig } from '../../../shared/types';
import { api } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace-context';
import { cn, timeAgo } from '../../lib/format';
import { Badge, Button, Card, CardBody, CardHeader, ErrorBanner, Input, Label, PageHeader, ProgressBar, Spinner, Stat, StatusBadge, Textarea } from '../../components/ui';
import { AgentActivity } from '../../components/AgentActivity';

const STAGE_HELP: Record<StageName, string> = {
  intel: 'Reads the hackathon page and your pasted text; extracts rules, themes, criteria. Unfound fields stay “unavailable”.',
  sponsors: 'Researches each sponsor’s products, APIs and integration angles. Depends on Intelligence.',
  opportunities: 'Finds problem areas with evidence from the web, repos and papers. Depends on Intelligence and Sponsors.',
  ideas: 'Generates and scores ideas against the judging criteria. Depends on Opportunities.',
  evolve: 'Critiques and revises the shortlist over several rounds. Depends on Ideas.',
  validate: 'Checks key claims of the top ideas against sources. Depends on Evolution.',
};

function StageRow({ stage, index, state, busy, onRun }: { stage: StageName; index: number; state: StageState; busy: boolean; onRun: () => void }) {
  const hasRun = state.status !== 'idle';
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {index < STAGE_ORDER.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-line" aria-hidden />}
      <span
        className={cn(
          'z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
          state.status === 'done' && 'border-good bg-good/15 text-good',
          state.status === 'running' && 'hm-pulse border-info bg-info/15 text-info',
          state.status === 'failed' && 'border-bad bg-bad/15 text-bad',
          state.status === 'stale' && 'border-warn bg-warn/15 text-warn',
          state.status === 'idle' && 'border-line-strong bg-surface-2 text-faint',
        )}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-sm font-medium">{STAGE_LABELS[stage]}</h4>
          <StatusBadge status={state.status} />
          {state.engine && <Badge tone={state.engine === 'llm' ? 'accent' : 'neutral'}>{state.engine === 'llm' ? 'LLM' : 'Heuristic'}</Badge>}
          {state.lastRunAt && <span className="text-xs text-faint">{timeAgo(state.lastRunAt)}</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted">{state.summary ?? STAGE_HELP[stage]}</p>
        {state.status === 'stale' && (
          <p className="mt-1 flex items-center gap-1 text-xs text-warn">
            <AlertTriangle className="h-3 w-3" aria-hidden /> An earlier stage was re-run, so this result may no longer reflect it. Re-run to refresh.
          </p>
        )}
        {state.status === 'failed' && <p className="mt-1 text-xs text-bad">The last run failed. See recent jobs below for the error.</p>}
      </div>
      <Button size="sm" variant={hasRun ? 'secondary' : 'primary'} disabled={busy} onClick={onRun} aria-label={`${hasRun ? 'Re-run' : 'Run'} ${STAGE_LABELS[stage]}`}>
        {hasRun ? <RotateCcw className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
        {hasRun ? 'Re-run' : 'Run'}
      </Button>
    </li>
  );
}

const CONFIG_FIELDS: { key: keyof WorkspaceConfig; label: string }[] = [
  { key: 'initialIdeas', label: 'Initial ideas' },
  { key: 'shortlistSize', label: 'Shortlist size' },
  { key: 'deepValidateCount', label: 'Deep-validate count' },
  { key: 'evolutionRounds', label: 'Evolution rounds' },
  { key: 'teamSize', label: 'Team size' },
];

function ConfigEditor() {
  const { bundle, refresh, setError } = useWorkspace();
  const w = bundle!.workspace;
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setVals(Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, String(w.config[f.key])])));
  }, [w.config]);

  const save = async () => {
    const config: Partial<WorkspaceConfig> = {};
    for (const f of CONFIG_FIELDS) {
      const n = Number(vals[f.key]);
      if (!Number.isFinite(n) || n < 1) return setError(`${f.label} must be a positive number.`);
      config[f.key] = Math.floor(n);
    }
    setSaving(true);
    try {
      await api.updateWorkspace(w.id, { config });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Pipeline configuration" subtitle="Applies the next time the relevant stage runs." />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {CONFIG_FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`oc-${f.key}`}>{f.label}</Label>
              <Input id={`oc-${f.key}`} type="number" min={1} value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" loading={saving} onClick={save}>Save configuration</Button>
          {saved && <span className="text-xs text-good" role="status">Saved</span>}
        </div>
      </CardBody>
    </Card>
  );
}

function ManualTextEditor() {
  const { bundle, refresh, setError, busy, runStage } = useWorkspace();
  const w = bundle!.workspace;
  const [text, setText] = useState(w.manualText ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(w.manualText ?? ''), [w.manualText]);
  const dirty = text !== (w.manualText ?? '');

  const save = async (rerun: boolean) => {
    setSaving(true);
    try {
      await api.updateWorkspace(w.id, { manualText: text });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (rerun) await runStage('intel');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Hackathon notes" subtitle="Paste rules, themes, judging criteria or anything the page doesn’t show. Treated as user-provided." />
      <CardBody className="space-y-3">
        <Label htmlFor="manual-text">Manual text</Label>
        <Textarea id="manual-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Judging: Innovation 30%, Technical depth 30%, Impact 25%, Presentation 15%…" />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={saving} disabled={!dirty} onClick={() => save(false)}>Save notes</Button>
          <Button size="sm" variant="secondary" disabled={saving || busy || (!dirty && !w.manualText)} onClick={() => save(true)}>Save & re-run Intelligence</Button>
          {saved && <span className="text-xs text-good" role="status">Saved</span>}
        </div>
      </CardBody>
    </Card>
  );
}

export default function Overview() {
  const { bundle, loading, error, clearError, busy, runStage, activeJobs } = useWorkspace();
  if (!bundle) return loading ? <Spinner label="Loading overview…" /> : <ErrorBanner error={error ?? 'Workspace unavailable'} />;

  const { workspace: w, sources, sponsors, ideas, jobs } = bundle;
  const rec = w.recommendedIdeaId ? ideas.find((i) => i.id === w.recommendedIdeaId) : undefined;
  const fullJob = activeJobs.find((j) => j.stage === 'full') ?? activeJobs[0];
  const progress = fullJob?.progress;
  const doneCount = STAGE_ORDER.filter((s) => w.stages[s].status === 'done').length;
  const stats = {
    sources: sources.length,
    sponsors: sponsors.length,
    ideas: ideas.length,
    shortlisted: ideas.filter((i) => i.status === 'shortlisted' || i.status === 'validated' || i.status === 'recommended').length,
    validated: ideas.filter((i) => i.status === 'validated' || i.status === 'recommended').length,
  };

  return (
    <div>
      <PageHeader
        title="Command centre"
        subtitle="Run the pipeline stage by stage, or all at once. Results carry their provenance; anything unverified is labelled as such."
        right={
          <Button variant="primary" loading={busy && fullJob?.stage === 'full'} disabled={busy} onClick={() => void runStage('full')}>
            <Zap className="h-4 w-4" aria-hidden /> Run full pipeline
          </Button>
        }
      />
      <ErrorBanner error={error} onDismiss={clearError} />

      {busy && (
        <div className="mb-4 rounded-xl border border-info/30 bg-info/8 p-3" role="status">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="text-info">{progress ? progress.label : 'Working…'}</span>
            {progress && <span className="font-mono text-xs text-muted">{progress.done}/{progress.total}</span>}
          </div>
          <ProgressBar value={progress?.done ?? 0} max={progress?.total ?? 1} tone="accent" className={progress ? '' : 'hm-pulse'} />
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Sources" value={stats.sources} />
        <Stat label="Sponsors" value={stats.sponsors} />
        <Stat label="Ideas" value={stats.ideas} />
        <Stat label="Shortlisted" value={stats.shortlisted} />
        <Stat label="Validated" value={stats.validated} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Pipeline" subtitle={`${doneCount} of ${STAGE_ORDER.length} stages complete. Each stage builds on the one before it; re-running an earlier stage marks later ones stale.`} />
            <CardBody>
              <ol>
                {STAGE_ORDER.map((s, i) => (
                  <StageRow key={s} stage={s} index={i} state={w.stages[s]} busy={busy} onRun={() => void runStage(s)} />
                ))}
              </ol>
              {w.mode === 'demo' && <p className="mt-3 text-xs text-faint">Sample workspace: sources are bundled fixtures, not live research.</p>}
            </CardBody>
          </Card>

          {rec ? (
            <Card className="border-good/30">
              <CardHeader
                title={<span className="flex items-center gap-2"><Star className="h-4 w-4 text-good" aria-hidden /> Recommended idea</span>}
                subtitle="The current top pick based on the scoring model, not a guarantee of how judges will rate it."
                right={rec.scores ? <Badge tone="good">{rec.scores.total.toFixed(1)} / 100</Badge> : <Badge>Unscored</Badge>}
              />
              <CardBody className="space-y-3">
                <div>
                  <Link to={`/w/${w.id}/ideas/${rec.id}`} className="text-base font-semibold text-fg hover:text-accent-2">{rec.title}</Link>
                  <p className="mt-1 text-sm text-muted">{rec.pitch}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/w/${w.id}/ideas/${rec.id}`} className="rounded-lg bg-surface-3 px-3 py-1.5 text-xs font-medium hover:bg-line">View idea</Link>
                  <Link to={`/w/${w.id}/judge/${rec.id}`} className="inline-flex items-center gap-1 rounded-lg bg-surface-3 px-3 py-1.5 text-xs font-medium hover:bg-line"><Gavel className="h-3 w-3" aria-hidden /> Judge Arena</Link>
                  <Link to={`/w/${w.id}/blueprint/${rec.id}`} className="inline-flex items-center gap-1 rounded-lg bg-surface-3 px-3 py-1.5 text-xs font-medium hover:bg-line"><ScrollText className="h-3 w-3" aria-hidden /> Blueprint</Link>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="text-sm text-muted">
                <strong className="text-fg">No recommended idea yet.</strong>{' '}
                {stats.ideas > 0 ? (
                  <>Review the <Link className="text-info underline" to={`/w/${w.id}/ideas`}>ideas</Link> and pick one, or run Deep Validation to get a recommendation.</>
                ) : (
                  <>Run the full pipeline above (or the Idea Generation stage) to generate and rank ideas.</>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Recent jobs" />
            <CardBody className="p-0">
              {jobs.length === 0 ? (
                <p className="p-4 text-sm text-faint">No jobs yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {jobs.slice(0, 8).map((j) => (
                    <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <StatusBadge status={j.status} />
                        <span>{j.stage === 'full' ? 'Full pipeline' : STAGE_LABELS[j.stage]}</span>
                      </span>
                      <span className="text-xs text-faint">{timeAgo(j.startedAt)}</span>
                      {j.error && <p className="w-full break-words text-xs text-bad">{j.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <ConfigEditor />
          <ManualTextEditor />
          <AgentActivity compact maxHeight="max-h-80" />
        </div>
      </div>
    </div>
  );
}
