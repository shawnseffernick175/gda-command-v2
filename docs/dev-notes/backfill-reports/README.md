# Backfill Validator Reports

Audit trail for one-shot data quality backfill runs over the `opportunities` table.

## 2026-06-11 — First production --apply

- **Scope:** All 15,097 active opportunities
- **Mode:** apply (writes committed)
- **Rules in effect:** Opp Validator v3_072 + NAICS allowlist (PR #785)
- **Unchanged:** 7,069
- **Data normalized:** 253 (R1: 121, R6: 96, R3: 37, R2: 2)
- **Relevance changed:** 7,122
- **Quarantined:** 0
- **Pipeline-protected (skipped):** 835

See `backfill_apply_2026-06-11.json` for full report including sample diffs.
