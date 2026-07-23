-- v3_145_service_center_actuals.sql — Cost Service Centers tab (Financial Bible).
--
-- Lays out the company's INDIRECT cost service centers straight from finance's
-- official books. Two additive, source-linked tables:
--
--   service_center_actuals  — one row per (service center, pool, month) of
--     INDIRECT cost, aggregated from the YTD GL Detail ledger (Proj
--     Classification = INDIRECT). service_center_id is the GL Project ID
--     (e.g. FRNG.001, ADMN.GNA, SRVC.FAC); pool is the GL PAG group.
--
--   indirect_pool_rates     — the Trend SIE "Trend Rate Summary" pool rates
--     (Fringe / OH Offsite / OH Onsite / MHx / G&A). One row per (pool, month)
--     carries that month's actual rate; the YTD row (month_num IS NULL) carries
--     the YTD actual rate and the provisional (PROV) rate for variance display.
--
-- No fabricated values: every figure traces to a single source document via
-- source_doc_id (R1). Rows the source does not provide simply do not exist.

CREATE TABLE IF NOT EXISTS service_center_actuals (
  id                  BIGSERIAL PRIMARY KEY,
  period              TEXT        NOT NULL,             -- e.g. 'FY26 Jan'
  fiscal_year         INTEGER     NOT NULL,
  quarter             INTEGER,
  month_num           INTEGER     NOT NULL,             -- GL PD, 1..12
  service_center_id   TEXT        NOT NULL,             -- GL Project ID
  service_center_name TEXT,                             -- GL Project Name
  pool                TEXT,                             -- GL PAG group
  org_id              TEXT,                             -- GL Org ID
  classification      TEXT        NOT NULL DEFAULT 'INDIRECT',
  amount              NUMERIC(15,2) NOT NULL DEFAULT 0,
  source              TEXT        NOT NULL DEFAULT 'gl_service_center',
  source_doc_id       BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- COALESCE the nullable pool so a service center with no PAG still keys uniquely.
CREATE UNIQUE INDEX IF NOT EXISTS service_center_actuals_key_idx
  ON service_center_actuals (source, fiscal_year, month_num, service_center_id, (COALESCE(pool, '')));
CREATE INDEX IF NOT EXISTS service_center_actuals_fy_center_idx
  ON service_center_actuals (fiscal_year, service_center_id);
CREATE INDEX IF NOT EXISTS service_center_actuals_fy_pool_idx
  ON service_center_actuals (fiscal_year, pool);

COMMENT ON TABLE service_center_actuals IS
  'Per-service-center INDIRECT cost by month, from the YTD GL Detail ledger (Proj Classification = INDIRECT). Source-linked via source_doc_id (R1).';

CREATE TABLE IF NOT EXISTS indirect_pool_rates (
  id                BIGSERIAL PRIMARY KEY,
  fiscal_year       INTEGER     NOT NULL,
  pool_number       TEXT        NOT NULL,          -- e.g. '100', '500'
  pool_name         TEXT        NOT NULL,          -- e.g. 'Fringe', 'OH Offsite'
  month_num         INTEGER,                       -- 1..12 monthly actual; NULL = YTD summary
  actual_rate       NUMERIC(10,6),                 -- decimal fraction (0.35 = 35%)
  provisional_rate  NUMERIC(10,6),                 -- PROV rate; only on the YTD row
  source            TEXT        NOT NULL DEFAULT 'sie_pool_rate',
  source_doc_id     BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- COALESCE the nullable month_num so the YTD row (NULL) participates in the
-- unique key as a single distinct slot per pool.
CREATE UNIQUE INDEX IF NOT EXISTS indirect_pool_rates_key_idx
  ON indirect_pool_rates (source, fiscal_year, pool_number, (COALESCE(month_num, -1)));
CREATE INDEX IF NOT EXISTS indirect_pool_rates_fy_idx
  ON indirect_pool_rates (fiscal_year, pool_number);

COMMENT ON TABLE indirect_pool_rates IS
  'Indirect cost pool rates from the Trend SIE Trend Rate Summary. Monthly rows carry the month actual rate; the YTD row (month_num IS NULL) carries YTD actual + provisional rate. Source-linked via source_doc_id (R1).';
