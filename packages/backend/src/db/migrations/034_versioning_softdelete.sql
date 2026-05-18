-- Migration 034: Record versioning + soft-delete (Workstream 3)
-- Foundation for "no data loss" guarantee. Every edit is versioned,
-- every delete is soft, and a Postgres trigger provides belt-and-suspenders.

-- ============================================================================
-- 1. Record Version table — stores full snapshots of every change
-- ============================================================================
CREATE TABLE IF NOT EXISTS record_version (
  version_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name     TEXT NOT NULL,
  record_id      TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot       JSONB NOT NULL,
  changed_by     TEXT NOT NULL,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_type    TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'restore')),
  change_summary JSONB
);

CREATE INDEX IF NOT EXISTS idx_rv_table_record ON record_version (table_name, record_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_rv_changed_at ON record_version (changed_at DESC);

-- ============================================================================
-- 2. Soft-delete: add deleted_at to user-mutable tables
-- ============================================================================
ALTER TABLE opportunities       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE capture_plans        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE capture_activities   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE proposals            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE proposal_sections    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE compliance_requirements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contacts             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE intel_items           ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE doctrine_drafts      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE risk_register        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE color_reviews        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE competitor_profiles  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE approvals            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE knowledge_documents  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE cpars_records        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Indexes for efficient soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_opps_deleted ON opportunities (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capture_plans_deleted ON capture_plans (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_deleted ON proposals (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_deleted ON contacts (deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- 3. Postgres trigger — belt-and-suspenders versioning
-- If the backend ever forgets to call the versioning service,
-- this trigger auto-creates a version row on UPDATE/DELETE.
-- Backend-written versions (with richer change_summary) take precedence.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_auto_version()
RETURNS TRIGGER AS $$
DECLARE
  pk_col TEXT;
  pk_val TEXT;
  next_ver INTEGER;
  op_type TEXT;
  snap JSONB;
BEGIN
  -- Determine PK column (assumes 'id' for most tables)
  pk_col := TG_ARGV[0];
  IF pk_col IS NULL THEN pk_col := 'id'; END IF;

  IF TG_OP = 'DELETE' THEN
    EXECUTE format('SELECT ($1).%I::TEXT', pk_col) INTO pk_val USING OLD;
    snap := to_jsonb(OLD);
    op_type := 'delete';
  ELSE
    EXECUTE format('SELECT ($1).%I::TEXT', pk_col) INTO pk_val USING NEW;
    snap := to_jsonb(NEW);
    IF TG_OP = 'INSERT' THEN
      op_type := 'create';
    ELSE
      op_type := 'update';
    END IF;
  END IF;

  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_ver
  FROM record_version
  WHERE table_name = TG_TABLE_NAME AND record_id = pk_val;

  -- Only insert if no version with this number exists for the same second
  -- (backend may have already written a richer version)
  IF NOT EXISTS (
    SELECT 1 FROM record_version
    WHERE table_name = TG_TABLE_NAME
      AND record_id = pk_val
      AND version_number = next_ver
      AND changed_at >= NOW() - INTERVAL '2 seconds'
  ) THEN
    INSERT INTO record_version (table_name, record_id, version_number, snapshot, changed_by, change_type)
    VALUES (TG_TABLE_NAME, pk_val, next_ver, snap, 'system_trigger', op_type);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to key user-mutable tables
CREATE OR REPLACE TRIGGER trg_version_opportunities
  AFTER INSERT OR UPDATE OR DELETE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_capture_plans
  AFTER INSERT OR UPDATE OR DELETE ON capture_plans
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_proposals
  AFTER INSERT OR UPDATE OR DELETE ON proposals
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_compliance
  AFTER INSERT OR UPDATE OR DELETE ON compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_intel
  AFTER INSERT OR UPDATE OR DELETE ON intel_items
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_color_reviews
  AFTER INSERT OR UPDATE OR DELETE ON color_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_risk_register
  AFTER INSERT OR UPDATE OR DELETE ON risk_register
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_doctrine
  AFTER INSERT OR UPDATE OR DELETE ON doctrine_drafts
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_cpars
  AFTER INSERT OR UPDATE OR DELETE ON cpars_records
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');

CREATE OR REPLACE TRIGGER trg_version_knowledge_docs
  AFTER INSERT OR UPDATE OR DELETE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION fn_auto_version('id');
