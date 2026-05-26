# F-029 R-12: "Redis account" Credential Audit

**Date:** 2026-05-26
**Credential:** Redis account (`F6aCGUnktFFSwjS8`, type: `redis`)
**Owner:** Shawn Seffernick (shawn.seffernick175@gmail.com)
**Created:** 2026-02-22T10:18:41Z
**Updated:** 2026-04-30T21:46:21Z

## Workflow References

**Zero.** No workflow node references credential `F6aCGUnktFFSwjS8`. No Redis-type nodes found in any workflow.

## Redis Usage in n8n Environment

The n8n `.env` contains:
```
QUEUE_BULL_REDIS_HOST=...
QUEUE_BULL_REDIS_PORT=...
```

This configures n8n's internal Bull queue for execution offloading (`EXECUTIONS_MODE`, `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS`). This is n8n infrastructure config — it does NOT use the stored Redis credential. The Bull queue connects directly using the env vars.

## Community Packages

Installed community packages in n8n:
- `@tavily/n8n-nodes-tavily` (0.5.1)
- `n8n-nodes-browserless` (^1.1.3)
- `n8n-nodes-firecrawl` (^0.3.0)
- `n8n-nodes-mcp` (0.1.37)
- `n8n-nodes-serpapi` (0.1.8)
- `@mendable/n8n-nodes-firecrawl` (2.0.4)

None of these packages use Redis credentials. The Firecrawl packages are installed but not referenced by any active workflow (confirmed in R-4 pre-check).

## Recommendation

**Delete in Wave 2.** Zero workflow references, no community packages use it, and n8n's internal Redis (Bull queue) uses env vars directly, not stored credentials. Safe to remove.
