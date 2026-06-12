# Devin spec — GovTribe daily-pace-aware throttle

## Problem

The current GovTribe budget throttle in `apps/backend-v3/src/ingest/govtribe/mcp_client.ts` (lines ~330–350) uses three hard percentage thresholds:

- `pct >= 95` → `skipped_halted`
- `pct >= 80` → `skipped_low_budget`
- `cycle cap exceeded` → `skipped_cycle_cap`

These are **calendar-time blind**. June 12 example:
- Budget: 1,200/month, used 976 (81%), 224 remaining
- 19 days left in month
- System self-throttled with `skipped_low_budget` for 3 consecutive days
- Result: 0 new GovTribe rows since 2026-06-08 despite ~11 credits/day still safely available

User pays for GovTribe out of pocket — credits going unspent is wasted money.

## Required change

Replace the static `pct >= 80` / `pct >= 95` checks with a **daily-pace-aware budget reservation**:

```
remainingCredits   = budget - credits_used
daysRemaining      = days_in_month - day_of_month + 1   (inclusive of today)
dailyAllowance     = floor(remainingCredits / daysRemaining)
todaySpent         = credits used today (from govtribe_credit_ledger WHERE created_at::date = today)
todayAvailable     = max(0, dailyAllowance - todaySpent)
```

**Decision logic:**

1. **`skipped_cycle_cap`** — unchanged, still apply per-cycle 150-credit cap
2. **`skipped_halted`** — if `remainingCredits <= 0` OR `todayAvailable < estimatedCost` AND `!critical`
3. **`skipped_low_budget`** — REMOVE this gate entirely (replaced by daily pacing)
4. **`called`** — proceed if `todayAvailable >= estimatedCost`

**Critical calls** (`critical = true`) still bypass all checks except the absolute hard stop at `remainingCredits <= 0`.

## Files to change

1. **`apps/backend-v3/src/ingest/govtribe/mcp_client.ts`**
   - Add helper `getDailyBudgetStatus()` that returns `{ dailyAllowance, todaySpent, todayAvailable, daysRemaining }`
   - Query: `SELECT COALESCE(SUM(cost_credits),0) AS spent_today FROM govtribe_credit_ledger WHERE created_at >= date_trunc('day', NOW())` (UTC; user is fine with UTC day boundary)
   - Replace the two `pct >=` checks with daily-pace gate
   - Log decision context: `dailyAllowance`, `todaySpent`, `daysRemaining` for every call

2. **`apps/backend-v3/src/ingest/govtribe/mcp_client.test.ts`** (or wherever existing tests live)
   - Add vitest cases:
     - Day 1 of month, fresh budget → allows calls
     - Mid-month, on-pace → allows calls
     - Mid-month, over-pace today → blocks with `skipped_halted`
     - Last day of month, has remaining → permits full remaining budget
     - `critical=true` always passes when remainingCredits > 0

3. **No schema changes needed** — existing `govtribe_credit_ledger` and `govtribe_credit_monthly` are sufficient.

## Acceptance criteria

- The user's June 12 scenario (224 credits remaining, 19 days left) MUST permit calls up to ~11 credits/day
- Cycle cap of 150/cycle and monthly cap of 1,200 are both still enforced
- The Monday/Thursday 06:00 ET poll continues to run; it no longer gets blocked when budget is on plan
- `govtribe_credit_ledger.decision` enum unchanged (do NOT add a new decision type — `skipped_low_budget` simply stops being emitted)
- New CI schema drift guard must pass (no new column references to opportunities)
- Two pre-existing failures will be admin-overridden at merge: `Compose Drift Check`, `LLM Router Gates (F-215 D4)`

## Architecture notes

- **DO NOT** add `place_of_performance_state` or any FPDS-specific fields to `opportunities`. The incumbent enrichment cron crashed on this column overnight — separate fix, not in scope here.
- Keep `BudgetDecision` enum string values stable.
- Time zone for "today" boundary: UTC (matches existing cron schedules and ledger storage).

## Branch / PR

- Branch: `feat/govtribe-daily-pace-throttle`
- Base: latest `main` (HEAD is post-cleanup-sprint as of 2026-06-12)
- PR title: `feat: GovTribe daily-pace-aware budget throttle`
- Reference this issue + the June 12 incident in PR description.
