-- task_order_years: per-contract-year ceiling breakdown for waterfall spread.
-- Each row represents one contract year (or extension) with its own ceiling,
-- enabling monthly revenue = that_year_ceiling / months_in_period instead of
-- total_ceiling / total_months.

CREATE TABLE IF NOT EXISTS task_order_years (
  id             SERIAL PRIMARY KEY,
  task_order_id  INTEGER NOT NULL REFERENCES task_orders(id) ON DELETE CASCADE,
  year_label     TEXT NOT NULL,
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  ceiling        NUMERIC(15,2) NOT NULL,
  months_in_period INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_order_years_to_id
  ON task_order_years (task_order_id);

-- Seed FORCE (task_order_id = 5, to_number W56KGU26FA010)
INSERT INTO task_order_years (task_order_id, year_label, period_start, period_end, ceiling, months_in_period)
VALUES
  (5, 'Base', '2026-07-01', '2027-06-30', 19205951.09, 12),
  (5, 'OY1',  '2027-07-01', '2028-06-30', 19700302.35, 12),
  (5, 'OY2',  '2028-07-01', '2029-06-30', 20069372.40, 12),
  (5, 'OY3',  '2029-07-01', '2030-06-30', 20368569.35, 12),
  (5, 'OY4',  '2030-07-01', '2031-06-30', 20779543.22, 12),
  (5, 'Ext',  '2031-07-01', '2031-12-31',  7155603.22,  6)
ON CONFLICT DO NOTHING;
