import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Blueprint } from '../../../shared/types';
import { Badge, StatusBadge, type Tone } from '../ui';
import { Timeline } from './Timeline';

export const SECTION_LIST = [
  ['pitch', 'Final pitch'],
  ['problem', 'Problem & solution'],
  ['diff', 'Differentiation'],
  ['research', 'Research evidence'],
  ['architecture', 'Architecture'],
  ['stack', 'Tech stack'],
  ['db', 'Database design'],
  ['api', 'API design'],
  ['mvp', 'MVP scope'],
  ['stretch', 'Stretch goals'],
  ['timeline', 'Timeline'],
  ['team', 'Team responsibilities'],
  ['demo', 'Demo storyline'],
  ['slides', 'Presentation outline'],
  ['judges', 'Judge questions'],
] as const;

const methodTone: Record<string, Tone> = { GET: 'info', POST: 'good', PUT: 'warn', PATCH: 'warn', DELETE: 'bad' };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`bp-${id}`} aria-labelledby={`bp-h-${id}`} className="bp-section scroll-mt-20 border-b border-line py-6 last:border-0">
      <h2 id={`bp-h-${id}`} className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Para({ children }: { children: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/90">{children}</p>;
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-muted">None listed.</p>;
  return <ul className="list-disc space-y-1 pl-5 text-sm text-fg/90">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>;
}

export function SourceChips({ wid, ids, titles }: { wid: string; ids: string[]; titles: Record<string, string> }) {
  if (!ids.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => (
        <Link key={id} to={`/w/${wid}/sources`} title={titles[id] ?? id} className="rounded-full border border-line-strong bg-surface-3 px-2 py-0.5 text-[11px] text-info hover:underline">
          {titles[id] ? titles[id].slice(0, 28) : id.slice(0, 8)}
        </Link>
      ))}
    </span>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BlueprintDocument({ bp, wid, sourceTitles }: { bp: Blueprint; wid: string; sourceTitles: Record<string, string> }) {
  const s = bp.sections;
  const demoTotal = s.demoStoryline.reduce((a, d) => a + d.seconds, 0);
  return (
    <article className="min-w-0 px-0 md:px-2">
      <Section id="pitch" title="Final pitch"><Para>{s.finalPitch}</Para></Section>
      <Section id="problem" title="Problem & solution"><Para>{s.problemAndSolution}</Para></Section>
      <Section id="diff" title="Differentiation"><Para>{s.differentiation}</Para></Section>
      <Section id="research" title="Research evidence">
        <ul className="space-y-2">
          {s.researchEvidence.map((r, i) => (
            <li key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} />
                <SourceChips wid={wid} ids={r.sourceIds} titles={sourceTitles} />
              </div>
              <p className="mt-1.5 text-sm">{r.claim}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-faint">Claims marked assumption have no supporting source and are labelled as such.</p>
      </Section>
      <Section id="architecture" title="Architecture">
        <Para>{s.architecture.summary}</Para>
        <div className="mt-3">
          <Table head={['Component', 'Responsibility', 'Tech']} rows={s.architecture.components.map((c) => [<b key="n">{c.name}</b>, c.responsibility, c.tech])} />
        </div>
      </Section>
      <Section id="stack" title="Tech stack">
        <Table head={['Layer', 'Choice', 'Why']} rows={s.techStack.map((t) => [t.layer, <b key="c">{t.choice}</b>, t.reason])} />
      </Section>
      <Section id="db" title="Database design">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {s.databaseDesign.map((t) => (
            <div key={t.table} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <h4 className="font-mono text-sm font-semibold text-accent-2">{t.table}</h4>
              <p className="text-xs text-muted">{t.purpose}</p>
              <ul className="mt-2 space-y-0.5 font-mono text-xs text-fg/90">{t.columns.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>
      <Section id="api" title="API design">
        <ul className="space-y-1.5">
          {s.apiDesign.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-sm">
              <Badge tone={methodTone[a.method.toUpperCase()] ?? 'neutral'}>{a.method.toUpperCase()}</Badge>
              <code className="font-mono text-xs">{a.path}</code>
              <span className="text-muted">{a.purpose}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="mvp" title="MVP scope"><Bullets items={s.mvpScope} /></Section>
      <Section id="stretch" title="Stretch goals"><Bullets items={s.stretchGoals} /></Section>
      <Section id="timeline" title="Timeline">
        <Timeline milestones={s.milestones} timelineHours={bp.timelineHours} timelineBasis={bp.timelineBasis} />
      </Section>
      <Section id="team" title="Team responsibilities">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {s.teamResponsibilities.map((t, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <h4 className="mb-1 text-sm font-semibold">{t.role}</h4>
              <Bullets items={t.responsibilities} />
            </div>
          ))}
        </div>
      </Section>
      <Section id="demo" title="Demo storyline">
        <p className="mb-2 text-xs text-muted">Total: <b className="tabular-nums text-fg">{Math.floor(demoTotal / 60)}m {demoTotal % 60}s</b> ({demoTotal} seconds)</p>
        <ol className="space-y-2">
          {s.demoStoryline.map((d, i) => (
            <li key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{i + 1}. {d.step}</h4>
                <Badge>{d.seconds}s</Badge>
              </div>
              <p className="mt-1 text-sm text-fg/90">{d.script}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section id="slides" title="Presentation outline">
        <ol className="space-y-2">
          {s.presentationOutline.map((p, i) => (
            <li key={i} className="text-sm"><b>{i + 1}. {p.slide}</b><span className="text-muted"> — {p.content}</span></li>
          ))}
        </ol>
      </Section>
      <Section id="judges" title="Judge questions">
        <ul className="space-y-3">
          {s.judgeQuestions.map((q, i) => (
            <li key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <h4 className="text-sm font-semibold">Q: {q.question}</h4>
              <p className="mt-1 text-sm text-fg/90"><span className="text-good">Recommended answer: </span>{q.recommendedAnswer}</p>
              {q.groundedIn.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">Grounded in <SourceChips wid={wid} ids={q.groundedIn} titles={sourceTitles} /></div>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}

export function Outline() {
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(`bp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav aria-label="Blueprint outline" className="bp-outline">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {SECTION_LIST.map(([id, label]) => (
          <li key={id} className="shrink-0">
            <a href={`#bp-${id}`} onClick={go(id)} className="block whitespace-nowrap rounded-md px-2.5 py-1 text-xs text-muted hover:bg-surface-3 hover:text-fg">{label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
