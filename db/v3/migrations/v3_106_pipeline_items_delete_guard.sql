-- v3_106: Hard guard — prevent automated/bulk DELETE on pipeline_items.
--
-- OWNER RULE (F-600): Every pipeline_item is owner-promoted. Terminal stages
-- (no_bid, won, lost, gov_cancelled) are explicit owner DECISIONS, not junk.
-- No automated process, cleanup script, or cron job may DELETE rows from this
-- table. Stage transitions are the ONLY valid mutation — rows are NEVER removed.
--
-- The trigger raises an exception on any DELETE unless the session variable
-- gda.allow_pipeline_delete is explicitly set to 'true'. This escape hatch
-- exists solely for:
--   1. Integration tests that need to clean up test data.
--   2. A future owner-initiated, single-record admin action (if ever needed).
--
-- To bypass in a test: SET LOCAL gda.allow_pipeline_delete = 'true';

CREATE OR REPLACE FUNCTION prevent_pipeline_item_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('gda.allow_pipeline_delete', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'DELETE on pipeline_items is blocked (F-600 owner rule). '
    'Pipeline items are owner decisions and must never be auto-deleted. '
    'Use stage transitions instead. '
    'Bypass: SET LOCAL gda.allow_pipeline_delete = ''true'';';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pipeline_items_no_delete
  BEFORE DELETE ON pipeline_items
  FOR EACH ROW
  EXECUTE FUNCTION prevent_pipeline_item_delete();

-- DOWN
-- DROP TRIGGER IF EXISTS trg_pipeline_items_no_delete ON pipeline_items;
-- DROP FUNCTION IF EXISTS prevent_pipeline_item_delete();
