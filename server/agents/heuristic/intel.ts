import type { JudgingCriterion, ProblemStatement, SponsorRef } from '../../../shared/types';
import type { IntelDraft, PageText, SponsorDraft } from '../engine';
import { detectCapabilities, CAPABILITY_LABEL } from './capabilities';
import { sectionItems, sectionText, splitSections, stripBullet, truncate, uniq, type Section } from './text';

const emptyDraft = (): IntelDraft => ({
  name: null, objectives: [], themes: [], problemStatements: [], judgingCriteria: [], submissionRequirements: [],
  restrictions: [], mandatoryTech: [], prizes: [], startDate: null, endDate: null, durationHours: null, organizers: [],
  sponsors: [], quotes: {},
});

function parseCriteria(items: string[]): JudgingCriterion[] {
  return items
    .map((item) => {
      const weight = item.match(/(\d{1,3})\s*%/);
      const nameMatch = item.match(/^(.*?)(?:\s*\(\s*\d{1,3}\s*%\s*\))?\s*(?::|—|–|-\s)\s*(.*)$/);
      let name = (nameMatch?.[1] ?? item).replace(/\(\s*\d{1,3}\s*%\s*\)/, '').replace(/\d{1,3}\s*%/, '').trim();
      name = name.replace(/[:\-–—\s]+$/, '');
      const description = nameMatch?.[2]?.trim() || undefined;
      return { name: name || truncate(item, 40), weight: weight ? Number(weight[1]) : null, description };
    })
    .filter((c) => c.name.length > 1);
}

function parseProblems(items: string[]): ProblemStatement[] {
  return items.map((item) => {
    const m = item.match(/^([^:.]{3,80}):\s+(.+)$/);
    if (m) return { title: m[1].trim(), description: m[2].trim() };
    const words = item.split(/\s+/);
    return { title: words.slice(0, 7).join(' '), description: item };
  });
}

function parseSponsorList(text: string): SponsorRef[] {
  return text
    .split(/[,;\n]| and /)
    .map((s) => stripBullet(s).replace(/\(.*?\)/g, '').trim())
    .filter((s) => s.length > 1 && s.length < 60)
    .map((name) => ({ name }));
}

function hoursBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = Date.parse(a.replace(/\s+UTC$/i, 'Z').replace(' ', 'T'));
  const db = Date.parse(b.replace(/\s+UTC$/i, 'Z').replace(' ', 'T'));
  if (Number.isNaN(da) || Number.isNaN(db) || db <= da) return null;
  return Math.round(((db - da) / 3_600_000) * 10) / 10;
}

function extractFromText(text: string, d: IntelDraft): void {
  const sections = splitSections(text);
  const q = (field: keyof IntelDraft['quotes'], ...lines: string[]) => {
    d.quotes[field] = uniq([...(d.quotes[field] ?? []), ...lines.filter((l) => l.length >= 6)]);
  };

  // name: first meaningful line
  if (!d.name) {
    const first = text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('[') && l.length < 100);
    if (first) {
      d.name = first;
      q('name', first);
    }
  }

  const objectives = [...sectionItems(sections, 'objectives')];
  if (objectives.length) {
    d.objectives.push(...objectives);
    q('objectives', ...objectives);
  } else {
    const about = sectionText(sections, 'about').split(/(?<=[.!?])\s+/)[0];
    if (about) {
      d.objectives.push(about);
      q('objectives', about);
    }
  }

  const themes = sectionItems(sections, 'themes');
  d.themes.push(...themes);
  q('themes', ...themes);

  const problems = sectionItems(sections, 'problems');
  d.problemStatements.push(...parseProblems(problems));
  q('problemStatements', ...problems);

  const criteria = sectionItems(sections, 'judging');
  d.judgingCriteria.push(...parseCriteria(criteria));
  q('judgingCriteria', ...criteria);

  const sub = sectionItems(sections, 'submission');
  d.submissionRequirements.push(...sub);
  q('submissionRequirements', ...sub);

  const rules = sectionItems(sections, 'rules');
  d.restrictions.push(...rules);
  q('restrictions', ...rules);

  const mandatory = sectionItems(sections, 'mandatory');
  d.mandatoryTech.push(...mandatory);
  q('mandatoryTech', ...mandatory);
  // "Projects must use at least one sponsor technology" is a rule worth surfacing as mandatory tech
  for (const r of rules) if (/\bmust (use|include|integrate)\b/i.test(r) && !d.mandatoryTech.includes(r)) {
    d.mandatoryTech.push(r);
    q('mandatoryTech', r);
  }

  const prizes = sectionItems(sections, 'prizes');
  d.prizes.push(...prizes);
  q('prizes', ...prizes);

  // schedule (can be inline anywhere)
  const sched = [sectionText(sections, 'schedule'), text].join('\n');
  const start = sched.match(/^\s*(?:start(?:s)?|begins?)\s*[:-]\s*(.+)$/im)?.[0];
  const end = sched.match(/^\s*(?:end(?:s)?|ends? at|deadline|submission deadline)\s*[:-]\s*(.+)$/im)?.[0];
  if (start && !d.startDate) {
    d.startDate = start.replace(/^\s*[A-Za-z ]+[:-]\s*/, '').trim();
    q('startDate', start.trim());
  }
  if (end && !d.endDate) {
    d.endDate = end.replace(/^\s*[A-Za-z ]+[:-]\s*/, '').trim();
    q('endDate', end.trim());
  }
  const dur = text.match(/(?:duration\s*[:-]\s*)?(\d{1,3})\s*[- ]?\s*hours?\b/i);
  if (d.durationHours === null) {
    if (dur) {
      d.durationHours = Number(dur[1]);
      q('durationHours', dur[0].trim());
    } else {
      const computed = hoursBetween(d.startDate, d.endDate);
      if (computed) d.durationHours = computed;
    }
  }

  const org = text.match(/^\s*organi[sz]ers?\s*[:-]\s*(.+)$/im);
  if (org) {
    d.organizers.push(...org[1].split(/[,;]| and /).map((s) => s.trim()).filter(Boolean));
    q('organizers', org[0].trim());
  }

  const sponsorLine = text.match(/^\s*sponsors?\s*[:-]\s*(.+)$/im);
  const sponsorItems = sectionItems(sections, 'sponsors');
  const sponsorText = sponsorLine ? sponsorLine[1] : sponsorItems.join('\n');
  if (sponsorText) {
    d.sponsors.push(...parseSponsorList(sponsorText));
    q('sponsors', sponsorLine ? sponsorLine[0].trim() : sponsorItems[0] ?? '');
  }
}

/** Deterministic extraction from page/manual text. Everything returned is copied from the text, so quotes verify. */
export function extractIntelHeuristic(pages: PageText[], manualText: string | null, hintSponsors: string[]): IntelDraft {
  const d = emptyDraft();
  const texts = [...(manualText ? [manualText] : []), ...pages.map((p) => p.text)];
  for (const t of texts) extractFromText(t, d);

  d.objectives = uniq(d.objectives);
  d.themes = uniq(d.themes);
  d.restrictions = uniq(d.restrictions);
  d.mandatoryTech = uniq(d.mandatoryTech);
  d.organizers = uniq(d.organizers);
  const merged = new Map<string, SponsorRef>();
  for (const s of [...d.sponsors, ...hintSponsors.map((name) => ({ name }))]) merged.set(s.name.toLowerCase(), merged.get(s.name.toLowerCase()) ?? s);
  d.sponsors = [...merged.values()];
  return d;
}

// ── Sponsor profile ──

const URL_RE = /((?:https?|demo):\/\/[^\s)]+)/i;

function splitDoc(item: string): { title: string; url: string } | null {
  const m = item.match(URL_RE);
  if (!m) return null;
  const title = item.replace(m[1], '').replace(/[:–\s-]+$/, '').trim() || m[1];
  return { title, url: m[1] };
}

export function profileSponsorHeuristic(_sponsor: SponsorRef, pages: PageText[], themes: string[], problems: ProblemStatement[]): SponsorDraft {
  const draft: SponsorDraft = {
    summary: '', products: [], techEcosystem: [], devTools: [], apis: [], docs: [], latest: [], previousHackathons: [], opportunities: [], gaps: [],
  };
  let sections: Section[] = [];
  for (const p of pages) {
    const s = splitSections(p.text);
    sections = sections.concat(s);
    if (!draft.summary) {
      const para = p.text.split('\n').map((l) => l.trim()).find((l) => l.length > 50 && !/^\[/.test(l) && !/^[-*•]/.test(l));
      if (para) draft.summary = truncate(para, 320);
    }
    // docs links from the URL itself
    if (/\/docs?\b|developer|\bapi\b/i.test(p.url) && !/^demo:/.test(p.url)) draft.docs.push({ title: p.title || p.url, url: p.url });
  }
  draft.products = sectionItems(sections, 'products');
  draft.devTools = sectionItems(sections, 'devtools');
  draft.apis = sectionItems(sections, 'apis');
  for (const item of sectionItems(sections, 'docs')) {
    const d = splitDoc(item);
    if (d) draft.docs.push(d);
  }
  for (const item of sectionItems(sections, 'latest')) draft.latest.push({ title: truncate(item, 90), summary: item });
  for (const item of sectionItems(sections, 'previous')) draft.previousHackathons.push({ note: item });
  draft.techEcosystem = uniq([...draft.products, ...draft.devTools].flatMap((i) => detectCapabilities(i)).map((c) => CAPABILITY_LABEL[c]));
  draft.docs = [...new Map(draft.docs.map((d) => [d.url, d])).values()];

  if (!pages.length) draft.gaps.push('No pages could be retrieved for this sponsor — nothing below is sourced.');
  if (pages.length && !draft.products.length) draft.gaps.push('Product list could not be extracted automatically (page not in a recognised format). Review the sources or enable the LLM engine.');
  if (!draft.docs.length) draft.gaps.push('No documentation page was located.');
  if (!draft.apis.length && !draft.devTools.length) draft.gaps.push('No API/SDK details were extracted.');
  if (!draft.latest.length) draft.gaps.push('No recent announcements were found.');
  if (!draft.previousHackathons.length) draft.gaps.push('No previous hackathon involvement was found.');

  // Integration opportunities: each capability found maps to the most relevant problem statement.
  const target = (cap: string) => {
    const hay = problems.map((p) => `${p.title} ${p.description}`);
    const kw: Record<string, RegExp> = {
      ai: /advis|guid|explain|assist|understand|triage|personal|summar|match|recommend/i,
      geo: /street|route|neighbo|local|area|map|location|region|flood|map/i,
      realtime: /real-?time|alert|coordinat|near-real|live|notify|update|dispatch/i,
    };
    const idx = hay.findIndex((h) => kw[cap]?.test(h));
    return problems[idx >= 0 ? idx : 0];
  };
  const combined = [...draft.products, ...draft.apis, ...draft.devTools];
  const seen = new Set<string>();
  for (const item of combined) {
    for (const cap of detectCapabilities(item)) {
      if (seen.has(cap)) continue;
      seen.add(cap);
      const [name, ...rest] = item.split(/:\s+/);
      const prod = rest.length ? name.trim() : item.trim();
      const tgt = target(cap);
      const goal = tgt ? `“${tgt.title}”` : (themes[0] ? `the “${themes[0]}” theme` : 'the hackathon problem');
      const core = cap === 'ai' || cap === 'geo' || cap === 'realtime';
      draft.opportunities.push({
        title: `${prod} as the ${CAPABILITY_LABEL[cap]} layer`,
        integration: `Use ${prod} (${rest.join(': ') || item}) as the ${CAPABILITY_LABEL[cap]} component of a solution to ${goal}.`,
        justification: core
          ? `${CAPABILITY_LABEL[cap]} is a core technical requirement for ${goal}; ${prod} provides it directly, so the integration carries real functionality rather than branding.`
          : `${prod} supplies supporting ${CAPABILITY_LABEL[cap]} infrastructure; useful but replaceable, so judges may see it as a moderate integration.`,
        technicalDepth: core ? 'deep' : 'moderate',
      });
    }
  }
  if (!draft.opportunities.length) draft.gaps.push('No concrete integration opportunities could be derived from the retrieved material.');
  return draft;
}
