# LLM Router

The Model Router is the centralized LLM gateway for GDA Command v3. Business logic references **tasks**, not models — the router handles provider selection, retry, fallback, timeout, cost tracking, and mock mode.

**Spec:** `docs/architecture/v3/frontend/d4-model-router.md`
**Types:** `apps/backend-v3/src/lib/llm-router.types.ts`

## Entrypoint

```ts
import { route } from '../llm-router.js';
import type { RouteRequest, RouteResponse } from '../llm-router.types.js';

const result = await route({
  task: 'opportunity_analysis',
  input: { opportunity_id: '...', title: '...', /* ... */ },
  opts: { operator_id: 'user-123' },
});

if (result.ok) {
  console.log(result.output.pwin);
} else {
  console.error(result.error_kind, result.error_message);
}
```

### Signature

```ts
route<T extends Task>(req: RouteRequest<T>): Promise<RouteResponse<T>>
```

- `req.task` — one of the 8 `Task` types
- `req.input` — strongly typed per `TaskInputMap[T]`
- `req.opts.mock` — force mock mode for this request
- `req.opts.disable_router_retry` — disable retry loop (for pg-boss async callers)
- `req.opts.timeout_ms` — override default timeout
- `req.opts.operator_id` — audit trail
- `req.opts.object_ref` — e.g. `"opp:SAM-W912PM-26-R-0042"`

## Task Types

| Task | Provider | Model | Timeout | Fallback |
|------|----------|-------|---------|----------|
| `fast_track_triage` | Anthropic | claude-haiku-4-5 | 5s | none |
| `opportunity_analysis` | Anthropic | claude-sonnet-4-5 | 10s (R2) | claude-haiku-4-5 |
| `capture_plan` | Anthropic | claude-opus-4-5 | 60s | claude-sonnet-4-5 |
| `daily_briefing` | Anthropic | claude-sonnet-4-5 | 30s | claude-haiku-4-5 |
| `sentinel_summary` | Anthropic | claude-haiku-4-5 | 5s | none |
| `doctrine_score` | Anthropic | claude-sonnet-4-5 | 8s | claude-haiku-4-5 |
| `semantic_embed` | OpenAI | text-embedding-3-large | 10s | none |
| `source_research` | Perplexity | sonar-pro | 20s | none |

## Adding a New Task Type

1. Add the task to `Task` union in `llm-router.types.ts`
2. Add `TaskInputMap[T]` and `TaskOutputMap[T]` interfaces
3. Add a zod schema in `router/schemas.ts`
4. Create a handler file in `router/handlers/<task-name>.ts`
5. Register the handler in `router/handlers/index.ts`
6. Add a routing table entry in `llm-router.table.ts`
7. Add a mock fixture at `tests/fixtures/llm-mock/<task-name>.json`
8. Add unit + integration tests

## Swapping Providers

Each provider implements the `LLMProvider` interface from `router/providers/types.ts`:

```ts
interface LLMProvider {
  name: string;
  chat(req: LLMChatRequest, signal?: AbortSignal): Promise<LLMChatResponse>;
  embed?(req: LLMEmbedRequest, signal?: AbortSignal): Promise<LLMEmbedResponse>;
}
```

To swap a provider for a task:
1. Update the `provider` field in `llm-router.table.ts`
2. If the new provider is not yet implemented, add it to `router/providers/`
3. Register it in `router/providers/index.ts`

## Updating Pricing

Edit `router/pricing.ts` — the `PRICING_TABLE` maps model names to per-million-token rates (USD). The router uses this for `cost_estimate_usd` in responses.

## Mock Mode

For local dev and CI — **zero real API calls**:

```bash
# Environment variable
LLM_ROUTER_MODE=mock pnpm --filter backend-v3 dev

# Or per-request
route({ task: '...', input: {...}, opts: { mock: true } })
```

Mock mode reads fixtures from `tests/fixtures/llm-mock/<task>.json`. Each fixture has an `output` field validated against the task's zod schema.

### Simulating failures

Fixtures support two simulation flags:
- `"_simulate_timeout": true` — returns `ANALYSIS_TIMEOUT` (503)
- `"_simulate_primary_fail": true` — triggers fallback path

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (non-mock) | Anthropic Claude API key |
| `OPENAI_API_KEY` | Yes (non-mock) | OpenAI API key (embeddings) |
| `PERPLEXITY_API_KEY` | Yes (non-mock) | Perplexity API key (search) |
| `LLM_ROUTER_MODE` | No | Set to `mock` for mock mode |
| `MOCK_LLM` | No | Set to `1` for mock mode (alias) |

## Architecture

```
src/lib/
├── llm-router.ts           # Entry: route<T>(req) → RouteResponse<T>
├── llm-router.types.ts     # All types (authoritative)
├── llm-router.table.ts     # Task → provider/model/timeout/fallback
├── llm-router.retry.ts     # Retry + backoff logic
├── llm-router.mocks.ts     # Mock registry for CI
├── llm-router.logger.ts    # Structured observability
└── router/
    ├── handlers/            # One file per task (8 handlers)
    ├── providers/           # Anthropic, OpenAI, Perplexity adapters
    ├── pricing.ts           # Per-model cost rates
    ├── schemas.ts           # Zod schemas from types
    └── README.md            # This file
```
