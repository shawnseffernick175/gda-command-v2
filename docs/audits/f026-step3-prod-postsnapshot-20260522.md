# F-026 Step 3 — Post-Migration Target-DB Snapshot & Parity Comparison

**Captured:** 2026-05-22 16:23:55 EDT (20:23:55 UTC)  
**Target:** gda-postgres / gda_command (production)  
**Context:** Post-migration, pre-resume. Writers still paused.

## Row Count Comparison: Source (pre-snapshot) vs Target (post-migration)

| Table | Source (n8n) | Target (gda_command) | Match |
|-------|-------------|---------------------|-------|
| gda_relationships | 0 | 0 | EXACT |
| ft_signal_source | 10 | 10 | EXACT |
| gda_touchpoints | 0 | 0 | EXACT |
| ft_opportunity_signal | 234 | 234 | EXACT |
| gda_risk_register | 464 | 464 | EXACT |
| gda_opportunity_tracker | 1780 | 1780 | EXACT |
| gda_capture_plans | 110 | 110 | EXACT |
| gda_intelligence_log | 54 | 54 | EXACT |
| gda_competitor_watchlist | 46 | 46 | EXACT |
| opportunity_alerts | 2 | 2 | EXACT |
| gda_competitor_cache | 1 | 1 | EXACT |
| gda_action_items | 47 | 47 | EXACT |
| gda_active_contracts | 5 | 5 | EXACT |
| gda_dashboard_intel_cache | 6 | 6 | EXACT |
| daily_trends | 537 | 537 | EXACT |
| gda_opportunity_alerts | 7 | 7 | EXACT |
| gda_morning_briefings | 40 | 40 | EXACT |
| gda_learned_weights | 18 | 18 | EXACT |
| gda_win_loss | 6 | 6 | EXACT |
| gda_error_log | 334 | 334 | EXACT |
| gda_saved_opportunities | 0 | 0 | EXACT |
| gda_teaming_partners | 12 | 12 | EXACT |
| gda_embeddings | 821 | 821 | EXACT |
| govtribe_cache | 0 | 0 | EXACT |
| gda_wargames | 1 | 1 | EXACT |
| gda_win_loss_db | 10 | 10 | EXACT |
| gda_trend_arrays | 15 | 15 | EXACT |
| gda_contacts | 2 | 2 | EXACT |
| **TOTAL** | **4,562** | **4,562** | **EXACT** |

## Constraint Verification (Section 7)

| Check | Result |
|-------|--------|
| FK: gda_touchpoints → gda_relationships | 0 orphans |
| FK: ft_opportunity_signal → ft_signal_source | 0 orphans |
| Sequence sync (27 SERIAL-PK tables) | All PASS (seq >= MAX(id)) |
| pgvector self-match similarity | 1.0 |

## Migration Summary

| Metric | Value |
|--------|-------|
| Script | scripts/f026/step3-data-migration.sh --target=prod |
| Start | 2026-05-22T20:21:54Z |
| End | 2026-05-22T20:22:41Z |
| Duration | ~47 seconds |
| Tables copied | 24 |
| Tables skipped (empty) | 4 |
| Tables failed | 0 |
| Exit code | 0 |
| Log | /var/log/f026-step3-migration-prod-20260522T202154Z.log |

## Notes

- All 28 tables show exact parity between source and target
- 4 empty tables (gda_relationships, gda_touchpoints, gda_saved_opportunities, govtribe_cache) were correctly SKIPped
- No halt conditions triggered
