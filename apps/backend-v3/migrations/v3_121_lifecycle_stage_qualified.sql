-- Add 'qualified' to the opportunity_lifecycle_stage enum (unified opportunities model).
-- 'qualify' = staging state (pre-pipeline, not counted in metrics).
-- 'qualified' = normal counted pipeline stage, inserted after 'qualify'.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_lifecycle_stage') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'opportunity_lifecycle_stage'::regtype
        AND enumlabel = 'qualified'
    ) THEN
      EXECUTE $$ALTER TYPE opportunity_lifecycle_stage ADD VALUE 'qualified' AFTER 'qualify'$$;
    END IF;
  END IF;
END
$do$;
