-- V3 Migration 029: extend sources_kind_check — add nsf + dod_rss (F-433)
-- ============================================================================
-- The NSF adapter (F-423) and the new DoD RSS adapter (F-433) both insert into
-- the sources table with their respective kind values. The CHECK constraint
-- must include them.
-- ============================================================================

ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE sources ADD CONSTRAINT sources_kind_check
  CHECK (kind = ANY (ARRAY[
    'sam_gov',
    'fpds',
    'usaspending',
    'govwin',
    'govtribe',
    'news',
    'doctrine',
    'partner_site',
    'internal',
    'manual',
    'n8n_workflow',
    'dibbs',
    'neco',
    'sbir',
    'federal_register',
    'color_team',
    'nsf',
    'dod_rss'
  ]));
