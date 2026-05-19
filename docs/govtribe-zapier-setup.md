# GovTribe Tier 1: Zapier → n8n → GDA Ingest Pipeline

## Architecture

```
GovTribe Saved Searches → Zapier (Pro, $49.99/month) → n8n webhook → GDA /api/ingest/govtribe
                                                                      ↓
                                                                SAM.gov enrichment (free)
                                                                      ↓
                                                                USAspending fallback (free)
```

**Cost:** $0/month in MCP credits. Zapier Pro at $49.99/month for 2,000 tasks.

## Setup Steps

### 1. Create GovTribe Saved Searches

Log into [GovTribe](https://govtribe.com) and create saved searches for each category:

| # | Name | Type | Keywords | NAICS Filter |
|---|------|------|----------|--------------|
| 1 | GDA-Opps-Core | Federal Opportunities | SETA, C5ISR, PEO IEW&S, cybersecurity, systems engineering | 541511, 541512, 541519, 541330, 541611, 541690 |
| 2 | GDA-Opps-Growth | Federal Opportunities | CMMC, AI/ML, XR/AR, DEVCOM, synthetic training | 541511, 541512, 541715, 518210 |
| 3 | GDA-Opps-Opportunistic | Federal Opportunities | advisory services, innovation, ISR, EW | 541611, 541690, 541715 |
| 4 | GDA-Awards-Core | Federal Awards | SETA, C5ISR, cybersecurity, systems engineering | 541511, 541512, 541519, 541330 |
| 5 | GDA-Awards-Growth | Federal Awards | CMMC, AI/ML, DEVCOM | 541511, 541512, 541715 |
| 6 | GDA-Forecasts-Core | Federal Forecasts | SETA, C5ISR, PEO IEW&S, cybersecurity | 541511, 541512, 541519 |
| 7 | GDA-Forecasts-Growth | Federal Forecasts | AI/ML, CMMC, DEVCOM, innovation | 541715, 518210 |

### 2. Create n8n Workflow: `GDA.ingest.govtribe-zapier`

In n8n, create a new workflow:

1. **Webhook node** — path: `govtribe-ingest`, method: POST
2. **HTTP Request node** — POST to `${GDA_BASE_URL}/api/ingest/govtribe`
   - Headers: `x-gda-key: ${GDA_WEBHOOK_KEY}`
   - Body: forward the incoming Zapier payload as-is
3. Activate the workflow

The webhook URL will be: `${N8N_BASE_URL}/webhook/govtribe-ingest`

### 3. Create Zapier Zaps

For each saved search, create a Zapier Zap:

**Trigger:** GovTribe → "New Results for [Saved Search Type] Saved Search"
- Select the saved search created in step 1

**Action:** Webhooks by Zapier → POST
- URL: Your n8n webhook URL from step 2
- Payload Type: JSON
- Data: Map all available GovTribe fields

Create 7 Zaps (one per saved search). All point to the same n8n webhook URL.

### 4. Verify

After a Zap triggers (or test manually in Zapier):

```bash
# Check Source Health
curl -H "Authorization: Bearer $TOKEN" $GDA_URL/api/qa/source-health | jq '.data.sources[] | select(.source == "govtribe_zapier")'

# Check ingested opportunities
curl -H "Authorization: Bearer $TOKEN" $GDA_URL/api/ingest/status | jq '.data.recordCounts'
```

## Field Mapping

| GovTribe Zapier Field | GDA Column | Notes |
|---|---|---|
| `id` | `id` (prefixed as `govtribe-{id}`) | Prevents collision with SAM IDs |
| `name` / `title` | `title` | |
| `solicitation_number` | `solicitation_number` | Key for SAM cross-reference |
| `set_aside_type` | `set_aside` | |
| `due_date` | `due_date` | |
| `government_description` | `description` | Full scope of work text |
| `ai_description` | `ai_summary` | GovTribe AI-generated summary |
| `source_url` / `url` | `raw_source_url` | |
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
| `medium` | USAspending fuzzy (keyword+agency+NAICS, top result >2x second) | Relevance ≥70 or core keyword/NAICS | Yes, with flag |
| `low` | USAspending fuzzy (multiple similar-scoring candidates) | Same gating as medium | No — flagged for manual review |

Low-confidence records appear in Source Health panel: *"N opportunities with low-confidence incumbent matches awaiting review"*

## Webhook Registry

The `govtribe-ingest` webhook is registered in `webhook-registry.ts` with status `planned`. Once the n8n workflow is activated, update the status to `live`:

```typescript
// In webhook-registry.ts, change:
status: "planned" → status: "live"
```

## Zapier Task Budget

| Plan | Tasks/Month | Cost | Fits? |
|---|---|---|---|
| Free | 100 | $0 | No — 720-1,920 projected |
| Starter | 750 | $19.99 | Tight with NAICS filters |
| **Pro** | **2,000** | **$49.99** | **Recommended — headroom for all 7 searches** |
