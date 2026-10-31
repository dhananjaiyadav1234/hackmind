import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GitCompare, Info, LayoutGrid, Lightbulb, Rows3, Search, Sparkles, ShieldCheck, Dna } from 'lucide-react';
import type { IdeaStatus, IdeaTier, StageName } from '../../../shared/types';
import { SCORE_DISCLAIMER } from '../../../shared/scoring';
import { api } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace-context';
import { Badge, Button, Card, CardBody, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from '../../components/ui';
import { cn } from '../../lib/format';
import { IdeaBoard, type IdeaActions } from '../../components/ideas/IdeaBoard';
import { RankingTable } from '../../components/ideas/RankingTable';
import { STATUS_ORDER, TIER_ORDER, TIER_SHORT } from '../../components/ideas/shared';

const MAX_COMPARE = 4;

export default function Ideas() {
  const { wid = '' } = useParams();
  const navigate = useNavigate();
  const { bundle, busy, runStage, refresh, error, clearError } = useWorkspace();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [tier, setTier] = useState<IdeaTier | 'all'>('all');
  const [status, setStatus] = useState<IdeaStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showEliminated, setShowEliminated] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const ideas = useMemo(() => bundle?.ideas ?? [], [bundle]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ideas.filter((i) => {
      if (!showEliminated && i.status === 'eliminated' && status !== 'eliminated') return false;
      if (tier !== 'all' && i.tier !== tier) return false;
      if (status !== 'all' && i.status !== status) return false;
      if (q && !`${i.title} ${i.pitch} ${i.sponsorIntegration.map((s) => s.sponsor).join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ideas, tier, status, query, showEliminated]);

  if (!bundle) return <Spinner label="Loading ideas…" />;
  const w = bundle.workspace;
  const stages = w.stages;
  const counts = {
    total: ideas.length,
    shortlisted: ideas.filter((i) => i.status === 'shortlisted').length,
    validated: ideas.filter((i) => i.status === 'validated' || i.status === 'recommended').length,
    eliminated: ideas.filter((i) => i.status === 'eliminated').length,
  };

  const done = (s: StageName) => stages[s].status === 'done' || stages[s].status === 'stale';
  const notes: string[] = [];
  if (!done('opportunities')) notes.push('“Generate ideas” works best after Opportunity Discovery has run.');
  if (!done('ideas')) notes.push('“Evolve shortlist” needs generated ideas first.');
  if (!done('evolve')) notes.push('“Validate top” needs the evolution stage to have run.');

  const a: IdeaActions = {
    selected,
    maxSelected: selected.size >= MAX_COMPARE,
    onToggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else if (next.size < MAX_COMPARE) next.add(id);
        return next;
      }),
    onStatus: async (id, st) => {
      setPendingId(id);
      setActionError(null);
      try {
        await api.patchIdea(wid, id, { status: st });
        await refresh();
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setPendingId(null);
      }
    },
    pendingId,
    wid,
    recommendedId: w.recommendedIdeaId,
  };

  const compare = () => navigate(`/w/${wid}/compare?ids=${[...selected].join(',')}`);
  const canCompare = selected.size >= 2 && selected.size <= MAX_COMPARE;

  return (
    <div>
      <PageHeader
        title="Idea board"
        subtitle={
          ideas.length
            ? `${counts.total} ideas · ${counts.shortlisted} shortlisted · ${counts.validated} validated · ${counts.eliminated} eliminated`
            : 'Generate, rank, evolve and validate ideas against this hackathon’s criteria.'
        }
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} loading={stages.ideas.status === 'running'} onClick={() => void runStage('ideas')}>
              <Sparkles className="h-4 w-4" aria-hidden /> Generate ideas
            </Button>
            <Button disabled={busy} loading={stages.evolve.status === 'running'} onClick={() => void runStage('evolve')}>
              <Dna className="h-4 w-4" aria-hidden /> Evolve shortlist
            </Button>
            <Button disabled={busy} loading={stages.validate.status === 'running'} onClick={() => void runStage('validate')}>
              <ShieldCheck className="h-4 w-4" aria-hidden /> Validate top
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-xs text-muted" role="note">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
        <span>
          <strong className="text-fg">AI-assisted estimate, not a prediction of winning.</strong> {SCORE_DISCLAIMER}
        </span>
      </div>

      {notes.length > 0 && (
        <ul className="mb-4 space-y-0.5 text-xs text-faint" aria-label="Stage prerequisites">
          {notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
      <div className="mb-4 space-y-2">
        <ErrorBanner error={actionError ?? error} onDismiss={() => (actionError ? setActionError(null) : clearError())} />
      </div>

      {ideas.length === 0 ? (
        <EmptyState icon={<Lightbulb className="h-8 w-8" aria-hidden />} title="No ideas yet" action={<Button variant="primary" disabled={busy} onClick={() => void runStage('ideas')}>Generate ideas</Button>}>
          Run idea generation to create ranked Safe, Innovative and Moonshot candidates grounded in the intel, sponsors and opportunities gathered so far.
        </EmptyState>
      ) : (
        <>
          <Card className="mb-4">
            <CardBody className="flex flex-wrap items-center gap-3 !py-3">
              <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line-strong bg-surface-2 p-0.5">
                {([['board', 'Board', LayoutGrid], ['table', 'Ranking table', Rows3]] as const).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={view === k}
                    onClick={() => setView(k)}
                    className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', view === k ? 'bg-accent text-white' : 'text-muted hover:text-fg')}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
                  </button>
                ))}
              </div>
              <div className="relative min-w-40 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-faint" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ideas" aria-label="Search ideas" className="!py-1.5 !pl-8 !text-xs" />
              </div>
              <select aria-label="Filter by tier" value={tier} onChange={(e) => setTier(e.target.value as IdeaTier | 'all')} className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-fg">
                <option value="all">All tiers</option>
                {TIER_ORDER.map((t) => <option key={t} value={t}>{TIER_SHORT[t]}</option>)}
              </select>
              <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as IdeaStatus | 'all')} className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1.5 text-xs text-fg">
                <option value="all">All statuses</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={showEliminated} onChange={(e) => setShowEliminated(e.target.checked)} className="accent-[#7b6cff]" />
                Show eliminated ({counts.eliminated})
              </label>
              <div className="ml-auto flex items-center gap-2">
                {selected.size > 0 && (
                  <>
                    <Badge tone="accent">{selected.size} selected</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                  </>
                )}
                <Button size="sm" variant="primary" disabled={!canCompare} onClick={compare} title={canCompare ? '' : `Select 2–${MAX_COMPARE} ideas to compare`}>
                  <GitCompare className="h-3.5 w-3.5" aria-hidden /> Compare{selected.size > 0 ? ` (${selected.size})` : ''}
                </Button>
              </div>
            </CardBody>
          </Card>
          {selected.size >= MAX_COMPARE && <p className="mb-3 text-xs text-faint">Maximum of {MAX_COMPARE} ideas can be compared at once.</p>}

          {view === 'board' ? <IdeaBoard ideas={filtered} a={a} /> : <RankingTable ideas={filtered} a={a} />}
        </>
      )}
    </div>
  );
}
