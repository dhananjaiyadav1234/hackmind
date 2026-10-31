import type { Criterion, Idea } from '../../../shared/types';
import { CRITERIA, CRITERION_LABELS } from '../../../shared/types';

export interface Driver {
  criterion: Criterion;
  label: string;
  /** Weighted points (score/10 × weight) difference winner − other. */
  delta: number;
  winnerScore: number;
  otherScore: number;
}

export interface WinnerSummary {
  winner: Idea;
  runnerUp: Idea;
  totalDelta: number;
  leads: Driver[];
  trails: Driver[];
}

export function weightedContribution(score: number, weight: number): number {
  return (score / 10) * weight;
}

/** Explain why the highest-scored idea leads the next best, by weighted criterion contribution. */
export function summariseWinner(ideas: Idea[]): WinnerSummary | null {
  const scored = ideas.filter((i) => i.scores).sort((a, b) => (b.scores!.total - a.scores!.total));
  if (scored.length < 2) return null;
  const [winner, runnerUp] = scored;
  const w = winner.scores!;
  const r = runnerUp.scores!;
  const drivers: Driver[] = CRITERIA.map((c) => ({
    criterion: c,
    label: CRITERION_LABELS[c],
    winnerScore: w.criteria[c].score,
    otherScore: r.criteria[c].score,
    delta: weightedContribution(w.criteria[c].score, w.weights[c]) - weightedContribution(r.criteria[c].score, r.weights[c]),
  }));
  return {
    winner,
    runnerUp,
    totalDelta: w.total - r.total,
    leads: drivers.filter((d) => d.delta > 0.05).sort((a, b) => b.delta - a.delta),
    trails: drivers.filter((d) => d.delta < -0.05).sort((a, b) => a.delta - b.delta),
  };
}

export function bestIndices(values: (number | null)[], higherIsBetter: boolean): Set<number> {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return new Set();
  const best = higherIsBetter ? Math.max(...nums) : Math.min(...nums);
  if (nums.every((v) => v === best)) return new Set();
  return new Set(values.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0));
}
