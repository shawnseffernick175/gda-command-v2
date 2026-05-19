-- Migration 045: Fix duplicate migration numbers (F-010)
--
-- Four pairs of migrations shared the same numeric prefix (036, 038, 039, 040),
-- making execution order undefined on fresh deploys. The second file in each pair
-- was renamed with a 'b' suffix to ensure unique, deterministic ordering.
--
-- This migration updates schema_migrations so production doesn't re-run them.

UPDATE schema_migrations SET name = '036b_vehicle_classification.sql'
  WHERE name = '036_vehicle_classification.sql';

UPDATE schema_migrations SET name = '038b_merger_context.sql'
  WHERE name = '038_merger_context.sql';

UPDATE schema_migrations SET name = '039b_pgvector_safe.sql'
  WHERE name = '039_pgvector_safe.sql';

UPDATE schema_migrations SET name = '040b_seed_anomaly_rules.sql'
  WHERE name = '040_seed_anomaly_rules.sql';
