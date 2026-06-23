-- F-611: Weekly SITREP tables for the Digest page.
-- sitreps = one per week; sitrep_items = rows within a SITREP.
-- Mutations go through CRUD endpoints and write audit_log (source='user').

CREATE TABLE IF NOT EXISTS sitreps (
  id              SERIAL PRIMARY KEY,
  sitrep_number   INTEGER NOT NULL,
  week_ending     DATE NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sitreps_week_ending
  ON sitreps (week_ending DESC);

CREATE TABLE IF NOT EXISTS sitrep_items (
  id            SERIAL PRIMARY KEY,
  sitrep_id     INTEGER NOT NULL REFERENCES sitreps(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,
  discussion    TEXT NOT NULL DEFAULT '',
  action_items  TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sitrep_items_sitrep
  ON sitrep_items (sitrep_id, sort_order);
