-- Migration 043: Fix duplicate versioning triggers (BROKEN-001)
-- Root cause: Migration 034_versioning_softdelete.sql was applied 3 times to production,
-- creating 3 copies of each trigger. Each write fires the trigger function 3 times.
-- Fix: Drop all copies, recreate exactly one per table.

-- Step 1: Drop ALL existing versioning triggers
DO $$
DECLARE
  tbl TEXT;
  trg_name TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'opportunities', 'capture_plans', 'proposals', 'contacts',
      'compliance_requirements', 'intel_items', 'color_reviews',
      'risk_register', 'doctrine_drafts', 'cpars_records', 'knowledge_documents'
    ])
  LOOP
    trg_name := 'trg_version_' || tbl;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trg_name, tbl);
    -- Also drop any numbered duplicates (trg_version_X_1, trg_version_X_2, etc.)
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trg_name || '_1', tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trg_name || '_2', tbl);
  END LOOP;
END $$;

-- Step 2: Recreate exactly one trigger per table
DO $$
DECLARE
  tbl TEXT;
  trg_name TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'opportunities', 'capture_plans', 'proposals', 'contacts',
      'compliance_requirements', 'intel_items', 'color_reviews',
      'risk_register', 'doctrine_drafts', 'cpars_records', 'knowledge_documents'
    ])
  LOOP
    trg_name := 'trg_version_' || tbl;
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_auto_version()',
      trg_name, tbl
    );
  END LOOP;
END $$;
