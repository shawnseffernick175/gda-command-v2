-- V3 Migration 024: Backfill v3_schema_migrations tracker
--
-- Ensures every canonical migration (v3_000 → v3_023) is recorded in the
-- v3_schema_migrations tracker table.  Uses ON CONFLICT DO NOTHING so this
-- is safe to run on any database, whether fresh or already-populated.
--
-- NOTE: This migration is managed by node-pg-migrate; it is tracked
-- separately in the pgmigrations table. This INSERT backfills the
-- LEGACY tracker so /v3/health/schema reports correctly.

INSERT INTO v3_schema_migrations (filename, file_sha256, applied_by, commit_sha)
VALUES
  ('v3_000_schema_migrations.sql',        'backfill', current_user, 'backfill'),
  ('v3_001_initial.sql',                  'backfill', current_user, 'backfill'),
  ('v3_002_analysis_cache.sql',           'backfill', current_user, 'backfill'),
  ('v3_003_source_siblings.sql',          'backfill', current_user, 'backfill'),
  ('v3_004_pgboss_bootstrap.sql',         'backfill', current_user, 'backfill'),
  ('v3_005_qualified_columns.sql',        'backfill', current_user, 'backfill'),
  ('v3_006_analysis_periodic_refresh_queue.sql', 'backfill', current_user, 'backfill'),
  ('v3_007_schema_bug_fixes.sql',         'backfill', current_user, 'backfill'),
  ('v3_008_fast_track_assessments.sql',   'backfill', current_user, 'backfill'),
  ('v3_009_auth_seed_columns.sql',        'backfill', current_user, 'backfill'),
  ('v3_010_ingest_runs.sql',              'backfill', current_user, 'backfill'),
  ('v3_011_awards.sql',                   'backfill', current_user, 'backfill'),
  ('v3_012_dibbs_neco.sql',               'backfill', current_user, 'backfill'),
  ('v3_013_regulatory_notices.sql',       'backfill', current_user, 'backfill'),
  ('v3_014_sbir_sttr.sql',               'backfill', current_user, 'backfill'),
  ('v3_015_swap_fpds_to_usaspending.sql', 'backfill', current_user, 'backfill'),
  ('v3_016_extend_sources_kind.sql',      'backfill', current_user, 'backfill'),
  ('v3_017_agent_runs_and_tool_calls.sql','backfill', current_user, 'backfill'),
  ('v3_018_govtribe_connector.sql',       'backfill', current_user, 'backfill'),
  ('v3_019_doctrine_rules.sql',           'backfill', current_user, 'backfill'),
  ('v3_020_govwin_connector.sql',         'backfill', current_user, 'backfill'),
  ('v3_021_agent_decisions_and_pwin.sql', 'backfill', current_user, 'backfill'),
  ('v3_022_kb_documents_and_chunks.sql',  'backfill', current_user, 'backfill'),
  ('v3_023_color_team_reviews.sql',       'backfill', current_user, 'backfill'),
  ('v3_024_backfill_schema_migrations.sql','backfill', current_user, 'backfill')
ON CONFLICT (filename) DO NOTHING;
