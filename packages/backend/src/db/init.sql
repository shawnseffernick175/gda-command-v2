-- GDA Command v2 — Initial Postgres Schema
-- Run: psql -f init.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Opportunities table (from S-009 spec)
CREATE TABLE IF NOT EXISTS opportunities (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  agency          TEXT,
  department      TEXT,
  status          TEXT NOT NULL DEFAULT 'discovery'
                    CHECK (status IN ('discovery','qualified','pipeline','lost','won')),
  score           NUMERIC(5,2) DEFAULT 0,
  value_estimated NUMERIC(14,2),
  probability_of_win NUMERIC(3,2),
  naics           TEXT,
  psc             TEXT,
  due_date        DATE,
  solicitation_number TEXT,
  set_aside       TEXT,
  place_of_performance TEXT,
  incumbent       TEXT,
  qualified_at    TIMESTAMPTZ,
  qualified_by    TEXT,
  tags            TEXT[] DEFAULT '{}',
  raw_source_url  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Doctrine drafts table (from doctrine automation spec)
CREATE TABLE IF NOT EXISTS doctrine_drafts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sprint_id       TEXT NOT NULL,
  component       TEXT NOT NULL,
  doc_type        TEXT NOT NULL
                    CHECK (doc_type IN ('book_of_truths','sprint_notes','decision_log','master_build_note')),
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','finalized','superseded','blocked')),
  source_pr_number INTEGER,
  source_pr_url   TEXT,
  body            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Doctrine publish runs table
CREATE TABLE IF NOT EXISTS doctrine_publish_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sprint_id       TEXT NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('pr-merge','finalize','manual')),
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','success','blocked','failed')),
  gate_results    JSONB,
  commit_sha      TEXT,
  reason          TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_department ON opportunities(department);
CREATE INDEX IF NOT EXISTS idx_doctrine_drafts_sprint ON doctrine_drafts(sprint_id);
CREATE INDEX IF NOT EXISTS idx_doctrine_publish_runs_sprint ON doctrine_publish_runs(sprint_id);
