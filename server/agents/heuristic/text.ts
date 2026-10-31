/** Text utilities shared by the heuristic engine and the pipeline. */

export const STOPWORDS = new Set(
  'a an the and or of to in for on with by from at as is are was were be been it its this that these those our your their we you they not no can will should must may into over under more most less than then so such via per each any all both between across about after before during using use used build built help helps make makes what which who whom whose how when where why also just only very much many other another'.split(' '),
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? []).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function keyTerms(text: string, max = 12): string[] {
  const freq = new Map<string, number>();
  for (const t of tokens(text)) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, max).map(([t]) => t);
}

/** Share of `terms` that occur (as whole tokens / prefixes) in `haystack`. */
export function overlap(terms: string[], haystack: string): number {
  if (!terms.length) return 0;
  const set = new Set(tokens(haystack));
  const stems = [...set];
  let hit = 0;
  for (const t of terms) {
    if (set.has(t) || stems.some((s) => s.length > 4 && t.length > 4 && (s.startsWith(t.slice(0, 5)) || t.startsWith(s.slice(0, 5))))) hit++;
  }
  return hit / terms.length;
}

export function normaliseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function containsQuote(haystack: string, quote: string): boolean {
  const q = normaliseWs(quote);
  return q.length >= 6 && normaliseWs(haystack).includes(q);
}

export function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

export function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// ── Section parsing for hackathon / sponsor pages ──

export type SectionKey =
  | 'about' | 'objectives' | 'themes' | 'problems' | 'judging' | 'submission' | 'rules' | 'mandatory' | 'prizes'
  | 'schedule' | 'sponsors' | 'products' | 'devtools' | 'apis' | 'docs' | 'latest' | 'previous';

const HEADINGS: [SectionKey, RegExp][] = [
  ['mandatory', /^(mandatory|required|compulsory) tech(nolog(y|ies))?/i],
  ['problems', /^(problem statements?|challenges?|prompts?|tracks? descriptions?)/i],
  ['judging', /^(judging( criteria)?|evaluation( criteria)?|criteria|how (we|projects are) judg\w*|scoring)/i],
  ['submission', /^(submission( requirements?)?|deliverables|what to submit|submit)/i],
  ['rules', /^(rules?( and| &) restrictions?|rules|restrictions?|eligibility|terms)/i],
  ['themes', /^(themes?|tracks?|categories|focus areas?)/i],
  ['objectives', /^(objectives?|goals?|mission|purpose)/i],
  ['about', /^(about|overview|what is)/i],
  ['prizes', /^(prizes?|awards?|rewards?)/i],
  ['schedule', /^(schedule|timeline|dates|important dates)/i],
  ['sponsors', /^(sponsors?|partners?)/i],
  ['products', /^(products?|services|platform|solutions)/i],
  ['devtools', /^(developer tools|dev tools|sdks?|tooling)/i],
  ['apis', /^(apis?|api reference)/i],
  ['docs', /^(documentation|docs|developer docs|resources)/i],
  ['latest', /^(latest|news|announcements|what'?s new|recent)/i],
  ['previous', /^(previous hackathons?|past hackathons?|hackathons?)/i],
];

export interface Section {
  key: SectionKey;
  heading: string;
  lines: string[];
}

const BULLET = /^\s*(?:[-*•–]|\d{1,2}[.)])\s+/;

export function stripBullet(line: string): string {
  return line.replace(BULLET, '').trim();
}

/** Split text into known sections. Headings are short lines matching a known heading vocabulary. */
export function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^#+\s*/, '');
    if (!line) continue;
    const headingCandidate = line.replace(/:$/, '');
    if (headingCandidate.length <= 48 && !BULLET.test(raw) && !/[.!?]$/.test(headingCandidate)) {
      const hit = HEADINGS.find(([, re]) => re.test(headingCandidate));
      if (hit) {
        cur = { key: hit[0], heading: headingCandidate, lines: [] };
        sections.push(cur);
        continue;
      }
    }
    // Metadata lines (Duration:, Start:, Organizers: …) end whatever section was open.
    if (/^(duration|start|starts|end|ends|deadline|submission deadline|organi[sz]ers?|location|format|team size|website|date|dates)\s*[:-]\s*\S/i.test(line) && !BULLET.test(raw)) {
      cur = null;
      continue;
    }
    // "Sponsors: A, B, C" style inline sections (colon with content on same line)
    const inline = line.match(/^([A-Za-z &/]{3,32}):\s+(.+)$/);
    if (inline) {
      const hit = HEADINGS.find(([, re]) => re.test(inline[1]));
      if (hit && ['sponsors', 'schedule', 'prizes'].includes(hit[0]) && !cur?.lines.length) {
        sections.push({ key: hit[0], heading: inline[1], lines: [inline[2]] });
        cur = null;
        continue;
      }
    }
    if (cur) cur.lines.push(line);
  }
  return sections;
}

export function sectionItems(sections: Section[], key: SectionKey): string[] {
  return sections
    .filter((s) => s.key === key)
    .flatMap((s) => s.lines)
    .map(stripBullet)
    .filter((l) => l.length > 1);
}

export function sectionText(sections: Section[], key: SectionKey): string {
  return sections.filter((s) => s.key === key).flatMap((s) => s.lines).join('\n');
}
