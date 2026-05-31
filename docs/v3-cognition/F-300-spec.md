# F-300 — Agent Runtime (Cognition Layer foundation)

**Phase:** Cognition Layer — Track A (gates all agentic surfaces)
**Depends on:** F-301 (RAG) for full functionality, but the runtime itself can be built in parallel
**Blocks:** F-Opp-Auto-Analysis, F-Color-Team-Reviews, F-Sentinel (agent-driven), F-Capability-Matching, F-Action-Item-Tracker, F-Universal-Ingestion, F-Daily-News, F-Launchpad (agent surfaces)

---

## Objective

Build the single sandboxed agent runtime service that every agentic surface in GDA Command V3 calls. The runtime exposes a tool registry, executes multi-step agent plans, streams responses, and logs every tool call to an audit table.

This is THE BRAIN. Nothing on the V3 agentic side works without it.

---

## Architecture

**New service:** `gda-agent-v3` — a sibling container to `gda-backend-v3` on the VPS Docker compose stack.

**Stack:**
- Python 3.12
- LangGraph (agent orchestration)
- OpenAI SDK (primary model provider)
- Anthropic SDK (fallback for long-context tasks)
- FastAPI (HTTP surface)
- psycopg (Postgres access to `gda_command_staging`)
- httpx (external API calls)
- Pydantic (tool I/O schemas)

**Why a separate container:** isolates Python runtime, lets us iterate on agent code without touching the backend, gives clean container-level health and trace endpoints, scales independently.

---

## Tool registry (initial set)

All tools are Pydantic-typed inputs/outputs. The agent can call any of these. Every call is logged.

| Tool name | Inputs | Outputs | Backing system |
|---|---|---|---|
| `sam_search` | query, agency?, naics?, set_aside?, posted_after?, limit | SamOpportunity[] (with source_url) | SAM.gov API |
| `usaspending_search` | recipient_uei?, agency?, naics?, posted_after?, limit | UsaSpendingAward[] (with source_url) | USAspending API |
| `federal_register_search` | query?, agencies?, posted_after?, limit | FrNotice[] (with source_url) | Federal Register API |
| `db_query` | sql (READ ONLY — enforced via DB role) | rows | gda_command_staging |
| `rag_search` | query, ou_filter?, doc_type_filter?, top_k=8 | RagChunk[] (chunk, source_doc, grade [A/B/C], source_url) | F-301 pgvector |
| `web_search` | query, top_k=5 | WebResult[] (title, url, snippet) | Perplexity OR Tavily |
| `doctrine_check` | claim_text, context? | DoctrineEvaluation (alignment_score 1-5 per principle, exclusion_triggers[], margin_check, rationale) | F-303 rules engine |
| `decision_memory_lookup` | entity_kind, entity_id?, filters? | AgentDecision[] | F-302 |
| `file_read` | doc_id | doc_text, doc_meta | gda-backend-v3 file store |
| `pwin_score` | opp_id | PwinResult (score 0-100, feature_weights, model_version, confidence) | F-302 |
| `govwin_search` | query, agency? | GovwinResult[] (stub until F-Govwin credentials wired; returns empty + warning) | GovWin IQ |

All tool outputs include explicit source URLs. Tools cannot return uncited data.

---

## HTTP surface

```
POST /agent/run
  body: { task: str, context?: dict, tools_allowed?: str[], model?: str, max_steps?: int }
  response: streamed SSE — plan, tool_call, tool_result, intermediate, final
  fallback: 503 AGENT_TIMEOUT if exceeds max wall time

GET /healthz
  response: { ok: bool, ready: bool, tools: str[], models_available: str[], rag_ready: bool, db_ready: bool }

GET /agent/trace/:run_id
  response: full trace (plan, tool calls, tool results, final output)

POST /agent/cancel/:run_id
  response: 200 ok
```

---

## Audit table

```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  task TEXT NOT NULL,
  context JSONB,
  caller TEXT,                -- which surface called: 'opp-analysis', 'launchpad', 'color-team', etc.
  model TEXT NOT NULL,
  status TEXT NOT NULL,       -- 'running', 'ok', 'timeout', 'error', 'cancelled'
  output TEXT,
  error TEXT,
  step_count INT DEFAULT 0,
  token_usage JSONB           -- {prompt, completion, total, cost_usd}
);

CREATE TABLE agent_tool_calls (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index INT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  latency_ms INT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_runs_caller_started ON agent_runs(caller, started_at DESC);
CREATE INDEX idx_agent_tool_calls_run_step ON agent_tool_calls(run_id, step_index);
```

---

## Acceptance criteria

### Container-level
- [ ] `docker ps` shows `gda-agent-v3` container running on the same `gda-command-v2_gda` network as the backend
- [ ] `curl -s http://<agent-container-ip>:8001/healthz` returns 200 with `ready: true`, `tools: [list of 11]`, `models_available: ['openai:gpt-4o', 'openai:gpt-5', 'anthropic:claude-sonnet-4-6']` (or whichever are configured), `rag_ready: bool`, `db_ready: bool`
- [ ] Container starts cleanly via `docker compose up gda-agent-v3` with no errors in logs after readiness
- [ ] Container survives backend restart (no shared volumes other than `/data` for traces)

### Tool registry
- [ ] All 11 tools registered, callable, type-safe (Pydantic validation on input + output)
- [ ] Each tool returns explicit source URL in every record
- [ ] `db_query` enforces read-only via separate DB role (`gda_agent_ro`) — write attempts return permission error
- [ ] `govwin_search` returns empty list + warning string when credentials not configured (does not crash)
- [ ] Tool registry exposed at `GET /agent/tools` with full schemas

### Agent run lifecycle
- [ ] `POST /agent/run` with `{ task: "List the top 5 SAM opportunities posted in the last 24 hours for agency Army" }` returns a streamed SSE response
- [ ] Stream events include: `plan`, `tool_call`, `tool_result`, `intermediate`, `final`
- [ ] Every tool call writes a row to `agent_tool_calls`
- [ ] Run writes a row to `agent_runs` with status `running` → `ok` (or `timeout`/`error`/`cancelled`)
- [ ] `max_steps` default 12; exceeding returns 200 with partial output + status `max_steps`
- [ ] Wall-time timeout default 30s for analysis tasks (configurable); exceeding returns 503 AGENT_TIMEOUT
- [ ] `POST /agent/cancel/:run_id` cancels a running task and writes status `cancelled`

### Trace
- [ ] `GET /agent/trace/:run_id` returns full trace: plan, every tool call (name, input, output, latency), final output, token usage
- [ ] Trace is human-readable and surfaces in the UI under any agentic result (collapsible "Show reasoning" panel)

### Token + cost tracking
- [ ] Every `agent_runs` row records `{ prompt_tokens, completion_tokens, total_tokens, cost_usd }`
- [ ] `GET /agent/usage/daily?since=...` returns daily cost rollup
- [ ] If `cost_usd > $X` in a 1-hour window, agent returns 429 AGENT_RATE_LIMITED (config threshold)

### Error handling
- [ ] OpenAI 5xx / 429 → exponential backoff with 3 retries, then surface error
- [ ] Tool error does not crash agent — agent decides to retry, switch tools, or surface failure
- [ ] All errors logged with full stack trace to `agent_tool_calls.error` or `agent_runs.error`

### Security
- [ ] OpenAI API key and Anthropic API key read from `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)
- [ ] DB credentials read from `.env` (`AGENT_DB_URL` — points to `gda_agent_ro` read-only role)
- [ ] No secrets in logs (filter middleware)
- [ ] `/healthz` and `/agent/tools` public; `/agent/run`, `/agent/cancel`, `/agent/trace`, `/agent/usage` require backend service token (`AGENT_SERVICE_TOKEN`)

### Integration with gda-backend-v3
- [ ] Backend can call `POST http://gda-agent-v3:8001/agent/run` via internal Docker network
- [ ] Backend's `analyze opportunity` endpoint calls the agent and streams SSE through to the frontend
- [ ] Backend records `agent_run_id` against the opportunity for traceability

### Deployment
- [ ] `docker-compose.prod.yml` updated with `gda-agent-v3` service
- [ ] Service has restart policy `unless-stopped`
- [ ] Service exposes only port 8001 on the internal network; not publicly routed
- [ ] Healthcheck in compose file using `/healthz`
- [ ] Logs go to stdout (picked up by Docker logging)

### Test coverage
- [ ] Unit tests for every tool (mock external APIs)
- [ ] Integration test: agent runs a 3-step task using `sam_search` + `rag_search` + `doctrine_check`, returns coherent output, all tool calls logged
- [ ] Integration test: agent honors `tools_allowed` filter (cannot call disallowed tools)
- [ ] Integration test: timeout returns 503 AGENT_TIMEOUT
- [ ] Integration test: cancel mid-run returns status `cancelled`

---

## Non-negotiables (standing build rules)

- Container-level verification AC — all the curl checks above must pass from inside the Docker network
- Root cause only — no symptom patches, no workarounds
- No degradation — every tool listed must work; "we'll add it later" is not acceptable
- Source link on every data point — tools that don't return source URLs are bugs
- Read-only DB role enforced — no agent path can write to the DB without going through gda-backend-v3

---

## Out of scope (separate F-specs)

- F-301: pgvector + RAG corpus ingest (built in parallel)
- F-302: Decision Memory tables + PWin model (built after F-300 ready)
- F-303: Doctrine rules engine (built in parallel)
- F-Color-Team-Reviews, F-Opp-Auto-Analysis, etc. — surfaces built on top of this runtime

---

## Deliverables

- PR titled `feat(F-300): Agent Runtime service (gda-agent-v3) — LangGraph + tool registry + audit + healthz`
- New service: `services/gda-agent-v3/` with Dockerfile, requirements.txt, src/, tests/
- Migration: `migrations/v3_NNN_agent_runs_and_tool_calls.sql`
- Updated: `docker-compose.prod.yml`, `.env.example`
- Documentation: `services/gda-agent-v3/README.md`

---

## Canonical docs to read before starting

- `GDA_V3_Completion_Plan.md` (this plan)
- `gda-north-star-roadmap.md`
- The 7 CEO docs in workspace (Insight, Strategic Op Plan, Op Doctrine, Vision Transcript, Business Plan Slides + PPTX + DOCX) — for context on what the agent will be analyzing
