-- 019_sprint2_header_kpis_and_roles.sql
-- Adds missing financial KPIs (Orders, Sales, EBIT, Gross Profit, ROS)
-- and user roles/invitations support.

-- ============================================================================
-- Additional Financial KPIs for the header strip
-- ============================================================================
INSERT INTO financial_kpis (id, label, category, value, target, unit, period, trend) VALUES
('orders', 'Orders', 'revenue', 95000000, 100000000, '$', 'FY2026', 'up'),
('sales', 'Sales', 'revenue', 382000000, 400000000, '$', 'FY2026', 'up'),
('ebit', 'EBIT', 'profitability', 34380000, 40000000, '$', 'FY2026', 'up'),
('gross_profit', 'Gross Profit', 'profitability', 76400000, 80000000, '$', 'FY2026', 'up'),
('ros', 'ROS', 'profitability', 9.0, 10.0, '%', 'FY2026', 'up'),
('funded_backlog', 'Funded Backlog', 'revenue', 198000000, 220000000, '$', 'FY2026', 'up')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- User roles column
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'viewer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- ============================================================================
-- Anomaly detection rules table
-- ============================================================================
CREATE TABLE IF NOT EXISTS anomaly_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  condition_type VARCHAR(50) NOT NULL DEFAULT 'threshold',
  condition_config JSONB NOT NULL DEFAULT '{}',
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default anomaly rules
INSERT INTO anomaly_rules (name, description, category, condition_type, condition_config, severity) VALUES
('Pwin Drop Alert', 'Alert when any opportunity Pwin drops more than 10% in a period', 'pwin_drop', 'threshold', '{"metric": "pwin_change", "operator": "less_than", "value": -0.10}', 'high'),
('Response Deadline Warning', 'Alert 14 days before response deadline', 'timeline_change', 'deadline', '{"days_before": 14}', 'medium'),
('High-Value Opp Unscored', 'Alert when opportunity over $10M has no score', 'scoring_outlier', 'threshold', '{"metric": "score", "operator": "equals", "value": 0, "filter": "value_estimated > 10000000"}', 'high'),
('Competitor Win Alert', 'Alert when a tracked competitor wins a contract in our NAICS', 'competitor_activity', 'event', '{"event_type": "contract_win", "match": "naics"}', 'critical'),
('Budget Variance Alert', 'Alert when EBIT falls more than 15% below plan', 'financial_anomaly', 'threshold', '{"metric": "ebit_variance_pct", "operator": "less_than", "value": -15}', 'high')
ON CONFLICT DO NOTHING;
