-- V3 Migration 139: Relocate l1_target off financial_plan (#1142)
--
-- BUG 5 follow-up. The company-P&L TARGET series (source 'l1_target') was
-- historically written to financial_plan, but the trend/variance path reads
-- target from financial_actuals (l1_target) against actual (l1_actual) on the
-- same natural key. Ingest now routes l1_target into financial_actuals, so the
-- residual financial_plan.l1_target rows are stale duplicates. The AOP-execution
-- baseline uses source 'user_aop' (covers all 12 months), so removing the
-- shadowed l1_target rows changes no read path.
--
-- Forward-only and idempotent — safe to re-run.

BEGIN;

DELETE FROM financial_plan WHERE source = 'l1_target';

COMMIT;
