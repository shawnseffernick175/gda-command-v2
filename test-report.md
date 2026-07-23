# Test Report — Financial Bible reporting views (PR #1184, F-625)

**Branch:** `devin/1784831343-fix-financial-ingest-accuracy`
**Scope:** Runtime, end-to-end UI testing of the Financial Bible AP/AR tabs and adjacent tabs (frontend `packages/frontend-v3`, backend `apps/backend-v3`).
**How tested:** Ran backend (`:4000`) + frontend (`:3000`) locally against a local Postgres (docker `gda-postgres`) with migrations applied through `v3_143_ap_actuals_status`. Seeded deterministic AP (10 rows) and AR (7 rows) data to exercise both the no-status fallback and the status-present state. Logged into the real UI (`admin@gda-command.local`) and drove every tab by hand.

## Result summary

| # | Test | Result |
|---|------|--------|
| 1 | AP tab **fallback** (no status data) | ✅ Passed |
| 2 | AP tab **with status** — On HOLD KPI, Status column, source note toggle | ✅ Passed |
| 2 | AP tab **with status** — payment-status **donut** | ❌ **Failed — donut renders blank** |
| 3 | AR tab laptop-first layout + collapsible matrix | ✅ Passed |
| 4 | Income Statement / Trial Balance / Project Revenue render (regression) | ✅ Passed |

## 🔴 Key finding — the new payment-status donut renders blank

The headline feature of this PR — the **"Open Payables by Payment Status" donut** (HOLD/PAID/PPHOLD) — does **not render**. When `ap_actuals` rows carry a non-null `status`, the panel header appears but the chart area is completely empty, and the browser console logs:

```
[ECharts] Series pie is used but not imported.
import { PieChart } from 'echarts/charts';
echarts.use([PieChart]);
```

**Root cause:** the shared ECharts registry `packages/frontend-v3/src/lib/echarts-setup.ts` registers `BarChart` and `LineChart` but **not `PieChart`**. The donut in `ApTab.tsx` uses `type: "pie"`, so ECharts silently refuses to draw it. The aging/vendor **bar** charts render fine because `BarChart` is registered.

**Confirmed fix (test-only, reverted):** I temporarily added `PieChart` to `echarts-setup.ts`. After reload the donut rendered correctly — HOLD 90% / PAID 6% / PPHOLD 4%, segments summing to the $270K total — proving the missing registration is the sole cause. This edit was reverted; the PR code is unchanged (`git diff` clean).

**Suggested fix for the PR:**
```ts
// packages/frontend-v3/src/lib/echarts-setup.ts
import { BarChart, LineChart, PieChart } from "echarts/charts";
echarts.use([ BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer ]);
```

---

## Test 1 — AP fallback (no status data) ✅

Precondition: all 10 `ap_actuals.status` are NULL.

- "Past Due" KPI shown ($185.0K, 68.5% of AP); **no** "On HOLD" KPI.
- **No** payment-status donut section.
- Detail table has **no** "Status" column.
- Aging bar (risk-colored) and vendor concentration bar both render.
- Source strip includes the re-ingest note: `payment status (HOLD/PAID) shown once the Open AP report is re-ingested`.
- Console clean (no runtime errors).

![AP fallback — Past Due KPI, no donut, re-ingest note](https://app.devin.ai/attachments/f9565c78-8f91-4a45-973a-6494924915ab/ss_95d9f020.png)

## Test 2 — AP with status data ⚠️ (KPI/table pass, donut fails)

Action: set status on all 10 rows via SQL (HOLD=$243K, PAID=$15K, PPHOLD=$12K) and hard-reloaded.

Working correctly:
- **"On HOLD" KPI** appears = **$243.0K, "90.0% of AP withheld"**; "Past Due" KPI removed.
- Detail table gains a **"Status" column** (HOLD/PAID/PPHOLD per row).
- Source-strip re-ingest note is **gone** (`· 10 rows · period FY26 Jun`).

![AP with status — On HOLD KPI $243.0K](https://app.devin.ai/attachments/6873f875-131e-45ce-9dc1-d9088451d66f/ss_zoom_fb8cda0b.png)

![AP with status — Status column HOLD/PAID/PPHOLD, note removed](https://app.devin.ai/attachments/f9791c6e-5bf6-41a1-a733-60218435c5c3/ss_bafce4be.png)

**Failing:** the donut panel is blank.

![Donut panel BLANK — pie series not imported](https://app.devin.ai/attachments/d9bebf53-c7d2-482e-8ef9-fc29f47c7174/ss_90511798.png)

Zoomed — header renders, chart area empty:

![Blank donut zoom](https://app.devin.ai/attachments/e5b56350-31b2-48c0-bf24-97b2eed21da5/ss_zoom_73a22323.png)

**Proof of root cause (temporary PieChart registration, reverted):** donut renders 90/6/4, sums to $270K.

![Donut renders correctly after test-only PieChart fix](https://app.devin.ai/attachments/7a3de9a5-1c20-4eef-bfed-ecccb725b10c/ss_zoom_5153e7a0.png)

## Test 3 — AR tab (laptop-first) ✅

- Health KPIs: Total Receivables $330.0K, % Current 66.7%, Past Due $110.0K (33.3%), Top Customer US Army CECOM $160.0K.
- Horizontal 100%-stacked "Receivables Aging — composition" bar renders (laptop width, no horizontal scroll).
- "Top Customers by Open Receivable" bar renders.
- "Receivables by Contract" matrix **collapsed by default (▸)**; expands (▾) to a contract matrix totaling **$330,000**, and collapses again on second click.
- Source strip: `ar_actuals · 7 rows · period FY26 Jun`.
- Console clean.

![AR tab — KPIs + horizontal aging bar + customer bar](https://app.devin.ai/attachments/651116f4-10ad-4735-a2df-3bbeb9b0afcb/ss_a0d1515a.png)

![AR matrix expanded — totals $330K](https://app.devin.ai/attachments/fc7cda05-cf21-4f4f-a80f-5b26276fc5a2/ss_69f63545.png)

## Test 4 — Remaining tabs (regression) ✅

- **Income Statement**: renders YTD tiles ($555.0K / $479.5K / $75.5K / 38.9%) + source strip; no crash.
- **Trial Balance**: graceful empty state ("Trial balance data not yet ingested"); no crash.
- **Project Revenue**: graceful empty state ("Project revenue data not yet ingested"); no crash.
- Console clean across all three.

![Income Statement — YTD tiles](https://app.devin.ai/attachments/ddaaa62c-746f-4daf-b156-366d792d2ccc/ss_141ef44d.png)

![Trial Balance — graceful empty state](https://app.devin.ai/attachments/3c730940-8375-461a-87b4-640ed2bb525e/ss_f8e268f1.png)

![Project Revenue — graceful empty state](https://app.devin.ai/attachments/aa55fc2e-2630-4696-92df-4d474a241c11/ss_cf78cee8.png)

---

## Notes & limitations

- Trial Balance and Project Revenue have no seed data locally, so only graceful **empty-state** rendering was verified (not populated content).
- Minor observation (non-blocking): in the fixed donut, the HOLD (red) and PPHOLD (orange) segments are similar hues; worth a visual check once the donut is enabled.
- Test data was locally seeded (`source='test_seed'`); no real June financial documents were used, per instructions.
