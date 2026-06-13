-- v3_077_cost_detail_actuals.sql — Cost Detail (TGT vs ACT) table + balance_sheet_actuals backfill columns (F-815)

-- Add source_doc_id and created_at to balance_sheet_actuals (created in v3_076 without them)
ALTER TABLE balance_sheet_actuals ADD COLUMN IF NOT EXISTS source_doc_id BIGINT REFERENCES vault_documents(id);
ALTER TABLE balance_sheet_actuals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS cost_detail_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT NOT NULL,
  cost_element TEXT NOT NULL,
  pool TEXT NOT NULL,
  target_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(15,2) GENERATED ALWAYS AS (actual_amount - target_amount) STORED,
  source TEXT NOT NULL DEFAULT 'tgt_vs_act',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, period, cost_element, pool)
);
CREATE INDEX IF NOT EXISTS cost_detail_actuals_period_idx ON cost_detail_actuals (fiscal_year, quarter, period);
