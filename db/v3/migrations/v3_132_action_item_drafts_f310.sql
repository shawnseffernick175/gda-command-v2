-- v3_132_action_item_drafts_f310.sql
-- F-310: Action Item Tracker — AI Drafts Feeding Launchpad (supplement)
--
-- v3_128 added draft_text, draft_evidence_ids, draft_generated_at, draft_status
-- to action_items and created action_item_draft_edits.
-- This migration adds the remaining pieces:
-- 1. Relaxes source_id NOT NULL on action_item_drafts (auto-drafts may lack source)
-- 2. Extends action_item_drafts with evidence, rejection, and edit-diff columns
--
-- Idempotent: every statement uses IF NOT EXISTS / IF guards.

-- 1. Relax source_id NOT NULL on action_item_drafts (mirrors v3_062 for action_items)
ALTER TABLE action_item_drafts ALTER COLUMN source_id DROP NOT NULL;

-- 2. Extend action_item_drafts with evidence + rejection columns
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS evidence_ids TEXT[];
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS edit_diff TEXT;
ALTER TABLE action_item_drafts ADD COLUMN IF NOT EXISTS original_content TEXT;
