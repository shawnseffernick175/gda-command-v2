# GDA Command — Agentic AI Architecture Specification

**Version:** 1.0
**Author:** GDA Engineering
**Status:** Phase 1 Shipped / Phase 2 Spec Only
**Last Updated:** 2026-05-18

---

## Executive Summary

GDA Command integrates AI capabilities in two phases:
- **Phase 1 (Shipped):** Deterministic AI features — opportunity summarization, bid/no-bid recommendation, and a centralized LLM gateway with classification enforcement and call logging.
- **Phase 2 (Spec):** Autonomous agent loop with multi-agent topology, tool use, and human-in-the-loop gates.

All AI interactions flow through a single **LLM Gateway** (`packages/backend/src/services/llmGateway.ts`) that enforces classification boundaries, prepends organization context, and logs every call.

---

## Phase 1 — Deterministic AI (Shipped)

### 1.1 LLM Gateway

**Path:** `packages/backend/src/services/llmGateway.ts`

The gateway is the single entry point for all LLM calls. No route or service may call OpenAI/Anthropic directly — all calls go through `gatewayCall()`.

**Features:**
- **Dual-provider support:** OpenAI GPT-4o ("fast") and Anthropic Claude Sonnet ("deep") with automatic fallback
- **Classification gate:** CUI, ITAR, and SECRET content is hard-blocked from public providers. The gate checks `data_classification` on each opportunity and refuses to send restricted content to public endpoints.
- **Organizations context injection:** Every prompt is prepended with a context block constructed from `company_entity` rows (W4), making all AI features merger-aware.
- **Call logging:** Every request/response is logged to `llm_call_log` with prompt hash, model, latency, cost estimate, and classification check result.
- **Cost estimation:** Tracks input/output tokens and estimates USD cost per call.

**Environment variables:**
| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Public fast-tier LLM |
| `ANTHROPIC_API_KEY` | Public deep-tier LLM |
| `LLM_PROVIDER` | `"public"` (default) or `"restricted"` |
| `LLM_PROVIDER_RESTRICTED` | On-prem endpoint for CUI/ITAR content (Phase 2) |

### 1.2 Opportunity Summarizer

**Endpoint:** `POST /api/ai/summarize/:id`

Generates a 3-bullet executive summary + "why this matters for NewCo" sentence. Persists to `opportunities.ai_summary` and `ai_summary_generated_at`.

**Prompt design:** System prompt enforces exact bullet format. User prompt includes title, agency, NAICS, set-aside, value, due date, description (truncated to 2000 chars), incumbent, stage, and Pwin. Organizations context is automatically prepended.

### 1.3 Bid/No-Bid Recommender

**Endpoint:** `POST /api/ai/recommend/:id`

Returns a structured JSON recommendation:
```json
{
  "recommendation": "bid" | "no_bid" | "watch",
  "confidence": 0.0-1.0,
  "reasons": ["..."],
  "gaps": ["..."],
  "conditions": ["..."]
}
```

**Data sources pulled:**
1. Opportunity row (title, agency, NAICS, value, stage, Pwin, etc.)
2. Entity capabilities from `company_entity` (NAICS alignment, set-aside eligibility)
3. Discipline config (manager load caps, coverage targets)
4. *(Phase 2: similar past performance via pgvector)*

Persists to `opportunities.ai_recommendation` (JSONB) with timestamp and model version.

### 1.4 Call Log

**Table:** `llm_call_log`

| Column | Type | Purpose |
|---|---|---|
| `call_id` | UUID PK | Unique call identifier |
| `called_at` | TIMESTAMPTZ | When the call was made |
| `purpose` | TEXT | `summarize_opp`, `recommend_bid`, `impact_narrative`, etc. |
| `provider` | TEXT | `openai`, `anthropic`, `blocked` |
| `model` | TEXT | Exact model name used |
| `classification` | TEXT | Data classification of the input |
| `prompt_hash` | TEXT | SHA-256 prefix of prompt content |
| `input_tokens` | INTEGER | Tokens sent |
| `output_tokens` | INTEGER | Tokens received |
| `latency_ms` | INTEGER | End-to-end latency |
| `cost_usd_est` | NUMERIC(8,4) | Estimated cost |
| `status` | TEXT | `ok`, `blocked_classification`, `error`, `rate_limited` |
| `error_text` | TEXT | Error message if failed |
| `record_table` | TEXT | Source table (e.g., `opportunities`) |
| `record_id` | TEXT | Source row ID |

**Admin endpoint:** `GET /api/ai/call-log?limit=50&purpose=summarize_opp`

### 1.5 Classification Enforcement

The gateway enforces a hard boundary:

```
unclassified, fouo → public providers (OpenAI, Anthropic)
cui, itar, secret  → BLOCKED from public providers
                      → routed to LLM_PROVIDER_RESTRICTED (Phase 2)
```

Every blocked call is still logged with `status = 'blocked_classification'` for audit purposes. A CUI-classified document will **never** appear in `llm_call_log` against a public provider with `status = 'ok'`.

---

## Phase 2 — Autonomous Agent Architecture (Spec)

### 2.1 Agent Loop Architecture

The agent follows an **OODA loop** (Observe → Orient → Decide → Act → Reflect):

```
┌─────────────┐
│  PERCEPTION  │ ← New opportunity ingested, source documents changed,
│              │   user request, scheduled trigger
└──────┬──────┘
       │
┌──────▼──────┐
│   PLANNING   │ ← Agent selects tools and builds execution plan
│              │   based on task type and available data
└──────┬──────┘
       │
┌──────▼──────┐
│   ACTION     │ ← Execute tool calls (search PP, score fit, draft section)
│              │   Each action is logged and bounded by cost/latency budget
└──────┬──────┘
       │
┌──────▼──────┐
│ REFLECTION   │ ← Compare output to expected quality, self-correct,
│              │   update confidence scores, persist learning
└─────────────┘
```

### 2.2 Tool Catalog

The agent can call these tools (each mapped to an API endpoint or internal function):

| Tool | Description | Write? | Approval Required? |
|---|---|---|---|
| `search_past_performance` | pgvector similarity search against PP narratives | No | No |
| `lookup_boe` | Retrieve BOE data for cost estimation | No | No |
| `score_fit` | Run fit scoring against each entity | No | No |
| `draft_section` | Generate a proposal section draft | Yes | Yes (high-impact) |
| `schedule_color_team` | Create a color-team review entry | Yes | Yes |
| `update_capture_stage` | Advance Shipley phase | Yes | Yes |
| `search_opportunities` | Query opportunities by filters | No | No |
| `analyze_incumbent` | Research incumbent strengths/weaknesses | No | No |
| `generate_summary` | Create executive summary | Yes | No |
| `recommend_bid` | Generate bid/no-bid recommendation | Yes | No |

### 2.3 Human-in-the-Loop Gates

**No autonomous external action.** All writes require approval for high-impact changes:

| Impact Level | Examples | Gate |
|---|---|---|
| **Low** | Generate summary, score fit | Auto-approve, log only |
| **Medium** | Update Pwin, generate recommendation | Auto-approve with notification |
| **High** | Advance phase, schedule color team, draft section | Require explicit user approval |
| **Critical** | Submit proposal, change entity assignment | Require admin approval + audit trail |

### 2.4 Memory Layers

| Layer | Storage | TTL | Purpose |
|---|---|---|---|
| **Short-term** | In-memory (per session) | Session lifetime | Current conversation context, recent tool results |
| **Long-term agent** | pgvector embeddings | Persistent | Learned patterns, successful strategies, common gaps |
| **Organizational** | PostgreSQL data model | Persistent | The data model itself: opportunities, entities, PP, BOEs |
| **Call history** | `llm_call_log` | Persistent | Every AI interaction for audit, cost tracking, and prompt regression |

### 2.5 Multi-Agent Topology

**Recommended: Start single-agent, evolve to multi-agent.**

Phase 2A (Single Agent):
```
┌───────────────────┐
│  Capture Agent     │ ← Handles all tasks: summarize, recommend,
│  (Orchestrator)    │   score, draft, schedule
└───────────────────┘
```

Phase 2B (Multi-Agent):
```
┌─────────────────┐     ┌─────────────────┐
│  Capture Agent   │     │  Pricing Agent   │
│  (strategy,      │     │  (BOE, rates,    │
│   fit, pipeline) │     │   competitiveness)│
└────────┬────────┘     └────────┬────────┘
         │                       │
    ┌────▼───────────────────────▼────┐
    │         Orchestrator             │
    │  (task routing, conflict         │
    │   resolution, human gates)       │
    └────┬───────────────────────┬────┘
         │                       │
┌────────▼────────┐     ┌───────▼─────────┐
│ Compliance Agent │     │ Proposal Agent   │
│ (FAR/DFARS,      │     │ (section drafting,│
│  CMMC, CUI gate) │     │  color reviews)   │
└─────────────────┘     └─────────────────┘
```

### 2.6 Eval Framework

**Golden set:** Historical opportunities with known outcomes (won/lost/no-bid). Minimum 50 opportunities with documented decision rationale.

| Metric | Target | Measurement |
|---|---|---|
| Recommendation accuracy | >70% agreement with historical decisions | Compare `ai_recommendation.recommendation` vs actual `status` |
| Pwin calibration | ±15% of actual win rate per bucket | Group by Pwin decile, compare predicted vs actual |
| Summary quality | >4/5 user rating | Manual review of 20 random summaries per month |
| Latency (summarize) | <5s p95 | Measured from `llm_call_log.latency_ms` |
| Latency (recommend) | <8s p95 | Measured from `llm_call_log.latency_ms` |
| Cost per call | <$0.05 (fast) / <$0.10 (deep) | Measured from `llm_call_log.cost_usd_est` |

**Regression testing:** When prompts change, re-run the golden set and compare win/loss accuracy before deploying.

### 2.7 Cost / Latency Budgets

| Action | Max Latency | Max Cost | Token Budget |
|---|---|---|---|
| Summarize opportunity | 5s | $0.03 | 512 output |
| Bid/no-bid recommend | 8s | $0.05 | 1024 output |
| Draft proposal section | 30s | $0.15 | 4096 output |
| Fit scoring (per entity) | 3s | $0.02 | 256 output |
| RAG search + answer | 10s | $0.05 | 1024 output |

Monthly budget cap: $500 (configurable in `capture_discipline_config`).

### 2.8 Classification + ITAR Boundary Enforcement

The classification gate operates at the **gateway layer** (Phase 1, already shipped):

```
Request → Gateway → Classification Check → ┬─ PASS → LLM Provider → Response
                                            │
                                            └─ BLOCK → Log + Error Response
```

In Phase 2, the agent layer adds a second boundary:
- Before constructing any prompt, the agent checks `data_classification` on all input documents.
- If any input is CUI/ITAR, the agent routes to `LLM_PROVIDER_RESTRICTED` (on-prem) or blocks entirely if no restricted provider is configured.
- The n8n workflow layer enforces the same gate using the existing v2 pattern (check classification before any external API call).

### 2.9 Rollout Plan

| Phase | Mode | Description | Duration |
|---|---|---|---|
| **Shadow** | Log-only | Agent generates recommendations but they're only logged, not shown to users. Compare against human decisions. | 2 weeks |
| **Suggest** | Display-only | Show AI recommendations in UI with confidence scores. Users make all decisions. | 4 weeks |
| **Autonomous (low-risk)** | Auto-execute | Auto-generate summaries, auto-score fit. Recommendations still require human approval. | Ongoing |
| **Autonomous (high-risk)** | Approval-gated | Agent can propose phase advances and section drafts, but all writes require explicit approval. | TBD |
| **Fully autonomous** | N/A | Not planned. Government contracting requires human judgment for all bid decisions. | N/A |

---

## Database Schema (Phase 1)

### New Table: `llm_call_log`
See Section 1.4 above.

### New Columns on `opportunities`
| Column | Type | Purpose |
|---|---|---|
| `ai_summary` | TEXT | Cached 3-bullet executive summary |
| `ai_summary_generated_at` | TIMESTAMPTZ | When summary was last generated |
| `ai_recommendation` | JSONB | Cached bid/no-bid recommendation |
| `ai_recommendation_generated_at` | TIMESTAMPTZ | When recommendation was last generated |
| `data_classification` | TEXT | `unclassified` (default), `fouo`, `cui`, `itar`, `secret` |

### Migration
`packages/backend/src/db/migrations/040_llm_gateway.sql`

---

## API Reference (Phase 1)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/ai/status` | Any | Check LLM availability and provider config |
| POST | `/api/ai/summarize/:id` | Any | Generate and persist executive summary |
| POST | `/api/ai/recommend/:id` | Any | Generate and persist bid/no-bid recommendation |
| GET | `/api/ai/summary/:id` | Any | Retrieve cached AI data for an opportunity |
| GET | `/api/ai/call-log` | Admin | View recent LLM call log entries |
