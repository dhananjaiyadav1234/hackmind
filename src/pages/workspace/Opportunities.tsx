import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import type { Opportunity, Source } from '../../../shared/types';
import { useWorkspace } from '../../lib/workspace-context';
import { Badge, Button, Card, CardBody, EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge, type Tone } from '../../components/ui';
import { Bullets, ExtLink, FieldLabel, SourceChips } from '../../components/workspace/common';

const strengthTone: Record<Opportunity['strength'], Tone> = { high: 'good', medium: 'warn', low: 'neutral' };
const strengthRank: Record<Opportunity['strength'], number> = { high: 0, medium: 1, low: 2 };
type Filter = 'all' | Opportunity['strength'];
type Sort = 'strength' | 'title';

function Block({ label, children }: { label: string; children: ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function OppCard({ o, sources }: { o: Opportunity; sources: Source[] }) {
  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="min-w-0 text-base font-semibold tracking-tight">{o.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={strengthTone[o.strength]} title="AI-assessed strength of this opportunity. Not a prediction.">{o.strength} strength</Badge>
          <StatusBadge status={o.verification} />
          <Badge tone={o.engine === 'llm' ? 'accent' : 'neutral'}>{o.engine === 'llm' ? 'LLM' : 'Heuristic'}</Badge>
        </div>
      </div>
      <CardBody className="space-y-4">
        <Block label="Problem"><p className="text-sm leading-relaxed">{o.problem}</p></Block>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
          <Block label="Why now"><p className="text-sm text-muted">{o.whyNow || '—'}</p></Block>
          <Block label="Audience"><p className="text-sm text-muted">{o.audience || '—'}</p></Block>
        </div>
        {o.existingSolutions.length > 0 && (
          <Block label="Existing solutions & competitors">
            <ul className="space-y-1.5 text-sm">
              {o.existingSolutions.map((e, i) => (
                <li key={`${e.name}-${i}`}><span className="font-medium"><ExtLink href={e.url} className="text-fg">{e.name}</ExtLink></span> <span className="text-muted">— {e.note}</span></li>
              ))}
            </ul>
          </Block>
        )}
        {o.openSource.length > 0 && (
          <Block label="Open-source projects">
            <ul className="space-y-1.5 text-sm">
              {o.openSource.map((r, i) => (
                <li key={`${r.url}-${i}`} className="flex flex-wrap items-center gap-x-2">
                  <ExtLink href={r.url}>{r.name}</ExtLink>
                  {r.stars != null && <span className="inline-flex items-center gap-0.5 text-xs text-warn"><Star className="h-3 w-3" aria-hidden />{r.stars.toLocaleString()}</span>}
                  <span className="text-muted">{r.note}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}
        {o.papers.length > 0 && (
          <Block label="Papers">
            <ul className="space-y-1 text-sm">
              {o.papers.map((p, i) => (
                <li key={`${p.url}-${i}`}><ExtLink href={p.url}>{p.title}</ExtLink>{(p.authors || p.year) && <span className="text-xs text-faint"> · {[p.authors, p.year].filter(Boolean).join(', ')}</span>}</li>
              ))}
            </ul>
          </Block>
        )}
        {o.developments.length > 0 && <Block label="Recent developments"><Bullets items={o.developments} /></Block>}
        {o.technicalOpportunities.length > 0 && <Block label="Technical opportunities"><Bullets items={o.technicalOpportunities} /></Block>}
        {o.gaps.length > 0 && (
          <div className="rounded-lg border border-warn/30 bg-warn/8 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Gaps & open questions</div>
            <Bullets items={o.gaps} />
          </div>
        )}
        <Block label="Sources"><SourceChips ids={o.sourceIds} sources={sources} /></Block>
      </CardBody>
    </Card>
  );
}

export default function Opportunities() {
  const { bundle, loading, error, clearError, busy, runStage } = useWorkspace();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('strength');

  const list = useMemo(() => {
    const items = (bundle?.opportunities ?? []).filter((o) => filter === 'all' || o.strength === filter);
    return [...items].sort((a, b) => (sort === 'strength' ? strengthRank[a.strength] - strengthRank[b.strength] : a.title.localeCompare(b.title)));
  }, [bundle, filter, sort]);

  if (!bundle) return loading ? <Spinner label="Loading opportunities…" /> : <ErrorBanner error={error ?? 'Workspace unavailable'} />;
  const total = bundle.opportunities.length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Opportunity discovery"
        subtitle="Problem areas worth building for, backed by what exists today. Strength is an AI assessment, and verification shows whether the evidence was actually found."
        right={<Button variant={total ? 'secondary' : 'primary'} disabled={busy} onClick={() => void runStage('opportunities')}>{total ? 'Re-run discovery' : 'Run opportunity discovery'}</Button>}
      />
      <ErrorBanner error={error} onDismiss={clearError} />
      {total === 0 ? (
        <EmptyState title="No opportunities discovered yet">
          This stage searches for problems, existing solutions, open-source projects and papers related to the hackathon themes. Run Hackathon and Sponsor Intelligence first for best results, then run Opportunity Discovery.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Filter by strength" className="flex gap-1">
              {(['all', 'high', 'medium', 'low'] as Filter[]).map((f) => (
                <Button key={f} size="sm" variant={filter === f ? 'primary' : 'secondary'} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-line-strong bg-surface-2 px-2 py-1 text-xs text-fg">
                <option value="strength">Strength</option>
                <option value="title">Title</option>
              </select>
            </label>
            <span className="text-xs text-faint">{list.length} of {total}</span>
          </div>
          {list.length === 0 ? <p className="text-sm text-muted">No opportunities match this filter.</p> : (
            <div className="space-y-4">{list.map((o) => <OppCard key={o.id} o={o} sources={bundle.sources} />)}</div>
          )}
        </>
      )}
    </div>
  );
}
