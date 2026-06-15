-- v3_080: Cleanup phantom pipeline_items rows
-- Removes pipeline_items that were auto-created by ingestion noise and never
-- touched by a user. These rows pollute the Pipeline page with SAM/GovTribe
-- firehose data that is not the company's book of work.
--
-- Criteria for deletion:
--   1. No matching record in opportunity_decision_overrides with field_name = 'pipeline_stage'
--      (i.e. no user ever explicitly set the stage)
--   2. The pipeline_items.created_by IS NULL (system-created, not user-created)
--
-- This is conservative: any row that a user explicitly touched is preserved.

DELETE FROM pipeline_items pi
WHERE pi.created_by IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM opportunity_decision_overrides odo
    WHERE odo.opportunity_id = pi.opportunity_id
      AND odo.field_name = 'pipeline_stage'
  );
