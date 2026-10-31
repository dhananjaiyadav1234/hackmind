import { describe, expect, it } from 'vitest';
import { CRITERIA, type Claim, type Criterion, type CriterionScore } from '../shared/types';
import { DEFAULT_WEIGHTS, applyEvidenceAdjustments, buildScoreCard, computeTotal, deriveWeights, evidenceCoverage, mapCriterion, timelinePhases } from '../shared/scoring';

const sc = (n: number): CriterionScore => ({ score: n, rationale: 'r', evidenceIds: [], confidence: 'medium' });
const all = (n: number) => Object.fromEntries(CRITERIA.map((c) => [c, sc(n)])) as Record<Criterion, CriterionScore>;
const claim = (over: Partial<Claim>): Claim => ({ id: 'c', workspaceId: 'w', ideaId: 'i', text: 'x', kind: 'problem', importance: 'high', status: 'unverified', sourceIds: [], supportingQuotes: [], note: '', method: 'keyword', checkedAt: '', ...over });

describe('deriveWeights', () => {
  it('falls back to defaults summing to 100', () => {
    const { weights, basis } = deriveWeights(null, false);
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(weights).toEqual(DEFAULT_WEIGHTS);
    expect(basis).toMatch(/default/i);
  });
  it('maps official criteria and sums to 100', () => {
    const { weights, basis } = deriveWeights([
      { name: 'Impact & Relevance', weight: 25 }, { name: 'Technical Execution', weight: 25 }, { name: 'Innovation', weight: 20 },
      { name: 'Use of Sponsor Technology', weight: 15 }, { name: 'Demo & Presentation', weight: 15 },
    ], true);
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    expect(weights.feasibility).toBeGreaterThan(20);
    expect(weights.innovation).toBeGreaterThan(weights.differentiation);
    expect(weights.sponsor).toBeGreaterThan(weights.differentiation);
    expect(basis).toMatch(/Official/);
  });
  it('distributes unknown weights', () => {
    const { weights } = deriveWeights([{ name: 'Innovation', weight: null }, { name: 'Demo', weight: null }], false);
    expect(Object.values(weights).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });
  it('maps names to criteria', () => {
    expect(mapCriterion('Creativity')).toBe('innovation');
    expect(mapCriterion('zzz')).toBeNull();
  });
});

describe('score card', () => {
  it('computes the weighted total', () => {
    expect(computeTotal(all(10), DEFAULT_WEIGHTS)).toBe(100);
    expect(computeTotal(all(5), DEFAULT_WEIGHTS)).toBe(50);
  });
  it('clamps out-of-range scores', () => {
    const card = buildScoreCard({ criteria: all(42), weights: DEFAULT_WEIGHTS, weightBasis: 'b', basis: 'initial', scoredBy: 't' });
    expect(card.total).toBe(100);
    expect(card.criteria.alignment.score).toBe(10);
  });
});

describe('applyEvidenceAdjustments', () => {
  const base = buildScoreCard({ criteria: all(8), weights: DEFAULT_WEIGHTS, weightBasis: 'b', basis: 'evolved', scoredBy: 't' });
  it('caps differentiation when a differentiation claim is contradicted, with an explanation', () => {
    const out = applyEvidenceAdjustments(base, [claim({ kind: 'differentiation', status: 'contradicted', text: 'nothing like this exists' })]);
    expect(out.criteria.differentiation.score).toBe(4);
    expect(out.total).toBeLessThan(base.total);
    expect(out.basis).toBe('validated');
    expect(out.adjustments[0].reason).toContain('[validation]');
  });
  it('lowers confidence (not score) for unverified high-importance claims', () => {
    const out = applyEvidenceAdjustments(base, [claim({ kind: 'problem', status: 'unverified' })]);
    expect(out.criteria.impact.confidence).toBe('low');
    expect(out.criteria.impact.score).toBe(8);
  });
  it('is idempotent across repeated validation', () => {
    const c = [claim({ kind: 'sponsor', status: 'contradicted' })];
    const once = applyEvidenceAdjustments(base, c);
    const twice = applyEvidenceAdjustments(once, c);
    expect(twice.total).toBe(once.total);
    expect(twice.adjustments.length).toBe(once.adjustments.length);
  });
  it('reports evidence coverage', () => {
    const cov = evidenceCoverage([claim({ status: 'verified' }), claim({ status: 'unverified' }), claim({ importance: 'low', status: 'verified' })]);
    expect(cov).toMatchObject({ verified: 1, total: 2, ratio: 0.5 });
  });
});

describe('timelinePhases', () => {
  it.each([12, 24, 36, 48, 72])('covers %ih contiguously', (h) => {
    const p = timelinePhases(h);
    expect(p[0].startHour).toBe(0);
    expect(p[p.length - 1].endHour).toBe(h);
    for (let i = 1; i < p.length; i++) expect(p[i].startHour).toBe(p[i - 1].endHour);
  });
});
