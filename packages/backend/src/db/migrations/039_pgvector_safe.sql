-- Migration 039: Safely install pgvector extension
-- This fixes the "$libdir/vector" errors by ensuring the extension is properly installed
-- If pgvector is not available on this system, this migration silently succeeds
DO $$
BEGIN
  -- Try to create the vector extension
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available: %. Skipping.', SQLERRM;
END $$;
