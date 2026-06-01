# GovTribe Integration (MCP over Streamable HTTP)

## Architecture

GovTribe integration uses **MCP (Model Context Protocol) over Streamable HTTP**
against `https://govtribe.com/mcp`. The deprecated REST API (`api.govtribe.com`)
was removed in F-323.

### Files

| File | Purpose |
|------|---------|
| `mcp_client.ts` | MCP connection + credit-budget-aware `mcpCallTool()` |
| `mcp_tools.ts` | Typed wrapper functions for each MCP tool we use |
| `tools.generated.json` | Full tool catalog from `tools/list` discovery |
| `job.ts` | Ingest jobs: opportunities (7 saved searches), contacts, vehicles, budget rollup |
| `saved_searches.ts` | 7 named saved search definitions (3 opps, 2 awards, 2 forecasts) |
| `mapper.ts` | Maps raw GovTribe responses to `ExternalOpportunityRow` |
| `rag_sink.ts` | RAG sink: writes each opp to `kb_documents` |
| `types.ts` | TypeScript types for GovTribe response shapes |
| `index.ts` | Module entry: registers sources with the ingest framework |

### Auth

```
Authorization: Bearer ${GOVTRIBE_API_KEY}
```

The `GOVTRIBE_API_KEY` is a JWT (scope `mcp:use`, len ~1068). Stored in VPS `.env`.

### Credit Budget

Every MCP tool call is credit-budget-aware:

- **Monthly cap:** 1200 credits (Shawn's personal plan)
- **Per-cycle cap:** 150 credits
- **Thresholds:** 80% → `skipped_low_budget`, 95% → `skipped_halted`
- **Ledger:** `govtribe_credit_ledger` (one row per tool call)
- **Monthly aggregate:** `govtribe_credit_monthly`

Budget decisions: `called` | `skipped_low_budget` | `skipped_halted` | `skipped_cycle_cap` | `cached`

### Dry-Run Mode

```
GET /v3/govtribe/tools
```

Lists all discovered MCP tools without burning credits. Calls `tools/list` only.

### Discovery

To regenerate `tools.generated.json`:

```bash
GOVTRIBE_API_KEY=<jwt> pnpm tsx scripts/govtribe-discover.ts
```

This connects to the MCP endpoint, runs `tools/list`, and writes the catalog.

### MCP Tools Used

| MCP Tool | GDA Use Case | Credit Cost |
|----------|-------------|-------------|
| `Search_Federal_Contract_Opportunities` | Opportunity saved searches | 3 |
| `Search_Federal_Contract_Awards` | Award saved searches | 4 |
| `Search_Federal_Forecasts` | Forecast saved searches | 3 |
| `Search_Contacts` | Agency contact enrichment | 2 |
| `Search_Federal_Contract_Vehicles` | Vehicle metadata refresh | 2 |
| `Search_Federal_Contract_IDVs` | IDV search | 3 |
| `Search_Vendors` | Vendor lookup | 2 |
| `Search_GovTribe` | General search (agent-v3) | 1 |

### Ingest Cadence

| Source Key | Schedule | Est. Credits |
|-----------|----------|-------------|
| `govtribe` (opps) | Mon + Thu 6am ET | ~115 |
| `govtribe.contacts` | Weekly Mon 09:00 UTC | ~20 |
| `govtribe.vehicles` | Monthly 1st | ~5 |
| `govtribe.budget` | Nightly 23:55 ET | 0 |
