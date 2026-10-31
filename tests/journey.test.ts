import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Blueprint, Idea, IdeaDetailBundle, JudgeSession, Job, WorkspaceBundle } from '../shared/types';
import { startTestServer } from './helpers';

/** The complete user journey against the real HTTP API, heuristic engine and bundled demo fixtures. */
describe('critical user journey (demo workspace)', () => {
  let s: Awaited<ReturnType<typeof startTestServer>>;
  let wsId: string;
  let top: Idea;
  let session: JudgeSession;

  beforeAll(async () => { s = await startTestServer(); });
  afterAll(async () => { await s.close(); });

  it('1. creates the demo workspace', async () => {
    const r = await s.call<WorkspaceBundle>('POST', '/workspaces', { demo: true });
    expect(r.status).toBe(201);
    expect(r.body.workspace.mode).toBe('demo');
    wsId = r.body.workspace.id;
    expect((await s.call<unknown[]>('GET', '/workspaces')).body).toHaveLength(1);
  });

  it('2. runs the full pipeline successfully', async () => {
    const r = await s.call<Job>('POST', `/workspaces/${wsId}/run`, { stage: 'full', wait: true });
    expect(r.status).toBe(200);
    expect(r.body.error).toBeUndefined();
    expect(r.body.status).toBe('succeeded');
    const b = (await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body;
    for (const st of Object.values(b.workspace.stages)) expect(st.status).toBe('done');
  });

  it('3. hackathon intelligence separates verified facts from unavailable ones', async () => {
    const { intel } = (await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body.workspace;
    expect(intel.durationHours).toMatchObject({ value: 36, status: 'verified' });
    expect(intel.judgingCriteria.value!.map((c) => c.weight)).toEqual([25, 25, 20, 15, 15]);
    expect(intel.judgingCriteria.sourceIds.length).toBeGreaterThan(0);
    expect(intel.sponsors.value!.map((x) => x.name)).toEqual(['Northwind Cloud', 'Meridian Maps', 'Signalbase']);
  });

  it('4. sponsor intelligence is grounded and reports gaps honestly', async () => {
    const { sponsors } = (await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body;
    expect(sponsors).toHaveLength(3);
    const nw = sponsors.find((x) => x.name === 'Northwind Cloud')!;
    expect(nw.status).toBe('researched');
    expect(nw.products.join(' ')).toMatch(/NorthVector/);
    expect(nw.opportunities.length).toBeGreaterThan(0);
    expect(nw.opportunities.every((o) => o.sourceIds.length > 0)).toBe(true);
    expect(Array.isArray(nw.gaps)).toBe(true);
  });

  it('5. produces ~20 structured ideas in three tiers with transparent scores', async () => {
    const { ideas } = (await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body;
    expect(ideas).toHaveLength(20);
    expect(new Set(ideas.map((i) => i.tier))).toEqual(new Set(['safe', 'innovative', 'moonshot']));
    expect(new Set(ideas.map((i) => i.title)).size).toBe(20);
    for (const i of ideas) {
      for (const f of ['title', 'pitch', 'problem', 'audience', 'solution', 'differentiation', 'judgingAppeal'] as const) expect(i[f].length, `${i.title}.${f}`).toBeGreaterThan(3);
      expect(i.mvpFeatures.length).toBeGreaterThan(2);
      expect(i.risks.length).toBeGreaterThan(0);
      expect(i.architecture.components.length).toBeGreaterThan(1);
      expect(i.scores).not.toBeNull();
      const weights = i.scores!.weights;
      expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
      const recomputed = Object.entries(i.scores!.criteria).reduce((t, [k, v]) => t + (v.score / 10) * weights[k as keyof typeof weights], 0);
      expect(recomputed).toBeCloseTo(i.scores!.total, 0);
      expect(i.scores!.disclaimer).toMatch(/not a prediction/i);
    }
    expect(ideas.filter((i) => i.status !== 'eliminated').length).toBeGreaterThanOrEqual(8);
    expect(ideas.filter((i) => i.status === 'eliminated').every((i) => i.eliminatedReason)).toBe(true);
  });

  it('6. evolution preserves reasoning and changes between iterations', async () => {
    const { ideas } = (await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body;
    const evolved = ideas.filter((i) => i.revisions.length > 0);
    expect(evolved.length).toBeGreaterThanOrEqual(5);
    const i = evolved.find((x) => x.revisions.some((r) => r.changes.length)) ?? evolved[0];
    expect(i.revisions).toHaveLength(2);
    expect(i.revisions[0].critiques.length).toBeGreaterThan(0);
    const changed = i.revisions.flatMap((r) => r.changes);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed[0]).toHaveProperty('before');
    expect(changed[0].reason.length).toBeGreaterThan(5);
    expect(i.version).toBeGreaterThan(1);
  });

  it('7. deep validation builds an evidence workspace and recommends one idea', async () => {
    const b = (await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body;
    expect(b.ideas.filter((i) => i.status === 'validated' || i.status === 'recommended')).toHaveLength(3);
    const rec = b.ideas.filter((i) => i.status === 'recommended');
    expect(rec).toHaveLength(1);
    expect(b.workspace.recommendedIdeaId).toBe(rec[0].id);
    top = rec[0];
    expect(top.recommendationRationale).toMatch(/not predictions|not a prediction|estimates/i);
    const d = (await s.call<IdeaDetailBundle>('GET', `/workspaces/${wsId}/ideas/${top.id}`)).body;
    expect(d.claims.length).toBeGreaterThan(3);
    expect(d.evidence.some((e) => e.category === 'sponsor_doc')).toBe(true);
    expect(d.claims.some((c) => c.kind === 'sponsor' && c.status === 'verified')).toBe(true);
    // heuristic keyword matching must never claim a full 'verified' for non-sponsor claims
    expect(d.claims.filter((c) => c.kind === 'problem' && c.status === 'verified')).toHaveLength(0);
    for (const c of d.claims) for (const sid of c.sourceIds) expect(d.sources.some((x) => x.id === sid), `claim source ${sid}`).toBe(true);
    expect(d.idea.scores!.basis).toBe('validated');
  });

  it('8. Judge Arena asks contextual questions and follows up on vague answers', async () => {
    const r = await s.call<JudgeSession>('POST', `/workspaces/${wsId}/ideas/${top.id}/judge`, { maxFollowUps: 2 });
    expect(r.status).toBe(201);
    session = r.body;
    expect(session.turns).toHaveLength(6);
    expect(new Set(session.turns.map((t) => t.persona)).size).toBe(6);
    const text = session.turns.map((t) => t.question).join(' ');
    expect(text).toContain(top.sponsorIntegration[0].technology); // contextual, not generic
    const t0 = session.turns[0];
    const weak = await s.call<JudgeSession>('POST', `/workspaces/${wsId}/judge/${session.id}/answer`, { turnId: t0.id, answer: 'I think it will probably just work, basically.' });
    expect(weak.status).toBe(200);
    const evald = weak.body.turns.find((t) => t.id === t0.id)!;
    expect(evald.evaluation!.overall).toBeLessThan(5);
    const follow = weak.body.turns.find((t) => t.parentTurnId === t0.id);
    expect(follow, 'follow-up expected for hedged answer').toBeDefined();
    expect(follow!.depth).toBe(1);
    expect(follow!.question).toMatch(/probably/i); // reacts to the user's actual words
    // answering twice is rejected
    expect((await s.call('POST', `/workspaces/${wsId}/judge/${session.id}/answer`, { turnId: t0.id, answer: 'again again again' })).status).toBe(409);
    // a strong, specific answer scores higher than a weak one
    const strongText = `Data flows from the ingestion worker over a WebSocket channel to the map UI; we measured 120 ms median latency in a benchmark of 500 events, and if the ${top.sponsorIntegration[0].technology} API fails the retry queue falls back to cached tiles. According to the documentation the endpoint supports 100 requests per second, which we tested.`;
    const t1 = weak.body.turns[1];
    const strong = await s.call<JudgeSession>('POST', `/workspaces/${wsId}/judge/${session.id}/answer`, { turnId: t1.id, answer: strongText });
    expect(strong.body.turns.find((t) => t.id === t1.id)!.evaluation!.overall).toBeGreaterThan(evald.evaluation!.overall + 1);
  });

  it('9. Judge Arena produces a report with weak areas and a preparation plan', async () => {
    const r = await s.call<JudgeSession>('POST', `/workspaces/${wsId}/judge/${session.id}/finish`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('finished');
    expect(r.body.report!.answered).toBe(2);
    expect(r.body.report!.preparationPlan.length).toBeGreaterThan(0);
    expect(r.body.report!.caveat).toMatch(/rule-based/i);
    expect((await s.call('POST', `/workspaces/${wsId}/judge/${session.id}/answer`, { turnId: session.turns[2].id, answer: 'too late answer text' })).status).toBe(409);
  });

  it('10. Winning Blueprint is generated with a timeline scaled to the hackathon duration', async () => {
    expect((await s.call('GET', `/workspaces/${wsId}/ideas/${top.id}/blueprint`)).status).toBe(404);
    const r = await s.call<Blueprint>('POST', `/workspaces/${wsId}/ideas/${top.id}/blueprint`, {});
    expect(r.status).toBe(201);
    const bp = r.body;
    expect(bp.timelineHours).toBe(36);
    const ms = bp.sections.milestones;
    expect(ms[0].startHour).toBe(0);
    expect(ms[ms.length - 1].endHour).toBe(36);
    expect(ms.every((m) => m.goals.length > 0 && m.owner)).toBe(true);
    for (const key of ['finalPitch', 'architecture', 'databaseDesign', 'apiDesign', 'demoStoryline', 'presentationOutline', 'judgeQuestions', 'teamResponsibilities', 'researchEvidence'] as const) {
      const v = bp.sections[key];
      expect(Array.isArray(v) ? v.length : String(v).length, key).toBeGreaterThan(0);
    }
    expect(bp.sections.demoStoryline.reduce((t, d) => t + d.seconds, 0)).toBe(180);
    expect(bp.markdown).toContain('## Potential judge questions');
    const md = await fetch(`${s.base}/workspaces/${wsId}/ideas/${top.id}/blueprint.md`);
    expect(md.headers.get('content-type')).toContain('text/markdown');
    expect(await md.text()).toBe(bp.markdown);
    const custom = await s.call<Blueprint>('POST', `/workspaces/${wsId}/ideas/${top.id}/blueprint`, { hours: 24, teamSize: 2 });
    expect(custom.body.sections.milestones.at(-1)!.endHour).toBe(24);
    expect(custom.body.sections.teamResponsibilities).toHaveLength(2);
  });

  it('11. users can override intel and curate ideas; downstream stages go stale', async () => {
    const put = await s.call('PUT', `/workspaces/${wsId}/intel/durationHours`, { value: 48 });
    expect(put.status).toBe(200);
    expect(put.body.intel.durationHours).toMatchObject({ value: 48, status: 'verified', note: 'Entered by user' });
    expect(put.body.stages.ideas.status).toBe('stale');
    // re-running intel must not overwrite the user's value
    await s.call('POST', `/workspaces/${wsId}/run`, { stage: 'intel', wait: true });
    expect((await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body.workspace.intel.durationHours.value).toBe(48);
    const p = await s.call<Idea>('PATCH', `/workspaces/${wsId}/ideas/${top.id}`, { status: 'eliminated' });
    expect(p.body.status).toBe('eliminated');
    expect((await s.call<WorkspaceBundle>('GET', `/workspaces/${wsId}`)).body.workspace.recommendedIdeaId).toBeNull();
    expect((await s.call('PUT', `/workspaces/${wsId}/intel/bogus`, { value: 1 })).status).toBe(400);
    expect((await s.call('PUT', `/workspaces/${wsId}/intel/durationHours`, { value: -5 })).status).toBe(400);
  });

  it('12. emits agent activity events and deletes workspaces completely', async () => {
    const ev = (await s.call<{ agent: string }[]>('GET', `/workspaces/${wsId}/events?limit=500`)).body;
    expect(new Set(ev.map((e) => e.agent))).toEqual(expect.objectContaining(new Set(['Orchestrator', 'Intel Analyst', 'Sponsor Analyst', 'Idea Evolver', 'Claim Auditor'])));
    expect((await s.call('DELETE', `/workspaces/${wsId}`)).status).toBe(204);
    expect((await s.call('GET', `/workspaces/${wsId}`)).status).toBe(404);
    expect(s.store.list('idea', wsId)).toHaveLength(0);
    expect(s.store.list('source', wsId)).toHaveLength(0);
  });
});
