-- Migration: Update Financial Bible KPIs with real Q1 FY2026 data
-- Source: Envision Consolidated financials (Income Statement, Balance Sheet, Revenue Summary)
-- Data period: January–March 2026

-- Annual Revenue → Q1 YTD actual revenue ($9,855,289)
UPDATE financial_kpis SET value = 9855289, target = 39421155, period = 'FY2026-Q1', trend = 'up' WHERE id = 'fin-001';

-- Sales → same as revenue for services company
UPDATE financial_kpis SET value = 9855289, target = 39421155, period = 'FY2026-Q1', trend = 'up' WHERE id = 'sales';

-- Gross Profit → Q1 YTD gross margin ($123,874)
UPDATE financial_kpis SET value = 123874, target = 495496, period = 'FY2026-Q1', trend = 'up' WHERE id = 'gross_profit';

-- EBIT → Q1 YTD net income before taxes ($98,703)
UPDATE financial_kpis SET value = 98703, target = 394812, period = 'FY2026-Q1', trend = 'up' WHERE id = 'ebit';

-- ROS (Return on Sales) → Net Income / Revenue = 1.0%
UPDATE financial_kpis SET value = 1.0, target = 2.5, period = 'FY2026-Q1', trend = 'down' WHERE id = 'ros';

-- Orders → Q1 YTD actual revenue earned on contracts ($9,806,287)
UPDATE financial_kpis SET value = 9806287, target = 39000000, period = 'FY2026-Q1', trend = 'up' WHERE id = 'orders';

-- Funded Backlog → billed + unbilled receivable ($5,186,745)
UPDATE financial_kpis SET value = 5186745, target = 10000000, period = 'FY2026-Q1', trend = 'up' WHERE id = 'funded_backlog';

-- Contract Backlog → total assets ($16,599,957)
UPDATE financial_kpis SET value = 16599957, target = 25000000, period = 'FY2026-Q1', trend = 'up' WHERE id = 'fin-006';

-- Revenue Per Employee → annualized Q1 revenue / 41 employees ($961,491)
UPDATE financial_kpis SET value = 961491, target = 1000000, period = 'FY2026-Q1', trend = 'up' WHERE id = 'fin-010';

-- Avg Contract Value → Q1 YTD revenue / 10 active projects ($985,529)
UPDATE financial_kpis SET value = 985529, target = 1500000, period = 'FY2026-Q1', trend = 'up' WHERE id = 'fin-004';

-- Active Contracts → from L1-ACTUAL Revenue Summary (10 active projects)
UPDATE financial_kpis SET value = 10, target = 15, period = 'FY2026-Q1', trend = 'up' WHERE id = 'fin-005';
