# LLM Router

The Model Router is the centralized AI gateway for GDA Command v3. Business logic never references model names — it references tasks. The router owns retry, fallback, timeout, mock mode, logging, and cost tracking.

**Spec:** `docs/architecture/v3/frontend/d4-model-router.md`

## Entrypoint

```ts
import { route } from '../lib/llm-router.js';

const result = await route({
  task: 'opportunity_analysis',
  input: { opportunity_id: '...', title: '...', /* ... */ },
  opts: { operator_id: 'user-abc', object_ref: 'opp:SAM-123' },
});

if (result.ok) {
  console.log(result.output);   // TaskOutputMap['opportunity_analysis']
  console.log(result.trace_id); // UUID for audit trail
} else {
  console.error(result.error_kind, result.error_message);
}
```

### Signature

```ts
route<T extends Task>(req: RouteRequest<T>): Promise<RouteResponse<T>>
```

- `RouteRequest` contains `task`, `input` (typed per task), and optional `opts`
- `RouteResponse` is discriminated on `ok: true | false`
- All types are in `llm-router.types.ts` — do not redefine

## 8 Task Types

| Task | Model | Provider | Timeout | Fallback |
|------|-------|----------|---------|----------|
| `fast_track_triage` | claude-haiku-4-5 | Anthropic | 5s | none |
| `opportunity_analysis` | claude-sonnet-4-5 | Anthropic | 10s (R2) | Haiku |
| `capture_plan` | claude-opus-4-5 | Anthropic | 60s | Sonnet |
| `daily_briefing` | claude-sonnet-4-5 | Anthropic | 30s | Haiku |
| `sentinel_summary` | claude-haiku-4-5 | Anthropic | 5s | none |
| `doctrine_score` | claude-sonnet-4-5 | Anthropic | 8s | Haiku |
| `semantic_embed` | text-embedding-3-large | OpenAI | 10s | none |
| `source_research` | sonar-pro | Perplexity | 20s | none |

## How to Add a New Task Type

1. Add the task name to the `Task` union in `llm-router.types.ts`
2. Define `TaskInputMap[newTask]` and `TaskOutputMap[newTask]` interfaces
3. Add a zod schema in `router/schemas.ts` and register it in `TASK_OUTPUT_SCHEMAS`
4. Create a handler at `router/handlers/new-task.ts` exporting `handle(input, model)`
5. Add a routing table entry in `llm-router.table.ts`
6. Register the handler in `llm-router.ts` → `handlerRegistry`
7. Add a mock fixture at `tests/fixtures/llm-mock/new-task.json`
8. Add pricing for any new model in `router/pricing.ts`

## How to Swap Providers

Each provider is isolated in `router/providers/`. To swap a task's provider:

1. Update the `provider` field in `llm-router.table.ts`
2. If the new provider doesn't exist, create an adapter in `router/providers/`
3. Update the handler to import the new provider
4. Add pricing for the new model in `router/pricing.ts`

## How to Update Pricing

Edit `router/pricing.ts`. The `PRICING` record maps model names to per-million token rates:

```ts
const PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5': {
    input_per_million: 0.80,
    output_per_million: 4.00,
  },
  // ...
};
```

## Mock Mode (Local Dev & CI)

Mock mode prevents real API calls. Activate via:

- **Environment variable:** `MOCK_LLM=1` or `LLM_ROUTER_MODE=mock`
- **Per-request:** `opts.mock: true` in `RouteRequest`

Mock fixtures are at `tests/fixtures/llm-mock/<task>.json`. Each fixture has:

```json
{
  "output": { /* TaskOutputMap[T] */ },
  "_simulate_timeout": false,
  "_simulate_primary_fail": false
}
```

- `_simulate_timeout: true` → router returns 503 ANALYSIS_TIMEOUT (for opportunity_analysis)
- `_simulate_primary_fail: true` → router simulates primary failure and uses fallback model

### Running with mock mode

```bash
# Local dev — no API keys needed
MOCK_LLM=1 pnpm --filter backend-v3 dev

# CI tests
MOCK_LLM=1 pnpm --filter backend-v3 test
```

## Required Environment Variables (Production)

| Variable | Provider | Required |
|----------|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | Yes |
| `OPENAI_API_KEY` | OpenAI (embeddings) | Yes |
| `PERPLEXITY_API_KEY` | Perplexity (search) | Yes |

Router refuses to start if any key is missing (mock mode excepted).

## Retry & Fallback

- **Retry:** 200ms / 600ms / 1800ms exponential backoff, max 3 retries
- **429 (rate limit):** immediate fallback, no retry
- **5xx:** retry once, then fallback
- **Wall-clock cap:** total time (retries + fallback) never exceeds task timeout
- **`disable_router_retry: true`:** disables router retry for pg-boss async tasks

## R2 Enforcement

`opportunity_analysis` has a hard 10-second wall-clock budget. If the provider hasn't returned within budget, the router returns `{ ok: false, error_kind: 'ANALYSIS_TIMEOUT' }`. There is no third state (no polling, no pending). Sync or 503.

## Observability

Every invocation emits structured pino log entries:

- `router.invoke.start` — task, model, request_id
- `router.invoke.complete` — task, model, latency_ms, tokens, cost
- `router.invoke.fallback` — primary_model, fallback_model, reason
- `router.invoke.error` — task, error_code, error_message
- `router.invoke.timeout` — task, budget_ms, elapsed_ms

## File Structure

```
src/lib/
├── llm-router.ts            # Entry: route<T>(req) → Promise<RouteResponse<T>>
├── llm-router.types.ts      # All types (canonical, DO NOT EDIT without D3 update)
├── llm-router.mocks.ts      # Mock registry for CI
├── llm-router.table.ts      # Routing table (Task → provider/model/timeout/fallback)
├── llm-router.retry.ts      # Retry + backoff logic
├── llm-router.logger.ts     # Structured log emitter
└── router/
    ├── handlers/
    │   ├── fast-track-triage.ts
    │   ├── opportunity-analysis.ts
    │   ├── capture-plan.ts
    │   ├── daily-briefing.ts
    │   ├── sentinel-summary.ts
    │   ├── doctrine-score.ts
    │   ├── semantic-embed.ts
    │   └── source-research.ts
    ├── providers/
    │   ├── anthropic.ts
    │   ├── openai.ts
    │   └── perplexity.ts
    ├── pricing.ts
    ├── schemas.ts
    └── README.md             # ← You are here
```
