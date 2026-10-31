import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Job, WorkspaceBundle } from '../shared/types';
import { startTestServer } from './helpers';

const MANUAL = `Climate Hack 2027
Objectives
- Reduce household energy waste
Themes
- Home energy
- Grid flexibility
Problem Statements
1. Home energy audits: Homeowners cannot see where energy is wasted.
Judging Criteria
- Innovation (50%): novelty
- Demo (50%): clarity
Duration: 24 hours
Sponsors: Volt API, GridCo`;

describe('manual workspace with no network research', () => {
  let s: Awaited<ReturnType<typeof startTestServer>>;
  let id: string;
  beforeAll(async () => { s = await startTestServer(); });
  afterAll(async () => { await s.close(); });

  it('never fabricates sources or competitors when research is unavailable', async () => {
    const created = await s.call<WorkspaceBundle>('POST', '/workspaces', { manualText: MANUAL, config: { initialIdeas: 6, shortlistSize: 3, deepValidateCount: 1, evolutionRounds: 1 } });
    expect(created.status).toBe(201);
    id = created.body.workspace.id;
    const job = await s.call<Job>('POST', `/workspaces/${id}/run`, { stage: 'full', wait: true });
    expect(job.body.status, job.body.error).toBe('succeeded');
    const b = (await s.call<WorkspaceBundle>('GET', `/workspaces/${id}`)).body;

    expect(b.workspace.name).toBe('Climate Hack 2027');
    expect(b.workspace.intel.durationHours.value).toBe(24);
    expect(b.workspace.intel.judgingCriteria.value).toEqual([
      { name: 'Innovation', weight: 50, description: 'novelty' }, { name: 'Demo', weight: 50, description: 'clarity' },
    ]);
    // only the user's own manual text exists as a source
    expect(b.sources.every((x) => x.kind === 'manual')).toBe(true);
    // sponsors named but with no retrievable material → unavailable + explicit gaps, no invented products
    expect(b.sponsors.map((x) => x.status)).toEqual(['unavailable', 'unavailable']);
    expect(b.sponsors.every((x) => x.products.length === 0 && x.gaps.length > 0)).toBe(true);
    // no alternatives invented
    expect(b.ideas.every((i) => i.alternatives.length === 0)).toBe(true);
    expect(b.opportunities.every((o) => o.existingSolutions.length === 0 && o.verification === 'unavailable')).toBe(true);
    // scoring weights come from the official criteria and are visible
    const card = b.ideas[0].scores!;
    expect(card.weightBasis).toMatch(/Official/);
    expect(card.weights.innovation).toBeGreaterThan(card.weights.feasibility);
    // no sponsor evidence → sponsor score is low, not inflated
    expect(card.criteria.sponsor.score).toBeLessThan(5);
  });

  it('respects configured counts', async () => {
    const b = (await s.call<WorkspaceBundle>('GET', `/workspaces/${id}`)).body;
    expect(b.ideas).toHaveLength(6);
    expect(b.ideas.filter((i) => i.status !== 'eliminated').length).toBe(3);
    expect(b.ideas.filter((i) => i.status === 'validated' || i.status === 'recommended')).toHaveLength(1);
    expect(b.ideas.every((i) => i.revisions.length <= 1)).toBe(true);
  });

  it('refuses a second concurrent job and recovers interrupted state', async () => {
    const first = s.runner.start(id, 'sponsors');
    expect(() => s.runner.start(id, 'sponsors')).toThrow(/already running/);
    await first.done;
    // simulate crash: stage left "running"
    const ws = s.store.get('workspace', id)!;
    ws.stages.ideas.status = 'running';
    s.store.put('workspace', id, id, ws);
    s.runner.recoverInterrupted();
    expect(s.store.get('workspace', id)!.stages.ideas.status).toBe('failed');
  });

  it('fails a stage with a clear message when prerequisites are missing', async () => {
    const empty = (await s.call<WorkspaceBundle>('POST', '/workspaces', { manualText: 'Just a name' })).body.workspace.id;
    const job = await s.call<Job>('POST', `/workspaces/${empty}/run`, { stage: 'validate', wait: true });
    expect(job.body.status).toBe('failed');
    expect(job.body.error).toMatch(/No shortlisted ideas/);
  });
});
