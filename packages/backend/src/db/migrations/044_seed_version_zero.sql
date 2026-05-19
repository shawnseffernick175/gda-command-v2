-- Migration 044: Seed version-0 snapshots for existing records (STALE-001)
-- Root cause: Versioning triggers were installed after data existed.
-- No retroactive version-0 snapshots were created, so record_version is empty.
-- Fix: Insert version 0 for every existing row in each tracked table.

DO $$
DECLARE
  tbl TEXT;
  pk_col TEXT;
  row_rec RECORD;
  snap JSONB;
  id_val TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'opportunities', 'capture_plans', 'proposals', 'contacts',
      'compliance_requirements', 'intel_items', 'color_reviews',
      'risk_register', 'doctrine_drafts', 'cpars_records', 'knowledge_documents'
    ])
  LOOP
    pk_col := 'id';
    FOR row_rec IN EXECUTE format('SELECT * FROM %I', tbl)
    LOOP
      snap := to_jsonb(row_rec);
      id_val := snap->>pk_col;
      -- Skip rows with non-UUID primary keys (legacy mock data IDs like 'opp-003')
      CONTINUE WHEN id_val IS NULL OR id_val !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      INSERT INTO record_version (table_name, record_id, version_number, snapshot, changed_by, change_type)
      VALUES (tbl, id_val, 0, snap, '00000000-0000-0000-0000-000000000000', 'create')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
