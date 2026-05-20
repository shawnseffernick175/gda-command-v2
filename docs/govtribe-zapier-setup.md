# GovTribe Tier 1: Direct MCP Poll → GDA Ingest Pipeline

## Architecture

```
n8n Cron (every 4h) → POST /api/ingest/govtribe/poll
                        ↓
                   GovTribe MCP (7 saved search configs)
                        ↓
                   Upsert to opportunities table
                        ↓
                   SAM.gov enrichment (free)
                        ↓
                   USAspending fallback (free)
```

**Cost:** GovTribe MCP credits only (3-4 credits per 10 results per search). No Zapier subscription needed.

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
1. Runs all 7 searches against GovTribe MCP at `https://govtribe.com/mcp`
2. Deduplicates results by `govtribe_id`
3. Upserts each record into the `opportunities` table (prefixed as `govtribe-{id}`)
4. Auto-enriches via SAM cross-reference and USAspending fallback
5. Updates `gov_source_feeds` tracking

## Setup

### 1. n8n Cron Workflow

Import `docs/n8n-govtribe-workflow.json` into n8n. The workflow:
- **Cron trigger**: runs every 4 hours
- **Manual trigger**: webhook at `/webhook/govtribe-cron-trigger` for on-demand polling
- **HTTP Request**: calls `POST /api/ingest/govtribe/poll` with `x-gda-key` auth

n8n Workflow ID: `5KuF4KZ8uxYcbUN5` (GDA.ingest.govtribe-cron)

### 2. Environment Variables

Required on the GDA backend:
- `GOVTRIBE_API_KEY` — Bearer token for GovTribe MCP
- `GDA_WEBHOOK_KEY` — Shared key for n8n → GDA auth

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

# Check Source Health
curl -H "Authorization: Bearer $TOKEN" $GDA_URL/api/qa/source-health | \
  jq '.data.sources[] | select(.source == "govtribe_zapier")'
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

**Benefits:**
- Eliminates Zapier dependency and $49.99/month subscription
- All search logic lives in GDA backend (TypeScript, testable, version-controlled)
- n8n only handles scheduling — no secrets or complex logic needed
- Same SAM enrichment + confidence scoring pipeline
