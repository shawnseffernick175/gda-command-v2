-- Migration 008: Add file_id to color_reviews for uploaded document linking
ALTER TABLE color_reviews ADD COLUMN IF NOT EXISTS file_id TEXT;
