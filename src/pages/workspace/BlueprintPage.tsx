import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Download, FileText, Printer } from 'lucide-react';
import { DEFAULT_CONFIG, type Blueprint } from '../../../shared/types';
import { ApiError, api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace-context';
import { BlueprintDocument, Outline } from '../../components/blueprint/BlueprintDocument';
import { judgeableIdeas } from '../../components/judge/IdeaPicker';
import { Badge, Button, Card, CardBody, EmptyState, ErrorBanner, Input, Label, PageHeader, Spinner } from '../../components/ui';

const PRINT_CSS = `
@media print {
  body { background: #fff !important; color: #111 !important; background-image: none !important; }
  nav, aside, header, .bp-no-print, .bp-outline { display: none !important; }
  .bp-doc, .bp-doc * { color: #111 !important; background: transparent !important; border-color: #ccc !important; box-shadow: none !important; }
  .bp-doc [data-testid="milestone-bar"] { background: #888 !important; color: #fff !important; }
  .bp-section { break-inside: avoid; }
}`;

export default function BlueprintPage() {
  const { ideaId: paramId } = useParams();
  const navigate = useNavigate();
  const { id: wid, bundle, loading } = useWorkspace();
  if (loading && !bundle) return <Spinner label="Loading workspace…" />;
  if (!bundle) return <ErrorBanner error="Workspace not available." />;
  const ideaId = paramId ?? bundle.workspace.recommendedIdeaId ?? undefined;
  const ideas = judgeableIdeas(bundle.ideas.slice());

  return (
    <div>
      <PageHeader
        title="Build Blueprint"
        subtitle="A hackathon-ready build plan: pitch, architecture, timeline, demo script and judge Q&A."
        right={
          ideas.length > 0 ? (
            <div className="bp-no-print">
              <Label htmlFor="bp-idea">Idea</Label>
              <select
                id="bp-idea"
                value={ideaId ?? ''}
                onChange={(e) => navigate(`/w/${wid}/blueprint/${e.target.value}`)}
                className="max-w-[16rem] rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg"
              >
                {!ideaId && <option value="">Select an idea…</option>}
                {ideas.map((i) => <option key={i.id} value={i.id}>{i.title}{i.id === bundle.workspace.recommendedIdeaId ? ' (recommended)' : ''}</option>)}
              </select>
            </div>
          ) : undefined
        }
      />
      {!ideaId ? (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="Choose an idea">Pick an idea above to view or generate its blueprint.</EmptyState>
      ) : (
        <BlueprintView key={ideaId} wid={wid} ideaId={ideaId} />
      )}
    </div>
  );
}

function BlueprintView({ wid, ideaId }: { wid: string; ideaId: string }) {
  const { bundle } = useWorkspace();
  const defaultHours = bundle?.workspace.intel.durationHours.value ?? 36;
  const [hours, setHours] = useState(String(defaultHours));
  const [team, setTeam] = useState(String(bundle?.workspace.config.teamSize ?? DEFAULT_CONFIG.teamSize));
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setBp(await api.getBlueprint(wid, ideaId));
      setState('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setState('missing');
      else {
        setError((e as Error).message);
        setState('missing');
      }
    }
  }, [wid, ideaId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    if (generating) return;
    const h = Number(hours);
    const t = Number(team);
    if (!Number.isFinite(h) || h < 1 || h > 500 || !Number.isFinite(t) || t < 1 || t > 20) {
      setError('Hours must be 1-500 and team size 1-20.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      setBp(await api.generateBlueprint(wid, ideaId, { hours: Math.round(h), teamSize: Math.round(t) }));
      setState('ready');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    if (!bp) return;
    try {
      await navigator.clipboard.writeText(bp.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not access the clipboard. Use Download Markdown instead.');
    }
  }

  const sourceTitles = Object.fromEntries((bundle?.sources ?? []).map((s) => [s.id, s.title]));

  return (
    <div className="space-y-4">
      <style>{PRINT_CSS}</style>
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <Card className="bp-no-print">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <Label htmlFor="bp-hours">Hackathon hours</Label>
            <Input id="bp-hours" type="number" min={1} max={500} value={hours} onChange={(e) => setHours(e.target.value)} disabled={generating} />
          </div>
          <div className="w-28">
            <Label htmlFor="bp-team">Team size</Label>
            <Input id="bp-team" type="number" min={1} max={20} value={team} onChange={(e) => setTeam(e.target.value)} disabled={generating} />
          </div>
          <Button variant="primary" onClick={() => void generate()} loading={generating}>
            {generating ? 'Generating blueprint…' : bp ? 'Regenerate blueprint' : 'Generate blueprint'}
          </Button>
          {bp && (
            <div className="ml-auto flex flex-wrap gap-2">
              <a
                href={api.blueprintMarkdownUrl(wid, ideaId)}
                download
                className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface-3 px-3.5 py-2 text-sm font-medium hover:bg-line"
              >
                <Download className="h-4 w-4" aria-hidden /> Download Markdown
              </a>
              <Button onClick={() => void copy()}><Copy className="h-4 w-4" aria-hidden /> {copied ? 'Copied' : 'Copy markdown'}</Button>
              <Button onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Print</Button>
            </div>
          )}
        </CardBody>
      </Card>

      {state === 'loading' && <Spinner label="Loading blueprint…" />}
      {state === 'missing' && !bp && !generating && (
        <EmptyState icon={<FileText className="h-8 w-8" />} title="No blueprint yet">Set the hours and team size, then generate a blueprint for this idea.</EmptyState>
      )}

      {bp && (
        <div className="bp-doc">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={bp.engine === 'llm' ? 'accent' : 'warn'}>{bp.engine === 'llm' ? 'LLM-generated' : 'Rule-based'}</Badge>
            <span>Generated {timeAgo(bp.generatedAt)} ({new Date(bp.generatedAt).toLocaleString()})</span>
            <span>Assumptions are labelled; verify them before relying on this plan.</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <aside className="bp-no-print min-w-0 lg:sticky lg:top-4 lg:self-start">
              <Outline />
            </aside>
            <Card><div className="px-4"><BlueprintDocument bp={bp} wid={wid} sourceTitles={sourceTitles} /></div></Card>
          </div>
        </div>
      )}
    </div>
  );
}
