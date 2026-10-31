import type { IdeaTier } from '../../../shared/types';
import type { Capability } from './capabilities';

export interface Topic {
  title: string;
  short: string; // lowercase noun phrase
  audience: string;
  gist: string; // first sentence of the statement
  audienceSpecific: boolean;
}

export interface Pattern {
  id: string;
  tier: IdeaTier;
  name: string;
  title: string;
  pitch: string;
  solution: string;
  edge: string;
  needs: Capability[];
  roles: Partial<Record<Capability, string>>;
  mvp: string[];
  stretch: string[];
  components: { name: string; responsibility: string; tech: string }[];
  hours: number;
  complexity: 'low' | 'medium' | 'high';
  demo: number;
  appeal: string;
  risks: { risk: string; severity: 'low' | 'medium' | 'high'; mitigation: string }[];
}

export function fill(tpl: string, t: Topic): string {
  return tpl
    .replace(/\{Short\}/g, t.short.charAt(0).toUpperCase() + t.short.slice(1))
    .replace(/\{short\}/g, t.short)
    .replace(/\{Title\}/g, t.title)
    .replace(/\{audience\}/g, t.audience)
    .replace(/\{gist\}/g, t.gist);
}

export const PATTERNS: Pattern[] = [
  {
    id: 'briefing', tier: 'safe', name: 'Personal Briefing Assistant',
    title: '{Short}: Personal Briefing Assistant',
    pitch: 'Turns raw {short} data into a plain-language, personalised briefing for {audience}.',
    solution: 'A focused web app that takes a person’s location and situation, retrieves the relevant official guidance and data, and generates a short, sourced briefing with the three actions that matter most right now. Every statement links to the document it came from so users can check it.',
    edge: 'it personalises sourced guidance to one person’s exact situation instead of publishing generic area-wide notices',
    needs: ['ai', 'geo', 'data'],
    roles: { ai: 'retrieve official guidance passages and generate a grounded, cited briefing', geo: 'resolve the user’s location to the relevant zone or area', data: 'store profiles and indexed source documents' },
    mvp: ['Location + situation intake form', 'Retrieval over a curated set of official documents', 'Cited plain-language briefing with top-3 actions', 'Shareable briefing link', 'Source panel showing exactly which passages were used'],
    stretch: ['Multilingual briefings', 'SMS / push delivery', 'Household profiles for multiple people'],
    components: [
      { name: 'Intake UI', responsibility: 'Collect location and situation', tech: 'React + Vite' },
      { name: 'Retrieval service', responsibility: 'Index and retrieve guidance passages', tech: 'Vector / hybrid search' },
      { name: 'Briefing generator', responsibility: 'Compose cited briefings', tech: 'LLM with structured output' },
      { name: 'Data API', responsibility: 'Profiles, documents, audit log', tech: 'Node/TypeScript + SQLite/Postgres' },
    ],
    hours: 34, complexity: 'medium', demo: 7.5,
    appeal: 'Easy to understand in 30 seconds and demoable live with a real address; citations make the AI output trustworthy.',
    risks: [
      { risk: 'Generated guidance could be wrong or unsafe', severity: 'high', mitigation: 'Constrain to retrieved passages, show citations, refuse when no source supports an answer' },
      { risk: 'Source documents may be hard to obtain in time', severity: 'medium', mitigation: 'Curate a small, high-quality document set first' },
    ],
  },
  {
    id: 'dashboard', tier: 'safe', name: 'Live Dashboard & Alerting',
    title: '{Short}: Live Dashboard & Alerts',
    pitch: 'A live map and alerting layer that tells {audience} what is changing around them as it happens.',
    solution: 'A realtime dashboard that ingests hazard or status feeds, maps what changes, and pushes threshold-based alerts to subscribed users. Operators see the whole picture; residents get only the alerts relevant to their saved places.',
    edge: 'alerts are scoped to a user’s saved places and thresholds rather than broadcast to everyone',
    needs: ['realtime', 'geo', 'comms'],
    roles: { realtime: 'stream updates to every open dashboard and subscribed client', geo: 'render affected areas, thresholds and routes on the map', comms: 'deliver reliable alert webhooks / notifications with retries' },
    mvp: ['Data ingestion adapter with 1–2 live/simulated feeds', 'Realtime map with change highlighting', 'Saved places + threshold rules', 'Alert delivery with delivery log', 'Operator view with alert history'],
    stretch: ['Escalation rules', 'Alert acknowledgement tracking', 'Historical replay'],
    components: [
      { name: 'Ingestion worker', responsibility: 'Poll/ingest feeds and normalise events', tech: 'Node/TypeScript worker' },
      { name: 'Realtime hub', responsibility: 'Fan-out of updates', tech: 'WebSocket pub/sub' },
      { name: 'Map UI', responsibility: 'Visualise areas and alerts', tech: 'React + vector map SDK' },
      { name: 'Rules & alerting', responsibility: 'Evaluate thresholds and deliver alerts', tech: 'Rules engine + webhooks' },
    ],
    hours: 38, complexity: 'medium', demo: 8.5,
    appeal: 'Highly visual and demonstrably live; judges can watch an event propagate end to end.',
    risks: [
      { risk: 'Live data feeds may be unavailable or rate-limited during the event', severity: 'medium', mitigation: 'Record a replayable fixture feed as a fallback' },
      { risk: 'Looks like many existing dashboards', severity: 'medium', mitigation: 'Lead the demo with the personalised alert scoping' },
    ],
  },
  {
    id: 'matching', tier: 'safe', name: 'Needs-and-Offers Matching Board',
    title: '{Short}: Needs & Offers Matching Board',
    pitch: 'Matches what {audience} need with who can help, in near-real time.',
    solution: 'A lightweight coordination board where needs and offers are posted, geocoded and automatically matched by distance, skills and urgency. Coordinators see unmatched needs first; helpers get one clear task at a time.',
    edge: 'it ranks unmatched needs by urgency and distance so coordinators act on gaps, not on the loudest request',
    needs: ['realtime', 'data', 'ai'],
    roles: { realtime: 'push new needs/matches instantly to coordinators and helpers', data: 'persist needs, offers and match history', ai: 'normalise free-text requests into structured needs and skills' },
    mvp: ['Post a need / offer (free text or form)', 'Structured extraction + geocoding', 'Match scoring by distance, skills, urgency', 'Coordinator queue of unmatched needs', 'Helper task view with accept/decline'],
    stretch: ['Duplicate-request merging', 'Volunteer verification', 'Route batching'],
    components: [
      { name: 'Intake', responsibility: 'Capture and structure needs/offers', tech: 'React + LLM extraction' },
      { name: 'Matcher', responsibility: 'Score and propose matches', tech: 'Weighted ranking service' },
      { name: 'Realtime channel', responsibility: 'Notify participants', tech: 'WebSocket pub/sub' },
      { name: 'Store', responsibility: 'Needs, offers, matches', tech: 'SQLite/Postgres' },
    ],
    hours: 36, complexity: 'medium', demo: 7.5,
    appeal: 'Clear user value and an interactive demo with two roles side by side.',
    risks: [
      { risk: 'Cold-start: a board is useless without participants', severity: 'medium', mitigation: 'Seed realistic scenarios and demo with two live roles' },
      { risk: 'Abuse / fake requests', severity: 'medium', mitigation: 'Coordinator confirmation step for high-urgency items' },
    ],
  },
  {
    id: 'copilot', tier: 'safe', name: 'Guided Action Copilot',
    title: '{Short}: Guided Action Copilot',
    pitch: 'A step-by-step copilot that walks {audience} through exactly what to do next.',
    solution: 'An interactive, checklist-driven assistant that adapts its next step to the user’s answers and location, and sends reminders for time-critical actions. Content comes from vetted playbooks and is cited.',
    edge: 'it is stateful and procedural — it tracks what the user has already done instead of answering one-off questions',
    needs: ['ai', 'comms', 'data'],
    roles: { ai: 'adapt the next step to the user’s answers while grounded in vetted playbooks', comms: 'send reminders and escalate time-critical steps', data: 'persist progress and playbook versions' },
    mvp: ['Playbook schema + 2–3 authored playbooks', 'Adaptive step engine', 'Progress tracking', 'Reminder notifications', 'Cited step explanations'],
    stretch: ['Voice interface', 'Caregiver sharing', 'Playbook authoring UI'],
    components: [
      { name: 'Playbook engine', responsibility: 'Evaluate state and choose next step', tech: 'TypeScript state machine' },
      { name: 'Explainer', responsibility: 'Generate cited explanations', tech: 'LLM + retrieval' },
      { name: 'Reminder service', responsibility: 'Schedule notifications', tech: 'Scheduler + webhooks' },
      { name: 'Web app', responsibility: 'Checklist UI', tech: 'React + Vite' },
    ],
    hours: 30, complexity: 'low', demo: 6.8,
    appeal: 'Low risk and polished; shows engineering discipline but is less novel.',
    risks: [
      { risk: 'Perceived as a generic chatbot', severity: 'medium', mitigation: 'Make the stateful checklist the hero of the demo' },
      { risk: 'Playbook content quality', severity: 'medium', mitigation: 'Author a few playbooks from official sources and cite them' },
    ],
  },
  {
    id: 'explorer', tier: 'safe', name: 'Open-Data Explorer',
    title: '{Short}: Open-Data Explorer',
    pitch: 'Makes scattered public {short} data searchable and understandable for {audience}.',
    solution: 'A unified explorer that pulls several public datasets into one searchable map-and-table view, with natural-language questions translated into verified queries and every number linked to its source dataset.',
    edge: 'natural-language questions compile to inspectable queries over open datasets, so answers are checkable',
    needs: ['data', 'geo', 'ai'],
    roles: { data: 'host harmonised datasets and indexes', geo: 'spatial joins and map rendering', ai: 'translate questions into inspectable structured queries' },
    mvp: ['2–3 dataset connectors', 'Harmonised schema', 'Map + table explorer', 'NL → structured query with visible query', 'Dataset provenance panel'],
    stretch: ['Saved views and sharing', 'Data quality scoring', 'Export API'],
    components: [
      { name: 'Connectors', responsibility: 'Fetch and normalise datasets', tech: 'Node/TypeScript ETL' },
      { name: 'Query service', responsibility: 'Run structured queries', tech: 'SQL / search index' },
      { name: 'NL translator', responsibility: 'Questions to queries', tech: 'LLM structured output' },
      { name: 'Explorer UI', responsibility: 'Map and table views', tech: 'React + map SDK' },
    ],
    hours: 36, complexity: 'medium', demo: 7.0,
    appeal: 'Useful immediately and credible because answers are traceable.',
    risks: [
      { risk: 'Dataset licensing / availability', severity: 'medium', mitigation: 'Use clearly open datasets and cache snapshots' },
      { risk: 'Data harmonisation takes longer than planned', severity: 'high', mitigation: 'Limit to two datasets for the MVP' },
    ],
  },
  {
    id: 'explainable', tier: 'innovative', name: 'Explainable Risk Engine',
    title: '{Short}: Explainable Risk Engine',
    pitch: 'A transparent risk score for {short} that shows which factors drive it and what would change it.',
    solution: 'Combines several public signals into a per-location risk score and shows a factor-by-factor explanation plus counterfactuals (“if X were different, risk would drop to Y”). Users and agencies can audit the logic and see data freshness for each factor.',
    edge: 'it explains and lets users interrogate the score with counterfactuals, where most risk tools show an opaque number',
    needs: ['ai', 'geo', 'data'],
    roles: { ai: 'generate factor explanations and counterfactual narratives from the model’s outputs', geo: 'location-specific hazard and exposure layers', data: 'store factor definitions, weights and freshness metadata' },
    mvp: ['Factor model with 4–6 documented factors', 'Per-location score + factor breakdown', 'Counterfactual “what would change this” panel', 'Data freshness / confidence indicators', 'Methodology page'],
    stretch: ['Community-contributed factors', 'Model backtesting view', 'API for third parties'],
    components: [
      { name: 'Factor registry', responsibility: 'Define factors, weights, sources', tech: 'TypeScript + SQLite' },
      { name: 'Scoring engine', responsibility: 'Compute scores and counterfactuals', tech: 'Deterministic scoring service' },
      { name: 'Narrator', responsibility: 'Plain-language explanations', tech: 'LLM constrained to factor outputs' },
      { name: 'Risk UI', responsibility: 'Explorable breakdowns', tech: 'React + map' },
    ],
    hours: 46, complexity: 'high', demo: 8.0,
    appeal: 'Novel framing (explainability and counterfactuals) with a strong “aha” in the demo.',
    risks: [
      { risk: 'Scoring validity cannot be proven in 36 hours', severity: 'high', mitigation: 'Be explicit that the score is a documented heuristic; show methodology and uncertainty' },
      { risk: 'Required data layers may be unavailable', severity: 'medium', mitigation: 'Choose factors with accessible open data first' },
    ],
  },
  {
    id: 'fusion', tier: 'innovative', name: 'Community Signal Fusion',
    title: '{Short}: Community Signal Fusion',
    pitch: 'Fuses crowdsourced reports with official data and scores how much to trust each signal.',
    solution: 'Residents submit quick reports (photo/text/location). The system clusters them, cross-checks against official feeds and sensor data, assigns a trust score with reasons, and surfaces a verified picture faster than official channels alone.',
    edge: 'it quantifies and explains trust in each crowdsourced signal by corroborating it against independent sources',
    needs: ['realtime', 'ai', 'geo'],
    roles: { realtime: 'ingest and fan out reports as they arrive', ai: 'classify reports and cluster duplicates', geo: 'spatial clustering and corroboration against official layers' },
    mvp: ['Report submission (text + location + optional photo)', 'Duplicate clustering', 'Corroboration against one official feed', 'Trust score with reasons', 'Verified-picture map'],
    stretch: ['Reporter reputation', 'Moderation queue', 'Rumour-detection alerts'],
    components: [
      { name: 'Report intake', responsibility: 'Collect and validate reports', tech: 'React PWA + API' },
      { name: 'Classifier & clusterer', responsibility: 'Label and group reports', tech: 'LLM + spatial clustering' },
      { name: 'Corroboration engine', responsibility: 'Cross-check against official data', tech: 'Rules + data adapters' },
      { name: 'Realtime hub', responsibility: 'Push verified updates', tech: 'WebSocket pub/sub' },
    ],
    hours: 48, complexity: 'high', demo: 8.2,
    appeal: 'Strong demo moment when a noisy report becomes a trusted, corroborated event.',
    risks: [
      { risk: 'Adversarial or false reports', severity: 'high', mitigation: 'Trust scoring requires independent corroboration before alerts' },
      { risk: 'Needs realistic data to demo', severity: 'medium', mitigation: 'Prepare a scripted scenario with synthetic reports clearly labelled as such' },
    ],
  },
  {
    id: 'offline', tier: 'innovative', name: 'Offline-First Field Kit',
    title: '{Short}: Offline-First Field Kit',
    pitch: 'Keeps working when networks fail: a local-first app that syncs when connectivity returns.',
    solution: 'A PWA with local-first storage and conflict-free sync, so field teams and residents can record needs, status and maps with no connectivity, then reconcile automatically. Peers can share data over short-range links where possible.',
    edge: 'it is designed around connectivity failure — the typical failure mode of the situations it targets',
    needs: ['data', 'realtime', 'compute'],
    roles: { data: 'durable server-side store and sync endpoint', realtime: 'push merged state to reconnecting clients', compute: 'run merge/reconciliation functions at the edge' },
    mvp: ['Installable PWA with local storage', 'Conflict-free sync for 2 record types', 'Offline map tiles for one area', 'Sync status UI', 'Demo with network toggled off'],
    stretch: ['Peer-to-peer sync', 'Data compression for low bandwidth', 'Field role permissions'],
    components: [
      { name: 'Local store', responsibility: 'Offline persistence', tech: 'IndexedDB + CRDT' },
      { name: 'Sync service', responsibility: 'Merge and reconcile', tech: 'Edge functions' },
      { name: 'PWA shell', responsibility: 'UI and service worker', tech: 'React + Workbox' },
      { name: 'Server store', responsibility: 'Authoritative state', tech: 'SQLite/Postgres' },
    ],
    hours: 50, complexity: 'high', demo: 8.4,
    appeal: 'A memorable live demo (airplane mode on stage) aimed at a real failure mode.',
    risks: [
      { risk: 'Sync conflicts are subtle and time-consuming', severity: 'high', mitigation: 'Use an off-the-shelf CRDT library and limit to two record types' },
      { risk: 'Service-worker debugging overhead', severity: 'medium', mitigation: 'Timebox; fall back to simple queue-and-retry' },
    ],
  },
  {
    id: 'sandbox', tier: 'innovative', name: 'What-If Scenario Sandbox',
    title: '{Short}: What-If Scenario Sandbox',
    pitch: 'Lets {audience} and planners rehearse scenarios and see consequences before they happen.',
    solution: 'An interactive sandbox where users alter conditions (intensity, timing, interventions) and see simulated impacts on a map, with side-by-side comparison of response options and the assumptions each run depends on.',
    edge: 'it makes assumptions explicit and lets users compare interventions, instead of showing a single forecast',
    needs: ['compute', 'geo', 'ai'],
    roles: { compute: 'run scenario simulations as scalable serverless jobs', geo: 'apply simulation results to the map and exposure layers', ai: 'summarise differences between scenarios and flag assumptions' },
    mvp: ['Parameterised simulation (simple model)', 'Scenario runner + results map', 'Side-by-side scenario comparison', 'Assumption ledger', 'Shareable scenario links'],
    stretch: ['Calibration against historical events', 'Multi-user planning sessions', 'Export to PDF'],
    components: [
      { name: 'Simulation core', responsibility: 'Run simplified models', tech: 'TypeScript/WASM module' },
      { name: 'Job runner', responsibility: 'Execute scenarios', tech: 'Serverless functions' },
      { name: 'Comparison engine', responsibility: 'Diff scenarios', tech: 'TypeScript' },
      { name: 'Sandbox UI', responsibility: 'Parameters and maps', tech: 'React + map' },
    ],
    hours: 46, complexity: 'high', demo: 8.0,
    appeal: 'Interactive and visual — judges can play with it themselves.',
    risks: [
      { risk: 'Simulation realism is limited', severity: 'high', mitigation: 'Label as illustrative; expose assumptions and uncertainty' },
      { risk: 'Scope creep in modelling', severity: 'medium', mitigation: 'Single hazard, single model, two interventions' },
    ],
  },
  {
    id: 'agents', tier: 'innovative', name: 'Multi-Agent Planning Room',
    title: '{Short}: Multi-Agent Planning Room',
    pitch: 'Specialist AI agents debate options and produce a reviewable response plan for {short}.',
    solution: 'A planning room where specialist agents (logistics, safety, communications) propose, challenge and reconcile actions over shared situational data. Humans see the debate, approve or edit the plan, and every recommendation lists its evidence and open assumptions.',
    edge: 'it exposes the disagreement between specialist agents so humans judge the trade-offs, rather than receiving one opaque recommendation',
    needs: ['ai', 'realtime', 'compute'],
    roles: { ai: 'power the specialist agents and the reconciliation step', realtime: 'stream agent deliberation to the planning UI', compute: 'run agent tool calls and plan evaluation as isolated jobs' },
    mvp: ['3 specialist agents with distinct mandates', 'Shared situation state', 'Visible debate transcript', 'Plan with evidence and assumptions', 'Human approve/edit step'],
    stretch: ['Plan versioning and diff', 'Agent performance evaluation', 'What-if re-planning'],
    components: [
      { name: 'Agent orchestrator', responsibility: 'Run and reconcile agents', tech: 'TypeScript + LLM tool use' },
      { name: 'Situation store', responsibility: 'Shared state and evidence', tech: 'SQLite/Postgres' },
      { name: 'Realtime stream', responsibility: 'Live deliberation feed', tech: 'WebSocket / SSE' },
      { name: 'Planning UI', responsibility: 'Review, approve, edit', tech: 'React' },
    ],
    hours: 44, complexity: 'high', demo: 8.6,
    appeal: 'Compelling AI-native demo with visible reasoning and human control.',
    risks: [
      { risk: 'Agent output quality is inconsistent', severity: 'high', mitigation: 'Structured outputs, evidence requirements, and a human approval gate' },
      { risk: 'Latency makes the demo slow', severity: 'medium', mitigation: 'Pre-warm scenarios and stream partial results' },
    ],
  },
  {
    id: 'coordinator', tier: 'moonshot', name: 'Autonomous Response Coordinator',
    title: '{Short}: Autonomous Response Coordinator',
    pitch: 'An agentic coordinator that triages, dispatches and re-plans in real time with a human in the loop.',
    solution: 'Continuously ingests incidents and resources, proposes dispatch decisions, monitors outcomes and re-plans on change. Humans approve high-impact actions; low-risk routine actions are automated with a full audit trail.',
    edge: 'it closes the loop — monitoring outcomes and re-planning — instead of stopping at a one-off recommendation',
    needs: ['ai', 'realtime', 'geo'],
    roles: { ai: 'triage incidents and draft dispatch decisions with justifications', realtime: 'ingest status changes and push re-plans instantly', geo: 'compute travel-time-aware assignments' },
    mvp: ['Incident + resource simulation', 'Triage and assignment proposals', 'Human approval gate with audit log', 'Re-plan on change', 'Map view of assignments'],
    stretch: ['Learning from past decisions', 'Multi-agency handoffs', 'Fairness / coverage analytics'],
    components: [
      { name: 'State tracker', responsibility: 'Incidents and resources', tech: 'Event-sourced store' },
      { name: 'Planner agent', responsibility: 'Triage and assign', tech: 'LLM + optimisation' },
      { name: 'Approval workflow', responsibility: 'Human gate and audit', tech: 'TypeScript API' },
      { name: 'Ops UI', responsibility: 'Map and queue', tech: 'React + map SDK' },
    ],
    hours: 66, complexity: 'high', demo: 9.0,
    appeal: 'A bold, ambitious vision that is still demoable with simulated incidents.',
    risks: [
      { risk: 'Scope is far larger than a hackathon allows', severity: 'high', mitigation: 'Ship a single-scenario vertical slice with simulated data' },
      { risk: 'Safety / trust concerns about autonomy', severity: 'high', mitigation: 'Human approval for anything high-impact; show audit trail' },
    ],
  },
  {
    id: 'twin', tier: 'moonshot', name: 'Street-Level Digital Twin',
    title: '{Short}: Street-Level Digital Twin',
    pitch: 'A live, street-level model of a neighbourhood that shows exposure and options as conditions change.',
    solution: 'Builds a navigable model of one neighbourhood from open map and elevation data, overlays live conditions, and answers “what happens here next?” at street level, including which routes and buildings are affected.',
    edge: 'it operates at street and building granularity rather than city-wide zones',
    needs: ['geo', 'realtime', 'data'],
    roles: { geo: 'elevation, routing and hazard layers for the street-level model', realtime: 'stream live condition updates into the model', data: 'store derived building/street attributes' },
    mvp: ['One neighbourhood model from open data', 'Elevation/exposure overlay', 'Live (or replayed) condition updates', 'Affected routes and assets list', 'Street-level inspect view'],
    stretch: ['3D view', 'Multiple neighbourhoods', 'Resident-contributed observations'],
    components: [
      { name: 'Model builder', responsibility: 'Derive streets/buildings/exposure', tech: 'Geo processing pipeline' },
      { name: 'State overlay', responsibility: 'Apply live conditions', tech: 'Realtime stream' },
      { name: 'Query service', responsibility: 'Impact queries', tech: 'Spatial queries' },
      { name: 'Twin UI', responsibility: 'Interactive visualisation', tech: 'React + WebGL map' },
    ],
    hours: 62, complexity: 'high', demo: 9.2,
    appeal: 'Visually striking; strong “wow” factor if the vertical slice is polished.',
    risks: [
      { risk: 'Geo data wrangling consumes the schedule', severity: 'high', mitigation: 'Pick one small area and pre-process data before the event' },
      { risk: 'Model fidelity is hard to validate', severity: 'medium', mitigation: 'Frame as illustrative and show data provenance' },
    ],
  },
  {
    id: 'predict', tier: 'moonshot', name: 'Predictive Early-Warning Network',
    title: '{Short}: Predictive Early-Warning Network',
    pitch: 'Learns local patterns to warn earlier than thresholds can, and says how sure it is.',
    solution: 'Trains lightweight per-area models on historical and live signals to forecast the near term, publishes calibrated probabilities with uncertainty, and tracks its own forecast accuracy publicly so trust is earned.',
    edge: 'it reports calibrated uncertainty and tracks its own forecast accuracy publicly',
    needs: ['ai', 'data', 'realtime'],
    roles: { ai: 'train/serve forecast models and generate uncertainty-aware explanations', data: 'store historical series and forecast ledgers', realtime: 'publish forecast updates continuously' },
    mvp: ['Historical dataset ingestion', 'Baseline + one learned model', 'Probabilistic forecast with intervals', 'Accuracy ledger', 'Forecast UI'],
    stretch: ['Per-area model personalisation', 'Ensembling', 'Drift detection'],
    components: [
      { name: 'Data pipeline', responsibility: 'Collect and clean series', tech: 'Python/Node ETL' },
      { name: 'Model service', responsibility: 'Train and serve forecasts', tech: 'Python (sklearn/XGBoost)' },
      { name: 'Ledger', responsibility: 'Forecast vs outcome', tech: 'SQLite/Postgres' },
      { name: 'Forecast UI', responsibility: 'Probabilities and accuracy', tech: 'React' },
    ],
    hours: 68, complexity: 'high', demo: 7.6,
    appeal: 'Technically impressive; riskier because model quality must be shown, not claimed.',
    risks: [
      { risk: 'Insufficient historical data to train anything meaningful', severity: 'high', mitigation: 'Validate data availability in hour 1; fall back to calibrated baselines' },
      { risk: 'Overclaiming accuracy', severity: 'high', mitigation: 'Show backtest results honestly with intervals' },
    ],
  },
  {
    id: 'playbook', tier: 'moonshot', name: 'Self-Improving Playbook Generator',
    title: '{Short}: Self-Improving Playbook Generator',
    pitch: 'Generates local response playbooks from past incidents and improves them after every drill.',
    solution: 'Ingests after-action reports and local plans, drafts a tailored playbook, runs tabletop drills with simulated participants, and revises the playbook from drill findings while tracking what changed and why.',
    edge: 'playbooks are living artefacts that improve from drills, with a visible change history',
    needs: ['ai', 'data', 'compute'],
    roles: { ai: 'extract lessons, draft playbooks and revise from drill findings', data: 'store documents, playbook versions and drill logs', compute: 'run drill simulations as jobs' },
    mvp: ['Document ingestion', 'Playbook draft with citations', 'Drill simulation (scripted participants)', 'Revision proposals with diff', 'Change history'],
    stretch: ['Multi-agency playbooks', 'Compliance mapping', 'Training mode'],
    components: [
      { name: 'Ingestion & extraction', responsibility: 'Parse reports and plans', tech: 'LLM extraction' },
      { name: 'Playbook store', responsibility: 'Versions and diffs', tech: 'SQLite/Postgres' },
      { name: 'Drill runner', responsibility: 'Simulate drills', tech: 'Serverless jobs + LLM' },
      { name: 'Editor UI', responsibility: 'Review and approve', tech: 'React' },
    ],
    hours: 60, complexity: 'high', demo: 7.4,
    appeal: 'Compelling long-term story; the demo needs careful scripting to land in three minutes.',
    risks: [
      { risk: 'Hard to show value in a three-minute demo', severity: 'medium', mitigation: 'Script one drill that visibly changes the playbook' },
      { risk: 'Source plan documents may be hard to obtain', severity: 'medium', mitigation: 'Use public after-action reports' },
    ],
  },
];
