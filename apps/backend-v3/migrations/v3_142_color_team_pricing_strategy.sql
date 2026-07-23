-- V3 Migration 142: Color Team green-review pricing strategy
--
-- The F-300 Color Team runtime's green (executive/final) pass produces a
-- structured pricing strategy alongside the margin check: sourced facts
-- (traceable to the Financial Bible / pricing scenarios), qualitative
-- recommendations, and the concrete inputs still missing. Stored as JSONB on
-- the finding so it lives inside the existing run/finding persistence path.
--
-- Forward-only and idempotent — safe to re-run.

BEGIN;

ALTER TABLE color_team_findings ADD COLUMN IF NOT EXISTS pricing_strategy JSONB;

COMMIT;
