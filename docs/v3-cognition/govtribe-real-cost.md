# GovTribe Real-Cost Breakdown (V3)

> **Owner:** Shawn Seffernick — paid personally, not company-funded.

## Annual Cost Summary

| Item | Annual Cost | Notes |
|------|-------------|-------|
| GovTribe Launch Plus subscription | $1,200/yr | Includes unlimited saved searches, MCP access |
| MCP credit packs (~8,500 credits × ~$49/mo usage) | ~$588/yr | 2 cycles/week × ~115 credits/cycle × 52 weeks |
| **Total** | **~$1,788/yr** | Conservative estimate |

## Monthly Breakdown

| Item | Monthly Cost |
|------|-------------|
| Subscription (prorated) | $100/mo |
| MCP credits (actual usage) | ~$49/mo |
| **Total** | **~$149/mo** |

## Credit Budget Guardrails

| Guardrail | Value | Behavior |
|-----------|-------|----------|
| Monthly cap | 1,200 credits | New months initialized at 1,200 |
| Alert threshold | 960 (80%) | Sentinel warns, restricts to on-demand |
| Stop threshold | 1,140 (95%) | Hard stop — no auto-polling |
| Per-cycle cap | 150 credits | Stops mid-poll, remaining searches skipped |

### Why These Defaults Matter

Wrong defaults (e.g., 5000/mo budget) would allow the system to burn Shawn's
personal credits at **4× the intended rate** before any guardrail triggers.
The 1,200/mo cap with 150/cycle enforcement ensures:

- Maximum 2 polls/week (Mon + Thu 6am ET)
- ~115 credits/cycle × 8 cycles/month = ~920 credits/month
- ~30% headroom for volume spikes or added searches
- Hard stop at 1,140 prevents runaway bills

## Poll Cadence

| Job | Schedule | Credits/Run |
|-----|----------|-------------|
| `govtribe.opps.poll` | Mon + Thu 10:00 UTC (6am ET) | ~115 |
| `govtribe.contacts.poll` | Mon 09:00 UTC | ~20 |
| `govtribe.vehicles.poll` | 1st of month | ~5 |
| `govtribe.budget.rollup` | Nightly 03:55 UTC (23:55 ET) | 0 |

## Saved Search Configs (7 total)

### Opportunities (3 searches, ~45 credits/cycle)

| # | Name | Keywords | NAICS | Credits/page |
|---|------|----------|-------|-------------|
| 1 | GDA-Opps-Core | SETA, C5ISR, PEO IEW&S, CPE IEW&S, PEO C3N, CPE C3N, cybersecurity, systems engineering | 541511, 541512, 541519, 541330, 541611, 541690 | ~15 |
| 2 | GDA-Opps-Growth | CMMC, AI/ML, XR/AR, DEVCOM, synthetic training | 541511, 541512, 541715, 518210 | ~15 |
| 3 | GDA-Opps-Opportunistic | advisory services, innovation, ISR, EW | 541611, 541690, 541715 | ~15 |

### Awards (2 searches, ~40 credits/cycle)

| # | Name | Keywords | NAICS | Credits/page |
|---|------|----------|-------|-------------|
| 4 | GDA-Awards-Core | SETA, C5ISR, PEO IEW&S, CPE IEW&S, cybersecurity, systems engineering | 541511, 541512, 541519, 541330 | ~20 |
| 5 | GDA-Awards-Growth | CMMC, AI/ML, DEVCOM | 541511, 541512, 541715 | ~20 |

### Forecasts (2 searches, ~30 credits/cycle)

| # | Name | Keywords | NAICS | Credits/page |
|---|------|----------|-------|-------------|
| 6 | GDA-Forecasts-Core | SETA, C5ISR, PEO IEW&S, CPE IEW&S, cybersecurity | 541511, 541512, 541519 | ~15 |
| 7 | GDA-Forecasts-Growth | AI/ML, CMMC, DEVCOM, innovation | 541715, 518210 | ~15 |

## RAG Integration

Each GovTribe result ingested is also written to the RAG knowledge base:
- `doc_type`: `govtribe`
- `evidence_grade`: `B`
- Chunked and embedded via the F-301 ingest path
- Enables semantic search over government opportunity intelligence

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GOVTRIBE_API_KEY` | — | Bearer token for GovTribe MCP |
| `GOVTRIBE_CYCLE_CREDIT_CAP` | 150 | Per-cycle cap (stops mid-poll) |
| `GOVTRIBE_MONTHLY_CREDIT_CAP` | 1200 | Monthly cap for new months |
| `ENABLE_GOVTRIBE_INGEST` | true | Master kill switch |

## Comparison with V2 (Zapier-based)

| Dimension | V2 (Zapier) | V3 (Direct MCP) |
|-----------|-------------|-----------------|
| Intermediary | Zapier Pro ($49.99/mo) | None (direct backend cron) |
| Search logic | Zapier Zaps (manual config) | Version-controlled TS configs |
| Credit tracking | Manual | Automated ledger + sentinel |
| RAG integration | None | Automatic kb_documents ingest |
| Cadence control | Zapier UI | Cron expression in code |
| Cost visibility | Zapier dashboard | /v3/govtribe/credits endpoint |
