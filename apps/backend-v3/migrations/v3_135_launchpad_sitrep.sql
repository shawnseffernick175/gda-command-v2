-- F-SITREP: Daily SITREP block for the Launchpad page.
--
-- launchpad_sitreps        = one row per day (sitrep_date), holds the ordered
--                            AI-generated bullet list for that day.
-- launchpad_sitrep_documents = documents folded into a given day's SITREP,
--                            with extracted text kept for future reference.
--
-- Distinct from the weekly leadership `sitreps` / `sitrep_items` tables used by
-- the Digest page (F-611): this is the per-day Launchpad situation report.

CREATE TABLE IF NOT EXISTS launchpad_sitreps (
  id            SERIAL PRIMARY KEY,
  sitrep_date   DATE NOT NULL UNIQUE,
  bullets       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ordered array of one-line strings
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launchpad_sitreps_date
  ON launchpad_sitreps (sitrep_date DESC);

CREATE TABLE IF NOT EXISTS launchpad_sitrep_documents (
  id              SERIAL PRIMARY KEY,
  sitrep_date     DATE NOT NULL,
  filename        TEXT NOT NULL,
  file_size_bytes BIGINT,
  file_path       TEXT,
  extracted_text  TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_launchpad_sitrep_docs_date
  ON launchpad_sitrep_documents (sitrep_date DESC, uploaded_at DESC);
