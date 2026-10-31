import type { ReactNode } from 'react';
import type { Idea, Source } from '../../../shared/types';
import { Badge, Card, CardBody, CardHeader, Markdown } from '../ui';
import { DEPTH_TONE, FEAS_TONE, LEVEL_TONE, SEVERITY_TONE, Section, SourceChips } from './shared';

function Block({ title, children }: { title: string; children: string }) {
  return (
    <Section title={title}>
      <Markdown>{children || '—'}</Markdown>
    </Section>
  );
}

function Table({ head, children, caption }: { head: string[]; children: ReactNode; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[460px] border-collapse text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-left text-[11px] uppercase tracking-wide text-faint">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}

export function OverviewTab({ idea, sources, onOpenSource }: { idea: Idea; sources: Map<string, Source>; onOpenSource: (id: string) => void }) {
  const superficial = idea.sponsorIntegration.filter((s) => s.depth === 'superficial');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardBody className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2">
          <Block title="Problem">{idea.problem}</Block>
          <Block title="Audience">{idea.audience}</Block>
          <Block title="Solution">{idea.solution}</Block>
          <Block title="Differentiation">{idea.differentiation}</Block>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Existing alternatives" subtitle="What users have today" />
        <CardBody className="space-y-3">
          {idea.alternatives.length === 0 && <p className="text-xs text-faint">No alternatives recorded. That is a gap worth checking, not evidence that none exist.</p>}
          {idea.alternatives.map((a, k) => (
            <div key={k} className="rounded-lg border border-line bg-surface-2/50 p-3">
              <div className="text-sm font-medium">{a.name}</div>
              <p className="mt-0.5 text-xs text-muted">{a.note}</p>
              <div className="mt-2"><SourceChips ids={a.sourceIds} sources={sources} onOpen={onOpenSource} /></div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sponsor integration" subtitle={superficial.length ? `${superficial.length} superficial — be honest about this with judges` : undefined} />
        <CardBody className="space-y-3">
          {idea.sponsorIntegration.length === 0 && <p className="text-xs text-faint">No sponsor technology is integrated.</p>}
          {idea.sponsorIntegration.map((s, k) => (
            <div key={k} className="rounded-lg border border-line bg-surface-2/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{s.sponsor}</span>
                <span className="text-xs text-muted">{s.technology}</span>
                <Badge tone={DEPTH_TONE[s.depth]}>{s.depth}</Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted"><span className="text-fg">How:</span> {s.how}</p>
              <p className="mt-1 text-xs text-muted"><span className="text-fg">Why:</span> {s.justification}</p>
              {s.depth === 'superficial' && (
                <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-xs text-warn">
                  Superficial: this is a light-touch integration. Judges may see it as a logo-on-slide rather than a real dependency.
                </p>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Architecture" />
        <CardBody className="space-y-3">
          <Markdown>{idea.architecture.summary || '—'}</Markdown>
          <Table head={['Component', 'Responsibility', 'Tech']} caption="Architecture components">
            {idea.architecture.components.map((c, k) => (
              <tr key={k}><td className="font-medium">{c.name}</td><td className="text-muted">{c.responsibility}</td><td className="text-muted">{c.tech}</td></tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Recommended stack" />
        <CardBody>
          <Table head={['Layer', 'Choice', 'Reason']} caption="Recommended stack">
            {idea.stack.map((s, k) => (
              <tr key={k}><td className="font-medium">{s.layer}</td><td>{s.choice}</td><td className="text-muted">{s.reason}</td></tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="MVP features" right={<Badge>{idea.mvpFeatures.length}</Badge>} />
        <CardBody>
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg/90">{idea.mvpFeatures.map((f, k) => <li key={k}>{f}</li>)}</ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Stretch goals" right={<Badge>{idea.stretchGoals.length}</Badge>} />
        <CardBody>
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg/90">{idea.stretchGoals.map((f, k) => <li key={k}>{f}</li>)}</ul>
          {idea.stretchGoals.length === 0 && <p className="text-xs text-faint">None.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Feasibility" right={<Badge tone={FEAS_TONE[idea.feasibility.level]}>{idea.feasibility.level}</Badge>} />
        <CardBody><Markdown>{idea.feasibility.assessment || '—'}</Markdown></CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Complexity"
          right={
            <>
              <Badge tone={LEVEL_TONE[idea.complexity.level]}>{idea.complexity.level}</Badge>
              <Badge>~{idea.complexity.estimatedHours}h</Badge>
            </>
          }
        />
        <CardBody><Markdown>{idea.complexity.rationale || '—'}</Markdown></CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Risks" right={<Badge>{idea.risks.length}</Badge>} />
        <CardBody>
          <Table head={['Risk', 'Severity', 'Mitigation']} caption="Risks and mitigations">
            {idea.risks.map((r, k) => (
              <tr key={k}><td>{r.risk}</td><td><Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge></td><td className="text-muted">{r.mitigation}</td></tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Judging appeal" />
        <CardBody><Markdown>{idea.judgingAppeal || '—'}</Markdown></CardBody>
      </Card>
      <Card>
        <CardHeader title="Supporting research" />
        <CardBody className="space-y-3">
          {idea.supportingResearch.length === 0 && <p className="text-xs text-faint">No supporting research attached yet.</p>}
          {idea.supportingResearch.map((r, k) => (
            <div key={k}>
              <p className="text-sm text-fg/90">{r.note}</p>
              <div className="mt-1"><SourceChips ids={r.sourceIds} sources={sources} onOpen={onOpenSource} /></div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
