import type { SponsorProfile } from '../../../shared/types';

export type Capability = 'ai' | 'geo' | 'realtime' | 'data' | 'compute' | 'auth' | 'payments' | 'observability' | 'comms';

export const CAPABILITY_LABEL: Record<Capability, string> = {
  ai: 'AI / retrieval',
  geo: 'geospatial',
  realtime: 'realtime messaging',
  data: 'data storage',
  compute: 'serverless compute',
  auth: 'identity & auth',
  payments: 'payments',
  observability: 'observability',
  comms: 'messaging & notifications',
};

const RULES: [Capability, RegExp][] = [
  ['ai', /\b(vector|embedding|semantic|rag|llm|inference|language model|machine learning|\bai\b|agent)\b/i],
  ['geo', /\b(map|maps|geo\w*|routing|isochrone|elevation|location|tiles?|geofenc\w*)\b/i],
  ['realtime', /\b(stream\w*|realtime|real-time|pub\/sub|websocket|presence|event\w*)\b/i],
  ['comms', /\b(webhook\w*|notification\w*|sms|email|push)\b/i],
  ['data', /\b(database|storage|sql|postgres|object storage|bucket|search index)\b/i],
  ['compute', /\b(serverless|functions?|edge|compute|deploy\w*|hosting)\b/i],
  ['auth', /\b(auth\w*|identity|sso|login)\b/i],
  ['payments', /\b(payments?|checkout|payouts?|billing|invoice)\b/i],
  ['observability', /\b(observab\w*|monitoring|tracing|logging|telemetry)\b/i],
];

export function detectCapabilities(text: string): Capability[] {
  return RULES.filter(([, re]) => re.test(text)).map(([c]) => c);
}

export interface SponsorTech {
  sponsor: string;
  capability: Capability;
  /** Product/API name, e.g. "NorthVector". */
  name: string;
  description: string;
}

/** Map each sponsor's extracted products/APIs/tools to capabilities (first match per capability). */
export function sponsorTech(sponsors: SponsorProfile[]): SponsorTech[] {
  const out: SponsorTech[] = [];
  for (const s of sponsors) {
    const seen = new Set<Capability>();
    for (const item of [...s.products, ...s.apis, ...s.devTools, ...s.techEcosystem]) {
      const [rawName, ...rest] = item.split(/:\s+/);
      const description = rest.join(': ') || item;
      for (const cap of detectCapabilities(item)) {
        if (seen.has(cap)) continue;
        seen.add(cap);
        out.push({ sponsor: s.name, capability: cap, name: rest.length ? rawName.trim() : item.trim(), description });
      }
    }
  }
  return out;
}
