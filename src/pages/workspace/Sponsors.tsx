import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import type { Source, SponsorProfile } from '../../../shared/types';
import { useWorkspace } from '../../lib/workspace-context';
import { Badge, Button, Card, CardBody, EmptyState, ErrorBanner, Input, PageHeader, Spinner, StatusBadge, type Tone } from '../../components/ui';
import { Bullets, Chips, ExtLink, FieldLabel, SourceChips } from '../../components/workspace/common';

const depthTone: Record<string, Tone> = { deep: 'good', moderate: 'info', superficial: 'neutral' };
type StatusFilter = 'all' | SponsorProfile['status'];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function SponsorCard({ s, sources, open, onToggle }: { s: SponsorProfile; sources: Source[]; open: boolean; onToggle: () => void }) {
  const panelId = `sp-${s.id}`;
  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">
            {s.website ? <ExtLink href={s.website} className="text-fg hover:text-accent-2">{s.name}</ExtLink> : s.name}
          </h3>
          <p className="mt-1 text-sm text-muted">{s.summary || 'No summary available.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={s.status} />
          <Badge tone={s.engine === 'llm' ? 'accent' : 'neutral'}>{s.engine === 'llm' ? 'LLM' : 'Heuristic'}</Badge>
          {s.opportunities.length > 0 && <Badge tone="info">{s.opportunities.length} integration idea{s.opportunities.length === 1 ? '' : 's'}</Badge>}
        </div>
      </div>

      {s.gaps.length > 0 && (
        <div className="mx-4 mb-3 rounded-lg border border-warn/30 bg-warn/8 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warn"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Could not be found</div>
          <Bullets items={s.gaps} />
        </div>
      )}

      <div className="border-t border-line px-4 py-2">
        <button onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="text-xs font-medium text-info hover:underline">
          {open ? 'Hide details' : 'Show details'}
        </button>
      </div>

      {open && (
        <CardBody className="space-y-4 border-t border-line" >
          <div id={panelId} className="space-y-4">
            {s.opportunities.length > 0 && (
              <Section label="Integration opportunities">
                <ul className="space-y-2">
                  {s.opportunities.map((o, i) => (
                    <li key={`${o.title}-${i}`} className="rounded-lg border border-line bg-surface-2/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-medium">{o.title}</h4>
                        <Badge tone={depthTone[o.technicalDepth]} title="How substantive the integration would be">{o.technicalDepth}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-fg/90"><span className="text-faint">How: </span>{o.integration}</p>
                      <p className="mt-1 text-sm text-muted"><span className="text-faint">Why: </span>{o.justification}</p>
                      <div className="mt-2"><SourceChips ids={o.sourceIds} sources={sources} /></div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              {s.products.length > 0 && <Section label="Products"><Chips items={s.products} /></Section>}
              {s.techEcosystem.length > 0 && <Section label="Tech ecosystem"><Chips items={s.techEcosystem} /></Section>}
              {s.devTools.length > 0 && <Section label="Developer tools"><Chips items={s.devTools} /></Section>}
              {s.apis.length > 0 && <Section label="APIs"><Chips items={s.apis} tone="accent" /></Section>}
            </div>
            {s.docs.length > 0 && (
              <Section label="Documentation">
                <ul className="space-y-1 text-sm">
                  {s.docs.map((d, i) => <li key={`${d.url}-${i}`}><ExtLink href={d.url}>{d.title || d.url}</ExtLink></li>)}
                </ul>
              </Section>
            )}
            {s.latest.length > 0 && (
              <Section label="Latest developments">
                <ul className="space-y-2">
                  {s.latest.map((l, i) => (
                    <li key={`${l.title}-${i}`} className="text-sm">
                      <span className="font-medium"><ExtLink href={l.url} className="text-fg">{l.title}</ExtLink></span>
                      {l.date && <span className="ml-2 text-xs text-faint">{l.date}</span>}
                      <p className="text-xs text-muted">{l.summary}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            <Section label="Previous hackathon involvement">
              {s.previousHackathons.length === 0 ? (
                <p className="text-sm italic text-faint">No evidence of previous hackathon involvement was found (this does not mean there is none).</p>
              ) : (
                <ul className="space-y-2">
                  {s.previousHackathons.map((p, i) => (
                    <li key={i} className="text-sm"><p>{p.note}</p><div className="mt-1"><SourceChips ids={p.sourceIds} sources={sources} /></div></li>
                  ))}
                </ul>
              )}
            </Section>
            <Section label="Sources"><SourceChips ids={s.sourceIds} sources={sources} /></Section>
          </div>
        </CardBody>
      )}
    </Card>
  );
}

export default function Sponsors() {
  const { bundle, loading, error, clearError, busy, runStage } = useWorkspace();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!bundle) return [];
    const needle = q.trim().toLowerCase();
    return bundle.sponsors.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (!needle) return true;
      const hay = [s.name, s.summary, ...s.products, ...s.techEcosystem, ...s.devTools, ...s.apis, ...s.opportunities.map((o) => `${o.title} ${o.integration}`)].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [bundle, q, status]);

  if (!bundle) return loading ? <Spinner label="Loading sponsors…" /> : <ErrorBanner error={error ?? 'Workspace unavailable'} />;
  const { sponsors } = bundle;
  const toggle = (id: string) => setOpenIds((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sponsor intelligence"
        subtitle="What each sponsor offers and how a project could use it meaningfully. Gaps are listed openly rather than filled with guesses."
        right={<Button variant={sponsors.length ? 'secondary' : 'primary'} disabled={busy} onClick={() => void runStage('sponsors')}>{sponsors.length ? 'Re-run sponsors' : 'Run sponsor research'}</Button>}
      />
      <ErrorBanner error={error} onDismiss={clearError} />
      {sponsors.length === 0 ? (
        <EmptyState title="No sponsor research yet">
          Run Hackathon Intelligence first so sponsors are identified (or list them when creating the workspace), then run the Sponsor Intelligence stage.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
              <Input aria-label="Search sponsors" className="pl-9" placeholder="Search sponsors, products, APIs…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div role="group" aria-label="Filter by status" className="flex gap-1">
              {(['all', 'researched', 'partial', 'unavailable'] as StatusFilter[]).map((f) => (
                <Button key={f} size="sm" variant={status === f ? 'primary' : 'secondary'} aria-pressed={status === f} onClick={() => setStatus(f)}>{f}</Button>
              ))}
            </div>
          </div>
          {sponsors.some((s) => s.status !== 'researched') && (
            <p className="text-xs text-muted">Sponsors marked “partial” or “unavailable” had limited public information; treat their integration ideas as hypotheses to check against the docs.</p>
          )}
          {filtered.length === 0 ? (
            <p className="text-sm text-muted">No sponsors match your filters.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => <SponsorCard key={s.id} s={s} sources={bundle.sources} open={openIds.has(s.id)} onToggle={() => toggle(s.id)} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
