# Launchpad Summary Card Grid — Spec v1

**Purpose:** The Summary Card Grid sits at the top of the Launchpad (Door 0) and shows four today-actionable counts. Shawn opens the app and immediately sees what needs his attention across all modules.

**Backend route:** `GET /api/launchpad/summary?ou_tag=envision` returns `{ action_items_due_today, opportunities_hot, capture_behind, partner_new_awards_7d }`. One DB query per metric, all wrapped in `Promise.all`. No N+1.

---

## Card 1 — Action Items Due Today

Counts open action items whose `due_date` equals today (Eastern Time). Query filters `action_items` where `status = 'open'` and `due_date` matches the current EST date. Clicking navigates to `/action-items?due=today`, which filters the Action Items page to show only items due today.

## Card 2 — Opportunities Hot

Counts distinct opportunities that are "hot": either graded `A` or linked to a pipeline item with `win_prob_pct >= 70`. Query performs a `LEFT JOIN` from `opportunities` to `pipeline_items` and counts where `grade = 'A'` OR `win_prob_pct >= 70`. Clicking navigates to `/opportunities-v2?hot=1`, which applies the same filter on the Opportunities page.

## Card 3 — Capture Stages Behind

Counts captures in pre-submission stages (not `submitted`) where the linked opportunity's `response_due_at` has already passed. Query joins `captures` to `pipeline_items` to `opportunities` and filters where `color_review_stage != 'submitted'` AND `response_due_at < NOW()`. Clicking navigates to `/capture-v2?behind=1`, which applies the same filter on the Capture page.

## Card 4 — Partner Awards (7d)

Counts partner awards ingested in the last 7 days from the `partner_awards` table. This metric spans all tracked partners (Riverstone, PD Systems). Clicking navigates to `/partner-intel?new_awards=7d`, which filters the Partner Intel awards list to show only awards from the last 7 days.
