import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import type { Source, SourceKind } from '../../../shared/types';
import { api } from '../../lib/api';
import { hostOf, timeAgo } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace-context';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorBanner, Input, Label, PageHeader, Spinner, Tabs, Textarea } from '../../components/ui';
import { ExtLink, isHttpUrl } from '../../components/workspace/common';

const KINDS: ('all' | SourceKind)[] = ['all', 'web', 'docs', 'repo', 'paper', 'manual', 'demo'];

function SourceRow({ s }: { s: Source }) {
  const [open, setOpen] = useState(false);
  const bundled = s.provider === 'demo-fixture' || s.provider === 'demo' || s.kind === 'demo';
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-medium">
            {s.kind !== 'manual' && !bundled && isHttpUrl(s.url) ? <ExtLink href={s.url}>{s.title || s.url}</ExtLink> : (s.title || s.url)}
          </h4>
          <p className="truncate text-xs text-faint">{isHttpUrl(s.url) && !bundled ? hostOf(s.url) : s.url}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="info">{s.kind}</Badge>
          <Badge tone={bundled ? 'warn' : 'neutral'} title={bundled ? 'Bundled sample fixture, not retrieved from the live web' : `Retrieved via ${s.provider}`}>
            {bundled ? 'bundled sample' : s.provider}
          </Badge>
          <span className="text-xs text-faint" title={s.fetchedAt}>{timeAgo(s.fetchedAt)}</span>
        </div>
      </div>
      {s.snippet && <p className="mt-1.5 text-sm text-muted">{s.snippet}</p>}
      {s.content && (
        <div className="mt-2">
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1 text-xs font-medium text-info hover:underline">
            {open ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
            {open ? 'Hide captured content' : `Show captured content (${s.content.length.toLocaleString()} chars)`}
          </button>
          {open && (
            <pre tabIndex={0} aria-label={`Captured content of ${s.title}`} className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed text-fg/90">
              {s.content}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

type AddMode = 'url' | 'text';
function AddSource() {
  const { bundle, refresh } = useWorkspace();
  const [mode, setMode] = useState<AddMode>('url');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOk(null);
    const input: { url?: string; title?: string; text?: string } = {};
    if (mode === 'url') {
      if (!isHttpUrl(url.trim())) return setErr('Enter a full URL starting with http:// or https://');
      input.url = url.trim();
      if (title.trim()) input.title = title.trim();
    } else {
      if (!text.trim()) return setErr('Paste some text to add.');
      if (!title.trim()) return setErr('Give the pasted text a title so you can recognise it later.');
      input.text = text.trim();
      input.title = title.trim();
    }
    setBusy(true);
    try {
      const s = await api.addSource(bundle!.workspace.id, input);
      await refresh();
      setOk(`Added “${s.title}”. Re-run a stage to use it in the analysis.`);
      setUrl(''); setTitle(''); setText('');
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Add source" subtitle="Bring your own evidence: a URL is fetched server-side, or paste text directly." />
      <form onSubmit={submit} className="space-y-3 p-4">
        <Tabs<AddMode> tabs={[{ id: 'url', label: 'From URL' }, { id: 'text', label: 'Paste text' }]} value={mode} onChange={setMode} />
        {mode === 'url' ? (
          <div>
            <Label htmlFor="src-url">URL</Label>
            <Input id="src-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
        ) : (
          <div>
            <Label htmlFor="src-text">Text</Label>
            <Textarea id="src-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="src-title" hint={mode === 'url' ? 'optional' : undefined}>Title</Label>
          <Input id="src-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <ErrorBanner error={err} onDismiss={() => setErr(null)} />
        {ok && <p className="text-sm text-good" role="status">{ok}</p>}
        <Button type="submit" variant="primary" loading={busy}><Plus className="h-4 w-4" aria-hidden /> Add source</Button>
      </form>
    </Card>
  );
}

export default function Sources() {
  const { bundle, loading, error, clearError } = useWorkspace();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | SourceKind>('all');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (bundle?.sources ?? []).filter((s) => (kind === 'all' || s.kind === kind) && (!needle || `${s.title} ${s.url} ${s.snippet} ${s.provider}`.toLowerCase().includes(needle)));
  }, [bundle, q, kind]);

  if (!bundle) return loading ? <Spinner label="Loading sources…" /> : <ErrorBanner error={error ?? 'Workspace unavailable'} />;
  const all = bundle.sources;
  const counts = (k: SourceKind) => all.filter((s) => s.kind === k).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Sources" subtitle="Everything HACKMIND has read. Claims elsewhere in the workspace link back to these entries, so you can check the evidence yourself." />
      <ErrorBanner error={error} onDismiss={clearError} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
              <Input aria-label="Search sources" className="pl-9" placeholder="Search title, URL, snippet…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <Button key={k} size="sm" variant={kind === k ? 'primary' : 'secondary'} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {k} <span className="opacity-70">{k === 'all' ? all.length : counts(k)}</span>
              </Button>
            ))}
          </div>
          {all.length === 0 ? (
            <EmptyState title="No sources yet">Run Hackathon Intelligence to fetch the hackathon page, or add a source with the form.</EmptyState>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted">No sources match your filters.</p>
          ) : (
            <Card><CardBody className="p-0"><ul className="divide-y divide-line">{filtered.map((s) => <SourceRow key={s.id} s={s} />)}</ul></CardBody></Card>
          )}
        </div>
        <AddSource />
      </div>
    </div>
  );
}
