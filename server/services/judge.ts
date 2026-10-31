import { JUDGE_DIMENSIONS, JUDGE_PERSONAS, type JudgeDimension, type JudgePersona, type JudgeReport, type JudgeSession, type JudgeTurn } from '../../shared/types';
import { now, uid } from '../lib/ids';
import { HttpError, emit, getWorkspace, mapLimit, type Deps } from '../pipeline/core';

function ctxFor(deps: Deps, wsId: string, ideaId: string) {
  const workspace = getWorkspace(deps, wsId);
  const idea = deps.store.get('idea', ideaId);
  if (!idea || idea.workspaceId !== wsId) throw new HttpError(404, 'Idea not found');
  return { workspace, idea, sponsors: deps.store.list('sponsor', wsId), claims: deps.store.list('claim', wsId).filter((c) => c.ideaId === ideaId) };
}

export function getSession(deps: Deps, wsId: string, sessionId: string): JudgeSession {
  const s = deps.store.get('judge', sessionId);
  if (!s || s.workspaceId !== wsId) throw new HttpError(404, 'Judge session not found');
  return s;
}

export async function startSession(deps: Deps, wsId: string, ideaId: string, personas: JudgePersona[] | undefined, maxFollowUps = 2): Promise<JudgeSession> {
  const ctx = ctxFor(deps, wsId, ideaId);
  const panel = (personas?.length ? [...new Set(personas)] : [...JUDGE_PERSONAS]) as JudgePersona[];
  const asked: string[] = [];
  emit(deps, wsId, { agent: 'Judge Arena', stage: 'judge', level: 'info', message: `Convening ${panel.length} judge(s) for “${ctx.idea.title}”…` });
  const questions = await mapLimit(panel, 3, async (persona) => ({ persona, q: await deps.engine.openingQuestion({ ...ctx, persona, asked: [...asked] }) }));
  const ts = now();
  const turns: JudgeTurn[] = questions.map(({ persona, q }) => {
    asked.push(q.question);
    return { id: uid('turn'), persona, question: q.question, intent: q.intent, dimension: q.dimension, depth: 0, askedAt: ts };
  });
  const session: JudgeSession = { id: uid('js'), workspaceId: wsId, ideaId, personas: panel, maxFollowUps, status: 'active', turns, report: null, createdAt: ts, updatedAt: ts };
  return deps.store.put('judge', wsId, session.id, session);
}

export async function answerTurn(deps: Deps, wsId: string, sessionId: string, turnId: string, answer: string): Promise<JudgeSession> {
  const session = getSession(deps, wsId, sessionId);
  if (session.status === 'finished') throw new HttpError(409, 'This session is finished.');
  const turn = session.turns.find((t) => t.id === turnId);
  if (!turn) throw new HttpError(404, 'Turn not found');
  if (turn.answer) throw new HttpError(409, 'This question was already answered.');
  const ctx = ctxFor(deps, wsId, session.ideaId);
  const review = await deps.engine.reviewAnswer({
    ...ctx, persona: turn.persona, turn, answer, history: session.turns.filter((t) => t.answer), followUpsRemaining: Math.max(0, session.maxFollowUps - turn.depth),
  });
  // re-read to avoid clobbering concurrent answers
  const latest = getSession(deps, wsId, sessionId);
  const t = latest.turns.find((x) => x.id === turnId)!;
  if (t.answer) throw new HttpError(409, 'This question was already answered.');
  t.answer = answer;
  t.answeredAt = now();
  t.evaluation = review.evaluation;
  if (review.followUp && turn.depth < latest.maxFollowUps) {
    latest.turns.push({
      id: uid('turn'), persona: turn.persona, question: review.followUp.question, intent: review.followUp.intent, dimension: review.followUp.dimension,
      depth: turn.depth + 1, parentTurnId: turn.id, askedAt: now(), followUpReason: review.followUp.reason,
    });
  }
  latest.updatedAt = now();
  return deps.store.put('judge', wsId, latest.id, latest);
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function aggregate(session: JudgeSession) {
  const byDimension = Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, { avg: null as number | null, samples: 0 }])) as JudgeReport['byDimension'];
  const per: Record<JudgeDimension, number[]> = Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, [] as number[]])) as never;
  const byPersonaRaw: Partial<Record<JudgePersona, number[]>> = {};
  const overall: number[] = [];
  for (const t of session.turns) {
    if (!t.evaluation) continue;
    overall.push(t.evaluation.overall);
    (byPersonaRaw[t.persona] ??= []).push(t.evaluation.overall);
    for (const d of JUDGE_DIMENSIONS) {
      const s = t.evaluation.dimensions[d]?.score;
      if (typeof s === 'number') per[d].push(s);
    }
  }
  for (const d of JUDGE_DIMENSIONS) byDimension[d] = { avg: avg(per[d]), samples: per[d].length };
  const byPersona: JudgeReport['byPersona'] = {};
  for (const [p, xs] of Object.entries(byPersonaRaw)) byPersona[p as JudgePersona] = { avg: avg(xs!), samples: xs!.length };
  return { byDimension, byPersona, overall: avg(overall), answered: overall.length };
}

export async function finishSession(deps: Deps, wsId: string, sessionId: string): Promise<JudgeSession> {
  const session = getSession(deps, wsId, sessionId);
  const agg = aggregate(session);
  if (!agg.answered) throw new HttpError(409, 'Answer at least one question before finishing.');
  const ctx = ctxFor(deps, wsId, session.ideaId);
  const text = await deps.engine.writeReport({ ...ctx, session, byDimension: agg.byDimension });
  session.report = {
    overall: agg.overall, answered: agg.answered, byDimension: agg.byDimension, byPersona: agg.byPersona,
    weakAreas: text.weakAreas, strengths: text.strengths, preparationPlan: text.preparationPlan, engine: deps.engine.kind,
    caveat: deps.engine.kind === 'heuristic'
      ? 'Scores come from rule-based signals (specificity, evidence markers, hedging, topical overlap) — they cannot judge correctness. Treat them as practice prompts, not a verdict.'
      : 'Scores are an AI judge’s assessment of your answers; they are practice feedback, not a prediction of real judges.',
    generatedAt: now(),
  };
  session.status = 'finished';
  session.updatedAt = now();
  emit(deps, wsId, { agent: 'Judge Arena', stage: 'judge', level: 'success', message: `Session finished: overall ${agg.overall ?? '—'}/10 across ${agg.answered} answer(s).` });
  return deps.store.put('judge', wsId, session.id, session);
}
