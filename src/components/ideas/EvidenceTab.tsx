import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Claim, ClaimStatus, EvidenceCategory, EvidenceItem, Source } from '../../../shared/types';
import { evidenceCoverage } from '../../../shared/scoring';
import { Badge, Card, CardBody, CardHeader, EmptyState, ProgressBar, StatusBadge } from '../ui';
import { cn } from '../../lib/format';
import { ExtLink, SourceChips } from './shared';

const CATEGORY_ORDER: EvidenceCategory[] = ['problem', 'competitor', 'technology', 'sponsor_doc', 'repository', 'paper', 'statistic', 'assumption', 'unverified'];
const CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  problem: 'Problem', competitor: 'Competitors', technology: 'Technology', sponsor_doc: 'Sponsor docs', repository: 'Repositories',
  paper: 'Papers', statistic: 'Statistics', assumption: 'Assumptions', unverified: 'Unverified',
};
const STATUSES: ClaimStatus[] = ['verified', 'partially_verified', 'unverified', 'contradicted'];
const IMPORTANCE_TONE = { high: 'bad', medium: 'warn', low: 'neutral' } as const;

export function EvidenceTab({ claims, evidence, sources, onOpenSource, onValidate, validating }: {
  claims: Claim[];
  evidence: EvidenceItem[];
  sources: Map<string, Source>;
  onOpenSource: (id: string) => void;
  onValidate?: () => void;
  validating?: boolean;
}) {
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('all');
  const cov = evidenceCoverage(claims);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of claims) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [claims]);
  const shown = claims.filter((c) => filter === 'all' || c.status === filter);
  const weak = claims.filter((c) => c.status === 'unverified' || c.status === 'contradicted');
  const weakEvidence = evidence.filter((e) => e.status === 'assumption' || e.status === 'unverified' || e.category === 'assumption' || e.category === 'unverified');

  if (claims.length === 0 && evidence.length === 0) {
    return (
      <EmptyState
        title="No evidence workspace yet"
        action={onValidate && <button type="button" onClick={onValidate} disabled={validating} className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50">Deep validate</button>}
      >
        Run deep validation to build the evidence workspace. Until then, every claim about this idea (problem, competitors, differentiation, sponsor fit) should be treated as an unverified assumption.
      </EmptyState>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, items: evidence.filter((e) => e.category === cat) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <Card className="border-warn/30">
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warn" aria-hidden /> Assumptions &amp; unverified claims</span>}
          subtitle="Treat these as risks until sourced. Contradicted claims cap the related score."
        />
        <CardBody className="space-y-2" >
          {weak.length === 0 && weakEvidence.length === 0 && <p className="text-xs text-good">No unverified or contradicted claims recorded.</p>}
          {weak.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start gap-2 text-xs">
              <StatusBadge status={c.status} />
              <span className="min-w-0 flex-1 basis-60 text-fg/90">{c.text}</span>
            </div>
          ))}
          {weakEvidence.map((e) => (
            <div key={e.id} className="flex flex-wrap items-start gap-2 text-xs">
              <StatusBadge status={e.status} />
              <span className="min-w-0 flex-1 basis-60 text-muted"><span className="text-fg/90">{e.title}</span> — {e.summary}</span>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Claims" subtitle="Each claim is checked against captured sources" right={<Badge tone={cov.ratio >= 0.7 ? 'good' : cov.ratio >= 0.4 ? 'warn' : 'bad'}>coverage {Math.round(cov.ratio * 100)}%</Badge>} />
        <CardBody className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>Evidence coverage (high/medium-importance claims at least partially verified)</span>
              <span className="font-mono">{cov.verified}/{cov.total}</span>
            </div>
            <ProgressBar value={cov.ratio * 100} tone={cov.ratio >= 0.7 ? 'good' : cov.ratio >= 0.4 ? 'warn' : 'bad'} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter claims by status">
            {(['all', ...STATUSES] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs', filter === s ? 'border-accent bg-accent/20 text-fg' : 'border-line-strong text-muted hover:text-fg')}
              >
                {s === 'all' ? `All (${claims.length})` : `${s.replace(/_/g, ' ')} (${counts[s] ?? 0})`}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <caption className="sr-only">Claims and their verification status</caption>
              <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  {['Claim', 'Kind', 'Importance', 'Status', 'Method', 'Note & quotes', 'Sources'].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-xs text-fg/90">{c.text}</td>
                    <td><Badge>{c.kind}</Badge></td>
                    <td><Badge tone={IMPORTANCE_TONE[c.importance]}>{c.importance}</Badge></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="text-faint">{c.method}</td>
                    <td className="max-w-xs text-muted">
                      {c.note}
                      {c.supportingQuotes.map((q, k) => <blockquote key={k} className="mt-1 border-l-2 border-line-strong pl-2 italic text-faint">“{q}”</blockquote>)}
                    </td>
                    <td><SourceChips ids={c.sourceIds} sources={sources} onOpen={onOpenSource} /></td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={7} className="!py-6 text-center text-faint">No claims with this status.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Evidence items" subtitle={`${evidence.length} items grouped by category`} />
        <CardBody className="space-y-4">
          {grouped.length === 0 && <p className="text-xs text-faint">No evidence items.</p>}
          {grouped.map(({ cat, items }) => (
            <section key={cat} aria-label={CATEGORY_LABEL[cat]}>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">{CATEGORY_LABEL[cat]} ({items.length})</h4>
              <ul className="space-y-2">
                {items.map((e) => (
                  <li key={e.id} className="rounded-lg border border-line bg-surface-2/50 p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{e.title}</span>
                      <StatusBadge status={e.status} />
                      {e.url && <ExtLink href={e.url}>open</ExtLink>}
                      {e.sourceId && <SourceChips ids={[e.sourceId]} sources={sources} onOpen={onOpenSource} />}
                    </div>
                    <p className="mt-1 text-muted">{e.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
