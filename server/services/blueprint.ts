import { timelinePhases } from '../../shared/scoring';
import type { Blueprint, BlueprintSections } from '../../shared/types';
import { now, uid } from '../lib/ids';
import { HttpError, emit, getWorkspace, type Deps } from '../pipeline/core';

export function renderMarkdown(title: string, s: BlueprintSections, meta: { hours: number; basis: string; sources: Map<string, string> }): string {
  const ref = (ids: string[]) => (ids.length ? ' ' + ids.map((id) => `[${meta.sources.get(id) ?? id}]`).join('') : '');
  const L: string[] = [];
  L.push(`# ${title} — Winning Blueprint`, '', `*Timeline basis: ${meta.basis}*`, '');
  L.push('## Final pitch', s.finalPitch, '', '## Problem & solution', s.problemAndSolution, '', '## Differentiation', s.differentiation, '');
  L.push('## Research evidence', ...s.researchEvidence.map((e) => `- **${e.status.replace('_', ' ')}** — ${e.claim}${ref(e.sourceIds)}`), '');
  L.push('## Architecture', s.architecture.summary, '', '| Component | Responsibility | Tech |', '|---|---|---|', ...s.architecture.components.map((c) => `| ${c.name} | ${c.responsibility} | ${c.tech} |`), '');
  L.push('## Technology stack', ...s.techStack.map((t) => `- **${t.layer}:** ${t.choice} — ${t.reason}`), '');
  L.push('## Database design', ...s.databaseDesign.map((t) => `- **${t.table}** — ${t.purpose}: ${t.columns.join(', ')}`), '');
  L.push('## API design', ...s.apiDesign.map((a) => `- \`${a.method} ${a.path}\` — ${a.purpose}`), '');
  L.push('## MVP scope', ...s.mvpScope.map((m) => `- ${m}`), '', '## Stretch goals', ...s.stretchGoals.map((m) => `- ${m}`), '');
  L.push(`## Development milestones (${meta.hours}h)`, ...s.milestones.flatMap((m) => [`### ${m.name} (h${m.startHour}–h${m.endHour}) — ${m.owner}`, ...m.goals.map((g) => `- ${g}`), '']));
  L.push('## Team responsibilities', ...s.teamResponsibilities.flatMap((t) => [`- **${t.role}**`, ...t.responsibilities.map((r) => `  - ${r}`)]), '');
  L.push('## Demo storyline', ...s.demoStoryline.map((d, i) => `${i + 1}. **${d.step}** (${d.seconds}s) — ${d.script}`), '');
  L.push('## Presentation outline', ...s.presentationOutline.map((p, i) => `${i + 1}. **${p.slide}** — ${p.content}`), '');
  L.push('## Potential judge questions', ...s.judgeQuestions.flatMap((q) => [`**Q: ${q.question}**`, '', `${q.recommendedAnswer}${ref(q.groundedIn)}`, '']));
  return L.join('\n');
}

export async function generateBlueprint(deps: Deps, wsId: string, ideaId: string, opts: { hours?: number; teamSize?: number }): Promise<Blueprint> {
  const workspace = getWorkspace(deps, wsId);
  const idea = deps.store.get('idea', ideaId);
  if (!idea || idea.workspaceId !== wsId) throw new HttpError(404, 'Idea not found');
  const known = workspace.intel.durationHours.value;
  const hours = opts.hours ?? known ?? 36;
  const basis = opts.hours ? `${hours}h (entered for this blueprint)` : known ? `${hours}h (from hackathon intel, ${workspace.intel.durationHours.status})` : `${hours}h (assumed default — duration unknown)`;
  const teamSize = opts.teamSize ?? workspace.config.teamSize;
  const phases = timelinePhases(hours);
  const sources = deps.store.list('source', wsId);
  emit(deps, wsId, { agent: 'Blueprint Architect', stage: 'blueprint', level: 'info', message: `Drafting blueprint for “${idea.title}” (${hours}h, team of ${teamSize})…` });
  const draft = await deps.engine.writeBlueprint({
    workspace, idea, sponsors: deps.store.list('sponsor', wsId), claims: deps.store.list('claim', wsId).filter((c) => c.ideaId === ideaId),
    sources: sources.map((s) => ({ id: s.id, title: s.title, url: s.url })), hours, teamSize, phases,
  });
  const { milestoneGoals, ...rest } = draft;
  const sections: BlueprintSections = {
    ...rest,
    milestones: phases.map((p) => ({ name: p.name, startHour: p.startHour, endHour: p.endHour, goals: milestoneGoals[p.key]?.goals ?? [], owner: milestoneGoals[p.key]?.owner ?? 'Team' })),
  };
  for (const old of deps.store.list('blueprint', wsId).filter((b) => b.ideaId === ideaId)) deps.store.delete('blueprint', old.id);
  const bp: Blueprint = {
    id: uid('bp'), workspaceId: wsId, ideaId, generatedAt: now(), engine: deps.engine.kind, timelineHours: hours, timelineBasis: basis, sections,
    markdown: renderMarkdown(idea.title, sections, { hours, basis, sources: new Map(sources.map((s) => [s.id, s.title])) }),
  };
  deps.store.put('blueprint', wsId, bp.id, bp);
  emit(deps, wsId, { agent: 'Blueprint Architect', stage: 'blueprint', level: 'success', message: 'Blueprint ready.' });
  return bp;
}
