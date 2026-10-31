import { CRITERIA, JUDGE_DIMENSIONS } from '../../../shared/types';
import type { Engine, ScoreDraft } from '../engine';
import { extractIntelHeuristic, profileSponsorHeuristic } from './intel';
import { generateIdeasHeuristic, critiqueHeuristic, reviseHeuristic, scoreIdeasHeuristic } from './ideas';
import { explainRecommendationHeuristic, extractClaimsHeuristic, planResearchHeuristic, verifyClaimHeuristic } from './validate';
import { openingQuestionHeuristic, reviewAnswerHeuristic, writeReportHeuristic } from './judge';
import { writeBlueprintHeuristic } from './blueprint';
import { truncate } from './text';
import { CRITERION_LABELS } from '../../../shared/types';
import type { OpportunityDraft } from '../engine';

/** Deterministic, offline engine. Honest by construction: derives output from supplied text only. */
export class HeuristicEngine implements Engine {
  readonly kind = 'heuristic' as const;
  readonly label = 'Heuristic demo engine';

  async extractIntel(i: Parameters<Engine['extractIntel']>[0]) {
    return extractIntelHeuristic(i.pages, i.manualText, i.hintSponsors);
  }

  async profileSponsor(i: Parameters<Engine['profileSponsor']>[0]) {
    return profileSponsorHeuristic(i.sponsor, i.pages, i.workspace.intel.themes.value ?? [], i.workspace.intel.problemStatements.value ?? []);
  }

  async discoverOpportunities(i: Parameters<Engine['discoverOpportunities']>[0]): Promise<OpportunityDraft[]> {
    return i.research.map((r) => {
      const found = r.web.length + r.repos.length + r.papers.length;
      return {
        title: r.topic,
        problem: r.description,
        whyNow: 'Not assessed by the heuristic engine — enable the LLM engine for trend analysis.',
        audience: 'See problem statement.',
        existingSolutions: r.web.slice(0, 5).map((w) => ({ name: w.title, url: w.url, note: truncate(w.snippet || 'Found via search; relevance not analysed.', 200) })),
        openSource: r.repos.slice(0, 4).map((x) => ({ name: x.title, url: x.url, stars: x.stars, note: truncate(x.snippet, 160) })),
        papers: r.papers.slice(0, 3).map((p) => ({ title: p.title, url: p.url, authors: p.authors, year: p.year })),
        developments: [],
        gaps: [`Stated in the official problem statement: “${truncate(r.description, 220)}”`, 'Gap analysis against the listed solutions requires manual review or the LLM engine.'],
        technicalOpportunities: [],
        sourceIds: [...r.web, ...r.repos, ...r.papers].map((x) => x.sourceId),
        strength: found >= 6 ? 'high' : found >= 3 ? 'medium' : 'low',
        verification: found ? 'assumed' : 'unavailable',
      };
    });
  }

  async generateIdeas(i: Parameters<Engine['generateIdeas']>[0]) {
    return generateIdeasHeuristic(i);
  }

  async scoreIdeas(i: Parameters<Engine['scoreIdeas']>[0]): Promise<Record<string, ScoreDraft>> {
    return scoreIdeasHeuristic(i);
  }

  async critiqueIdea(i: Parameters<Engine['critiqueIdea']>[0]) {
    return critiqueHeuristic(i);
  }

  async reviseIdea(i: Parameters<Engine['reviseIdea']>[0]) {
    return reviseHeuristic(i);
  }

  async planValidationResearch(i: Parameters<Engine['planValidationResearch']>[0]) {
    return planResearchHeuristic(i.idea);
  }

  async extractClaims(i: Parameters<Engine['extractClaims']>[0]) {
    return extractClaimsHeuristic(i.idea, i.sponsors);
  }

  async verifyClaim(i: Parameters<Engine['verifyClaim']>[0]) {
    return verifyClaimHeuristic(i.claim, i.idea, i.sources);
  }

  async explainRecommendation(i: Parameters<Engine['explainRecommendation']>[0]) {
    const top = i.ranked[0];
    const sc = top.idea.scores;
    const sorted = sc ? [...CRITERIA].sort((a, b) => sc.criteria[b].score - sc.criteria[a].score) : [];
    return explainRecommendationHeuristic({
      title: top.idea.title,
      total: sc?.total ?? 0,
      coverage: top.coverage,
      strongest: sorted[0] ? CRITERION_LABELS[sorted[0]] : 'n/a',
      weakest: sorted.length ? CRITERION_LABELS[sorted[sorted.length - 1]] : 'n/a',
      contradicted: top.claims.filter((c) => c.status === 'contradicted').length,
      runnerUp: i.ranked[1] ? { title: i.ranked[1].idea.title, total: i.ranked[1].idea.scores?.total ?? 0 } : undefined,
    });
  }

  async openingQuestion(i: Parameters<Engine['openingQuestion']>[0]) {
    return openingQuestionHeuristic(i);
  }

  async reviewAnswer(i: Parameters<Engine['reviewAnswer']>[0]) {
    return reviewAnswerHeuristic(i);
  }

  async writeReport(i: Parameters<Engine['writeReport']>[0]) {
    void JUDGE_DIMENSIONS;
    return writeReportHeuristic(i);
  }

  async writeBlueprint(i: Parameters<Engine['writeBlueprint']>[0]) {
    return writeBlueprintHeuristic(i);
  }
}
