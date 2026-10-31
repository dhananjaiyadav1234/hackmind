import type { Claim, Idea, SponsorProfile } from '../../../shared/types';
import type { ClaimDraft, ClaimEvidenceSource, ClaimVerdict, ValidationResearchPlan } from '../engine';
import { containsQuote, keyTerms, overlap, truncate } from './text';

export function planResearchHeuristic(idea: Idea): ValidationResearchPlan {
  const core = keyTerms(`${idea.title} ${idea.pitch}`, 5).join(' ');
  return {
    competitorQueries: [`${core} existing tools alternatives`, `${idea.title.split(':')[0]} software open source`, `${core} app`],
    techQueries: idea.sponsorIntegration.slice(0, 2).map((i) => `${i.sponsor} ${i.technology} documentation`),
    paperQueries: [keyTerms(`${idea.problem}`, 4).join(' ')],
  };
}

export function extractClaimsHeuristic(idea: Idea, sponsors: SponsorProfile[]): ClaimDraft[] {
  const claims: ClaimDraft[] = [
    { text: `${idea.problem}`, kind: 'problem', importance: 'high' },
    { text: `${idea.differentiation}`, kind: 'differentiation', importance: 'high' },
    { text: `${idea.audience} would adopt a solution like “${idea.title}”.`, kind: 'problem', importance: 'medium' },
  ];
  for (const a of idea.alternatives.slice(0, 3)) claims.push({ text: `${a.name}: ${a.note}`, kind: 'competitor', importance: 'medium' });
  for (const i of idea.sponsorIntegration) {
    const known = sponsors.find((s) => s.name === i.sponsor);
    claims.push({ text: `${i.sponsor} provides ${i.technology}${known ? '' : ' (sponsor not profiled)'}.`, kind: 'sponsor', importance: i.depth === 'deep' ? 'high' : 'medium' });
  }
  const stack = idea.stack.find((s) => s.layer === 'Backend');
  if (stack) claims.push({ text: `${stack.choice} is sufficient to deliver the MVP within ${idea.complexity.estimatedHours} hours.`, kind: 'technical', importance: 'low' });
  return claims;
}

export function verifyClaimHeuristic(claim: ClaimDraft, idea: Idea, sources: ClaimEvidenceSource[]): ClaimVerdict {
  if (!sources.length) return { status: 'unverified', sourceIds: [], quotes: [], note: 'No sources were retrieved for this claim.', method: 'none' };

  if (claim.kind === 'sponsor') {
    const integ = idea.sponsorIntegration.find((i) => claim.text.includes(i.technology));
    if (integ) {
      for (const s of sources) {
        if (s.text.toLowerCase().includes(integ.technology.toLowerCase())) {
          const line = s.text.split('\n').find((l) => l.toLowerCase().includes(integ.technology.toLowerCase())) ?? '';
          return { status: 'verified', sourceIds: [s.sourceId], quotes: line && containsQuote(s.text, line) ? [truncate(line.trim(), 200)] : [], note: `${integ.technology} appears in the sponsor material (exact name match).`, method: 'keyword' };
        }
      }
    }
    return { status: 'unverified', sourceIds: [], quotes: [], note: 'The named sponsor technology was not found in retrieved sponsor material.', method: 'keyword' };
  }

  const terms = keyTerms(claim.text, 8);
  let best: { s: ClaimEvidenceSource; o: number } | null = null;
  for (const s of sources) {
    const o = overlap(terms, `${s.title} ${s.text}`);
    if (!best || o > best.o) best = { s, o };
  }
  if (!best) return { status: 'unverified', sourceIds: [], quotes: [], note: 'No usable sources.', method: 'none' };

  if (claim.kind === 'differentiation') {
    const ideaTerms = keyTerms(`${idea.title} ${idea.pitch}`, 8);
    for (const s of sources) {
      const o = overlap(ideaTerms, `${s.title} ${s.text}`);
      if (o >= 0.6) return { status: 'contradicted', sourceIds: [s.sourceId], quotes: [], note: `“${s.title}” covers ${(o * 100).toFixed(0)}% of this idea’s key terms — a close alternative that undercuts the differentiation claim (keyword heuristic; review manually).`, method: 'keyword' };
    }
    return { status: 'unverified', sourceIds: [], quotes: [], note: 'Absence claims (“nothing like this exists”) cannot be proven by keyword search. No close alternative was found among retrieved sources — review manually.', method: 'keyword' };
  }

  if (best.o >= 0.5) {
    return { status: 'partially_verified', sourceIds: [best.s.sourceId], quotes: [], note: `Keyword match ${(best.o * 100).toFixed(0)}% with “${best.s.title}”. Keyword overlap shows topical relevance, not that the claim is true.`, method: 'keyword' };
  }
  return { status: 'unverified', sourceIds: best.o >= 0.25 ? [best.s.sourceId] : [], quotes: [], note: `Weak support (best keyword match ${(best.o * 100).toFixed(0)}%).`, method: 'keyword' };
}

export function explainRecommendationHeuristic(top: { title: string; total: number; coverage: { verified: number; total: number }; weakest: string; strongest: string; contradicted: number; runnerUp?: { title: string; total: number } }): string {
  return [
    `“${top.title}” ranks first with a weighted score of ${top.total.toFixed(1)}/100${top.runnerUp ? ` (next: “${top.runnerUp.title}” at ${top.runnerUp.total.toFixed(1)})` : ''}.`,
    `Strongest criterion: ${top.strongest}; weakest: ${top.weakest}.`,
    `Evidence coverage: ${top.coverage.verified}/${top.coverage.total} important claims at least partially supported by retrieved sources${top.contradicted ? `; ${top.contradicted} claim(s) were contradicted and already capped in the score` : ''}.`,
    'Caveat: scores are AI-assisted estimates from rule-based heuristics, not predictions of the judges’ scores. Treat unverified claims as assumptions to test first.',
  ].join(' ');
}

export type { Claim };
