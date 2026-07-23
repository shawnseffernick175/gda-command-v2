# Test Plan — Financial Bible reporting views (PR #1184, F-625)

## What changed (grounding)
- **Real PR #1184 frontend diff** (vs `main`): only `packages/frontend-v3/src/components/financials/tabs/ApTab.tsx` (+77) and `src/lib/types.ts` (+1 → `ApRow.status: string | null`). Other tabs (AR/TB/ProjRev/P2) were the prior #1183 revamp, treated here as **regression**.
- Backend: `ap_actuals.status` nullable column (migration `v3_143`), `/v3/financials/ap` now returns `status` per row (`apps/backend-v3/src/routes/financials.ts:618`).
- AP tab logic (`ApTab.tsx`): `hasStatus = statusRowCount > 0` (rows with non-null `status`). When `hasStatus`:
  - "On HOLD" KPI (`holdAmt`, red) replaces "Past Due" KPI (`ApTab.tsx:218-222`)
  - "Open Payables by Payment Status" donut renders (`:227-234`), colors: HOLD=red, PPHOLD=orange, PAID=green (`statusColor` `:26-32`)
  - "Status" column added to detail table (`:267-269`, `:281-283`)
  - Source strip `note` is **absent** (`:295`)
  - When `!hasStatus`: "Past Due" KPI, NO donut, NO Status column, source-strip note "payment status (HOLD/PAID) shown once the Open AP report is re-ingested".
  - Donut segments (`statusEntries`) sum to `total` because every seeded row has a status → internal consistency check.

## Environment (already set up — not part of plan)
- Backend `:4000`, Frontend `:3000`, Postgres (docker `gda-postgres`), migrations through `v3_143` applied.
- Login: `admin@gda-command.local` / `admin123`.
- Seeded: `ap_actuals` 10 rows (source `test_seed`, initially **status = NULL**), `ar_actuals` 7 rows. Income Statement has 2 seeded actuals; Trial Balance & Project Revenue are empty (expected graceful empty state).
- Seeded AP totals: total = **$270,000**; Current = $85,000 (31.5%); Past Due (overdue) = **$185,000 (68.5%)**; Top vendor = Northrop Subcontract **$85,000**.
- Status phase (applied mid-test via SQL): HOLD=$243,000 (90.0%), PAID=$15,000, PPHOLD=$12,000; sum = $270,000.

---

## Test 1 — AP tab FALLBACK (no status data)  [PRIMARY]
Precondition: all `ap_actuals.status` are NULL (seeded default).
Steps: Log in → open `/financials` → click **Accounts Payable** tab.
Pass criteria (all must hold):
1. **KPI row shows "Past Due" = $185.0K** (or $185,000-ish formatted), subtitle "68.5% of AP". There is **NO "On HOLD" KPI**.
2. There is **NO "Open Payables by Payment Status" donut** section on the page.
3. Detail table header has columns: Period, Vendor, Invoice #, Amount, Age Bucket, Due Date — and **NO "Status" column**.
4. "Payables by Age Bucket (risk-colored)" bar renders with bars; Current bar green-ish, Over-90 bar red-ish (risk ramp).
5. "Top Vendors by Open Payable" horizontal bar renders (Northrop Subcontract largest ≈ $85K).
6. Source strip reads: `Source: ingested table ap_actuals · 10 rows · period FY26 Jun · payment status (HOLD/PAID) shown once the Open AP report is re-ingested`.
7. Browser console shows **no runtime errors** (check devtools console / browser_console tool).
Fail-if-broken rationale: a broken fallback would either crash, show an empty donut, or show the "On HOLD" KPI / Status column with no data.

## Test 2 — AP tab WITH STATUS (re-ingested state)  [PRIMARY]
Action (mid-test data change): run SQL to set status on all 10 rows (HOLD/PAID/PPHOLD as above), then hard-reload the AP tab.
Pass criteria:
1. **"On HOLD" KPI appears = $243.0K**, subtitle "90.0% of AP withheld". The "Past Due" KPI is **gone**.
2. **"Open Payables by Payment Status" donut renders** with exactly 3 segments: HOLD (red, largest ~90%), PAID (green), PPHOLD (orange). Legend shows HOLD/PAID/PPHOLD.
3. Donut internal consistency: hovering segments (tooltip) shows HOLD $243,000.00 (90.0%), PAID $15,000.00 (5.6%), PPHOLD $12,000.00 (4.4%) → **segments sum to $270,000 = Total Payables KPI**.
4. Detail table now has a **"Status" column** showing HOLD/PAID/PPHOLD per row.
5. Source strip note about re-ingest is **gone** (just `... · 10 rows · period FY26 Jun`).
6. Console shows no runtime errors.
Fail-if-broken rationale: proves the new status donut/KPI/column path is wired to real `status` data and toggles correctly vs Test 1.

## Test 3 — AR tab (regression, laptop-first layout)
Steps: click **Accounts Receivable** tab.
Pass criteria:
1. Health KPI row: Total Receivables ($330K), % Current (66.7%), Past Due ($110K / 33.3%), Top Customer (US Army CECOM $160K).
2. **Horizontal 100%-stacked "Receivables Aging — composition"** bar renders (single horizontal bar, segmented by bucket, laptop width, no horizontal scroll).
3. "Top Customers by Open Receivable" bar renders.
4. "Receivables by Contract (month-by-month matrix)" row is **collapsed by default** (▸). Clicking it expands (▾) and renders the matrix without error; clicking again collapses.
5. Source strip: `Source: ingested table ar_actuals · 7 rows · period FY26 Jun`.
6. No console runtime errors.

## Test 4 — Remaining tabs render without errors (regression)
Steps: click **Income Statement**, **Trial Balance**, **Project Revenue** tabs in turn.
Pass criteria:
1. **Income Statement**: renders KPI tiles (YTD revenue $555K etc.) / statement content, no crash.
2. **Trial Balance**: renders without crash — graceful empty state (no data) is acceptable; must NOT throw a runtime error / blank white screen.
3. **Project Revenue**: renders without crash — graceful empty state acceptable.
4. Console clean of runtime errors across all three.
Note: TB & Project Revenue have no seed data locally → verifying graceful empty rendering, not populated content (will be labeled a limitation in the report).

---

## Status-update SQL (Test 2 trigger)
```sql
UPDATE ap_actuals SET status='PAID'   WHERE invoice_number='INV-3001' AND source='test_seed';
UPDATE ap_actuals SET status='PPHOLD' WHERE invoice_number='INV-6001' AND source='test_seed';
UPDATE ap_actuals SET status='HOLD'   WHERE source='test_seed' AND status IS NULL;
```
