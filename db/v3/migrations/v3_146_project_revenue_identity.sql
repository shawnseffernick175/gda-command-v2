-- v3_146_project_revenue_identity.sql — per-contract identity fix.
--
-- The authoritative per-contract book (Revenue Summary by Cost Pool) keys each
-- contract by L2 Proj ID (project_id). Distinct contracts can legitimately share
-- a Project Name — e.g. two task orders both named "Shared Program Name" under
-- different L2 Proj IDs. The original upsert key (source, period, project_name)
-- collapsed those distinct contracts into a single row, silently dropping real
-- per-contract financials.
--
-- Replace it with a project-id-aware key. The new key is a strict SUPERSET of the
-- old columns (it appends COALESCE(project_id, '')), so any row set the old unique
-- index accepted stays unique — index creation cannot fail on existing data —
-- while same-name / different-id contracts now coexist. Legacy rows with no
-- project_id (NULL -> '') keep their previous uniqueness behavior.

DROP INDEX IF EXISTS project_revenue_actuals_upsert_key;

CREATE UNIQUE INDEX IF NOT EXISTS project_revenue_actuals_upsert_key
  ON project_revenue_actuals (source, period, project_name, (COALESCE(project_id, '')));
