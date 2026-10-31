import { CRITERIA, type Critique, type Criterion, type CriterionScore, type Idea, type IdeaSponsorIntegration, type Opportunity, type SponsorProfile, type Workspace } from '../../../shared/types';
import type { CritiqueInput, GenerateIdeasInput, IdeaDraft, ReviseInput, ReviseResult, ScoreDraft, ScoreIdeasInput } from '../engine';
import { CAPABILITY_LABEL, sponsorTech, type Capability, type SponsorTech } from './capabilities';
import { PATTERNS, fill, type Pattern, type Topic } from './patterns';
import { keyTerms, overlap, truncate } from './text';

// ── Topics ──

const AUDIENCES = /\b(older and isolated residents|residents|volunteers|small businesses|students|patients|farmers|developers|teams|citizens|customers|teachers|drivers|clinicians|nurses|families|travellers|researchers|coordinators|first responders|users)\b/i;

export function topicsFor(ws: Workspace): Topic[] {
  const intel = ws.intel;
  const problems = intel.problemStatements.value ?? [];
  const themes = intel.themes.value ?? [];
  const mk = (title: string, description: string): Topic => {
    const aud = description.match(AUDIENCES)?.[1];
    const short = title.replace(/[:.]+$/, '').toLowerCase();
    return {
      title,
      short,
      audience: aud ? aud.toLowerCase() : `people affected by ${short}`,
      gist: description.split(/(?<=[.!?])\s+/)[0] ?? description,
      audienceSpecific: !!aud,
    };
  };
  if (problems.length) return problems.map((p) => mk(p.title, p.description));
  if (themes.length) return themes.map((t) => mk(t, `Challenge area: ${t}.`));
  return [mk(ws.name, ws.manualText ?? ws.name)];
}

function matchOpportunity(topic: Topic, opps: Opportunity[]): Opportunity | undefined {
  const terms = keyTerms(`${topic.title} ${topic.gist}`, 8);
  let best: { o: Opportunity; s: number } | undefined;
  for (const o of opps) {
    const s = overlap(terms, `${o.title} ${o.problem}`);
    if (!best || s > best.s) best = { o, s };
  }
  return best && best.s >= 0.25 ? best.o : undefined;
}

// ── Sponsor integration ──

function buildIntegrations(p: Pattern, topic: Topic, techs: SponsorTech[]): IdeaSponsorIntegration[] {
  const out: IdeaSponsorIntegration[] = [];
  const usedSponsorTech = new Set<string>();
  p.needs.forEach((cap, idx) => {
    const choice = techs.find((t) => t.capability === cap && !usedSponsorTech.has(`${t.sponsor}:${t.name}`));
    if (!choice) return;
    usedSponsorTech.add(`${choice.sponsor}:${choice.name}`);
    const role = p.roles[cap] ?? `provide ${CAPABILITY_LABEL[cap]}`;
    out.push({
      sponsor: choice.sponsor,
      technology: choice.name,
      how: `Use ${choice.name} to ${role}.`,
      justification:
        idx === 0
          ? `${CAPABILITY_LABEL[cap]} is the core technical need of this solution for “${topic.title}”; without ${choice.name} (${choice.description}) the product would not work as described.`
          : `Supports the ${CAPABILITY_LABEL[cap]} responsibility of the architecture; replacing it would be possible but costly, so the integration is real but not the centrepiece.`,
      depth: idx === 0 ? 'deep' : 'moderate',
    });
  });
  if (!out.length && techs.length) {
    const t = techs[0];
    out.push({
      sponsor: t.sponsor,
      technology: t.name,
      how: `Optionally use ${t.name} for ${CAPABILITY_LABEL[t.capability]} features.`,
      justification: `${t.name} is not essential to this concept; the integration would mostly satisfy the sponsor requirement rather than the product’s needs.`,
      depth: 'superficial',
    });
  }
  return out;
}

// ── Generation ──

export function generateIdeasHeuristic(input: GenerateIdeasInput): IdeaDraft[] {
  const { workspace, sponsors, opportunities, tier, count, existingTitles, batchIndex } = input;
  const topics = topicsFor(workspace);
  const techs = sponsorTech(sponsors);
  const patterns = PATTERNS.filter((p) => p.tier === tier);
  const taken = new Set(existingTitles.map((t) => t.toLowerCase()));
  const out: IdeaDraft[] = [];

  // Enumerate pattern×topic combos, rotated so successive batches differ.
  const combos: { p: Pattern; t: Topic }[] = [];
  for (let round = 0; round < topics.length; round++) {
    patterns.forEach((p, pi) => combos.push({ p, t: topics[(pi + round + batchIndex) % topics.length] }));
  }

  for (const { p, t } of combos) {
    if (out.length >= count) break;
    const title = fill(p.title, t);
    if (taken.has(title.toLowerCase())) continue;
    taken.add(title.toLowerCase());
    const opp = matchOpportunity(t, opportunities);
    const alternatives = (opp?.existingSolutions ?? []).slice(0, 4).map((s) => ({
      name: s.name, url: s.url, note: s.note, sourceIds: opp?.sourceIds.slice(0, 2) ?? [],
    }));
    const integrations = buildIntegrations(p, t, techs);
    const hoursScale = 1 + ((title.length % 5) - 2) * 0.04; // small deterministic variation
    out.push({
      tier,
      title,
      pitch: fill(p.pitch, t),
      problem: `${t.gist} (hackathon problem statement: “${t.title}”).`,
      audience: t.audience.charAt(0).toUpperCase() + t.audience.slice(1),
      solution: fill(p.solution, t),
      differentiation: `Different from existing tools because ${fill(p.edge, t)}.`,
      alternatives,
      sponsorIntegration: integrations,
      architecture: {
        summary: `${p.components.map((c) => c.name).join(' → ')}. ${integrations.map((i) => `${i.technology} handles ${CAPABILITY_LABEL[(p.needs.find((n) => techs.find((x) => x.capability === n && x.name === i.technology)) ?? p.needs[0]) as Capability]}`).join('; ')}.`.replace(/\s\.$/, '.'),
        components: p.components.map((c) => ({ ...c })),
      },
      stack: [
        { layer: 'Frontend', choice: 'React + TypeScript + Vite', reason: 'Fast iteration and a polished demo UI' },
        { layer: 'Backend', choice: 'Node.js + TypeScript API', reason: 'One language across the stack; quick to build' },
        { layer: 'Data', choice: 'SQLite (dev) / Postgres (deploy)', reason: 'Zero-setup locally, production-grade later' },
        ...integrations.map((i) => ({ layer: `Sponsor: ${i.sponsor}`, choice: i.technology, reason: i.how })),
      ],
      mvpFeatures: p.mvp.map((m) => fill(m, t)),
      stretchGoals: p.stretch.map((s) => fill(s, t)),
      feasibility: {
        level: p.complexity === 'high' ? 'medium' : 'high',
        assessment: `Estimated ${Math.round(p.hours * hoursScale)} build-hours across a team; ${p.complexity} complexity. The MVP list is deliberately a vertical slice.`,
      },
      risks: p.risks.map((r) => ({ ...r })),
      complexity: {
        level: p.complexity,
        estimatedHours: Math.round(p.hours * hoursScale),
        rationale: `${p.mvp.length} MVP features, ${p.components.length} components, ${integrations.length} sponsor integration(s).`,
      },
      judgingAppeal: p.appeal,
      supportingResearch: opp ? [{ note: `Related opportunity: ${opp.title}`, sourceIds: opp.sourceIds.slice(0, 3) }] : [],
    });
  }
  return out;
}

// ── Scoring ──

const clamp = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, Math.round(n * 10) / 10));

export function scoreIdeaHeuristic(idea: Idea, ws: Workspace, sponsors: SponsorProfile[], opps: Opportunity[], topics: Topic[]): ScoreDraft {
  const intel = ws.intel;
  const duration = intel.durationHours.value ?? 36;
  const durationKnown = intel.durationHours.value !== null;
  const sponsorsKnown = (intel.sponsors.value ?? []).length > 0 || sponsors.length > 0;
  const mandatory = (intel.mandatoryTech.value ?? []).length > 0;
  const ideaText = `${idea.title} ${idea.problem} ${idea.solution} ${idea.pitch}`;

  // alignment
  let bestTopic = topics[0];
  let bestOverlap = 0;
  for (const t of topics) {
    const o = overlap(keyTerms(`${t.title} ${t.gist}`, 10), ideaText);
    if (o > bestOverlap) { bestOverlap = o; bestTopic = t; }
  }
  const alignment: CriterionScore = {
    score: clamp(Math.min(9, 4 + 3.5 * bestOverlap + (bestTopic?.audienceSpecific ? 0.8 : 0.2) + ((intel.themes.value ?? []).some((t) => overlap(keyTerms(t, 4), ideaText) >= 0.5) ? 0.7 : 0))),
    rationale: bestTopic ? `Closest official problem statement: “${bestTopic.title}” (key-term overlap ${(bestOverlap * 100).toFixed(0)}%).` : 'No problem statements available to compare against.',
    evidenceIds: [],
    confidence: (intel.problemStatements.status === 'verified' ? 'medium' : 'low'),
  };

  // innovation
  const base = { safe: 4.5, innovative: 6.8, moonshot: 8.2 }[idea.tier];
  const saturation = Math.min(2, Math.max(0, idea.alternatives.length - 2) * 0.6);
  const innovation: CriterionScore = {
    score: clamp(base - saturation),
    rationale: `${idea.tier} tier baseline ${base}${saturation ? `, −${saturation.toFixed(1)} because ${idea.alternatives.length} existing alternatives were found in this space` : ''}. Heuristic: novelty is estimated from tier and crowdedness, not judged semantically.`,
    evidenceIds: idea.alternatives.flatMap((a) => a.sourceIds).slice(0, 4),
    confidence: 'low',
  };

  // sponsor
  const depthPts = { deep: 3.2, moderate: 1.4, superficial: 0.6 } as const;
  const depthSum = idea.sponsorIntegration.reduce((s, i) => s + depthPts[i.depth], 0);
  const distinctSponsors = new Set(idea.sponsorIntegration.map((i) => i.sponsor)).size;
  let sponsorScore: number;
  let sponsorWhy: string;
  if (!sponsorsKnown) {
    sponsorScore = 5; sponsorWhy = 'No sponsors were identified for this hackathon, so sponsor integration is scored neutrally.';
  } else if (!idea.sponsorIntegration.length) {
    sponsorScore = mandatory ? 1.5 : 2.5; sponsorWhy = `No sponsor technology is integrated${mandatory ? ' even though the rules require sponsor/mandatory tech' : ''}.`;
  } else {
    sponsorScore = Math.min(9, 2 + depthSum + (distinctSponsors > 1 ? 0.3 : 0) - Math.max(0, idea.sponsorIntegration.length - 2) * 0.6);
    sponsorWhy = idea.sponsorIntegration.map((i) => `${i.sponsor} ${i.technology}: ${i.depth}`).join('; ') + '.';
  }
  const sponsor: CriterionScore = { score: clamp(sponsorScore), rationale: sponsorWhy, evidenceIds: sponsors.flatMap((s) => s.sourceIds).slice(0, 3), confidence: sponsors.length ? 'medium' : 'low' };

  // feasibility
  const capacity = duration * Math.max(1, ws.config.teamSize) * 0.55;
  const ratio = idea.complexity.estimatedHours / capacity;
  const feas = ratio <= 0.5 ? 9 : ratio <= 0.7 ? 8 : ratio <= 0.9 ? 7 : ratio <= 1.1 ? 5.5 : ratio <= 1.4 ? 4 : 2.5;
  const feasibility: CriterionScore = {
    score: clamp(feas - (idea.complexity.level === 'high' ? 0.5 : 0)),
    rationale: `Estimated ${idea.complexity.estimatedHours}h of work vs ≈${Math.round(capacity)}h of effective team capacity (${duration}h${durationKnown ? '' : ' — assumed, duration unknown'} × ${ws.config.teamSize} people × 0.55 focus factor); ratio ${ratio.toFixed(2)}${idea.complexity.level === 'high' ? ', −0.5 for high complexity' : ''}.`,
    evidenceIds: [],
    confidence: durationKnown ? 'medium' : 'low',
  };

  // impact
  const opp = opps.find((o) => overlap(keyTerms(`${o.title} ${o.problem}`, 8), ideaText) >= 0.3);
  const impactScore = 5 + (bestTopic?.audienceSpecific ? 1.2 : 0) + (bestOverlap >= 0.5 ? 1 : 0) + (opp?.strength === 'high' ? 0.8 : opp?.strength === 'medium' ? 0.4 : 0) + Math.min(1, (opp?.sourceIds.length ?? 0) * 0.25);
  const impact: CriterionScore = {
    score: clamp(Math.min(8.5, impactScore)),
    rationale: `Targets “${idea.audience}” on an official problem statement${opp ? `; matched researched opportunity “${opp.title}” (${opp.strength} strength)` : '; no researched opportunity matched, so impact evidence is thin'}. Real-world impact is not measured here.`,
    evidenceIds: opp?.sourceIds.slice(0, 3) ?? [],
    confidence: opp ? 'medium' : 'low',
  };

  // differentiation
  const altCount = idea.alternatives.length;
  const diffScore = 7.2 - 0.9 * Math.min(altCount, 4) + (idea.tier === 'innovative' ? 0.5 : idea.tier === 'moonshot' ? 1 : 0);
  const differentiation: CriterionScore = {
    score: clamp(diffScore, 2, 9),
    rationale: altCount ? `${altCount} existing alternative(s) found (${idea.alternatives.slice(0, 3).map((a) => a.name).join(', ')}); differentiation rests on: ${truncate(idea.differentiation, 160)}` : 'No alternatives were found by research — this could be white space or a research gap; verify manually.',
    evidenceIds: idea.alternatives.flatMap((a) => a.sourceIds).slice(0, 4),
    confidence: altCount ? 'medium' : 'low',
  };

  // demo
  const hasVisual = idea.architecture.components.some((c) => /map|ui|dashboard|visual/i.test(`${c.name} ${c.tech}`));
  const demoBase = idea.judgingAppeal.length ? 6.5 : 5;
  const demo: CriterionScore = {
    score: clamp(demoBase + (hasVisual ? 1.2 : 0) + (idea.tier === 'moonshot' ? 0.6 : 0) - (ratio > 0.9 ? 1 : 0)),
    rationale: `${hasVisual ? 'Has a visual/interactive component. ' : ''}${ratio > 0.9 ? 'Tight schedule risks a rough demo. ' : ''}Demo appeal: ${truncate(idea.judgingAppeal, 140)}`,
    evidenceIds: [],
    confidence: 'low',
  };

  const result = { alignment, innovation, sponsor, feasibility, impact, differentiation, demo } satisfies Record<Criterion, CriterionScore>;
  return result;
}

export function scoreIdeasHeuristic(input: ScoreIdeasInput): Record<string, ScoreDraft> {
  const topics = topicsFor(input.workspace);
  const out: Record<string, ScoreDraft> = {};
  for (const idea of input.ideas) out[idea.id] = scoreIdeaHeuristic(idea, input.workspace, input.sponsors, input.opportunities, topics);
  for (const id of Object.keys(out)) for (const c of CRITERIA) out[id][c].score = clamp(out[id][c].score);
  return out;
}

// ── Critique ──

export function critiqueHeuristic(input: CritiqueInput): Critique[] {
  const { idea, critic, workspace, sponsors } = input;
  const agent = critic.name;
  const out: Critique[] = [];
  const duration = workspace.intel.durationHours.value ?? 36;
  const capacity = duration * Math.max(1, workspace.config.teamSize) * 0.55;
  const ratio = idea.complexity.estimatedHours / capacity;

  switch (critic.id) {
    case 'competitive': {
      if (idea.alternatives.length) {
        const a = idea.alternatives[0];
        out.push({ agent, kind: 'competitor', severity: idea.alternatives.length >= 3 ? 'high' : 'medium',
          text: `${a.name} already addresses part of this space (${truncate(a.note, 120)}). The pitch must state a concrete advantage over it, not just a different UI.` });
      } else {
        out.push({ agent, kind: 'competitor', severity: 'medium', text: 'No competing tools were found by research. Either this is white space or the search missed them — verify before claiming novelty.' });
      }
      break;
    }
    case 'feasibility': {
      if (ratio > 1.1) out.push({ agent, kind: 'feasibility', severity: 'high', text: `Estimated ${idea.complexity.estimatedHours}h exceeds effective capacity (≈${Math.round(capacity)}h). Scope must be cut to a thinner vertical slice.` });
      else if (ratio > 0.8) out.push({ agent, kind: 'feasibility', severity: 'medium', text: `Estimated ${idea.complexity.estimatedHours}h uses ${(ratio * 100).toFixed(0)}% of capacity — little slack for integration bugs and demo polish.` });
      else out.push({ agent, kind: 'feasibility', severity: 'low', text: `Scope fits comfortably (${(ratio * 100).toFixed(0)}% of capacity).` });
      break;
    }
    case 'sponsor': {
      const weak = idea.sponsorIntegration.length === 0 || idea.sponsorIntegration.every((i) => i.depth === 'superficial');
      const noDeep = !idea.sponsorIntegration.some((i) => i.depth === 'deep');
      if (weak && sponsors.length) out.push({ agent, kind: 'sponsor', severity: 'high', text: 'Sponsor integration is absent or superficial; judges will see it as logo-placement. Make a sponsor capability essential to the core flow.' });
      else if (noDeep && sponsors.length) out.push({ agent, kind: 'sponsor', severity: 'medium', text: 'Only supporting sponsor integrations; consider moving a core capability onto a sponsor API.' });
      else out.push({ agent, kind: 'sponsor', severity: 'low', text: 'Sponsor integration carries real functionality.' });
      break;
    }
    case 'skeptic': {
      out.push({ agent, kind: 'assumption', severity: 'medium', text: `Assumes ${idea.audience.toLowerCase()} will adopt this and that the required data/APIs are accessible within the event window. Neither has been verified.` });
      break;
    }
    case 'product': {
      out.push({ agent, kind: 'weakness', severity: 'low', text: 'Unclear what happens after the hackathon (maintenance, funding, adoption path). Judges often ask who uses this on day 2.' });
      break;
    }
  }
  return out;
}

// ── Revision ──

const MARK_CUT = 'Scope cut (evolution)';
const MARK_ALT = 'Closest alternative';
const MARK_ASSUME = 'Assumption to validate';

export function reviseHeuristic(input: ReviseInput): ReviseResult {
  const { idea, critiques, sponsors, workspace } = input;
  const patch: ReviseResult['patch'] = {};
  const reasons: Record<string, string> = {};
  const summaryParts: string[] = [];
  const high = (kind: Critique['kind']) => critiques.find((c) => c.kind === kind && c.severity !== 'low');

  // competitor → sharpen differentiation
  const comp = high('competitor');
  if (comp && idea.alternatives.length && !idea.differentiation.includes(MARK_ALT)) {
    const a = idea.alternatives[0];
    patch.differentiation = `${idea.differentiation} ${MARK_ALT}: ${a.name}. We differ by focusing on the specific user workflow above rather than the general capability ${a.name} offers.`;
    reasons.differentiation = comp.text;
    summaryParts.push('named the closest alternative in the differentiation');
  }

  // feasibility → cut scope
  const feas = high('feasibility');
  if (feas && !idea.mvpFeatures.some((f) => f.startsWith(MARK_CUT))) {
    const keep = Math.max(3, Math.ceil(idea.mvpFeatures.length * 0.6));
    const moved = idea.mvpFeatures.slice(keep);
    patch.mvpFeatures = [...idea.mvpFeatures.slice(0, keep)];
    patch.stretchGoals = [...moved, ...idea.stretchGoals];
    patch.complexity = {
      ...idea.complexity,
      estimatedHours: Math.round(idea.complexity.estimatedHours * 0.75),
      rationale: `${MARK_CUT}: moved ${moved.length} feature(s) to stretch goals. ${idea.complexity.rationale}`,
    };
    patch.feasibility = { level: 'medium', assessment: `${idea.feasibility.assessment} After scope cut: ≈${patch.complexity.estimatedHours}h.` };
    reasons.mvpFeatures = feas.text;
    reasons.complexity = 'Re-estimated after removing features from the MVP.';
    summaryParts.push(`cut ${moved.length} feature(s) from the MVP`);
  }

  // sponsor → deepen integration
  const sp = high('sponsor');
  if (sp) {
    const techs = sponsorTech(sponsors);
    const used = new Set(idea.sponsorIntegration.map((i) => i.technology));
    const core = techs.find((t) => ['ai', 'geo', 'realtime'].includes(t.capability) && !used.has(t.name));
    if (core) {
      const comp0 = idea.architecture.components[0];
      const next: IdeaSponsorIntegration[] = [
        ...idea.sponsorIntegration.filter((i) => i.depth !== 'superficial'),
        {
          sponsor: core.sponsor, technology: core.name,
          how: `Use ${core.name} for the ${CAPABILITY_LABEL[core.capability]} responsibilities of “${comp0?.name ?? 'the core service'}”.`,
          justification: `Moved from optional to core after sponsor-alignment critique: ${CAPABILITY_LABEL[core.capability]} is needed by the main flow and ${core.name} (${core.description}) provides it directly.`,
          depth: 'moderate',
        },
      ];
      patch.sponsorIntegration = next;
      reasons.sponsorIntegration = sp.text;
      summaryParts.push(`reworked sponsor integration to use ${core.name}`);
    }
  }

  // skeptic → record assumption as risk
  const sk = high('assumption');
  if (sk && !idea.risks.some((r) => r.risk.startsWith(MARK_ASSUME))) {
    patch.risks = [
      ...idea.risks,
      { risk: `${MARK_ASSUME}: data access and user adoption`, severity: 'medium', mitigation: 'Validate the data source in the first 2 hours; run a 5-minute guerrilla test with 2–3 target users before building UI polish.' },
    ];
    reasons.risks = sk.text;
    summaryParts.push('recorded unverified assumptions as an explicit risk');
  }

  // product → post-event path
  const pr = critiques.find((c) => c.kind === 'weakness');
  if (pr && !idea.stretchGoals.some((g) => g.startsWith('Post-event path'))) {
    patch.stretchGoals = [...(patch.stretchGoals ?? idea.stretchGoals), 'Post-event path: pilot with one real organisation and define the maintenance owner'];
    patch.judgingAppeal = `${idea.judgingAppeal} Includes a concrete post-event adoption path.`;
    reasons.stretchGoals = pr.text;
    summaryParts.push('added a post-event adoption path');
  }

  void workspace;
  return {
    patch,
    reasons,
    summary: summaryParts.length ? `Heuristic evolver: ${summaryParts.join('; ')}.` : 'Heuristic evolver: no actionable critique this round; idea unchanged.',
  };
}
