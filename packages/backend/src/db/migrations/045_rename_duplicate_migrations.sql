-- Migration 045: Fix duplicate migration numbers (F-010)
--
-- Four pairs of migrations shared the same numeric prefix (036, 038, 039, 040),
-- making execution order undefined on fresh deploys. The second file in each pair
-- was renamed with a 'b' suffix to ensure unique, deterministic ordering.
--
-- On existing databases the migration runner will have already re-applied the
-- renamed *b_* files (they are idempotent) and recorded them under the new names.
-- We DELETE the stale old-name entries to clean up. On fresh databases these
-- DELETEs are harmless no-ops (no rows match).

DELETE FROM schema_migrations WHERE name = '036_vehicle_classification.sql';
DELETE FROM schema_migrations WHERE name = '038_merger_context.sql';
DELETE FROM schema_migrations WHERE name = '039_pgvector_safe.sql';
DELETE FROM schema_migrations WHERE name = '040_seed_anomaly_rules.sql';
