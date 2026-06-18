-- v3_103: Capture Review Engine — cumulative back-review flag
-- F-868: a color review can start at any color and run a cumulative back-review
-- that catches what earlier-phase reviews should have surfaced. This column
-- records whether a given review was created as a cumulative review.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. `color_reviews` is NOT one of the
-- doc-defined tables checked by scripts/v3-schema-diff.ts, so adding this column
-- does not affect the schema drift detector.

BEGIN;

ALTER TABLE color_reviews
  ADD COLUMN IF NOT EXISTS is_cumulative BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
