import type { BlueprintDraft, BlueprintInput } from '../engine';
import { openingQuestionHeuristic } from './judge';
import { truncate } from './text';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'item';

const ROLES = ['Product & pitch lead', 'Backend & data engineer', 'Frontend & UX engineer', 'AI / integrations engineer', 'QA & demo operator'];

export function writeBlueprintHeuristic(input: BlueprintInput): BlueprintDraft {
  const { idea, claims, hours, teamSize, workspace, phases } = input;
  const roles = ROLES.slice(0, Math.max(1, Math.min(teamSize, ROLES.length)));
  const submission = workspace.intel.submissionRequirements.value ?? [];
  const mvp = idea.mvpFeatures;
  const half = Math.ceil(mvp.length / 2);

  const goals: BlueprintDraft['milestoneGoals'] = {
    setup: { owner: roles[0], goals: ['Agree the MVP list and cut line', 'Create repo, CI and shared environment', ...idea.sponsorIntegration.slice(0, 2).map((i) => `Get ${i.technology} credentials and a working hello-world call`), 'Load fixture / seed data'] },
    core: { owner: roles[Math.min(1, roles.length - 1)], goals: mvp.slice(0, half) },
    integration: { owner: roles[Math.min(3, roles.length - 1)], goals: [...mvp.slice(half), ...idea.sponsorIntegration.map((i) => `Complete ${i.sponsor} ${i.technology} integration end-to-end`), 'Error handling and loading states'] },
    polish: { owner: roles[Math.min(2, roles.length - 1)], goals: ['Script and rehearse the demo path', 'Polish UI for the demo flow', 'README, architecture diagram and setup instructions', ...idea.stretchGoals.slice(0, 1).map((s) => `Stretch if on track: ${s}`)] },
    freeze: { owner: roles[0], goals: ['Feature freeze', 'Record backup demo video', ...(submission.length ? submission.map((s) => `Submission: ${s}`) : ['Complete the submission form']), 'Full dry-run of the pitch'] },
  };
  for (const p of phases) goals[p.key] ??= { owner: roles[0], goals: [] };

  const evidence: BlueprintDraft['researchEvidence'] = claims.map((c) => ({ claim: c.text, status: c.status, sourceIds: c.sourceIds }));
  for (const r of idea.risks.filter((r) => /assum/i.test(r.risk))) evidence.push({ claim: r.risk, status: 'assumption', sourceIds: [] });

  const qs = (['technical', 'innovation', 'business', 'sponsor', 'product', 'aggressive'] as const).map((persona) => {
    const q = openingQuestionHeuristic({ ...input, persona, asked: [] });
    const weak = claims.find((c) => c.status !== 'verified' && c.importance === 'high');
    const grounded = claims.filter((c) => c.sourceIds.length && c.status !== 'unverified').slice(0, 2);
    const answer =
      persona === 'aggressive' && weak
        ? `Be candid: the claim “${truncate(weak.text, 100)}” is currently ${weak.status.replace('_', ' ')}. Say what you have checked, what you have not, and the test you will run next.`
        : persona === 'sponsor' && idea.sponsorIntegration[0]
          ? `${idea.sponsorIntegration[0].justification} Name what you would lose without it.`
          : persona === 'technical'
            ? `${idea.architecture.summary} Mention the top risk (${idea.risks[0]?.risk ?? 'dependency failure'}) and mitigation: ${idea.risks[0]?.mitigation ?? 'a fallback path'}.`
            : persona === 'innovation'
              ? idea.differentiation
              : `${idea.solution} ${idea.judgingAppeal}`;
    return { question: q.question, recommendedAnswer: `${truncate(answer, 420)} (Starting point — rewrite in your own words and add your own numbers.)`, groundedIn: grounded.flatMap((c) => c.sourceIds).slice(0, 3) };
  });

  const entity = truncate(idea.title.split(':')[0], 28);
  return {
    finalPitch: `${idea.title} — ${idea.pitch} Built for ${idea.audience.toLowerCase()}: ${truncate(idea.solution, 260)}`,
    problemAndSolution: `**Problem.** ${idea.problem}\n\n**Solution.** ${idea.solution}`,
    differentiation: idea.differentiation,
    researchEvidence: evidence,
    architecture: idea.architecture,
    techStack: idea.stack,
    databaseDesign: [
      { table: 'users', purpose: `People using ${entity}`, columns: ['id', 'name', 'role', 'created_at'] },
      { table: 'records', purpose: `Core domain objects for ${entity}`, columns: ['id', 'user_id', 'type', 'payload_json', 'location', 'status', 'created_at'] },
      { table: 'events', purpose: 'Append-only audit and activity log', columns: ['id', 'record_id', 'kind', 'detail_json', 'created_at'] },
      { table: 'sources', purpose: 'Citations and provenance for displayed facts', columns: ['id', 'record_id', 'url', 'title', 'excerpt', 'retrieved_at'] },
      ...idea.sponsorIntegration.map((i) => ({ table: `${slug(i.technology)}_sync`, purpose: `State of the ${i.technology} integration`, columns: ['id', 'record_id', 'external_id', 'status', 'last_synced_at'] })),
    ],
    apiDesign: [
      { method: 'GET', path: '/api/health', purpose: 'Liveness and dependency status' },
      { method: 'GET', path: '/api/records', purpose: 'List records with filters' },
      { method: 'POST', path: '/api/records', purpose: 'Create a record' },
      { method: 'GET', path: '/api/records/:id', purpose: 'Fetch a record with its sources and events' },
      ...mvp.slice(0, 4).map((f) => ({ method: 'POST', path: `/api/${slug(f)}`, purpose: f })),
      ...idea.sponsorIntegration.map((i) => ({ method: 'POST', path: `/api/integrations/${slug(i.technology)}/sync`, purpose: `Call ${i.technology}: ${i.how}` })),
    ],
    mvpScope: mvp,
    stretchGoals: idea.stretchGoals,
    milestoneGoals: goals,
    teamResponsibilities: roles.map((role, i) => ({
      role,
      responsibilities: i === 0 ? ['Own scope and the cut line', 'Pitch, demo script and submission', 'Judge Q&A preparation'] : i === 1 ? ['API, data model, persistence', 'Deployment and environment'] : i === 2 ? ['Demo UI and interaction polish', 'Accessibility and responsive layout'] : i === 3 ? ['Sponsor technology integrations', 'AI/model prompts and evaluation'] : ['Test the demo path repeatedly', 'Backup video and fallbacks'],
    })),
    demoStoryline: [
      { step: 'Hook', seconds: 20, script: `Open with the human problem: ${truncate(idea.problem, 140)}` },
      { step: 'Meet the user', seconds: 25, script: `Introduce ${idea.audience.toLowerCase()} and the moment they need help.` },
      { step: 'Core flow', seconds: 60, script: `Walk the MVP happy path: ${truncate(mvp.slice(0, 3).join(' → '), 200)}` },
      { step: 'Sponsor technology moment', seconds: 30, script: idea.sponsorIntegration[0] ? `Show ${idea.sponsorIntegration[0].technology} doing real work and say why it is essential.` : 'Show the key technical component working live.' },
      { step: 'Trust & evidence', seconds: 25, script: 'Show sources/citations and say plainly what is verified versus assumed.' },
      { step: 'Close', seconds: 20, script: 'State impact, what comes next, and the ask.' },
    ],
    presentationOutline: [
      { slide: 'Title & one-liner', content: idea.pitch },
      { slide: 'Problem', content: truncate(idea.problem, 200) },
      { slide: 'Solution (live demo)', content: 'Demo the happy path' },
      { slide: 'How it works', content: truncate(idea.architecture.summary, 200) },
      { slide: 'Why us / differentiation', content: truncate(idea.differentiation, 200) },
      { slide: 'Evidence & honesty', content: 'What is verified, what is assumed, what we will test' },
      { slide: `Plan for ${hours}h and what is next`, content: `Team of ${teamSize}; MVP now, stretch later` },
    ],
    judgeQuestions: qs,
  };
}
