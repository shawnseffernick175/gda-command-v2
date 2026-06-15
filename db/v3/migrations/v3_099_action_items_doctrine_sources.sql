-- v3_079_action_items_doctrine_sources.sql
-- Issue #872: Action Items — show only CEO's actual work, not SAM firehose
--
-- 1. Adds doctrine_source discriminator (replaces the generic source_type text)
-- 2. Adds FK columns for capture, award (recompete), and review
-- 3. Wipes auto-generated SAM-firehose action items
-- 4. Adds indexes for new FK columns and due-date filtering
--
-- Idempotent: every statement uses IF NOT EXISTS / IF guards.

-- 1. Add doctrine_source discriminator -----------------------------------------
ALTER TABLE action_items
  ADD COLUMN IF NOT EXISTS doctrine_source TEXT
    DEFAULT 'manual';

-- Backfill from existing source_type where meaningful
UPDATE action_items
SET doctrine_source = 'manual'
WHERE doctrine_source IS NULL;

-- Add CHECK constraint for allowed values
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_doctrine_source_check;
ALTER TABLE action_items ADD CONSTRAINT action_items_doctrine_source_check
  CHECK (doctrine_source IN (
    'capture_review_killitem',
    'capture_stale',
    'capture_deadline',
    'recompete_expiring',
    'manual'
  ));

-- 2. Add FK columns ------------------------------------------------------------
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS capture_id BIGINT REFERENCES captures(id) ON DELETE CASCADE;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS award_id BIGINT REFERENCES awards(id) ON DELETE CASCADE;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS review_stage_id INTEGER REFERENCES capture_color_stages(id) ON DELETE CASCADE;

-- 3. Wipe SAM-firehose auto-generated action items -----------------------------
-- These are items auto-created by the old generateActionItems job from raw
-- SAM opportunities the company never pursued. Identified by:
--   is_auto = TRUE AND source_type = 'opportunity'
-- OR items with no meaningful link (no capture, no award, no review, no user)
DELETE FROM action_items
WHERE is_auto = TRUE
  AND (
    source_type = 'opportunity'
    OR (capture_id IS NULL AND award_id IS NULL AND review_stage_id IS NULL AND created_by IS NULL)
  );

-- Also wipe any items whose title matches the "Opportunity X closes in N days" pattern
DELETE FROM action_items
WHERE title LIKE 'Opportunity % closes in % days%'
  OR title LIKE 'High-probability opportunity % not in pipeline';

-- 4. Indexes -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_action_items_capture_id
  ON action_items (capture_id) WHERE capture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_award_id
  ON action_items (award_id) WHERE award_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_review_stage_id
  ON action_items (review_stage_id) WHERE review_stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_doctrine_source
  ON action_items (doctrine_source) WHERE status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_action_items_due_open
  ON action_items (due_date) WHERE status IN ('open', 'in_progress');
