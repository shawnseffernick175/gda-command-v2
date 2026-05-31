-- V3 Migration 016: fix sources_kind_check — add federal_register (F-242d)
--
-- v3_013 added 'federal_register' to the CHECK constraint, but v3_014
-- (SBIR/STTR) overwrote the constraint with a list that included 'sbir'
-- but dropped 'federal_register'.  This migration restores the full enum.
-- Forward-only.

BEGIN;

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
    'federal_register'
  ]));

COMMIT;
