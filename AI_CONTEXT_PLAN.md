# AI User-Context Plan (grounding → MCP tools → background summary)

Status: **planned, not started.** Code-grounded via deep review of the redbtn
engine, the Become webapp data layer, and the existing house MCP servers (2026-06-15).

Problem: the AI agent flies blind. `grounding` is currently `{}` at both chat
surfaces (CoachChat from mind + nutrition teasers pass no grounding; the routes
forward exactly what the client sends and do NOT enrich). The data exists; we just
never feed it to the model.

## How the graph can receive context (verified)
- PUSH: webhook body → `state.data.input.*`, injected into prompts. No graph change.
- PULL (tools): Gemini 2.5 Flash = native tool-calling; built-in `fetch_url` tool
  calls REST with a templated `Authorization: Bearer {{state.data.input.userToken}}`
  header (precedent: the `claude-agent` system graph). `fetch_url` does NOT auto-auth
  `become.redbtn.io` (third-party host) → we pass the token explicitly. Safe.
- MCP: supported but worker-global, not per-graph-scoped, heavier. House MCP pattern
  (`~/code/mcp-gateway`, `~/code/mcp-google`) = hand-rolled JSON-RPC over Express, no
  SDK, forwards the caller's Bearer to the app's REST API (zero stored creds).

## Auth/scoping
`verifyAuth(req)` = stateless JWT bearer → `userId`; every read endpoint scopes to it.
For tools/MCP we pass an identity into the run — mint a SHORT-LIVED, read-scoped token
(not the 7-day JWT), since the webhook body lands in run state (Redis ~1h TTL).

## Layer 1 — Server-side grounding (DO FIRST; ~half a day; no graph/infra change)
- New `GET /api/ai/context` that fans out + assembles ONE compact summary from the
  caller's userId: streak (+longest), last workout (name + when), 7-day training
  adherence (from Schedule scheduled vs completed), recent mood trend (7-day avg from
  moodHistory), active program + phase/week, today's nutrition vs goals, identity
  bundle (futureSelf + identityStatement + mission.purpose + dailyAction), recent wins.
- Each AI route (app/api/ai/**) assembles this SERVER-SIDE from the JWT and injects it
  into the graph `context` (stop relying on the client to pass grounding).
- Reuses existing endpoints/logic: /api/progress(?detailed=1), /api/programs/active,
  /api/schedule, /api/nutrition/log + /summary, /api/mind/{identity,mission,vision,wins,
  non-negotiables,progress}. New compute needed: 7-day adherence + 7-day mood avg.
- Result: the coach actually knows the user, today, cheaply, no tool loop.

## Layer 2 — Become MCP server (the tools layer)
- New repo/workspace `become-mcp`, mirror `mcp-gateway` house style: hand-rolled
  JSON-RPC (`POST /mcp/message` + `/mcp` alias + `GET /mcp/sse` keepalive + `/mcp/health`),
  TypeScript/CommonJS/tsc, two-stage `node:20-alpine` Dockerfile, deploy as a RedRun
  workspace (`/deploy`). ENV: `BECOME_API_URL` (https://become.redbtn.io), `PORT`.
- AUTH: read `params._meta.credentials.headers.Authorization`, forward UNCHANGED to
  `become.redbtn.io/api/*`; Become's `verifyAuth` does the scoping (copy `getAuthHeader`
  from mcp-gateway/src/namespaces/redbtn/shared.ts).
- Tools (read first): `become_get_progress`, `become_get_workouts`, `become_get_nutrition`,
  `become_get_mind_state`, `become_get_context` (wraps Layer 1). Then writes:
  `become_log_weight`, `become_log_mood`, `become_log_win`.
- Graph wiring: attach tools to the Gemini neuron (`toolStrategy:"native"`) OR use
  `fetch_url` steps for fixed pulls. Reusable by any MCP client, not just this graph.

## Layer 3 — The "unseen AI layer" (future, background summarization)
- Scheduled background runs summarize each user's raw history into a compact
  `UserAIContext` doc (stored per user). Layer 1 then serves that CACHED summary instead
  of recomputing → keeps context windows tight + cheap. Same endpoints/MCP tools as substrate.

## Recommended sequence
Layer 1 now (immediate unblock, Become-only), then Layer 2 (MCP server, the durable
tools layer George wants), then Layer 3 when summarization is worth it. Layers are
complementary: push a cheap baseline every call (L1), pull details on demand (L2),
cache summaries to stay tight (L3). Apply [[project_ai_slop_overhaul]] voice; coordinate
with [[project_become_ai_graph]] (pass userToken in the webhook body for L2/L3).
