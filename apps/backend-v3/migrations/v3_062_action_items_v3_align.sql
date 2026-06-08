-- v3_062_action_items_v3_align.sql
--
-- Aligns the live action_items table (v3_001 legacy shape) with the v3
-- service layer (services/action-items/index.ts).  Additive only --
-- existing columns and FKs are preserved.
--
-- Idempotent: every statement uses IF NOT EXISTS / IF EXISTS guards.

-- 1. Add columns the v3 service reads/writes ---------------------------------
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS detail TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assignee_id BIGINT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS linked_record_type TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS linked_record_id TEXT;

-- 2. source_id: legacy is BIGINT NOT NULL REFERENCES sources(id).
--    The v3 service stores arbitrary text entity ids in linked_record_id
--    instead.  Drop NOT NULL so auto-generated items can leave it NULL.
ALTER TABLE action_items ALTER COLUMN source_id DROP NOT NULL;

-- 3. Relax CHECK constraints to accept both legacy and v3 status/priority -----
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_status_check;
ALTER TABLE action_items ADD CONSTRAINT action_items_status_check
  CHECK (status IN ('open','in_progress','done','blocked'));

ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_priority_check;
ALTER TABLE action_items ADD CONSTRAINT action_items_priority_check
  CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW','critical','high','normal','low'));

-- 4. Backfill owner from owner_email so legacy NOT-NULL data is preserved -----
UPDATE action_items SET owner = owner_email WHERE owner IS NULL AND owner_email IS NOT NULL;

-- 5. Dedup index used by findExistingAutoItem (service writes entity id into
--    linked_record_id, so the index covers that column) ----------------------
CREATE INDEX IF NOT EXISTS idx_action_items_source_dedup
  ON action_items (source_type, linked_record_id) WHERE is_auto = TRUE;

-- 6. Create the missing audit table the service writes to ---------------------
CREATE TABLE IF NOT EXISTS action_item_audit (
  id             BIGSERIAL PRIMARY KEY,
  action_item_id BIGINT NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  field          TEXT NOT NULL,
  old_value      TEXT,
  new_value      TEXT,
  actor          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_item_audit_item
  ON action_item_audit (action_item_id);
