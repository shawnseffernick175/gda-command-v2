-- Add 'qualify' to the lifecycle_stage enum (unified opportunities model).
-- Inserted between 'signal' and 'forecast' in the stage order.
-- This is a staging state: pre-pipeline, not counted in metrics.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_lifecycle_stage') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'opportunity_lifecycle_stage'::regtype
        AND enumlabel = 'qualify'
    ) THEN
      EXECUTE $$ALTER TYPE opportunity_lifecycle_stage ADD VALUE 'qualify' BEFORE 'forecast'$$;
    END IF;
  END IF;
END
$do$;
