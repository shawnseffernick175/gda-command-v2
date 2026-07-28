-- v3_148: reversible archive flag for pipeline_items.
--
-- Shawn wants the Pipeline board emptied without losing any capture data, and
-- the F-600 owner rule blocks deletes anyway. A nullable archived_at gives a
-- fully reversible way to hide rows from the board/summary/coverage/list
-- surfaces: set it to now() to archive, set it back to NULL to restore.
--
-- Deliberately NOT backfilled here. Archiving the existing rows is a separate,
-- audited data step so the migration itself stays a pure schema change and the
-- archive decision can be reversed independently of the deploy.
-- Idempotent: safe to re-run.

ALTER TABLE pipeline_items
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN pipeline_items.archived_at IS
  'When set, the item is hidden from all Pipeline board/summary/coverage/list surfaces. NULL means active. Reversible: UPDATE pipeline_items SET archived_at = NULL to restore.';

-- Board queries all filter on archived_at IS NULL, so index the active rows.
CREATE INDEX IF NOT EXISTS idx_pipeline_items_active
  ON pipeline_items (stage) WHERE archived_at IS NULL;
