import { JUDGE_DIMENSIONS, JUDGE_DIMENSION_LABELS, type Claim, type Idea, type JudgeDimension, type JudgePersona, type TurnEvaluation } from '../../../shared/types';
import type { AnswerReview, AnswerReviewInput, JudgeQuestion, OpeningQuestionInput, ReportInput, ReportText } from '../engine';
import { keyTerms, overlap, truncate } from './text';

const weakestClaim = (claims: Claim[]) =>
  claims.find((c) => c.status === 'contradicted') ?? claims.find((c) => c.importance === 'high' && c.status === 'unverified') ?? claims.find((c) => c.status === 'unverified');

export function openingQuestionHeuristic(input: OpeningQuestionInput): JudgeQuestion {
  const { idea, persona, claims, asked } = input;
  const comps = idea.architecture.components;
  const risk = [...idea.risks].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.severity] - ({ high: 0, medium: 1, low: 2 })[b.severity])[0];
  const alt = idea.alternatives[0];
  const integ = idea.sponsorIntegration[0];
  const weak = weakestClaim(claims);

  const cands: Record<JudgePersona, JudgeQuestion[]> = {
    technical: [
      { question: `Walk me through how data moves from “${comps[0]?.name ?? 'the first component'}” to “${comps[comps.length - 1]?.name ?? 'the last component'}”. What happens when this goes wrong: ${risk?.risk ?? 'a dependency is unavailable'}?`, intent: 'Tests whether you understand your own architecture and failure modes.', dimension: 'technical' },
      { question: `You estimate ${idea.complexity.estimatedHours} hours of work. Which part will take longest, and what is your fallback if it does not work?`, intent: 'Probes feasibility and risk planning.', dimension: 'feasibility' },
    ],
    innovation: [
      { question: alt ? `${alt.name} already exists. What does “${idea.title}” do that it cannot, and how do you know?` : `Nothing comparable turned up in research. Why is that — is it genuinely new, or did you not find the incumbents?`, intent: 'Tests innovation claims against real alternatives.', dimension: 'innovation' },
    ],
    business: [
      { question: `Who is the very first user (${idea.audience.toLowerCase()}), what do they use today instead, and why would they switch?`, intent: 'Tests problem understanding and adoption logic.', dimension: 'problem' },
      { question: 'After the hackathon, who maintains this and what would a pilot look like?', intent: 'Probes viability beyond the demo.', dimension: 'problem' },
    ],
    sponsor: [
      integ
        ? { question: `Why is ${integ.technology} essential here? What specifically breaks if I replace it with an open-source alternative?`, intent: 'Separates meaningful sponsor integration from logo placement.', dimension: 'sponsor' }
        : { question: 'Your project does not integrate any sponsor technology in a meaningful way. How do you justify that against the rules?', intent: 'Probes sponsor requirement compliance.', dimension: 'sponsor' },
    ],
    product: [
      { question: `Describe the first 60 seconds of your target user’s experience (${idea.audience.toLowerCase()}). Which MVP feature matters most, and what did you deliberately cut?`, intent: 'Tests product thinking and prioritisation.', dimension: 'problem' },
      { question: `Of your MVP (${truncate(idea.mvpFeatures.slice(0, 3).join('; '), 140)}), which feature would you demo first, and why?`, intent: 'Tests prioritisation and demo clarity.', dimension: 'communication' },
    ],
    aggressive: [
      weak
        ? { question: `You claim: “${truncate(weak.text, 160)}” — I don’t see evidence for it (${weak.status.replace('_', ' ')}). Convince me.`, intent: 'Attacks the weakest, least-supported claim.', dimension: 'evidence' }
        : { question: `Give me one reason this will NOT work. And then tell me why you still believe in it.`, intent: 'Checks intellectual honesty about risk.', dimension: 'evidence' },
    ],
  };
  const options = cands[persona];
  return options.find((q) => !asked.includes(q.question)) ?? options[0];
}

const HEDGES = ['maybe', 'probably', 'i think', 'kind of', 'sort of', 'basically', 'i guess', 'hopefully', 'should be fine', 'stuff', 'etc', 'somehow'];
const EVIDENCE = ['source', 'study', 'data', 'according', 'measured', 'tested', 'benchmark', 'documentation', 'docs', 'paper', 'survey', 'interview', 'reported', 'citation', 'verified'];
const TECH = ['api', 'latency', 'index', 'database', 'queue', 'cache', 'schema', 'model', 'endpoint', 'websocket', 'auth', 'embedding', 'vector', 'pipeline', 'retry', 'fallback', 'throughput', 'sdk', 'rest', 'sse', 'webhook', 'sql', 'sync'];
const SCOPE = ['mvp', 'scope', 'cut', 'hours', 'milestone', 'fallback', 'risk', 'timeline', 'prioriti'];
const DIFF = ['unlike', 'instead', 'whereas', 'compared', 'differs', 'only', 'novel', 'unique', 'alternative'];

const clamp = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));

export function evaluateAnswerHeuristic(idea: Idea, turn: { dimension: JudgeDimension }, answer: string, sponsorNames: string[]): TurnEvaluation {
  const lower = answer.toLowerCase();
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const n = words.length;
  const numbers = (answer.match(/\b\d+(?:[.,]\d+)?\s*(?:%|ms|s|h|hours?|users?|x|k|m)?\b/gi) ?? []).length;
  const hedges = HEDGES.filter((h) => lower.includes(h));
  const evHits = EVIDENCE.filter((e) => lower.includes(e)).length + (/https?:\/\//.test(answer) ? 1 : 0);
  const techHits = TECH.filter((t) => new RegExp(`\\b${t}`).test(lower)).length;
  const ctx = keyTerms(`${idea.title} ${idea.problem} ${idea.solution} ${idea.architecture.summary}`, 20);
  const ctxOverlap = overlap(ctx, answer);

  const S = Math.min(1, numbers * 0.12 + techHits * 0.08 + ctxOverlap * 0.9);
  const E = Math.min(1, evHits * 0.28 + numbers * 0.06);
  const H = Math.min(1, hedges.length * 0.25);
  const lenBonus = n >= 25 && n <= 220 ? 1 : n >= 12 ? 0.4 : -1;

  const dims = {} as TurnEvaluation['dimensions'];
  const set = (d: JudgeDimension, score: number | null, comment: string) => { dims[d] = { score: score === null ? null : clamp(score), comment }; };
  const asked = turn.dimension;

  const main = 2 + 6 * S - 2 * H + lenBonus;
  set('technical', asked === 'technical' ? main : techHits ? 2.5 + 5 * S + techHits * 0.3 - H : null, techHits ? `${techHits} technical concept(s) referenced.` : 'No technical specifics given.');
  set('problem', asked === 'problem' ? main : overlap(keyTerms(idea.problem, 8), answer) > 0.2 ? 3 + 5 * ctxOverlap : null, 'Relates the answer to the user and problem.');
  set('innovation', asked === 'innovation' ? main + (DIFF.some((d) => lower.includes(d)) ? 0.8 : -0.8) : DIFF.some((d) => lower.includes(d)) ? 4 + 4 * S : null, DIFF.some((d) => lower.includes(d)) ? 'Contrasts with alternatives.' : 'No contrast with existing alternatives.');
  set('feasibility', asked === 'feasibility' ? main + (SCOPE.some((s) => lower.includes(s)) ? 0.8 : -0.5) : SCOPE.some((s) => lower.includes(s)) ? 3.5 + 4 * S : null, SCOPE.some((s) => lower.includes(s)) ? 'Discusses scope/fallbacks.' : 'No discussion of scope or fallbacks.');
  const sponsorHit = sponsorNames.some((s) => lower.includes(s.toLowerCase())) || idea.sponsorIntegration.some((i) => lower.includes(i.technology.toLowerCase()));
  set('sponsor', asked === 'sponsor' ? (sponsorHit ? main + 0.5 : Math.min(main, 3.5)) : sponsorHit ? 4 + 4 * S : null, sponsorHit ? 'References sponsor technology.' : 'Does not mention the sponsor technology.');
  const comm = 4 + (n >= 25 && n <= 220 ? 2.5 : n >= 12 ? 1 : -2) - 2 * H + (answer.split(/[.!?]/).filter((s) => s.trim().length > 8).length >= 2 ? 1 : 0);
  set('communication', comm, n < 12 ? 'Too brief to judge communication.' : hedges.length ? `Hedging language (“${hedges[0]}”) weakens confidence.` : 'Clear and structured.');
  set('evidence', asked === 'evidence' || evHits ? 1.5 + 7 * E - H : null, evHits ? `${evHits} evidence marker(s) (sources, data, tests).` : 'No sources, data or tests cited.');

  const scores = JUDGE_DIMENSIONS.map((d) => dims[d].score).filter((s): s is number => s !== null);
  const overall = clamp(scores.reduce((a, b) => a + b, 0) / (scores.length || 1));

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (numbers) strengths.push('Uses concrete numbers.'); else weaknesses.push('No numbers or concrete quantities — claims stay abstract.');
  if (techHits >= 2) strengths.push('Shows technical grounding.');
  if (evHits) strengths.push('Cites evidence or testing.'); else weaknesses.push('No evidence cited (sources, measurements, user tests).');
  if (hedges.length) weaknesses.push(`Hedging: “${hedges.slice(0, 2).join('”, “')}”.`);
  if (n < 20) weaknesses.push('Answer is very short.');
  if (ctxOverlap < 0.15) weaknesses.push('Barely connects to your own project’s specifics.');
  if (ctxOverlap >= 0.35) strengths.push('Stays specific to your project.');

  const weakDim = JUDGE_DIMENSIONS.filter((d) => dims[d].score !== null).sort((a, b) => dims[a].score! - dims[b].score!)[0];
  return {
    dimensions: dims, overall, strengths: strengths.length ? strengths : ['Addressed the question.'], weaknesses,
    suggestion: weakDim ? `Prepare a sharper answer on “${JUDGE_DIMENSION_LABELS[weakDim]}”: ${hintFor(weakDim)}` : 'Add specifics and evidence.',
    engine: 'heuristic',
  };
}

function hintFor(d: JudgeDimension): string {
  return {
    technical: 'trace one request end-to-end and name what fails first.',
    problem: 'name the exact user, what they do today, and what hurts.',
    innovation: 'name the closest alternative and the one thing yours does that it cannot.',
    feasibility: 'state what is in the MVP, what is cut, and the fallback if the riskiest part fails.',
    sponsor: 'explain what breaks without the sponsor technology.',
    communication: 'lead with the answer in one sentence, then give two supporting specifics.',
    evidence: 'cite a source, measurement or user test — or say plainly that it is an untested assumption.',
  }[d];
}

export function reviewAnswerHeuristic(input: AnswerReviewInput): AnswerReview {
  const sponsorNames = input.sponsors.map((s) => s.name);
  const evaluation = evaluateAnswerHeuristic(input.idea, input.turn, input.answer, sponsorNames);
  let followUp: AnswerReview['followUp'] = null;
  if (input.followUpsRemaining > 0) {
    const lower = input.answer.toLowerCase();
    const hedge = HEDGES.find((h) => lower.includes(h));
    const noNumbers = !/\d/.test(input.answer);
    const noEvidence = !EVIDENCE.some((e) => lower.includes(e));
    if (hedge) followUp = { question: `You said “${hedge}”. Replace that with a specific: what exactly will happen, and how will you know?`, intent: 'Pushes past hedging.', dimension: input.turn.dimension, reason: `Answer contained hedging (“${hedge}”).` };
    else if (evaluation.overall < 6.5 && noNumbers) followUp = { question: 'Put a number on it: how many users, how much time, how much data, or what latency? If you do not know, say so and explain how you would find out.', intent: 'Demands quantification.', dimension: input.turn.dimension, reason: 'Answer contained no concrete numbers.' };
    else if ((input.persona === 'aggressive' || input.turn.dimension === 'evidence' || evaluation.overall < 6.5) && noEvidence) followUp = { question: 'What is your evidence for that — a source, a measurement, a user test? Or is it an assumption?', intent: 'Separates evidence from assumption.', dimension: 'evidence', reason: 'No evidence was cited.' };
  }
  return { evaluation, followUp };
}

export function writeReportHeuristic(input: ReportInput): ReportText {
  const weak = JUDGE_DIMENSIONS.filter((d) => {
    const x = input.byDimension[d];
    return x.avg !== null && x.avg < 6;
  });
  const strong = JUDGE_DIMENSIONS.filter((d) => (input.byDimension[d].avg ?? 0) >= 7.5);
  return {
    strengths: strong.length ? strong.map((d) => `${JUDGE_DIMENSION_LABELS[d]} (avg ${input.byDimension[d].avg!.toFixed(1)})`) : ['No dimension scored consistently high yet — keep practising.'],
    weakAreas: weak.map((d) => ({
      dimension: d,
      why: `Average ${input.byDimension[d].avg!.toFixed(1)}/10 across ${input.byDimension[d].samples} answer(s) (rule-based scoring).`,
      prep: [hintFor(d), `Rehearse a 30-second answer on ${JUDGE_DIMENSION_LABELS[d].toLowerCase()} using your own numbers.`],
    })),
    preparationPlan: [
      'Write a one-sentence answer to each question you struggled with, then add one number and one source.',
      'List your three least-supported claims (Evidence tab) and decide: verify, soften, or drop.',
      'Re-run the Judge Arena after revising; compare dimension averages.',
    ],
  };
}
