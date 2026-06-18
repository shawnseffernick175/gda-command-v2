-- v3_091: FasTrac bidirectional matching — evidence column on matches
-- Adds JSONB evidence to every match so the UI can show traceability:
--   mission tag overlaps, timing alignment math, source citations, pursuit reasoning.

ALTER TABLE fast_track_matches
  ADD COLUMN IF NOT EXISTS evidence JSONB;

-- Index for queries that filter on evidence presence
CREATE INDEX IF NOT EXISTS idx_ftm_evidence_notnull
  ON fast_track_matches ((evidence IS NOT NULL));

-- Backfill the single seeded match with reconstructed evidence
UPDATE fast_track_matches
SET evidence = jsonb_build_object(
  'mission_tag_overlap', (
    SELECT jsonb_agg(tag)
    FROM (
      SELECT UNNEST(t.mission_tags) AS tag
      FROM fast_track_signals t
      WHERE t.id = fast_track_matches.tech_signal_id
      INTERSECT
      SELECT UNNEST(r.mission_tags)
      FROM fast_track_signals r
      WHERE r.id = fast_track_matches.req_signal_id
    ) overlap
  ),
  'mission_tag_unmatched', (
    SELECT COALESCE(jsonb_agg(tag), '[]'::jsonb)
    FROM (
      SELECT UNNEST(t.mission_tags) AS tag
      FROM fast_track_signals t
      WHERE t.id = fast_track_matches.tech_signal_id
      EXCEPT
      SELECT UNNEST(r.mission_tags)
      FROM fast_track_signals r
      WHERE r.id = fast_track_matches.req_signal_id
    ) unmatched
  ),
  'timing_window_alignment', jsonb_build_object(
    'need', (SELECT horizon FROM fast_track_signals WHERE id = fast_track_matches.req_signal_id),
    'solution', (SELECT horizon FROM fast_track_signals WHERE id = fast_track_matches.tech_signal_id),
    'score', fast_track_matches.timing_score
  ),
  'source_history', NULL,
  'pursuit_reasoning', 'Need is pre-RFP, solution is pre-prototype — OT Agreement is fastest path to capability demonstration.',
  'adoption_reasoning', 'Envision positions as AI analytics sub under a prime with AFMC relationship — leverage GDA Command pipeline for data-driven differentiation.'
)
WHERE evidence IS NULL;
