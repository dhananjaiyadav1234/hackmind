import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Crown, Gavel, ScrollText, ShieldCheck, Star, X, RotateCcw } from 'lucide-react';
import type { IdeaDetailBundle, Source } from '../../../shared/types';
import { api } from '../../lib/api';
import { useWorkspace } from '../../lib/workspace-context';
import { Badge, Button, Card, CardBody, EmptyState, ErrorBanner, Spinner, Tabs } from '../../components/ui';
import { EngineBadge, FEAS_TONE, IdeaStatusBadge, LEVEL_TONE, ScoreRing, TIER_LABELS } from '../../components/ideas/shared';
import { OverviewTab } from '../../components/ideas/OverviewTab';
import { ScoringTab } from '../../components/ideas/ScoringTab';
import { EvolutionTab } from '../../components/ideas/EvolutionTab';
import { EvidenceTab } from '../../components/ideas/EvidenceTab';
import { SourceDrawer } from '../../components/ideas/SourceDrawer';

type TabId = 'overview' | 'scoring' | 'evolution' | 'evidence';
const TAB_IDS: TabId[] = ['overview', 'scoring', 'evolution', 'evidence'];

export default function IdeaDetail() {
  const { wid = '', ideaId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { bundle, busy, refresh } = useWorkspace();
  const [detail, setDetail] = useState<IdeaDetailBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);

  const tabParam = params.get('tab');
  const tab: TabId = TAB_IDS.includes(tabParam as TabId) ? (tabParam as TabId) : 'overview';
  const bundleIdea = bundle?.ideas.find((i) => i.id === ideaId);
  const version = `${bundleIdea?.updatedAt ?? ''}|${bundleIdea?.status ?? ''}|${bundle?.workspace.recommendedIdeaId ?? ''}|${busy}`;

  const load = useCallback(async () => {
    try {
      const d = await api.idea(wid, ideaId);
      setDetail(d);
      setNotFound(false);
      setError(null);
    } catch (e) {
      if ((e as { status?: number }).status === 404) setNotFound(true);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [wid, ideaId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const sources = useMemo(() => {
    const m = new Map<string, Source>();
    for (const s of bundle?.sources ?? []) m.set(s.id, s);
    for (const s of detail?.sources ?? []) m.set(s.id, s);
    return m;
  }, [bundle, detail]);

  const act = async (name: string, fn: () => Promise<unknown>) => {
    setActing(name);
    setError(null);
    try {
      await fn();
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActing(null);
    }
  };

  const back = (
    <Link to={`/w/${wid}/ideas`} className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to idea board
    </Link>
  );

  if (notFound) {
    return (
      <div>
        {back}
        <EmptyState title="Idea not found" action={<Link className="text-sm text-info underline" to={`/w/${wid}/ideas`}>Go to the idea board</Link>}>
          This idea doesn’t exist in this workspace. It may have been removed when ideas were regenerated.
        </EmptyState>
      </div>
    );
  }
  if (!detail) {
    return (
      <div>
        {back}
        {error ? <ErrorBanner error={error} /> : loading ? <Spinner label="Loading idea…" /> : null}
      </div>
    );
  }

  const { idea } = detail;
  const isRecommended = idea.status === 'recommended' || bundle?.workspace.recommendedIdeaId === idea.id;
  const setTab = (t: TabId) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p, { replace: true });
  };
  const patch = (status: 'shortlisted' | 'eliminated' | 'generated') => act('patch', () => api.patchIdea(wid, idea.id, { status }));
  const validate = () => act('validate', () => api.validateIdea(wid, idea.id));
  const drawerSource = openSource ? sources.get(openSource) ?? null : null;

  return (
    <div>
      {back}
      <Card className={isRecommended ? 'mb-4 border-good/50' : 'mb-4'}>
        <CardBody className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 basis-80">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-faint">{idea.rank ? `Rank #${idea.rank}` : 'Unranked'}</span>
              {isRecommended && <Badge tone="good"><Crown className="h-3 w-3" aria-hidden /> Recommended</Badge>}
              <IdeaStatusBadge status={idea.status} />
              <Badge>{TIER_LABELS[idea.tier]}</Badge>
              <Badge tone={LEVEL_TONE[idea.complexity.level]}>complexity {idea.complexity.level} · ~{idea.complexity.estimatedHours}h</Badge>
              <Badge tone={FEAS_TONE[idea.feasibility.level]}>feasibility {idea.feasibility.level}</Badge>
              <EngineBadge engine={idea.engine} />
              <Badge>v{idea.version}</Badge>
            </div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{idea.title}</h1>
            <p className="mt-1.5 max-w-3xl text-sm text-muted">{idea.pitch}</p>
            {isRecommended && idea.recommendationRationale && (
              <p className="mt-3 rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-xs text-fg/90"><strong className="text-good">Why recommended: </strong>{idea.recommendationRationale}</p>
            )}
            {idea.status === 'eliminated' && idea.eliminatedReason && (
              <p className="mt-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-fg/90"><strong className="text-bad">Eliminated: </strong>{idea.eliminatedReason}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            <ScoreRing value={idea.scores?.total ?? null} size={64} />
            <div className="flex flex-wrap justify-end gap-2">
              {(idea.status === 'generated' || idea.status === 'eliminated') && (
                <Button size="sm" loading={acting === 'patch'} onClick={() => void patch('shortlisted')}><Star className="h-3.5 w-3.5" aria-hidden /> Shortlist</Button>
              )}
              {idea.status !== 'eliminated' ? (
                <Button size="sm" variant="danger" disabled={acting !== null} onClick={() => void patch('eliminated')}><X className="h-3.5 w-3.5" aria-hidden /> Eliminate</Button>
              ) : (
                <Button size="sm" variant="ghost" disabled={acting !== null} onClick={() => void patch('generated')}><RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restore</Button>
              )}
              <Button size="sm" disabled={busy || acting !== null} loading={acting === 'validate'} onClick={() => void validate()}><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Deep validate</Button>
              <Button size="sm" variant="primary" disabled={isRecommended || idea.status === 'eliminated' || acting !== null} loading={acting === 'recommend'} onClick={() => void act('recommend', () => api.recommendIdea(wid, idea.id))}>
                <Crown className="h-3.5 w-3.5" aria-hidden /> Mark as recommended
              </Button>
            </div>
            <div className="flex gap-3 text-xs">
              <Link className="inline-flex items-center gap-1 text-info hover:underline" to={`/w/${wid}/judge/${idea.id}`}><Gavel className="h-3.5 w-3.5" aria-hidden /> Judge Arena</Link>
              <Link className="inline-flex items-center gap-1 text-info hover:underline" to={`/w/${wid}/blueprint/${idea.id}`}><ScrollText className="h-3.5 w-3.5" aria-hidden /> Blueprint</Link>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mb-4"><ErrorBanner error={error} onDismiss={() => setError(null)} /></div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'scoring', label: 'Scoring' },
          { id: 'evolution', label: 'Evolution', count: idea.revisions.length },
          { id: 'evidence', label: 'Evidence', count: detail.claims.length },
        ]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'overview' && <OverviewTab idea={idea} sources={sources} onOpenSource={setOpenSource} />}
        {tab === 'scoring' && <ScoringTab idea={idea} sources={sources} onOpenSource={setOpenSource} />}
        {tab === 'evolution' && <EvolutionTab idea={idea} />}
        {tab === 'evidence' && (
          <EvidenceTab claims={detail.claims} evidence={detail.evidence} sources={sources} onOpenSource={setOpenSource} onValidate={() => void validate()} validating={busy || acting !== null} />
        )}
      </div>
      {openSource && <SourceDrawer source={drawerSource} missingId={openSource} onClose={() => setOpenSource(null)} />}
    </div>
  );
}
