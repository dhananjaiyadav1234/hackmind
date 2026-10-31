import { STAGE_LABELS, STAGE_ORDER, type Job, type StageName } from '../../shared/types';
import { now, uid } from '../lib/ids';
import { HttpError, emit, getWorkspace, saveWorkspace, type Deps, type StageCtx } from './core';
import { runIntel, runOpportunities, runSponsors } from './stages-research';
import { runEvolve, runIdeas, runValidate, validateIdea, recommend } from './stages-ideas';
import { SourceBook } from './core';

const RUNNERS: Record<StageName, (ctx: StageCtx) => Promise<string>> = {
  intel: runIntel, sponsors: runSponsors, opportunities: runOpportunities, ideas: runIdeas, evolve: runEvolve, validate: runValidate,
};

export class JobRunner {
  private running = new Map<string, Promise<Job>>();

  constructor(private deps: Deps) {}

  /** Mark work that was interrupted by a restart as failed. */
  recoverInterrupted(): void {
    for (const ws of this.deps.store.listAll('workspace')) {
      let changed = false;
      for (const s of STAGE_ORDER) if (ws.stages[s].status === 'running') {
        ws.stages[s] = { ...ws.stages[s], status: 'failed', summary: 'Interrupted by a server restart — re-run this stage.' };
        changed = true;
      }
      if (changed) saveWorkspace(this.deps, ws);
      for (const j of this.deps.store.list('job', ws.id)) if (j.status === 'running' || j.status === 'queued') {
        this.deps.store.put('job', ws.id, j.id, { ...j, status: 'failed', error: 'Interrupted by a server restart', endedAt: now() });
      }
    }
  }

  isBusy(wsId: string): boolean {
    return this.running.has(wsId);
  }

  start(wsId: string, target: StageName | 'full', opts: { ideaId?: string } = {}): { job: Job; done: Promise<Job> } {
    getWorkspace(this.deps, wsId);
    if (this.running.has(wsId)) throw new HttpError(409, 'A job is already running for this workspace. Wait for it to finish.');
    const job: Job = { id: uid('job'), workspaceId: wsId, stage: target, status: 'queued', startedAt: now() };
    this.save(job);
    const done = this.execute(job, target, opts);
    this.running.set(wsId, done);
    void done.finally(() => this.running.delete(wsId));
    return { job, done };
  }

  private save(job: Job) {
    this.deps.store.put('job', job.workspaceId, job.id, job);
    this.deps.bus.publish(job.workspaceId, 'job', job);
  }

  private async execute(job: Job, target: StageName | 'full', opts: { ideaId?: string }): Promise<Job> {
    const wsId = job.workspaceId;
    job.status = 'running';
    this.save(job);
    const stages = target === 'full' ? STAGE_ORDER : [target];
    const mkCtx = (stage: StageName): StageCtx => ({
      deps: this.deps, wsId, jobId: job.id, stage,
      research: getWorkspace(this.deps, wsId).mode === 'demo' ? this.deps.demoResearch : this.deps.research,
      log: (agent, message, level = 'info', evStage, data) => { emit(this.deps, wsId, { jobId: job.id, agent, stage: evStage ?? stage, level, message, data }); },
      progress: (done, total, label) => { job.progress = { done, total, label }; this.save(job); },
    });
    try {
      for (const stage of stages) {
        const ctx = mkCtx(stage);
        const setStage = (patch: Partial<ReturnType<typeof getWorkspace>['stages'][StageName]>) => {
          const ws = getWorkspace(this.deps, wsId);
          ws.stages[stage] = { ...ws.stages[stage], ...patch };
          saveWorkspace(this.deps, ws);
        };
        setStage({ status: 'running', engine: this.deps.engine.kind });
        ctx.log('Orchestrator', `Starting ${STAGE_LABELS[stage]} (${this.deps.engine.label}).`, 'info', 'system');
        try {
          let summary: string;
          if (stage === 'validate' && opts.ideaId) {
            await validateIdea(ctx, opts.ideaId, new SourceBook(this.deps, wsId));
            await recommend(this.deps, wsId, ctx.log);
            summary = 'Single idea validated';
          } else {
            summary = await RUNNERS[stage](ctx);
          }
          setStage({ status: 'done', lastRunAt: now(), summary });
        } catch (e) {
          setStage({ status: 'failed', summary: (e as Error).message });
          throw e;
        }
      }
      job.status = 'succeeded';
    } catch (e) {
      job.status = 'failed';
      job.error = (e as Error).message;
      emit(this.deps, wsId, { jobId: job.id, agent: 'Orchestrator', stage: 'system', level: 'error', message: `Job failed: ${job.error}` });
    }
    job.endedAt = now();
    this.save(job);
    return job;
  }
}
