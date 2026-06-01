# GovTribe Integration — Critical Finding (Jun 1, 2026)

## Headline

**GovTribe's REST API was deprecated in 2023 and is no longer accessible.** All
programmatic access is now via the **MCP protocol over Streamable HTTP**, not
plain REST.

Source: https://docs.govtribe.com/user-guide/terms-of-use/api-license-agreement
> "The GovTribe API was deprecated in 2023 and is no longer accessible."

## Current code is fundamentally wrong

File: `apps/backend-v3/src/ingest/govtribe/client.ts`

The current implementation calls:
```
GET https://api.govtribe.com/v1/<path>
Authorization: Bearer <token>
```

`api.govtribe.com` returns NXDOMAIN. **This code path will never succeed.**

Validation: smoke test run 2026-06-01 16:56 UTC — backend logged
`getaddrinfo ENOTFOUND api.govtribe.com` on every attempt (7 attempts across
search_opportunities, search_awards, search_forecasts). Credit-aware client
correctly caught the exception and logged `skipped_halted` decision. **Zero
credits burned, zero data ingested.**

## The real integration spec

| Item | Value | Source |
|---|---|---|
| Server URL | `https://govtribe.com/mcp` | [MCP Inspector docs](https://docs.govtribe.com/user-guide/integrations/govtribe-mcp/advanced-developer/mcp-inspector) |
| Transport | Streamable HTTP (`--transport http`) | Same |
| Auth header | `Authorization: Bearer <API_KEY>` | Same |
| API key location | https://govtribe.com/account-mcp | [Get started](https://docs.govtribe.com/user-guide/integrations/govtribe-mcp) |
| Our key scope | `mcp:use` (JWT claim) | VPS `.env` validation |
| Protocol | MCP (JSON-RPC over HTTP) | Anthropic [Model Context Protocol spec](https://modelcontextprotocol.io) |

## Available MCP capabilities (per docs)

GovTribe MCP exposes tools/resources for:
- Opportunities
- Awards
- IDVs
- Contract vehicles
- Vendors
- Forecasts
- Contacts
- Pipeline management
- Saved searches
- Pursuit tracking
- GovExec media coverage (real-time journalism, M&A coverage, contracting trends)

Exact tool names and per-tool credit costs are **not published** in the
docs — they're discoverable only via MCP `tools/list` introspection against
the live server.

## Pricing (already known, locked in `govtribe_credit_table.md`)
- PAYG: $0.09/credit
- 3,500 pack: $239 ($0.068/cr)
- 25,000 pack: $979 ($0.039/cr)
- "Pricing is credit-based and separate from your GovTribe subscription"
- Shawn pays personally, ~$1,200/yr (currently has 3,500-credit pack)

## Implications for V3 architecture

1. **Cannot use `fetch()` with the bearer token to a REST path.** Must use an
   MCP client library that speaks JSON-RPC over Streamable HTTP.
2. **Tool names are discovered, not hardcoded.** First call should be
   `tools/list` to enumerate what the server exposes; that informs our schema
   mapping.
3. **Credit cost per call is unknown until first run.** We need to capture the
   billing response from the MCP server (if any) or compute it from cycle
   ledger deltas via the GovTribe dashboard.
4. **Caching strategy still applies** — MCP tool responses are normal JSON,
   so the existing `getCachedResponse / setCachedResponse` helpers still work.
5. **Code restructure required** — `govtribe/client.ts` needs to be rewritten
   around an MCP client (e.g. `@modelcontextprotocol/sdk`), not direct HTTP.

## Required follow-up work (file as F-323)

**Title:** Rewrite GovTribe client around MCP protocol (REST is dead)

**Acceptance criteria:**
- `apps/backend-v3/src/ingest/govtribe/client.ts` uses
  `@modelcontextprotocol/sdk` (or equivalent) to talk to
  `https://govtribe.com/mcp` via Streamable HTTP
- First request is `tools/list` — result cached in DB for schema mapping
- Each MCP tool call is wrapped in the existing credit-budget guard
- Per-tool credit cost map is observed from production usage and recorded in
  `govtribe_credit_ledger.cost_credits` per actual ledger deltas
- All four ingest paths (opportunities, awards, forecasts, contacts) succeed
  end-to-end with real data inserted into `opportunities` table
- `GOVTRIBE_API_BASE` env var becomes `GOVTRIBE_MCP_URL`, defaults to
  `https://govtribe.com/mcp`
- Old REST code is deleted, not commented out

**Estimated complexity:** Medium. MCP TypeScript SDK is mature; main work is
adapting our existing credit-budget guard around a JSON-RPC call pattern
instead of a fetch() call.

**Blocks:** Live GovTribe smoke test (F-318 cannot complete until this is done)

## Quick win: hotfix the env default

While F-323 is being scoped, we should at minimum update `GOVTRIBE_API_BASE`
on the VPS so it no longer references the dead hostname. Even though the
current code will still fail (it speaks REST not MCP), the new value makes
it obvious to anyone reading `.env` that the integration is MCP:

```
GOVTRIBE_API_BASE=https://govtribe.com/mcp
```

This is **documentation hygiene only** — does not fix the integration. The
real fix is the F-323 rewrite.

## What this does NOT block

- GovWin integration — completely independent, uses CAS portal auth at a
  different hostname. F-318 GovWin path can still proceed.
- Architecture design doc (F-400) — proceeds as planned. This finding
  becomes part of the design doc's source-integration section.
- F-322 dep audit fix — independent.

## What this DOES block

- F-318 GovTribe live smoke test — cannot succeed until F-323 lands.
- F-320 `govtribe_search` agent tool — depends on working client.
- Any production cron run hitting GovTribe — currently failing silently
  (credit-aware client logs skipped_halted, no alerts).

## Recommendation

Inform Shawn immediately. The current code was written against the dead REST
API — likely either pre-2023 (and never validated post-deprecation) or by
someone who didn't realize the API was killed. We should file F-323 today
and either:

- (a) Park GovTribe entirely until F-323 lands (cleanest)
- (b) Push F-323 to top of sprint priority (fastest unblock)

Either way, F-318 cannot be marked complete on the GovTribe side until F-323
is done.
