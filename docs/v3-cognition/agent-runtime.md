# F-300 Agent Runtime — Tool Registry & Architecture

**Status:** Deployed (F-315b)
**Container:** `gda-agent-v3` (Python/FastAPI, port 8001 internal)
**Proxy:** `gda-backend-v3` forwards `/v3/agent/*` → `gda-agent-v3:8001/*`

## Architecture

```
Browser ──JWT──▶ backend-v3:4000/v3/agent/* ──service-token──▶ gda-agent-v3:8001/*
```

- **JWT validation** happens at the backend layer (Fastify `authHook`). No public access to agent-v3.
- **Service-token auth** (`AGENT_SERVICE_TOKEN`) secures the internal link between backend-v3 and agent-v3.
- **Trace IDs** flow end-to-end via `X-GDA-Trace-Id` header (backend `requestId` → agent runtime).

## Endpoints (via backend proxy)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v3/agent/healthz` | Aggregate health — fans out to agent-v3 `/healthz` |
| `GET` | `/v3/agent/tools` | List registered tools with schemas |
| `POST` | `/v3/agent/run` | Start agent run (SSE stream) |
| `GET` | `/v3/agent/trace/:run_id` | Retrieve full trace for a completed run |
| `POST` | `/v3/agent/cancel/:run_id` | Cancel an in-progress run |

## Tool Registry (12 tools)

| # | Tool | Description | Credit burn |
|---|------|-------------|-------------|
| 1 | `sam_search` | Search SAM.gov for federal contract opportunities | Free (public API) |
| 2 | `usaspending_search` | Search USAspending.gov for federal awards and contracts | Free (public API) |
| 3 | `federal_register_search` | Search Federal Register for regulatory notices and rules | Free (public API) |
| 4 | `db_query` | Execute read-only SQL against the GDA Command database | None (local) |
| 5 | `rag_search` | Search the RAG knowledge base (pgvector) for relevant documents | None (local) |
| 6 | `web_search` | Search the web via Perplexity or Tavily for current information | Per-query (Perplexity/Tavily) |
| 7 | `doctrine_check` | Evaluate a claim against GDA enterprise doctrine principles | LLM call |
| 8 | `decision_memory_lookup` | Look up past agent decisions from decision memory (F-302) | None (local) |
| 9 | `file_read` | Read a document from the GDA Command file store | None (local) |
| 10 | `pwin_score` | Get probability-of-win score for an opportunity (F-302 model) | LLM call |
| 11 | `govwin_search` | Search GovWin IQ for government contract intelligence | GovWin API credit |
| 12 | `govtribe_search` | Search GovTribe for federal contract opportunities (MCP-backed, credit-budgeted) | GovTribe MCP credit (3 per 10 results) |

### Credit-burn annotations

- **Free/Local**: `sam_search`, `usaspending_search`, `federal_register_search`, `db_query`, `rag_search`, `decision_memory_lookup`, `file_read` — zero external cost.
- **LLM**: `doctrine_check`, `pwin_score` — consume LLM tokens (OpenAI/Anthropic). Cost tracked via `AGENT_HOURLY_COST_LIMIT_USD` (default $5/hr).
- **API credits**: `web_search` (Perplexity/Tavily per-query), `govwin_search` (GovWin IQ API), `govtribe_search` (GovTribe MCP — 3 credits per 10 results, 150/cycle cap, 1200/month cap).

## Tool Schemas

Each tool exposes typed input/output via Pydantic models. Use `GET /v3/agent/tools` to retrieve the full JSON Schema for all tools at runtime.

### sam_search

```
Input:  { query, agency?, naics?, set_aside?, posted_after?, limit(1-100) }
Output: { results: [{ notice_id, title, agency, posted_date, response_deadline?, naics_code?, set_aside?, description?, source_url }] }
```

### usaspending_search

```
Input:  { recipient_uei?, agency?, naics?, posted_after?, limit(1-100) }
Output: { results: [{ award_id, recipient_name, agency, award_amount, start_date, naics_code?, description?, source_url }] }
```

### federal_register_search

```
Input:  { query?, agencies?, posted_after?, limit(1-50) }
Output: { results: [{ document_number, title, agencies, publication_date, document_type, abstract?, source_url }] }
```

### db_query

```
Input:  { sql (READ ONLY — enforced via DB role) }
Output: { rows: [...], row_count }
```

### rag_search

```
Input:  { query, ou_filter?, doc_type_filter?, top_k(1-50) }
Output: { results: [{ chunk, source_doc, grade(A/B/C), source_url }] }
```

### web_search

```
Input:  { query, top_k(1-20) }
Output: { results: [{ title, url, snippet }] }
```

### doctrine_check

```
Input:  { claim_text, context? }
Output: { evaluation: { alignment_score_by_principle, exclusion_triggers, margin_check?, rationale, source_url } }
```

### decision_memory_lookup

```
Input:  { entity_kind, entity_id?, filters? }
Output: { results: [{ decision_id, entity_kind, entity_id, decision, rationale, created_at, source_url }] }
```

### file_read

```
Input:  { doc_id }
Output: { doc_text, doc_meta, source_url }
```

### pwin_score

```
Input:  { opp_id }
Output: { result: { score(0-100), feature_weights, model_version, confidence, source_url } }
```

### govwin_search

```
Input:  { query, agency? }
Output: { results: [{ title, agency, status, source_url }], warning? }
```

### govtribe_search

```
Input:  { query, agency?, naics?, posted_within?(e.g. '7d','30d'), max_results(1-100, default 25) }
Output: { results: [{ title, agency?, posted_at?, response_due_at?, notice_id, govtribe_url, estimated_value?, set_aside? }], decision?, credits_used, from_cache, warning? }
```

**Credit accounting:** Calls backend `POST /v3/govtribe/search` (not GovTribe directly). Backend enforces cycle cap (150/cycle) and monthly cap (1200/month) via `govtribe_credit_ledger`. Ledger entries include `caller='agent-v3'` for attribution. If caps are hit, returns `decision='skipped_cycle_cap'` or `'skipped_halted'` with cached data (if available).

## Configuration (Environment Variables)

| Variable | Service | Description |
|----------|---------|-------------|
| `AGENT_V3_URL` | backend-v3 | Internal URL to agent-v3 (default: `http://gda-agent-v3:8001`) |
| `AGENT_SERVICE_TOKEN` | both | Shared token for backend→agent auth |
| `OPENAI_API_KEY` | agent-v3 | OpenAI API key for LLM tools |
| `ANTHROPIC_API_KEY` | agent-v3 | Anthropic API key for LLM tools |
| `AGENT_DB_URL` | agent-v3 | Database connection (read-write for agent tables) |
| `AGENT_DB_RO_URL` | agent-v3 | Read-only database connection for `db_query` tool |
| `SAM_GOV_API_KEY` | agent-v3 | SAM.gov API key |
| `PERPLEXITY_API_KEY` | agent-v3 | Perplexity API key for `web_search` |
| `TAVILY_API_KEY` | agent-v3 | Tavily API key for `web_search` fallback |
| `AGENT_DEFAULT_MODEL` | agent-v3 | Default LLM model (default: `openai:gpt-4o`) |
| `AGENT_MAX_STEPS` | agent-v3 | Max agent steps per run (default: 12) |
| `AGENT_WALL_TIMEOUT_S` | agent-v3 | Wall-clock timeout per run in seconds (default: 30) |
| `AGENT_HOURLY_COST_LIMIT_USD` | agent-v3 | Hourly cost limit in USD (default: $5) |
| `BACKEND_V3_URL` | agent-v3 | Internal URL to backend-v3 (default: `http://gda-backend-v3:4000`). Used by `govtribe_search` tool. |

## Docker Compose

The `gda-agent-v3` service is defined in `docker-compose.prod.yml`:

- **Image:** Built from `apps/gda-agent-v3/Dockerfile`
- **Port:** 8001 (internal only, not exposed externally)
- **Network:** `gda` (Docker bridge)
- **Depends on:** `postgres-staging` (healthy)
- **Healthcheck:** `curl -f localhost:8001/healthz` every 15s
- **Restart:** `unless-stopped`

## Dependency Pinning

`apps/gda-agent-v3/requirements.txt` must pin **all** langgraph ecosystem packages
to exact versions. The Dockerfile runs `pip install --no-cache-dir -r requirements.txt`
with no constraints file, so any unpinned transitive dep resolves to latest on every
rebuild — which can silently break the runtime when upstream packages drop or rename
internal modules.

**Pinned packages (F-317, 2026-06-01):**

| Package | Pinned | Why |
|---------|--------|-----|
| `langgraph` | `==0.4.7` | Core graph runtime |
| `langgraph-prebuilt` | `==0.2.3` | Last version compatible with langgraph 0.4.7 (`ToolNode`, `create_react_agent`). Versions ≥0.5.0 require `langgraph._internal` which only exists in langgraph ≥0.6.x. |
| `langgraph-checkpoint` | `==4.1.1` | Checkpoint serialization layer |
| `langgraph-sdk` | `==0.3.15` | SDK client utilities |
| `langchain-core` | `==0.3.86` | Shared LangChain message/tool types |

**Say-something principle:** `/healthz` now includes `langgraph` and `langgraph_prebuilt`
version strings so drift is visible in monitoring before it becomes a user-facing crash.

## Deploy

The `scripts/deploy-prod.sh` auto-deploy script builds and restarts `gda-agent-v3` alongside `backend-v3` and `frontend-v3` on every merge to `main`. The deploy workflow (`.github/workflows/deploy-prod.yml`) triggers after CI passes.
