-- Add 'qualify' to the lifecycle_stage enum (unified opportunities model).
-- Inserted between 'signal' and 'forecast' in the stage order.
-- This is a staging state: pre-pipeline, not counted in metrics.
ALTER TYPE opportunity_lifecycle_stage ADD VALUE IF NOT EXISTS 'qualify' BEFORE 'forecast';
