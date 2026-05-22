# F-026 Step 3 — Pre-Migration Source-DB Snapshot

**Captured:** 2026-05-22 16:21:19 EDT (20:21:19 UTC)  
**Source:** n8n-envision-postgres-1 / n8n (production)  
**Context:** Writers paused (17/17), pre-migration baseline

| Table | Source Rows |
|-------|------------|
| gda_relationships | 0 |
| ft_signal_source | 10 |
| gda_touchpoints | 0 |
| ft_opportunity_signal | 234 |
| gda_risk_register | 464 |
| gda_opportunity_tracker | 1780 |
| gda_capture_plans | 110 |
| gda_intelligence_log | 54 |
| gda_competitor_watchlist | 46 |
| opportunity_alerts | 2 |
| gda_competitor_cache | 1 |
| gda_action_items | 47 |
| gda_active_contracts | 5 |
| gda_dashboard_intel_cache | 6 |
| daily_trends | 537 |
| gda_opportunity_alerts | 7 |
| gda_morning_briefings | 40 |
| gda_learned_weights | 18 |
| gda_win_loss | 6 |
| gda_error_log | 334 |
| gda_saved_opportunities | 0 |
| gda_teaming_partners | 12 |
| gda_embeddings | 821 |
| govtribe_cache | 0 |
| gda_wargames | 1 |
| gda_win_loss_db | 10 |
| gda_trend_arrays | 15 |
| gda_contacts | 2 |
| **TOTAL** | **4,562** |

## Notes

- 4 tables with 0 rows: gda_relationships, gda_touchpoints, gda_saved_opportunities, govtribe_cache
- Matches staging rehearsal baseline exactly (4,562 total)
- All 17 writer workflows confirmed paused before snapshot
- System-watchdog (LPUSYd4Vpph1Qg7n) still running — not a writer
