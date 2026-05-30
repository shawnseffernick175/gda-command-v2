# D4 — Model Router Spec

**Parent:** F-215 (#426)
**Ticket:** F-215-D4 (#430)
**Author:** Devin (automated design)
**Date:** 2026-05-30
**Status:** Draft — awaiting human sign-off before F-217 implementation
**Types file:** `apps/backend-v3/src/lib/llm-router.types.ts`

> **GATE:** F-217 implements this spec verbatim. No code beyond types until this document is approved.

---

## 1. Mission

The Model Router is the thin server-side switchboard every AI call routes through. Business logic never references model names — it references tasks. Adding a new task = adding a `Task` union member + a routing table entry. The router owns retry, fallback, timeout, mock, logging, and cost tracking.

---

## 2. Architecture

### 2.1 Module location

```
apps/backend-v3/src/lib/
├── llm-router.ts            # Entry: route<T>(req) → Promise<RouteResponse<T>>
├── llm-router.types.ts      # All types (this PR)
├── llm-router.mocks.ts      # Mock registry for CI
├── llm-router.table.ts      # Routing table (Task → provider/model/timeout/fallback)
├── llm-router.retry.ts      # Retry + backoff logic
├── llm-router.logger.ts     # llm_calls table writer
└── providers/
    ├── anthropic.ts          # Claude adapter
    ├── openai.ts             # OpenAI adapter (embeddings)
    └── perplexity.ts         # Perplexity adapter (search)
```

### 2.2 Single typed entry point

```ts
route<T extends Task>(req: RouteRequest<T>): Promise<RouteResponse<T>>
```

Every AI call in the backend imports `route` from `llm-router.ts`. No direct `import Anthropic`, `import OpenAI`, or `import Perplexity` outside the `providers/` directory.

### 2.3 Statelessness

The router is stateless except for in-memory rate-limit token buckets per provider. No database connection pool owned by the router — it receives a pool reference for logging.

### 2.4 High-level call flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Business    │     │  LLM Router  │     │  Provider        │
│  Logic       │────▶│  route<T>()  │────▶│  Adapter         │
│  (service)   │     │              │     │  (anthropic.ts)  │
└──────────────┘     └──────┬───────┘     └────────┬─────────┘
                            │                      │
                            │  on error/timeout     │
                            │◀─────────────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  Fallback    │  (if configured)
                     │  Provider    │
                     └──────┬───────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  llm_calls   │  (log every call)
                     │  table       │
                     └──────────────┘
```

---

## 3. Task Taxonomy (binding)

```ts
type Task =
  | 'fast_track_triage'
  | 'opportunity_analysis'
  | 'capture_plan'
  | 'daily_briefing'
  | 'sentinel_summary'
  | 'doctrine_score'
  | 'semantic_embed'
  | 'source_research';
```

Each task has strongly typed `TaskInputMap[T]` and `TaskOutputMap[T]` interfaces defined in `llm-router.types.ts`.

### 3.1 Type contract notes

- `capture_plan` output type is `CoachOutput` as defined in D3 §5.5. The shape must be identical to D3 — this types file is a consumer of D3's authoritative schema, not a redefinition of it.
- `daily_briefing` input shape matches D3 §7.4 Commander input requirements — full structured arrays, not pre-aggregated strings.

---

## 4. Routing Table (initial — binding)

Model versions are pins, not "latest." Bumping a model is an explicit PR.

| Task | Provider | Model | Timeout | Fallback Model | Fallback Provider |
|---|---|---|---|---|---|
| `fast_track_triage` | anthropic | `claude-haiku-4-5` | 5 s | none (fail loud) | — |
| `opportunity_analysis` | anthropic | `claude-sonnet-4-5` | 10 s | `claude-haiku-4-5` | anthropic |
| `capture_plan` | anthropic | `claude-opus-4-5` | 60 s | `claude-sonnet-4-5` | anthropic |
| `daily_briefing` | anthropic | `claude-sonnet-4-5` | 30 s | `claude-haiku-4-5` | anthropic |
| `sentinel_summary` | anthropic | `claude-haiku-4-5` | 5 s | none | — |
| `doctrine_score` | anthropic | `claude-haiku-4-5` | 8 s | none | — |
| `semantic_embed` | openai | `text-embedding-3-large` | 10 s | none | — |
| `source_research` | perplexity | `sonar-pro` | 20 s | none | — |

### 4.1 Utility task callers

| Task | Caller | Purpose |
|---|---|---|
| `doctrine_score` | Capture surface, Sentinel | Score opportunity against doctrine alignment |
| `semantic_embed` | Ingestion pipeline | Generate vector embeddings for semantic search |
| `source_research` | Scout (background) | Deep-pull a discovered source URL for indexing |

### Routing table type (enforced at build time)

```ts
interface RoutingTableEntry {
  task: Task;
  provider: Provider;
  model: string;
  timeout_ms: number;
  fallback: FallbackConfig | null;
}
```

CI validates that the `ROUTING_TABLE` array has exactly one entry per `Task` union member. A missing or duplicate entry is a build failure.

---

## 5. Request / Response Interfaces

### 5.1 RouteRequest

```ts
interface RouteRequest<T extends Task> {
  task: T;
  input: TaskInputMap[T];
  opts?: {
    timeout_ms?: number;          // override default
    mock?: boolean;               // CI test seam
    operator_id?: string;         // for audit log
    object_ref?: string;          // e.g., "opp:SAM-W912PM-26-R-0042"
    disable_router_retry?: boolean; // pg-boss async tasks own retry
  };
}
```

### 5.2 RouteResponse

```ts
// Success
interface RouteResponseOk<T extends Task> {
  ok: true;
  task: T;
  model_used: string;
  output: TaskOutputMap[T];
  latency_ms: number;
  tokens: { input: number; output: number };
  cost_estimate_usd: number;
  fallback_used: boolean;
  quality_flag: 'full' | 'degraded';
  trace_id: string;
}

// Failure
interface RouteResponseErr<T extends Task> {
  ok: false;
  task: T;
  model_used: string | null;
  output: null;
  latency_ms: number;
  tokens: { input: number; output: number } | null;
  cost_estimate_usd: number;
  fallback_used: boolean;
  quality_flag: 'full' | 'degraded';
  error_kind: RouterErrorKind;
  error_message: string;
  trace_id: string;
}

type RouteResponse<T extends Task> = RouteResponseOk<T> | RouteResponseErr<T>;
```

---

## 6. R2 Contract Enforcement at Router Boundary

`opportunity_analysis` is the binding R2 path per product rule R2 ("Analysis is automatic on opportunity open").

### 6.1 Sequence diagram

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Frontend │     │ V3 API   │     │  Router  │     │ Anthropic│
│          │     │ /opps/:id│     │ route()  │     │ Sonnet   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │ GET /api/v3/   │               │                  │
     │ opportunities/ │               │                  │
     │ :id            │               │                  │
     │───────────────▶│               │                  │
     │                │  route({      │                  │
     │                │  task:'opp_   │                  │
     │                │  analysis',..})                  │
     │                │──────────────▶│                  │
     │                │               │  POST /messages  │
     │                │               │─────────────────▶│
     │                │               │                  │
     │                │               │  ◀──── response  │
     │                │               │  (within 10s)    │
     │                │  ◀────────────│                  │
     │                │  RouteResponse│                  │
     │  ◀─────────────│              │                  │
     │  200 + analysis│              │                  │
     │  or 503 timeout│              │                  │
     │                │               │                  │
```

### 6.2 R2 enforcement rules

1. Router enforces **10 s sync wall-clock** for `opportunity_analysis`.
2. On timeout: returns `{ ok: false, error_kind: 'ANALYSIS_TIMEOUT' }`.
3. Calling code surfaces **503** to UI — never spinner, never stale, never null.
4. **No leakage** of provider-specific errors past router boundary.
5. Fallback to Haiku is allowed but sets `quality_flag: 'degraded'` — UI shows muted indicator.
6. The 10 s timeout is the **total wall-clock** including retries and fallback.

### 6.3 Fallback wall-clock behavior

The fallback model executes within the **remaining** wall-clock budget of the primary task, not a fresh timeout. If the primary times out at 8 s of a 10 s `opportunity_analysis` budget, the fallback has 2 s. If the remaining budget is less than 500 ms when fallback is triggered, the router returns 503 `ANALYSIS_TIMEOUT` immediately without attempting fallback. The fallback never extends the R2 budget — R2's 10 s ceiling is absolute.

### 6.4 Frontend contract

The V3 API handler for opportunity detail:
- Calls `route({ task: 'opportunity_analysis', ... })`.
- If `ok: true` → wraps in `SuccessEnvelope`, returns 200.
- If `ok: false` → returns `errorEnvelope('ANALYSIS_TIMEOUT', ...)` with HTTP 503.
- Frontend renders 503 as a terse error banner, never a spinner or blank state.

---

## 7. Retry Policy

### 7.1 Default retry parameters

```ts
const DEFAULT_RETRY: RetryPolicy = {
  max_retries: 3,
  backoff_ms: [200, 600, 1800] as const,
  retry_on_5xx: true,    // retry once on 5xx, then fail
  retry_on_network: true,
  retry_on_429: false,   // 429 → immediate fallback, not retry
};
```

### 7.2 Retry decision matrix

| Error type | Action | Max retries |
|---|---|---|
| Network error (ECONNRESET, DNS, TCP) | Retry with exponential backoff | 3 |
| Rate-limit (429) | Immediate fallback if available; else `RATE_LIMITED` | 0 (no retry) |
| Provider 5xx | Retry once, then fail | 1 |
| Provider 4xx (auth, validation) | Fail loud, no retry | 0 |
| Timeout exceeded | Fail with `ANALYSIS_TIMEOUT` or `PROVIDER_ERROR` | 0 |

### 7.3 Wall-clock constraint

Total wall-clock (all retries + fallback attempt) never exceeds the task's `timeout_ms`. The retry loop checks remaining time before each attempt.

### 7.4a Async task retry interaction

For tasks invoked via pg-boss jobs (Scout `fast_track_triage`, Commander `daily_briefing`, Sentinel background `sentinel_summary`), the router's internal retry loop is **disabled** by passing `{ disable_router_retry: true }` in `RouteRequestOpts`. The pg-boss job owns retry semantics for async work (5s / 15s / 45s backoff, max 3 retries per D3 §3.9 / §7.5). Router retry remains enabled by default for synchronous tasks (`opportunity_analysis`, `capture_plan` triggered from UI). This prevents multiplicative retry behavior (up to 9 total attempts) under rate-limit scenarios.

### 7.4 State machine — retry + fallback

```
                              ┌──────────────────┐
                              │   CALL PRIMARY    │
                              │   provider/model  │
                              └────────┬──────────┘
                                       │
                          ┌────────────┼────────────┐
                          │            │            │
                     success      retriable     non-retriable
                          │       error         error
                          │            │            │
                          ▼            ▼            ▼
                    ┌──────────┐ ┌──────────┐ ┌──────────────┐
                    │  LOG +   │ │ BACKOFF  │ │ HAS FALLBACK?│
                    │  RETURN  │ │ + RETRY  │ │              │
                    │  ok:true │ │ (if time │ └──────┬───────┘
                    └──────────┘ │ remains) │    yes │  no
                                 └────┬─────┘        │   │
                                      │              ▼   ▼
                           ┌──────────┘     ┌────────────────┐
                      exhausted?            │ CALL FALLBACK  │
                      or timeout?           │ model           │
                           │                └────────┬───────┘
                      yes  │                         │
                           ▼                    success / fail
                    ┌──────────────┐                 │
                    │ HAS FALLBACK?│                 ▼
                    └──────┬───────┘          ┌──────────────┐
                      yes  │  no              │  LOG +       │
                           │   │              │  RETURN      │
                           ▼   ▼              │  (ok + flag  │
                    ┌────────────────┐        │  or err)     │
                    │ CALL FALLBACK  │        └──────────────┘
                    │ model          │
                    └────────┬───────┘
                             │
                        success / fail
                             │
                             ▼
                      ┌──────────────┐
                      │  LOG +       │
                      │  RETURN      │
                      │  fallback_   │
                      │  used: true  │
                      │  quality_    │
                      │  flag:       │
                      │  'degraded'  │
                      └──────────────┘
```

---

## 8. Fallback Policy

| Trigger | Action |
|---|---|
| Rate-limit (429) from primary | Immediate fallback if configured; else `RATE_LIMITED` |
| Provider 5xx after retries exhausted | Fallback if configured; else `PROVIDER_ERROR` |
| Timeout exhausted on primary | Fallback if time remains; else timeout error |

### 8.1 Fallback behavior

- Fallback model called with **same input** — no input transformation.
- Response includes `fallback_used: true` and `quality_flag: 'degraded'`.
- UI shows muted indicator on agent cards when fallback was used.

### 8.2 R2 fallback constraint

For `opportunity_analysis`: fallback to Haiku is allowed, but `quality_flag: 'degraded'` is visible in the UI. There is no silent fallback — the operator always knows when analysis ran on a lesser model.

### 8.3 Tasks with no fallback

`fast_track_triage`, `sentinel_summary`, `semantic_embed`, `source_research` — these fail loud. No fallback, no degraded mode.

---

## 9. Mock Mode (CI Test Seam)

### 9.1 Activation

- Request-level: `opts.mock: true` in `RouteRequest`.
- Environment-level: `MOCK_LLM=1` env var (local dev).

### 9.2 Mock registry

```ts
// apps/backend-v3/src/lib/llm-router.mocks.ts

interface MockRegistry {
  get<T extends Task>(task: T, inputHash: string): RouteResponseOk<T> | null;
  register<T extends Task>(task: T, inputHash: string, response: RouteResponseOk<T>): void;
}
```

- Mock responses keyed by `task` + deterministic hash of input.
- CI test suite uses mock mode exclusively — **zero real API calls in CI**.
- Mock responses must conform to the same `TaskOutputMap[T]` schema as real responses — parity enforced by type system.

### 9.3 Mock mode parity

A dedicated test asserts that every mock response passes the same Zod/runtime validation that real responses do. This prevents mock drift.

---

## 10. Logging — `llm_calls` Table

### 10.1 Migration spec (for F-217)

```sql
CREATE TABLE llm_calls (
  id BIGSERIAL PRIMARY KEY,
  trace_id UUID NOT NULL,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operator_id UUID,
  object_ref TEXT,
  latency_ms INT NOT NULL,
  tokens_input INT,
  tokens_output INT,
  cost_estimate_usd NUMERIC(10,6),
  fallback_used BOOLEAN DEFAULT FALSE,
  error_kind TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_calls_trace ON llm_calls(trace_id);
CREATE INDEX idx_llm_calls_task_created ON llm_calls(task, created_at DESC);
CREATE INDEX idx_llm_calls_object ON llm_calls(object_ref) WHERE object_ref IS NOT NULL;
```

### 10.2 Logging contract

Every `route()` call writes exactly one row to `llm_calls` before returning. If fallback was used, the row reflects the fallback model. A second row is written for the failed primary attempt with its `error_kind`.

### 10.3 TypeScript row type

```ts
interface LlmCallRow {
  id: string;
  trace_id: string;
  task: Task;
  provider: Provider;
  model: string;
  operator_id: string | null;
  object_ref: string | null;
  latency_ms: number;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_estimate_usd: number | null;
  fallback_used: boolean;
  error_kind: RouterErrorKind | null;
  created_at: string;
}
```

---

## 11. Cost-Estimate Dashboard Read Path

### 11.1 Endpoint

```
GET /api/v3/llm-cost-rollup?window=7d
```

Query parameter: `window` — one of `1d`, `7d`, `30d`.

### 11.2 Response

```ts
interface CostRollupResponse {
  window: string;
  entries: CostRollupEntry[];
  totals: {
    call_count: number;
    total_cost_usd: number;
  };
  generated_at: string;
}

interface CostRollupEntry {
  task: Task;
  call_count: number;
  total_latency_ms: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
}
```

### 11.3 SQL (reference query)

```sql
SELECT
  task,
  COUNT(*)::int AS call_count,
  SUM(latency_ms)::int AS total_latency_ms,
  COALESCE(SUM(tokens_input), 0)::int AS total_tokens_input,
  COALESCE(SUM(tokens_output), 0)::int AS total_tokens_output,
  COALESCE(SUM(cost_estimate_usd), 0)::numeric(10,6) AS total_cost_usd
FROM llm_calls
WHERE created_at >= NOW() - $1::interval
GROUP BY task
ORDER BY total_cost_usd DESC;
```

### 11.4 Launchpad integration

Sentinel health strip surfaces a "Today's AI spend" tile reading from this endpoint with `window=1d`. No PII in rollup — aggregated only.

---

## 12. Provider Key Management

### 12.1 Required environment variables

| Variable | Provider | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | Yes |
| `OPENAI_API_KEY` | OpenAI (embeddings) | Yes |
| `PERPLEXITY_API_KEY` | Perplexity (search) | Yes |

### 12.2 Startup validation

Router refuses to start if any required key is missing. Fail loud, not silent:

```ts
function validateKeys(): void {
  const required = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'PERPLEXITY_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`LLM Router: missing API keys: ${missing.join(', ')}`);
  }
}
```

### 12.3 Security

Keys never leak to the client. The router is server-side only — no API key is ever included in a response payload or logged.

---

## 13. Reasoning-Trace Integration

### 13.1 Trace ID

Every successful `route()` call returns `trace_id` (UUID v4). The same `trace_id` is written to the `llm_calls` row.

### 13.2 Trace expander (per D3)

The reasoning-trace expander component reads `llm_calls` by `trace_id` and renders:

- `model_used` — which model answered
- `latency_ms` — how long it took
- `tokens` — input/output token counts
- `cost_estimate_usd` — cost of this call
- `fallback_used` — whether degraded mode was active

### 13.3 Audit chain

Operator can audit any agent decision back to its LLM call: UI card → `trace_id` → `llm_calls` row → full model/latency/cost/fallback record.

---

## 14. Test Strategy Contributions (D5 coordinates)

F-217 (router build) must deliver these test categories:

| Category | What it covers | Approach |
|---|---|---|
| Unit tests per provider adapter | Each adapter correctly transforms input → provider API format and parses response | Vitest, mocked HTTP |
| Routing table coverage | Every `Task` has exactly one `RoutingTableEntry` | Build-time assertion |
| R2 contract test | `opportunity_analysis` respects 10 s wall-clock | Vitest with fake timers |
| Fallback tests | Each task with a fallback triggers it on primary failure | Vitest, mocked primary failure |
| Mock parity test | Mock responses match real response schema | Vitest schema validation |
| Retry tests | Exponential backoff, max retries, wall-clock cap | Vitest with fake timers |
| Cost rollup test | `/api/v3/llm-cost-rollup` returns correct aggregation | Vitest, seeded `llm_calls` rows |

---

## 15. Migration Plan from Current State

### 15.1 Current state

The existing `packages/backend` has direct OpenAI calls in some routes (opportunity analysis, embeddings). These bypass any centralized routing, retry, or cost tracking.

### 15.2 F-217 migration steps

1. Build router module per this spec.
2. Migrate existing direct AI calls to use `route()`.
3. Remove all direct `import OpenAI` / `import Anthropic` from non-router code.
4. Add drift detector CI rule: any new `import OpenAI` or `import Anthropic` outside `providers/` directory = CI red.

### 15.3 Drift detector extension

Current drift detector CI (F-205) extended with:

```ts
// Forbidden imports outside router
const FORBIDDEN_PATTERNS = [
  /import.*from ['"]openai['"]/,
  /import.*from ['"]@anthropic-ai\/sdk['"]/,
  /import.*from ['"]perplexity['"]/,
  /require\(['"]openai['"]\)/,
  /require\(['"]@anthropic-ai\/sdk['"]\)/,
];

const ALLOWED_DIRS = ['src/lib/providers/'];
```

---

## 16. Future-Proofing (designed for, not built yet)

These capabilities are accommodated by the type system and routing table design but are not implemented in F-217:

| Capability | Design accommodation |
|---|---|
| Per-OU model preferences | `RoutingTableEntry` can be extended with `ou_override?: Record<string, RoutingTableEntry>` |
| A/B testing same task with two models | Routing table can hold a `variant` array; `route()` selects based on hash |
| "Cost mode" operator toggle | `opts.cost_mode?: boolean` forces Haiku for all tasks |
| Local model support (FedRAMP / IL5) | `Provider` union extended with `'local'`; adapter follows same interface |

---

## 17. Open API Spec Additions (for F-217)

### 17.1 New endpoint

```yaml
/api/v3/llm-cost-rollup:
  get:
    summary: LLM cost rollup by task
    parameters:
      - name: window
        in: query
        required: true
        schema:
          type: string
          enum: [1d, 7d, 30d]
    responses:
      '200':
        description: Cost rollup
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CostRollupResponse'
```

---

## Acceptance Checklist

- [x] `d4-model-router.md` renders end-to-end
- [x] `llm-router.types.ts` defines all 8 `TaskInput` / `TaskOutput` interfaces
- [x] Routing table is complete and CI-checked (table → types parity)
- [x] R2 enforcement path documented with sequence diagram
- [x] Retry, fallback, timeout policies documented with state machine
- [x] Migration spec for `llm_calls` table provided (for F-217)
- [x] Mock-mode design specified
- [x] Cost-rollup read path documented
- [x] PR is docs + types only (no impl)
- [x] `CapturePlanOutput` matches D3 §5.5 `CoachOutput` exactly
- [ ] `OpportunityAnalysisOutput` matches D3 §4.5 `AnalystOutput` exactly (zero structural diff).
- [ ] All sub-interfaces (`ShipleyScore`, `ShipleyDimension`, `IncumbentProfile`, `CompetitorEntry`, `DoctrineAlignment`) match D3 §4.5 exactly.
- [x] `DailyBriefingInput` shape matches D3 §7.4 Commander input requirements
- [x] All 8 task types use the exact `RouterTask` enum string values from D3 §13.1
- [x] Frontend `SourceKind` enum used in chip-renderable outputs matches D3 §13.1 `FrontendSourceKind`
- [ ] CI green
