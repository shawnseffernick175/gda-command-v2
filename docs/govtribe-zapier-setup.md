# GovTribe Tier 1: Direct MCP Poll → GDA Ingest Pipeline

## Architecture

```
n8n Cron (Mon + Thu 6am ET) → POST /api/ingest/govtribe/poll
                                 ↓
                            Credit cap check (per-cycle + monthly)
                                 ↓
                            GovTribe MCP (7 saved search configs)
                                 ↓
                            Upsert to opportunities table
                                 ↓
                            SAM.gov enrichment (free)
                                 ↓
                            USAspending fallback (free)
```

**Cost:** ~920 GovTribe MCP credits/month (~$49/month at 8,500 pack rate). No Zapier subscription.
**Subscription:** GovTribe Launch Plus ($1,900/year). Includes unlimited saved searches, MCP access (credits separate).

## How It Works

The GDA backend contains the 7 saved search configurations matching the GovTribe design:

| # | Name | MCP Tool | Keywords | NAICS Filter (in GovTribe UI) |
|---|------|----------|----------|-------------------------------|
| 1 | GDA-Opps-Core | Search_Federal_Contract_Opportunities | SETA \| C5ISR \| "PEO IEW&S" \| "CPE IEW&S" \| "PEO C3N" \| "CPE C3N" \| cybersecurity \| "systems engineering" | 541511, 541512, 541519, 541330, 541611, 541690 |
| 2 | GDA-Opps-Growth | Search_Federal_Contract_Opportunities | CMMC \| "AI/ML" \| "XR/AR" \| DEVCOM \| "synthetic training" | 541511, 541512, 541715, 518210 |
| 3 | GDA-Opps-Opportunistic | Search_Federal_Contract_Opportunities | "advisory services" \| innovation \| ISR \| EW | 541611, 541690, 541715 |
| 4 | GDA-Awards-Core | Search_Federal_Contract_Awards | SETA \| C5ISR \| "PEO IEW&S" \| "CPE IEW&S" \| cybersecurity \| "systems engineering" | 541511, 541512, 541519, 541330 |
| 5 | GDA-Awards-Growth | Search_Federal_Contract_Awards | CMMC \| "AI/ML" \| DEVCOM | 541511, 541512, 541715 |
| 6 | GDA-Forecasts-Core | Search_Federal_Forecasts | SETA \| C5ISR \| "PEO IEW&S" \| "CPE IEW&S" \| cybersecurity | 541511, 541512, 541519 |
| 7 | GDA-Forecasts-Growth | Search_Federal_Forecasts | "AI/ML" \| CMMC \| DEVCOM \| innovation | 541715, 518210 |

When `POST /api/ingest/govtribe/poll` is called:
1. Checks monthly credit cap — refuses to start if at 95% of monthly limit
2. Runs all 7 searches against GovTribe MCP at `https://govtribe.com/mcp`
3. Checks per-cycle credit cap between searches — stops if exceeded
4. Records credit usage to `govtribe_credit_ledger` table
5. Deduplicates results by `govtribe_id`
6. Upserts each record into the `opportunities` table (prefixed as `govtribe-{id}`)
7. Auto-enriches via SAM cross-reference and USAspending fallback
8. Updates `gov_source_feeds` tracking

## Credit Budget Guardrails

| Guardrail | Default | Env Var | Behavior |
|-----------|---------|---------|----------|
| Per-cycle cap | 150 credits | `GOVTRIBE_CYCLE_CREDIT_CAP` | Stops mid-poll, remaining searches skipped |
| Monthly cap | 1,200 credits | `GOVTRIBE_MONTHLY_CREDIT_CAP` | Alert at 80% (960), hard stop at 95% (1,140) |

**Expected usage:** ~115 credits/cycle × 2 cycles/week × ~4.3 weeks = ~920 credits/month.
The 1,200 monthly cap provides ~30% headroom for volume spikes or added searches.

### Credit math per cycle

| Search Type | Count | Credits per 10 results | Credits per search (50 results) | Subtotal |
|-------------|-------|----------------------|-------------------------------|----------|
| Opportunities | 3 | 3 | 15 | 45 |
| Awards | 2 | 4 | 20 | 40 |
| Forecasts | 2 | 3 | 15 | 30 |
| **Total** | **7** | | | **115** |

### Credit cap in Source Health

The `GET /api/qa/source-health` endpoint includes a `govtribe_credits` section:

```json
{
  "govtribe_credits": {
    "cycleCap": 150,
    "cycleUsed": 0,
    "monthlyCap": 1200,
    "monthlyUsed": 230,
    "monthKey": "2026-05",
    "alertThreshold": 960,
    "stopThreshold": 1140,
    "monthlyAlertTriggered": false,
    "monthlyStopTriggered": false
  }
}
```

When monthly usage reaches 80%, the `hint` field warns: *"GovTribe MCP credits at 960/1200 this month (80%) — approaching limit"*.
At 95%, polling is blocked and hint reads: *"— POLLING STOPPED"*.

All usage is persisted to the `govtribe_credit_ledger` table. Monthly totals available via the `govtribe_credit_monthly` view.

## Setup

### 1. n8n Cron Workflow

Import `docs/n8n-govtribe-workflow.json` into n8n. The workflow:
- **Cron trigger**: runs Monday + Thursday at 6am ET (10am UTC)
- **Manual trigger**: webhook at `/webhook/govtribe-cron-trigger` for on-demand polling
- **HTTP Request**: calls `POST /api/ingest/govtribe/poll` with `x-gda-key` auth

n8n Workflow ID: `5KuF4KZ8uxYcbUN5` (GDA.ingest.govtribe-cron)

**Note:** Workflow starts deactivated. First cycle should be a manual trigger to verify credit consumption matches the 115/cycle estimate. Enable cron after verification.

### 2. Environment Variables

Required on the GDA backend:
- `GOVTRIBE_API_KEY` — Bearer token for GovTribe MCP
- `GDA_WEBHOOK_KEY` — Shared key for n8n → GDA auth
- `GOVTRIBE_CYCLE_CREDIT_CAP` — (optional) Override per-cycle cap (default: 150)
- `GOVTRIBE_MONTHLY_CREDIT_CAP` — (optional) Override monthly cap (default: 1200)

Required on n8n (set via `$env` or hardcoded in credential):
- `GDA_BASE_URL` — Base URL of the GDA backend
- `GDA_WEBHOOK_KEY` — Same shared key

### 3. Verify

```bash
# Manual poll trigger via n8n webhook
curl -X POST https://n8n.csr-llc.tech/webhook/govtribe-cron-trigger

# Direct poll via GDA API
curl -X POST -H "x-gda-key: $GDA_WEBHOOK_KEY" -H "Content-Type: application/json" \
  $GDA_URL/api/ingest/govtribe/poll

# Check Source Health (includes credit cap status)
curl -H "Authorization: Bearer $TOKEN" $GDA_URL/api/qa/source-health | \
  jq '.data.sources[] | select(.source == "govtribe_zapier")'

# Check credit usage specifically
curl -H "Authorization: Bearer $TOKEN" $GDA_URL/api/qa/source-health | \
  jq '.data.govtribe_credits'
```

## Field Mapping

| GovTribe MCP Field | GDA Column | Notes |
|---|---|---|
| `govtribe_id` | `id` (prefixed as `govtribe-{id}`) | Prevents collision with SAM IDs |
| `name` | `title` | |
| `solicitation_number` / `contract_number` | `solicitation_number` | Key for SAM cross-reference |
| `set_aside_type` | `set_aside` | |
| `due_date` | `due_date` | |
| `government_description` / `description` | `description` | Full scope of work text |
| `ai_description` | `ai_summary` | GovTribe AI-generated summary |
| `govtribe_url` | `raw_source_url` | |
| `opportunity_type` | `status` | Mapped: Award→won, Solicitation→qualified, Pre-Sol→discovery |

## SAM Enrichment (Automatic, Free)

After ingest, each opportunity with a `solicitation_number` is automatically enriched via SAM.gov:

| Enriched Field | Source | Cost |
|---|---|---|
| `naics` | SAM API by solicitation number | Free |
| `agency` | SAM API `fullParentPathName` | Free |
| `department` | SAM API `fullParentPathName` | Free |
| `psc` | SAM API `classificationCode` | Free |
| `value_estimated` | SAM API `award.amount` | Free |
| `place_of_performance` | SAM API `placeOfPerformance` | Free |
| `incumbent` | SAM Award Notice `award.awardee.name` | Free |

**Coverage:** ~80-90% of federal opportunities have solicitation numbers in SAM.

## Incumbent Enrichment — Confidence Levels

| Confidence | Source | When Used | Auto-Populate? |
|---|---|---|---|
| `high` | SAM Award Notice (exact solicitation match) | Direct awardee found | Yes |
| `high` | USAspending PIID match | Award ID derivable | Yes |
| `medium` | USAspending fuzzy (keyword+agency+NAICS, top result ≥1.2x second) | Relevance ≥70 or core keyword/NAICS | Yes, with flag |
| `low` | USAspending fuzzy (top result <1.2x second, ambiguous) | Same gating as medium | No — flagged for manual review |

Low-confidence records appear in Source Health panel: *"N opportunities with low-confidence incumbent matches awaiting review"*

## Webhook Registry

The `govtribe-ingest` webhook is registered in `packages/backend/src/lib/webhook-registry.ts`:

```typescript
"govtribe-ingest": {
  path: "govtribe-ingest",
  status: "live",
  n8nWorkflow: "GDA.ingest.govtribe-cron",
  usedBy: "ingest.ts",
  description: "GovTribe MCP → n8n cron → GDA ingest pipeline (Tier 1, direct poll)",
}
```

## Architecture Change: Zapier → Direct Poll

Originally designed as `GovTribe Saved Searches → Zapier → n8n webhook → GDA ingest`.
Changed to `n8n cron → GDA poll endpoint → GovTribe MCP → GDA ingest`.

**Reason:** Zapier login blocked by CAPTCHA and Google OAuth, no programmatic API for Zap creation.

**Cost comparison:** MCP polling at 2×/week (~$49/month at 8,500 credit pack) replaces Zapier Pro ($49.99/month flat). Cost-neutral. Eliminates third-party dependency, moves search logic into version-controlled code, no manual Zap maintenance.
