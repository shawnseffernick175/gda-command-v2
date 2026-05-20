-- Migration 056: Add provenance columns to schema_migrations.
-- Part of F-019: Prevent unversioned production DB modifications.
--
-- Adds tracking for WHO applied each migration, WHAT commit it came from,
-- and the SHA-256 hash of the migration file content as applied.
-- Existing rows get NULL for commit_sha/file_sha256 and 'unknown (pre-F-019)' for applied_by.
--
-- applied_by defaults to current_user (Postgres built-in) so the 056 row
-- itself records the role that applied it, even though the migration runner
-- doesn't yet know provenance columns exist when inserting 056's own row.

ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS commit_sha TEXT,
  ADD COLUMN IF NOT EXISTS applied_by TEXT NOT NULL DEFAULT current_user,
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT;

-- Backfill existing rows (pre-F-019) with a marker value
UPDATE schema_migrations SET applied_by = 'unknown (pre-F-019)' WHERE file_sha256 IS NULL AND name != '056_schema_migrations_provenance.sql';
