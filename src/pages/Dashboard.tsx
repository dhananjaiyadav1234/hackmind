import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Cpu, FlaskConical, Globe, PenLine, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import type { CreateWorkspaceInput, SystemStatus, WorkspaceConfig, WorkspaceSummary } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/types';
import { api } from '../lib/api';
import { hostOf, timeAgo } from '../lib/format';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorBanner, Input, Label, PageHeader, Spinner, Tabs, Textarea } from '../components/ui';
import { MiniStepper } from '../components/workspace/StageStepper';

type Mode = 'url' | 'manual';

function WorkspaceCard({ w, onDelete }: { w: WorkspaceSummary; onDelete: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const c = w.counts;
  return (
    <Card as="article" className="hm-in transition-colors hover:border-line-strong">
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/w/${w.id}`} className="block truncate text-base font-semibold tracking-tight text-fg hover:text-accent-2 focus-visible:outline-2 focus-visible:outline-accent">
              {w.name}
            </Link>
            <p className="truncate text-xs text-muted">{w.url ? hostOf(w.url) : 'Manual entry'}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {w.mode === 'demo' && <Badge tone="warn" title="Fictional bundled sample hackathon">Sample data</Badge>}
            {w.recommendedIdeaId && (
              <Badge tone="good" title="A recommended idea has been selected">
                <Star className="h-3 w-3" aria-hidden /> Recommended
              </Badge>
            )}
          </div>
        </div>
        <MiniStepper stages={w.stages} />
        <dl className="grid grid-cols-5 gap-2 text-center">
          {([['Sources', c.sources], ['Sponsors', c.sponsors], ['Ideas', c.ideas], ['Shortlist', c.shortlisted], ['Validated', c.validated]] as const).map(([k, v]) => (
            <div key={k} className="rounded-md bg-surface-2/60 px-1 py-1.5">
              <dd className="text-base font-semibold tabular-nums">{v}</dd>
              <dt className="text-[10px] uppercase tracking-wider text-faint">{k}</dt>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-faint">Updated {timeAgo(w.updatedAt)}</span>
          <div className="flex items-center gap-1.5">
            {confirming ? (
              <>
                <span className="text-xs text-bad">Delete “{w.name}”?</span>
                <Button
                  size="sm"
                  variant="danger"
                  loading={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    await onDelete(w.id);
                    setDeleting(false);
                    setConfirming(false);
                  }}
                >
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" aria-label={`Delete workspace ${w.name}`} onClick={() => setConfirming(true)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <Link to={`/w/${w.id}`} className="inline-flex items-center gap-1 rounded-lg bg-surface-3 px-3 py-1 text-xs font-medium text-fg hover:bg-line focus-visible:outline-2 focus-visible:outline-accent">
                  Open <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function EnvironmentCard({ status }: { status: SystemStatus | null }) {
  if (!status) return null;
  const missingLlm = !status.llm.configured;
  const missingResearch = status.research.providers.filter((p) => !p.configured);
  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Cpu className="h-4 w-4 text-accent" aria-hidden /> Environment</span>}
        subtitle={`HACKMIND v${status.version}`}
        right={<Badge tone={status.engine === 'llm' ? 'good' : 'warn'}>{status.engine === 'llm' ? 'LLM engine' : 'Heuristic engine'}</Badge>}
      />
      <CardBody className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">LLM</span>
          {status.llm.configured ? <Badge tone="good">{status.llm.provider} · {status.llm.model}</Badge> : <Badge tone="warn">Not configured</Badge>}
        </div>
        {missingLlm && (
          <p className="rounded-md border border-warn/25 bg-warn/8 p-2 text-xs text-muted">
            No LLM key found, so analysis runs on the built-in heuristic engine: deterministic and useful for exploring the product, but shallower than model-written research. Set <code className="font-mono text-fg">ANTHROPIC_API_KEY</code> in your <code className="font-mono text-fg">.env</code> file and restart the server to enable the LLM engine.
          </p>
        )}
        <div>
          <div className="mb-1.5 text-muted">Research providers</div>
          <ul className="space-y-1.5">
            {status.research.providers.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2 text-xs">
                <span className="min-w-0">
                  <span className="text-fg">{p.label}</span>
                  <span className="block text-faint">{p.note}</span>
                </span>
                <Badge tone={p.configured ? 'good' : p.requiresKey ? 'warn' : 'neutral'}>{p.configured ? 'Ready' : p.requiresKey ? 'Key missing' : 'Unavailable'}</Badge>
              </li>
            ))}
          </ul>
          {missingResearch.some((p) => p.requiresKey) && (
            <p className="mt-2 text-xs text-faint">Providers marked “Key missing” are skipped. Add their API keys to <code className="font-mono">.env</code> for broader web research.</p>
          )}
        </div>
        {status.notes.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-faint">
            {status.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

const CONFIG_FIELDS: { key: keyof WorkspaceConfig; label: string }[] = [
  { key: 'initialIdeas', label: 'Initial ideas' },
  { key: 'shortlistSize', label: 'Shortlist size' },
  { key: 'deepValidateCount', label: 'Deep-validate count' },
  { key: 'evolutionRounds', label: 'Evolution rounds' },
  { key: 'teamSize', label: 'Team size' },
];

function CreatePanel({ onCreate, busy }: { onCreate: (input: CreateWorkspaceInput) => Promise<void>; busy: boolean }) {
  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [hours, setHours] = useState('');
  const [sponsors, setSponsors] = useState('');
  const [showAdv, setShowAdv] = useState(false);
  const [cfg, setCfg] = useState<Record<keyof WorkspaceConfig, string>>(
    () => Object.fromEntries(CONFIG_FIELDS.map((f) => [f.key, String(DEFAULT_CONFIG[f.key])])) as Record<keyof WorkspaceConfig, string>,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const config: Partial<WorkspaceConfig> = {};
    for (const f of CONFIG_FIELDS) {
      const n = Number(cfg[f.key]);
      if (!Number.isFinite(n) || n < 1) return setFormError(`${f.label} must be a positive number.`);
      config[f.key] = Math.floor(n);
    }
    const input: CreateWorkspaceInput = { config };
    if (mode === 'url') {
      if (!/^https?:\/\/\S+/i.test(url.trim())) return setFormError('Enter a full hackathon URL starting with http:// or https://');
      input.url = url.trim();
      if (name.trim()) input.name = name.trim();
    } else {
      if (!name.trim()) return setFormError('Give the hackathon a name.');
      if (text.trim().length < 20) return setFormError('Paste the rules, themes or judging criteria (at least a few sentences) so there is something to analyse.');
      input.name = name.trim();
      input.manualText = text.trim();
      if (hours.trim()) {
        const h = Number(hours);
        if (!Number.isFinite(h) || h <= 0) return setFormError('Duration must be a positive number of hours.');
        input.durationHours = h;
      }
      const sp = sponsors.split(',').map((s) => s.trim()).filter(Boolean);
      if (sp.length) input.sponsors = sp;
    }
    await onCreate(input);
  };

  return (
    <Card>
      <CardHeader title="Create workspace" subtitle="Point HACKMIND at a hackathon, or paste what you know." />
      <form onSubmit={submit} className="space-y-4 p-4">
        <Tabs<Mode>
          tabs={[{ id: 'url', label: <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" aria-hidden />From URL</span> }, { id: 'manual', label: <span className="flex items-center gap-1.5"><PenLine className="h-3.5 w-3.5" aria-hidden />Manual entry</span> }]}
          value={mode}
          onChange={setMode}
        />
        {mode === 'url' ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="ws-url">Hackathon URL</Label>
              <Input id="ws-url" type="url" inputMode="url" placeholder="https://example-hackathon.devpost.com" value={url} onChange={(e) => setUrl(e.target.value)} />
              <p className="mt-1 text-xs text-faint">The page is fetched and analysed. Anything that can’t be found is marked “unavailable” rather than guessed.</p>
            </div>
            <div>
              <Label htmlFor="ws-name-url" hint="optional">Name</Label>
              <Input id="ws-name-url" value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the page title" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="ws-name">Hackathon name</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Global AI Build Week" />
            </div>
            <div>
              <Label htmlFor="ws-text">Rules, themes & judging criteria</Label>
              <Textarea id="ws-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the hackathon description, tracks, rules, judging criteria with weights, prizes…" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ws-hours" hint="optional">Duration (hours)</Label>
                <Input id="ws-hours" type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="48" />
              </div>
              <div>
                <Label htmlFor="ws-sponsors" hint="optional, comma-separated">Sponsors</Label>
                <Input id="ws-sponsors" value={sponsors} onChange={(e) => setSponsors(e.target.value)} placeholder="Acme Cloud, Foo AI" />
              </div>
            </div>
          </div>
        )}

        <div>
          <button type="button" onClick={() => setShowAdv(!showAdv)} aria-expanded={showAdv} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
            {showAdv ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />} Advanced configuration
          </button>
          {showAdv && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CONFIG_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`cfg-${f.key}`}>{f.label}</Label>
                  <Input id={`cfg-${f.key}`} type="number" min={1} value={cfg[f.key]} onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })} />
                </div>
              ))}
            </div>
          )}
        </div>

        <ErrorBanner error={formError} onDismiss={() => setFormError(null)} />
        <Button type="submit" variant="primary" loading={busy} className="w-full sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden /> Create workspace
        </Button>
      </form>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [list, setList] = useState<WorkspaceSummary[] | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<'demo' | 'form' | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.listWorkspaces());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setList((l) => l ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    api.status().then(setStatus).catch(() => undefined);
  }, [load]);

  const create = async (input: CreateWorkspaceInput, kind: 'demo' | 'form') => {
    setCreating(kind);
    setError(null);
    try {
      const b = await api.createWorkspace(input);
      navigate(`/w/${b.workspace.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteWorkspace(id);
      setList((l) => (l ?? []).filter((w) => w.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <PageHeader title="Workspaces" subtitle="Each workspace turns one hackathon into researched intelligence, ranked ideas, a judge rehearsal and a build blueprint." />
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <section className="mt-4 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent/15 via-surface to-surface p-5 sm:p-6" aria-labelledby="demo-h">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="demo-h" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Sparkles className="h-5 w-5 text-accent" aria-hidden /> New here? Explore with the demo workspace</h2>
            <p className="mt-1.5 text-sm text-muted">
              Loads a <strong className="font-medium text-fg">fictional sample hackathon</strong> with bundled sources, so you can try every screen without credentials or network access. Without an LLM key the pipeline runs on the heuristic engine; with one configured it uses the model. Sample data is always labelled as such.
            </p>
          </div>
          <Button variant="primary" className="px-5 py-3 text-base" loading={creating === 'demo'} disabled={creating !== null} onClick={() => create({ demo: true }, 'demo')}>
            <FlaskConical className="h-5 w-5" aria-hidden /> Try the demo workspace
          </Button>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section aria-labelledby="ws-h">
            <h2 id="ws-h" className="mb-3 text-sm font-semibold text-muted">Your workspaces {list ? `(${list.length})` : ''}</h2>
            {list === null ? (
              <Spinner label="Loading workspaces…" />
            ) : list.length === 0 ? (
              <EmptyState icon={<FlaskConical className="h-8 w-8" aria-hidden />} title="No workspaces yet">
                Create one from a hackathon URL or by pasting its rules, or load the demo workspace above to see what HACKMIND produces.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
                {list.map((w) => <WorkspaceCard key={w.id} w={w} onDelete={remove} />)}
              </div>
            )}
          </section>
          <CreatePanel busy={creating === 'form'} onCreate={(i) => create(i, 'form')} />
        </div>
        <aside className="space-y-4">
          <EnvironmentCard status={status} />
        </aside>
      </div>
    </div>
  );
}
