# GovTribe Real Cost Breakdown — V3 Configuration

**Source:** V2 production doc (`docs/govtribe-zapier-setup.md`)
**Ownership:** Shawn-paid personally. NOT company-paid.
**Status:** Authoritative for all V3 Sentinel displays and budget calculations.

---

## Subscription

| Line Item | Annual Cost | Monthly Equivalent |
|-----------|-------------|-------------------|
| GovTribe Launch Plus subscription | $1,200/yr (effective, negotiated down from $1,900 list) | ~$100/mo |
| MCP credit pack (8,500 credits) | ~$588/yr | ~$49/mo |
| **Total** | **~$1,788/yr** | **~$149/mo** |

**Note:** The $1,900/yr list price was negotiated to $1,200/yr effective. Budget calculations use the $1,200/yr figure.

---

## Credit Budget Guardrails

| Guardrail | Value | Env Var | Behavior |
|-----------|-------|---------|----------|
| Monthly cap | 1,200 credits | `GOVTRIBE_MONTHLY_CREDIT_CAP` | Denominator for all % calculations |
| Per-cycle cap | 150 credits | `GOVTRIBE_CYCLE_CREDIT_CAP` | Stops mid-poll, remaining searches skipped |
| 80% alert threshold | 960 credits | (derived) | Sentinel warns; restricts to on-demand only |
| 95% hard-stop threshold | 1,140 credits | (derived) | Polling STOPPED; only opp detail on user request |

---

## Expected Monthly Burn

| Metric | Value |
|--------|-------|
| Credits per cycle | ~115 |
| Cycles per week | 2 (Mon + Thu) |
| Weeks per month | ~4.3 |
| **Expected monthly burn** | **~920 credits/mo** |
| Headroom (1,200 - 920) | ~280 credits (~23%) |

---

## Credit Math Per Cycle (7 Saved Searches)

| Search Type | Count | Credits per search (50 results) | Subtotal |
|-------------|-------|-------------------------------|----------|
| Opportunities (3 credits/10 results) | 3 | 15 | 45 |
| Awards (4 credits/10 results) | 2 | 20 | 40 |
| Forecasts (3 credits/10 results) | 2 | 15 | 30 |
| **Total** | **7** | | **115** |

---

## Poll Cadence

- **Schedule:** Monday + Thursday at 6:00 AM ET (10:00 UTC)
- **Cron expression:** `0 10 * * 1,4`
- **Runs per month:** ~8.6
- **Rationale:** Matches V2 production setup; prevents burning through cap in ~10 days (which the previous every-8h schedule would have done: 90 runs/mo × 115 credits = 10,350 credits, far exceeding the 1,200 cap)

---

## 7 Named Saved Searches

| # | Name | MCP Tool | Keywords | NAICS Filter |
|---|------|----------|----------|--------------|
| 1 | GDA-Opps-Core | Search_Federal_Contract_Opportunities | SETA \| C5ISR \| "PEO IEW&S" \| "CPE IEW&S" \| "PEO C3N" \| "CPE C3N" \| cybersecurity \| "systems engineering" | 541511, 541512, 541519, 541330, 541611, 541690 |
| 2 | GDA-Opps-Growth | Search_Federal_Contract_Opportunities | CMMC \| "AI/ML" \| "XR/AR" \| DEVCOM \| "synthetic training" | 541511, 541512, 541715, 518210 |
| 3 | GDA-Opps-Opportunistic | Search_Federal_Contract_Opportunities | "advisory services" \| innovation \| ISR \| EW | 541611, 541690, 541715 |
| 4 | GDA-Awards-Core | Search_Federal_Contract_Awards | SETA \| C5ISR \| "PEO IEW&S" \| "CPE IEW&S" \| cybersecurity \| "systems engineering" | 541511, 541512, 541519, 541330 |
| 5 | GDA-Awards-Growth | Search_Federal_Contract_Awards | CMMC \| "AI/ML" \| DEVCOM | 541511, 541512, 541715 |
| 6 | GDA-Forecasts-Core | Search_Federal_Forecasts | SETA \| C5ISR \| "PEO IEW&S" \| "CPE IEW&S" \| cybersecurity | 541511, 541512, 541519 |
| 7 | GDA-Forecasts-Growth | Search_Federal_Forecasts | "AI/ML" \| CMMC \| DEVCOM \| innovation | 541715, 518210 |

---

## Comparison: V2 vs. V3 (before this fix)

| Setting | V3 (before fix) | V3 (after fix = V2 reality) |
|---------|-----------------|----------------------------|
| Monthly cap | 5,000 | **1,200** |
| Per-cycle cap | (not enforced) | **150** |
| Cadence | every 8h (~90 runs/mo) | **Mon + Thu 6am ET (~8.6 runs/mo)** |
| Searches | generic `GET /opportunities` | **7 named saved searches** |
| Monthly burn | ~10,350 (would blow cap) | **~920** |
| Alert threshold | 4,000 (80% of 5000) | **960** (80% of 1200) |
| Hard-stop threshold | 4,750 (95% of 5000) | **1,140** (95% of 1200) |

---

## Key Clarification

- **GovTribe = Shawn-paid** ($1.2k/yr subscription + ~$49/mo credits)
- **GovWin = company-paid** (separate connector, separate budget)
- These were transposed in earlier docs — this document is now authoritative.
