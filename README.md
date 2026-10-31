# HACKMIND — Hackathon Intelligence & Preparation Platform

HACKMIND walks a hackathon team through the whole journey:
**Registration → Intelligence → Sponsor research → Opportunity discovery → Idea generation → Evolution → Validation → Judge simulation → Execution blueprint.**

Every fact is labelled *verified* (traceable to a source or typed by you), *assumed*, or *unavailable*. Nothing is invented: when research cannot be fetched, the UI says so and the lists stay empty.

## Quick start

Requires Node ≥ 20 (developed on Node 24).

```bash
npm install
cp .env.example .env        # optional — everything works without keys
npm run dev                 # API on :8787, web UI on http://localhost:5173
```

Production build:

```bash
npm run build
npm start                   # serves API + UI on http://127.0.0.1:8787
```

Then open the app and click **“Try the demo workspace”** → **Run full pipeline**.

## Modes and credentials

| Capability | No keys (demo / heuristic) | With keys |
|---|---|---|
| Engine | Deterministic **heuristic engine** (rule-based; templated ideas, keyword-based claim checks and judge scoring) | **Claude agents** with `ANTHROPIC_API_KEY` (model via `HACKMIND_MODEL`, default `claude-sonnet-5-5`) |
| Demo workspace | Fully works offline: *fictional* hackathon + sponsors bundled as fixtures (clearly labelled “Sample data”) | Same fixtures, analysed by the LLM |
| Hackathon URL / sponsor pages | Direct fetch (SSRF-guarded) — works without a key | same |
| Web search | Keyless DuckDuckGo HTML scraping (best-effort, may be blocked) | `TAVILY_API_KEY` or `BRAVE_API_KEY` |
| Papers / repos | arXiv API and GitHub search (public, no key) | `GITHUB_TOKEN` raises the GitHub rate limit |

The top-right badge and the Dashboard “Environment” card show what is active. The heuristic engine is honest but shallow — it is not a substitute for the LLM engine on a real hackathon.

> **Not verified here:** the Claude-backed engine and live web providers (Tavily/Brave/DuckDuckGo/arXiv/GitHub) were implemented and unit-tested with fakes, but were **not exercised against the real services** during development (no API key available to the build). See *Known limitations*.

## Product tour

* **Overview** – pipeline stepper (six stages), run/re-run per stage or the whole pipeline, live **agent activity** feed (SSE), config (idea counts, rounds, team size), manual notes.
* **Intelligence** – objectives, themes, problem statements, judging criteria (weights), requirements, restrictions, mandatory tech, dates, organisers, sponsors — each with a status badge and source chips; inline edit (user values become “Entered by user” and survive re-runs). Shows how judging criteria translate into scoring weights.
* **Sponsors** – products, APIs, tools, docs, news, integration opportunities with honest depth rating (deep / moderate / superficial) and an explicit “could not be found” list.
* **Opportunities** – problem areas with competitors, open-source repos, papers and gaps.
* **Ideas** – ~20 ideas in *Safe / Innovative / Moonshot* tiers; board and sortable ranking table; compare 2–4 ideas (radar + matrix + “why the leader leads”).
* **Idea detail** – overview, **transparent scoring** (weights, contributions, rationale, confidence, evidence caps), **evolution** timeline (critiques, diffs, score deltas), **evidence workspace** (claims with verification status, evidence by category, assumptions, source inspector).
* **Judge Arena** – six judge personas, contextual opening questions, answer evaluation across 7 dimensions, reactive follow-ups, final report with weak areas and a preparation plan.
* **Blueprint** – pitch, evidence, architecture, stack, DB + API design, MVP, milestones scaled to the hackathon duration (Gantt), team roles, demo storyline, slide outline, judge Q&A; Markdown download/copy/print.

## Architecture

```
React 19 + Vite + Tailwind 4  ──/api──►  Express 4 (TypeScript, zod-validated)
                                          │
                  ┌───────────────────────┼─────────────────────────┐
             Job runner              Engine (interface)          Research (interface)
        (stages, SSE events)     LlmEngine │ HeuristicEngine   LiveResearch │ DemoResearch
                  │                                              fetch(SSRF guard), Tavily,
             SQLite (better-sqlite3, JSON documents per workspace)  Brave, DDG, arXiv, GitHub
```

* `shared/` – domain types and the **scoring maths** (weights from official criteria, evidence-based caps, timeline phases) used by server and client.
* `server/pipeline/` – the six stages + runner. Same code path for demo and live mode; only the Research/Engine implementations differ.
* `server/agents/` – `Engine` interface; `llm-engine.ts` (specialist prompts, lenient zod schemas, source-id filtering, quote verification) and `heuristic/` (offline).
* Data lives in `./data/hackmind.db` (`HACKMIND_DATA_DIR`).

### Agent architecture (LLM engine)

| Agent | Responsibility |
|---|---|
| Intel Analyst | Extract hackathon facts with verbatim quotes; the pipeline verifies each quote against the fetched text → *verified* or *assumed* |
| Sponsor Analyst | Profile products/APIs/docs/news; propose technically justified integrations; list gaps |
| Opportunity Researcher | Turn search/repo/paper results into opportunities (URLs only from retrieved results) |
| Safe-Winner Strategist / Innovation Agent / Moonshot Architect | Generate ideas per tier (batched, de-duplicated) |
| Judging Evaluator | Score ideas on 7 criteria with rationale and confidence |
| Critics: Competitive Analyst, Feasibility Engineer, Sponsor Alignment, Skeptic, Product Viability | Challenge each shortlisted idea |
| Idea Evolver | Revise the *same* idea from critiques; every change is stored as a before/after diff with reasons |
| Validation Lead / Claim Auditor | Extract claims, verify against retrieved sources (quotes must be verbatim), cap scores when evidence contradicts |
| Six judge personas | Contextual questions, answer evaluation, follow-ups, report |
| Blueprint Architect | Assemble the execution document (timeline computed in code) |

### Scoring (transparent by design)

Seven criteria: alignment, innovation, sponsor integration, feasibility, impact, differentiation, demo. Weights are derived from the hackathon’s official judging criteria when found (`shared/scoring.ts`), otherwise balanced defaults — and the basis is shown. Totals are recomputed from visible per-criterion scores. After deep validation, contradicted claims **cap** specific criteria (listed in the “adjustments” panel); unverified high-importance claims lower *confidence*. Scores are explicitly **not** predictions of winning.

## Testing

```bash
npm test              # vitest: unit, API, integration, journey, client component tests
npm run typecheck     # tsc for client and server
npm run lint          # eslint
npm run build         # typecheck + vite build + esbuild server bundle
npm run audit:prod    # npm audit for runtime dependencies
```

Key suites: `tests/journey.test.ts` (complete demo journey over HTTP), `tests/manual-workspace.test.ts` (no-network behaviour: nothing fabricated), `tests/security.test.ts` (SSRF, validation, headers), `tests/scoring.test.ts`, `tests/llm-engine.test.ts`, `tests/client/*`.

## Security notes

* Server binds to `127.0.0.1`; no auth (single-user local tool). Put it behind an authenticating proxy before exposing it.
* All user-supplied URLs go through an SSRF guard: http(s) only, no credentials, DNS-resolved addresses must be public, every redirect re-validated, size/time/content-type limits. (Residual risk: DNS rebinding between check and connect.) `HACKMIND_ALLOW_PRIVATE_FETCH=1` disables the guard for local testing only.
* Request bodies validated with zod; ids are pattern-checked; helmet headers; rate limits; JSON body ≤ 300 kB.
* Fetched web content is untrusted: it is wrapped in `<untrusted_source>` tags for the LLM, which has no tools, so prompt injection can at worst skew text output. Quotes/sources the model returns are verified against retrieved text; unknown source ids/URLs are dropped.
* The client renders AI/web text as text or sanitised Markdown (no raw HTML).
* `npm audit --omit=dev`: 0 vulnerabilities. (Dev-only advisory in the ESLint toolchain’s `minimatch`, not shipped.)
* API keys are read server-side from the environment and never sent to the browser.

## Known limitations

* LLM engine and live search providers are untested against real services (see above); prompts may need tuning.
* Heuristic engine output is templated; its claim verification is keyword-based (never marks non-sponsor claims fully *verified*) and its judge scoring measures specificity/evidence markers, not correctness.
* DuckDuckGo scraping can be blocked; configure Tavily or Brave for reliable search.
* Hackathon pages that render content with client-side JavaScript (some Devpost/Luma pages) may yield little text; paste details into the manual notes instead.
* No authentication/multi-user support; single in-process job per workspace; jobs interrupted by a restart are marked failed.
* No blueprint un-recommend/abandon-session endpoints; ideas restored from “eliminated” return to *generated*.
* Browser end-to-end tests (Playwright) are not included; the UI was verified manually in a browser and by component tests with mocked APIs.
