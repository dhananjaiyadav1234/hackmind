import type { Research, ResearchProviderStatus, SearchHit } from './types';

/**
 * Bundled SAMPLE data for the demo workspace. The hackathon and its sponsors are FICTIONAL.
 * Competitor/repository snippets describe real public projects but are bundled text, not live fetches.
 */
export const DEMO_URL = 'demo://resilient-cities-build-sprint-2026';

const HACKATHON_PAGE = `Resilient Cities Build Sprint 2026
[SAMPLE DATA — a fictional hackathon bundled with HACKMIND so you can explore the product without credentials.]

About
Resilient Cities Build Sprint is a 36-hour hackathon run by Civic Futures Lab. Teams build working software that helps cities and neighbourhoods prepare for, respond to, and recover from climate-driven emergencies such as floods and heatwaves.

Objectives
- Help cities prepare for, respond to, and recover from climate-driven emergencies.
- Make public safety and risk data usable by residents, not just agencies.
- Demonstrate practical uses of geospatial, realtime and AI infrastructure for civic good.

Themes
- Flood and heat early warning
- Community emergency response
- Infrastructure resilience
- Open civic data

Problem Statements
1. Neighbourhood-level flood alerts: Residents receive city-wide warnings that do not tell them whether their street, basement or route to work is at risk. Build something that turns raw hazard data into personal, actionable guidance.
2. Volunteer coordination after disasters: Spontaneous volunteers and local organisations duplicate effort or miss areas. Build tooling that matches help to need in near-real time.
3. Heat vulnerability: Heatwaves disproportionately harm older and isolated residents. Build ways to identify and reach the people most at risk.

Judging Criteria
- Impact & Relevance (25%): Does the project address a real civic problem from the problem statements?
- Technical Execution (25%): Is the solution working, well engineered and technically sound?
- Innovation (20%): Is the approach novel compared with existing tools?
- Use of Sponsor Technology (15%): Is sponsor technology integrated meaningfully rather than superficially?
- Demo & Presentation (15%): Is the demo clear, compelling and well communicated?

Submission Requirements
- Public GitHub repository with README and setup instructions
- 3-minute demo video
- Project description (problem, solution, tech, challenges)
- Live demo URL or reproducible local instructions

Rules and Restrictions
- Teams of up to 4 people
- All code must be written during the event; open-source libraries are permitted
- Projects must use at least one sponsor technology
- No pre-existing commercial products

Mandatory Technology
- At least one of: Northwind Cloud, Meridian Maps API, Signalbase

Prizes
- Grand Prize: $10,000
- Best Use of Meridian Maps: $3,000
- Best Use of Northwind Cloud: $3,000
- Best Use of Signalbase: $3,000

Schedule
Start: 2026-11-14 09:00 UTC
End: 2026-11-15 21:00 UTC
Submission deadline: 2026-11-15 21:00 UTC
Duration: 36 hours

Organizers: Civic Futures Lab
Sponsors: Northwind Cloud, Meridian Maps, Signalbase
`;

const SPONSOR_PAGES: Record<string, { url: string; title: string; text: string; links: { text: string; href: string }[] }> = {
  northwind: {
    url: 'demo://northwind-cloud',
    title: 'Northwind Cloud (fictional sponsor)',
    text: `Northwind Cloud (fictional sponsor — sample data)
Northwind Cloud is a developer cloud platform for building AI-powered applications quickly.

Products
- Northwind Functions: serverless functions with scheduled and HTTP triggers
- NorthVector: managed vector database with hybrid keyword + semantic search
- Northwind Inference: hosted LLM gateway with embeddings and structured JSON output
- Northwind Storage: object storage with signed URLs

Developer Tools
- Northwind CLI and local emulator
- SDKs for JavaScript/TypeScript and Python
- Templates for RAG and agent apps

APIs
- REST API for Functions deployments
- Inference API (chat, embeddings, structured output)
- Vector query API (hybrid search, metadata filters)

Documentation
- Quickstart: demo://northwind-cloud/docs/quickstart
- NorthVector guide: demo://northwind-cloud/docs/northvector

Latest
- NorthVector hybrid search is now generally available (sample announcement)
- Structured output mode added to Northwind Inference (sample announcement)

Previous Hackathons
- Provided free credits to teams at several community hackathons (sample statement)
`,
    links: [
      { text: 'Quickstart', href: 'demo://northwind-cloud/docs/quickstart' },
      { text: 'NorthVector guide', href: 'demo://northwind-cloud/docs/northvector' },
    ],
  },
  meridian: {
    url: 'demo://meridian-maps',
    title: 'Meridian Maps (fictional sponsor)',
    text: `Meridian Maps (fictional sponsor — sample data)
Meridian Maps provides geospatial APIs for location-aware applications, including hazard and terrain data.

Products
- Geocoding API: forward and reverse geocoding
- Routing API: turn-by-turn and isochrone (travel-time area) calculations
- Elevation API: point and path elevation profiles
- Hazard Layers: flood-risk raster tiles and vector contours (sample)

Developer Tools
- Meridian.js map SDK with vector tiles
- Mobile SDKs for iOS and Android
- Command line tile exporter

APIs
- REST Geocoding, Routing, Isochrone and Elevation endpoints
- Tile API for Hazard Layers
- Webhooks for geofence enter/exit events

Documentation
- Getting started: demo://meridian-maps/docs/start
- Isochrone API: demo://meridian-maps/docs/isochrone

Latest
- Hazard Layers now include 1 metre elevation-based flood depth tiles for selected regions (sample announcement)
- Geofence webhooks released in beta (sample announcement)

Previous Hackathons
- Offered a map API sandbox tier at civic-tech events (sample statement)
`,
    links: [
      { text: 'Getting started', href: 'demo://meridian-maps/docs/start' },
      { text: 'Isochrone API', href: 'demo://meridian-maps/docs/isochrone' },
    ],
  },
  signalbase: {
    url: 'demo://signalbase',
    title: 'Signalbase (fictional sponsor)',
    text: `Signalbase (fictional sponsor — sample data)
Signalbase is a realtime data platform for event streaming, presence and notifications.

Products
- Signalbase Streams: managed event streaming with replay
- Signalbase Realtime: WebSocket pub/sub channels with presence
- Signalbase Hooks: reliable webhook delivery with retries
- Signalbase Edge: low-latency edge functions for event enrichment

Developer Tools
- Client SDKs for web, Node and Python
- Replay and debug console
- Local broker for testing

APIs
- Publish/subscribe API
- Stream consumer API with offsets
- Webhook management API

Documentation
- Realtime quickstart: demo://signalbase/docs/realtime
- Streams replay: demo://signalbase/docs/streams

Latest
- Presence API now supports per-channel capacity limits (sample announcement)
- Streams replay UI released (sample announcement)

Previous Hackathons
- Sponsored realtime tracks at developer events (sample statement)
`,
    links: [
      { text: 'Realtime quickstart', href: 'demo://signalbase/docs/realtime' },
      { text: 'Streams replay', href: 'demo://signalbase/docs/streams' },
    ],
  },
};

interface Fixture { re: RegExp; hits: SearchHit[] }

const web = (title: string, url: string, snippet: string): SearchHit => ({ title, url, snippet, provider: 'demo-fixture', kind: 'web' });

const WEB_FIXTURES: Fixture[] = [
  {
    re: /flood|disaster|emergency|crisis|alert|warning|volunteer|resilien/i,
    hits: [
      web('Ushahidi — crowdsourced crisis mapping', 'https://www.ushahidi.com', 'Ushahidi builds open-source software for information collection, visualization and interactive mapping, used for crisis response and election monitoring.'),
      web('Sahana Software Foundation', 'https://sahanafoundation.org', 'Sahana provides free and open-source disaster management software for coordinating relief and recovery.'),
      web('HOT Tasking Manager', 'https://tasks.hotosm.org', 'A mapping tool built for the Humanitarian OpenStreetMap Team to coordinate collaborative mapping of areas affected by disasters.'),
      web('Common Alerting Protocol (CAP) v1.2 — OASIS', 'https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html', 'A standard XML format for exchanging public warnings and emergencies between alerting technologies.'),
    ],
  },
  {
    re: /weather|forecast|rain|heat|temperature/i,
    hits: [
      web('Open-Meteo — free weather API', 'https://open-meteo.com', 'Open-Meteo is a free, open-source weather API offering forecasts and historical data for non-commercial use.'),
      web('OpenStreetMap', 'https://www.openstreetmap.org', 'OpenStreetMap is a free, editable map of the whole world built by a community of mappers.'),
    ],
  },
];

const REPO_FIXTURES: Fixture[] = [
  {
    re: /flood|disaster|emergency|crisis|volunteer|alert|map/i,
    hits: [
      { title: 'ushahidi/platform', url: 'https://github.com/ushahidi/platform', kind: 'repo', provider: 'demo-fixture', snippet: 'Ushahidi platform API and client — open-source crisis mapping.' },
      { title: 'sahana/eden', url: 'https://github.com/sahana/eden', kind: 'repo', provider: 'demo-fixture', snippet: 'Sahana Eden — open-source emergency management and humanitarian response platform.' },
    ],
  },
];

function match(fixtures: Fixture[], q: string, limit: number): SearchHit[] {
  const out: SearchHit[] = [];
  for (const f of fixtures) if (f.re.test(q)) out.push(...f.hits);
  return [...new Map(out.map((h) => [h.url, h])).values()].slice(0, limit);
}

export class DemoResearch implements Research {
  status(): ResearchProviderStatus[] {
    return [{ id: 'demo-fixture', label: 'Bundled demo fixtures', configured: true, requiresKey: false, note: 'Fictional hackathon & sponsors; competitor/repo snippets are bundled text, not live fetches. No papers are bundled.' }];
  }
  drainWarnings(): string[] {
    return [];
  }
  async webSearch(query: string, limit = 6) {
    return match(WEB_FIXTURES, query, limit);
  }
  async paperSearch() {
    return [] as SearchHit[];
  }
  async repoSearch(query: string, limit = 5) {
    return match(REPO_FIXTURES, query, limit);
  }
  async fetchPage(url: string) {
    if (url === DEMO_URL) return { url, title: 'Resilient Cities Build Sprint 2026 (SAMPLE)', description: 'Fictional sample hackathon', text: HACKATHON_PAGE, links: [] };
    for (const p of Object.values(SPONSOR_PAGES)) if (p.url === url) return { ...p, description: p.title };
    return null;
  }
}

/** Sponsor homepage lookups used by the demo sponsor stage (fictional URLs). */
export const DEMO_SPONSOR_URLS: Record<string, string> = {
  'northwind cloud': SPONSOR_PAGES.northwind.url,
  'meridian maps': SPONSOR_PAGES.meridian.url,
  signalbase: SPONSOR_PAGES.signalbase.url,
};
