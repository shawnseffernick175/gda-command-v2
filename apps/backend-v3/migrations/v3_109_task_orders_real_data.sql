-- F-608: Mark seeded task orders so the waterfall shows empty-state until real
-- contract data is uploaded. Add is_seed flag + backfill existing rows.
ALTER TABLE task_orders ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark all existing rows as seed data (they came from v3_084 migration seed).
UPDATE task_orders SET is_seed = TRUE WHERE is_seed = FALSE;
