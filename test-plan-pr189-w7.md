# Test Plan — PR #189 (W7: Count Reconciliation)

## What Changed
The Launchpad (Home page) previously had a single "Total Opportunities" KPI card. Now it has two: **"Total Tracked"** (all non-deleted opportunities) and **"Active Pipeline"** (excludes won/lost/no_bid/gov_cancelled). Both surfaces — Launchpad and Ops Tracker — now query canonical Postgres views so counts always reconcile. The Ops Tracker has a new "Active / All Tracked" toggle chip that shows which canonical view is being used.

## Ground Truth (from live API + DB)
- `GET /api/dashboard/kpis` returns `totalOpportunities: 31`, `activePipeline: 28`
- DB views: `v_opportunity_all_tracked` = 31, `v_opportunity_active` = 28 (differs by won=1, lost=1, no_bid=1)
- `countSource: "canonical_view"` in response metadata

## Test 1: Launchpad KPI Cards Show Correct Counts

**Steps:**
1. Navigate to `http://localhost:3000/` (Home / Launchpad)
2. Observe the KPI strip at the top of the page

**Pass/Fail Criteria:**
- PASS: First KPI card labeled **"Total Tracked"** shows **"31"**
- PASS: Second KPI card labeled **"Active Pipeline"** shows **"28"** with green accent
- FAIL: If either card shows "0", "—", or any other number, or if the old "Total Opportunities" label is still present
- FAIL: If there is only one opportunity KPI card instead of two

## Test 2: Launchpad → Ops Tracker Navigation

**Steps:**
1. On the Home page, click the **"Total Tracked"** KPI card
2. Observe the URL and page state

**Pass/Fail Criteria:**
- PASS: URL becomes `/ops-tracker?filter=all_tracked`
- PASS: The "All Tracked" pill button is highlighted (active state — blue background, white text)
- PASS: The italic view label below the pills reads **"v_opportunity_all_tracked"**
- FAIL: If URL doesn't include `?filter=all_tracked`, or if "Active" pill is highlighted instead

## Test 3: Ops Tracker View Filter Toggle

**Steps:**
1. On the Ops Tracker page (arrived from Test 2 in "All Tracked" mode)
2. Click the **"Active"** pill button
3. Observe the count and view label change

**Pass/Fail Criteria:**
- PASS: After clicking "Active", the "Active" pill becomes highlighted (blue)
- PASS: The italic view label changes to **"v_opportunity_active"**
- PASS: The opportunity count in the summary strip changes (should be fewer than "All Tracked" mode)
- FAIL: If clicking "Active" doesn't change the highlighted pill, the view label, or the displayed count

## Test 4: Count Reconciliation — Launchpad vs Ops Tracker

**Steps:**
1. Note the "Total Tracked" count from the Home page KPI (expected: 31)
2. Navigate to `/ops-tracker?filter=all_tracked`
3. Note the total count shown in the Ops Tracker summary strip
4. Navigate back to Home, note "Active Pipeline" count (expected: 28)
5. Navigate to `/ops-tracker` (default Active view)
6. Note the total count in Ops Tracker summary strip

**Pass/Fail Criteria:**
- PASS: Home "Total Tracked" count === Ops Tracker "All Tracked" total count
- PASS: Home "Active Pipeline" count === Ops Tracker "Active" total count
- FAIL: If any pair of counts diverges between the two surfaces — this is the core bug this PR fixes

## Test 5: KPI Info Tooltips Reference Canonical Views

**Steps:**
1. On the Home page, hover/click the info icon (ℹ) on the "Total Tracked" KPI card
2. Read the tooltip content

**Pass/Fail Criteria:**
- PASS: Tooltip mentions **"v_opportunity_all_tracked"** by name
- PASS: Tooltip says "canonical view"
- FAIL: If tooltip doesn't reference the view name — this proves AC-W7-3 (each count labeled with view name)
