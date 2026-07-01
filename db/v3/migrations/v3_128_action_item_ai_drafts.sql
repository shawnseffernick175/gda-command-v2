-- v3_128_action_item_ai_drafts.sql
-- F-310: Action Item Tracker — AI Drafts Feeding Launchpad
--
-- 1. Extends action_items with inline draft columns (one draft per item)
-- 2. Creates action_item_draft_edits table for F-302 voice training
--
-- Idempotent: every statement uses IF NOT EXISTS / IF guards.

-- 1. Inline draft columns on action_items ----------------------------------------
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS draft_text TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS draft_evidence_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS draft_generated_at TIMESTAMPTZ;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS draft_status TEXT;

-- Add CHECK constraint for allowed draft_status values
ALTER TABLE action_items DROP CONSTRAINT IF EXISTS action_items_draft_status_check;
ALTER TABLE action_items ADD CONSTRAINT action_items_draft_status_check
  CHECK (draft_status IS NULL OR draft_status IN ('pending', 'ready', 'approved', 'sent', 'rejected', 'no_context'));

-- Index: find items with drafts awaiting review
CREATE INDEX IF NOT EXISTS idx_action_items_draft_status
  ON action_items (draft_status) WHERE draft_status IN ('pending', 'ready');

-- 2. Draft edit tracking for F-302 voice training --------------------------------
CREATE TABLE IF NOT EXISTS action_item_draft_edits (
  id              BIGSERIAL     PRIMARY KEY,
  action_item_id  BIGINT        NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  edit_type       TEXT          NOT NULL
                                CHECK (edit_type IN ('approve', 'reject', 'edit')),
  original_text   TEXT,
  edited_text     TEXT,
  diff_text       TEXT,
  rejection_reason TEXT,
  actor           TEXT          NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_item_draft_edits_item
  ON action_item_draft_edits (action_item_id);

CREATE INDEX IF NOT EXISTS idx_action_item_draft_edits_type
  ON action_item_draft_edits (edit_type);
