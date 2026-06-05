-- v3_044_action_items_auto_gen.sql
-- F-611: Action Items AI-generated + priority sorted + feeds Launchpad
--
-- Adds columns for auto-generated action items with source tracking,
-- priority-based sorting, and assignee support. Also adds recompete
-- tracking columns to awards for the re-compete capture condition.

-- ── action_items new columns ──────────────────────────────────────────────
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'MEDIUM';
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS is_auto BOOLEAN DEFAULT FALSE;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assignee_id BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_action_items_priority
  ON action_items (priority, due_date);
CREATE INDEX IF NOT EXISTS idx_action_items_source_dedup
  ON action_items (source_type, source_id) WHERE status NOT IN ('done');
CREATE INDEX IF NOT EXISTS idx_action_items_assignee
  ON action_items (assignee_id);

-- ── awards recompete tracking ─────────────────────────────────────────────
ALTER TABLE awards ADD COLUMN IF NOT EXISTS is_recompete_candidate BOOLEAN DEFAULT FALSE;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS period_of_performance_end DATE;

CREATE INDEX IF NOT EXISTS idx_awards_recompete
  ON awards (is_recompete_candidate) WHERE is_recompete_candidate = TRUE;
