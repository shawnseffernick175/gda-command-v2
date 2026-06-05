-- v3_039_risks.sql
CREATE TABLE IF NOT EXISTS risks (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT NOT NULL DEFAULT 'operational'
                   CHECK (category IN ('operational','technical','financial','compliance','schedule','competitive')),
  likelihood     SMALLINT NOT NULL DEFAULT 3 CHECK (likelihood BETWEEN 1 AND 5),
  impact         SMALLINT NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  score          SMALLINT GENERATED ALWAYS AS (likelihood * impact) STORED,
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','mitigated','accepted','closed')),
  owner          TEXT,
  mitigation     TEXT,
  opportunity_id BIGINT REFERENCES opportunities(id) ON DELETE SET NULL,
  source         TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','ai_generated')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risks_status_idx      ON risks (status);
CREATE INDEX IF NOT EXISTS risks_category_idx    ON risks (category);
CREATE INDEX IF NOT EXISTS risks_opportunity_idx ON risks (opportunity_id);
CREATE INDEX IF NOT EXISTS risks_score_idx       ON risks (score DESC);
