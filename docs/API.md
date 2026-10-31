# HACKMIND REST API (all JSON unless noted; types in `shared/types.ts`)

Base path `/api`. Errors: `{ "error": string, "details"?: unknown }` with 4xx/5xx.

| Method & path | Body | Returns |
|---|---|---|
| GET `/status` | – | `SystemStatus` |
| GET `/workspaces` | – | `WorkspaceSummary[]` |
| POST `/workspaces` | `CreateWorkspaceInput` (`demo:true` loads bundled sample hackathon) | `WorkspaceBundle` (201) |
| GET `/workspaces/:id` | – | `WorkspaceBundle` |
| PATCH `/workspaces/:id` | `{ name?, config?: Partial<WorkspaceConfig>, manualText? }` | `Workspace` |
| DELETE `/workspaces/:id` | – | 204 |
| POST `/workspaces/:id/run` | `{ stage: StageName \| 'full', wait?: boolean }` | `Job` (202; 200 when `wait`) |
| GET `/workspaces/:id/jobs` | – | `Job[]` (newest first) |
| GET `/workspaces/:id/events?after=<eventId>&limit=200` | – | `AgentEvent[]` oldest→newest |
| GET `/workspaces/:id/events/stream` | – | SSE: `event: agent` (AgentEvent), `event: job` (Job) |
| PUT `/workspaces/:id/intel/:field` | `{ value }` (user override → status `verified`, note "Entered by user") | `Workspace` |
| GET `/workspaces/:id/sources` | – | `Source[]` |
| POST `/workspaces/:id/sources` | `{ url? , title?, text? }` (URL is fetched with SSRF guard; or pasted text) | `Source` (201) |
| GET `/workspaces/:id/ideas/:ideaId` | – | `IdeaDetailBundle` |
| PATCH `/workspaces/:id/ideas/:ideaId` | `{ status?: 'shortlisted' \| 'eliminated' \| 'generated' }` | `Idea` |
| POST `/workspaces/:id/ideas/:ideaId/validate` | – | `Job` (202) deep-validate one idea |
| POST `/workspaces/:id/ideas/:ideaId/recommend` | – | `Workspace` (sets `recommendedIdeaId`) |
| GET `/workspaces/:id/ideas/:ideaId/judge` | – | `JudgeSession[]` |
| POST `/workspaces/:id/ideas/:ideaId/judge` | `{ personas?: JudgePersona[], maxFollowUps?: 0..3 }` | `JudgeSession` (201) with one opening question per persona |
| GET `/workspaces/:id/judge/:sessionId` | – | `JudgeSession` |
| POST `/workspaces/:id/judge/:sessionId/answer` | `{ turnId, answer }` | `JudgeSession` (turn evaluated; follow-up turn appended if asked) |
| POST `/workspaces/:id/judge/:sessionId/finish` | – | `JudgeSession` (with `report`) |
| POST `/workspaces/:id/ideas/:ideaId/blueprint` | `{ hours?, teamSize? }` | `Blueprint` (201) |
| GET `/workspaces/:id/ideas/:ideaId/blueprint` | – | `Blueprint` or 404 |
| GET `/workspaces/:id/ideas/:ideaId/blueprint.md` | – | `text/markdown` download |

Pipeline order: `intel → sponsors → opportunities → ideas → evolve → validate`.
Each stage marks `workspace.stages[stage]` (`idle|running|done|failed|stale`). Re-running an earlier stage marks later ones `stale`.
Events are emitted by named agents (e.g. "Intel Analyst", "Competitive Analyst") and drive the Agent Activity feed.
