# FORCE Task Order — Per-Year Ceiling Breakdown

**Last verified:** 2026-06-25
**Contract:** W15P7T19D0206 / Task Order W56KGU26FA010 (FORCE)
**Customer:** W6QK ACC-APG (U.S. Army, Aberdeen Proving Ground)
**Total ceiling:** $107,279,341.63 (ties to the sum below exactly, $0 difference)
**Vault doc:** id=194 (bucket "contract")
**task_orders:** id=5, funded $30,000, PoP 2026-06-15 → 2031-12-30, is_seed=false
**Booked:** $107,279,341.63 to Orders in financial_actuals (period 'FY26 Jun', FY2026 Q3, is_seed=false, source_doc_id=194)

> Revenue/billing recognition starts **July 1, 2026** — NOT before. Orders are booked now; revenue stays $0 until July.

## Per-year amounts (verified)

Each contract year runs **July 1 → June 30**. Each year total = Labor cost + Fixed Fee + Materials/ODC + Travel. Monthly spread = that contract year's total ÷ 12.

| Period | Contract Year | Year Total | Monthly (÷12) |
|---|---|---|---|
| Base Year | 07/01/2026 – 06/30/2027 | $19,205,951.09 | $1,600,495.92 |
| Option Year 1 | 07/01/2027 – 06/30/2028 | $19,700,302.35 | $1,641,691.86 |
| Option Year 2 | 07/01/2028 – 06/30/2029 | $20,069,372.40 | $1,672,447.70 |
| Option Year 3 | 07/01/2029 – 06/30/2030 | $20,368,569.35 | $1,697,380.78 |
| Option Year 4 | 07/01/2030 – 06/30/2031 | $20,779,543.22 | $1,731,628.60 |
| 6-Month Extension | 07/01/2031 – 12/30/2031 | $7,155,603.22 | $1,192,600.54 (÷6) |
| **Total** | | **$107,279,341.63** | |

## Spread rule for Contract Waterfall (issue #997)

- Each year's total is spread evenly across its 12 months (the 6-month extension across 6 months).
- Revenue line begins July 2026; nothing before.
- Profit line = revenue × per-contract average margin (fallback: portfolio average) — see Contract Waterfall rebuild (#997).

This is the authoritative source for FORCE per-year figures. No SSH or vault access is required to read these — they are committed here in the repo.
