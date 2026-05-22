# F-026 Step 3 — Writer Workflow Inventory

**Captured:** 2026-05-22 19:33 UTC  
**Source:** n8n REST API v1 (`/api/v1/workflows?active=true`)  
**Active workflow count:** 157 (matches expected from F-275)

## Workflows Writing to ADOPT Tables

| # | Workflow | ID | Trigger | Tables Written | Write Type |
|---|----------|----|---------|---------------|------------|
| 1 | GDA.cron.auto-risk-generation | ldVAxgDGuKJx4354 | cron | gda_risk_register | DDL+WRITE (UPSERT) |
| 2 | GDA.cron.deadline-escalation | Qg55lRKjubgsvD28 | cron | gda_risk_register | WRITE+DDL (UPDATE) |
| 3 | GDA.cron.pipeline-health-digest | 9annZcPoqw0DaPKI | cron | gda_risk_register | READ+WRITE |
| 4 | GDA.sched.opp-refresh | PeLGDqgLAsEh5Gsd | schedule | gda_opportunity_tracker | INSERT+UPDATE |
| 5 | GDA.cron.broad-opp-search | BQFYbILTezLgqkDY | cron | gda_opportunity_tracker | INSERT |
| 6 | GDA.cron.capture-opp-sync | 0E3lCtWt2rdJlMPY | cron | gda_opportunity_tracker | UPDATE |
| 7 | GDA.cron.fast-track-ingest | MJapg8dGkvEzLn0K | cron | ft_signal_source, ft_opportunity_signal | INSERT+UPDATE |
| 8 | GDA.cron.data-sync | M0xPvRs31zQOewfx | cron | daily_trends, gda_trend_arrays, gda_learned_weights | INSERT+UPDATE |
| 9 | GDA.cron.auto-capture-plan | 7gERqvfD6THg1gWf | cron | gda_capture_plans | UPDATE |
| 10 | GDA.cron.comp-intel-daily-growth | EcZWryEoS4zyAfGD | cron | gda_competitor_cache, gda_competitor_watchlist | INSERT+UPDATE |
| 11 | GDA.api.comp-intel 2 | geW4zw6lvkkizF82 | webhook | gda_competitor_cache, gda_competitor_watchlist | INSERT+UPDATE |
| 12 | GDA.cron.auto-opp-analysis | IGw8FBZhZwnwiIe1 | cron | gda_intelligence_log, gda_action_items | INSERT+DELETE |
| 13 | GDA.cron.change-detector | Zb2quk78c5mszZ2C | cron | gda_opportunity_alerts, opportunity_alerts | INSERT |
| 14 | GDA.cron.health-scan-daily | gMEwjeBZbC4GzL3N | cron | gda_error_log | INSERT |
| 15 | GDA.api.intel-feed | KIT8cj4V2cMFdSkA | cron | gda_dashboard_intel_cache, gda_morning_briefings | INSERT+DELETE |
| 16 | GDA.cron.stage-auto-promote | lU2uQfmQ6sch69TA | cron | gda_opportunity_tracker | UPDATE |
| 17 | GDA.cron.daily-trends-collect | D6nZ235hSF4wGMb5 | cron | daily_trends | INSERT |

## Notes

- **Row 4 (GDA.sched.opp-refresh):** Replaces the "sam-sync" placeholder in the original plan. This is the primary SAM.gov → gda_opportunity_tracker sync.
- **Row 5 (GDA.cron.broad-opp-search):** Also writes to gda_opportunity_tracker (new opportunity discovery).
- **Row 6 (GDA.cron.capture-opp-sync):** Syncs capture pipeline status to gda_opportunity_tracker.
- **Rows 10-11 (comp-intel):** Both the cron and API versions write to competitor tables. Both should be paused.
- **Row 17 (daily-trends-collect):** Collects trend data into daily_trends. Added as it was not in the original plan.
- **Tables with zero write activity (no writer workflow found):** gda_relationships, gda_touchpoints, gda_saved_opportunities, govtribe_cache, gda_wargames, gda_contacts, gda_active_contracts, gda_win_loss, gda_win_loss_db, gda_teaming_partners, gda_embeddings.

## Halt Condition Check

No inventory row resolved to more than one workflow ambiguously:
- comp-intel: Two distinct workflows found (cron + API). Both included, no ambiguity.
- intel-feed: KIT8cj4V2cMFdSkA is the primary writer. Other related workflows (dashboard-intel 2, sub.dashboard-intel-deep) are downstream consumers, not direct table writers.

**Conclusion:** No halt conditions triggered. 17 writer workflows identified.
