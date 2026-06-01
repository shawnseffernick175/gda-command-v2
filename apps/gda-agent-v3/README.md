# gda-agent-v3

Sandboxed agent runtime service for GDA Command V3 — the "brain" that every agentic surface calls.

## Stack

- Python 3.12
- FastAPI (HTTP surface)
- LangGraph (agent orchestration)
- OpenAI SDK + Anthropic SDK (model providers)
- psycopg (Postgres — `gda_command_staging`)
- httpx (external API calls)
- Pydantic (tool I/O schemas)

## Architecture

`gda-agent-v3` runs as a sibling container to `gda-backend-v3` on the same Docker network (`gda`). The backend calls `POST http://gda-agent-v3:8001/agent/run` to execute agent tasks and streams SSE responses through to the frontend.

## HTTP Surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | Public | Health + readiness check |
| GET | `/agent/tools` | Public | Tool registry with full Pydantic schemas |
| POST | `/agent/run` | `AGENT_SERVICE_TOKEN` | Execute agent task (SSE stream) |
| GET | `/agent/trace/{run_id}` | `AGENT_SERVICE_TOKEN` | Full run trace |
| POST | `/agent/cancel/{run_id}` | `AGENT_SERVICE_TOKEN` | Cancel running task |
| GET | `/agent/usage/daily` | `AGENT_SERVICE_TOKEN` | Daily cost rollup |

## Tool Registry (12 tools)

| Tool | Backing System | Status |
|------|---------------|--------|
| `sam_search` | SAM.gov API | Live |
| `usaspending_search` | USAspending API | Live |
| `federal_register_search` | Federal Register API | Live |
| `db_query` | gda_command_staging (read-only) | Live |
| `rag_search` | pgvector (F-301) | Stub |
| `web_search` | Perplexity / Tavily | Live (when configured) |
| `doctrine_check` | F-303 rules engine | Stub |
| `decision_memory_lookup` | F-302 decision memory | Stub |
| `file_read` | gda-backend-v3 file store | Live |
| `pwin_score` | F-302 PWin model | Stub |
| `govwin_search` | GovWin IQ | Stub (no crash) |
| `govtribe_search` | GovTribe MCP (F-323) | Live (credit-budgeted) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (fallback) |
| `AGENT_DB_URL` | Yes | Postgres connection for audit writes |
| `AGENT_DB_RO_URL` | Yes | Read-only Postgres connection (gda_agent_ro role) for db_query tool |
| `AGENT_SERVICE_TOKEN` | Yes (prod) | Auth token for protected endpoints |
| `SAM_GOV_API_KEY` | No | SAM.gov API key |
| `PERPLEXITY_API_KEY` | No | Perplexity API key |
| `TAVILY_API_KEY` | No | Tavily API key |
| `BACKEND_V3_URL` | No | Backend URL (default: `http://gda-backend-v3:4000`) |
| `AGENT_DEFAULT_MODEL` | No | Default model (default: `openai:gpt-4o`) |
| `AGENT_MAX_STEPS` | No | Max steps per run (default: 12) |
| `AGENT_WALL_TIMEOUT_S` | No | Wall timeout seconds (default: 30) |
| `AGENT_HOURLY_COST_LIMIT_USD` | No | Hourly cost limit (default: $5) |

## Development

```bash
cd apps/gda-agent-v3
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

## Docker

```bash
docker compose -f docker-compose.prod.yml up gda-agent-v3
```
