-- Migration 039: Capture Discipline (W6)
-- Gate review tracking and capture guardrails for Shipley-compliant BD process.

-- Track gate reviews per opportunity
CREATE TABLE IF NOT EXISTS capture_gate_reviews (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  gate TEXT NOT NULL
    CHECK (gate IN ('qualify', 'pursue', 'solicitation', 'post_submittal', 'bid_validation')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('passed', 'failed', 'pending', 'waived', 'deferred')),
  reviewer TEXT,
  reviewed_at TIMESTAMPTZ,
  criteria_met INT DEFAULT 0,
  criteria_total INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(opportunity_id, gate)
);

-- Capture guardrail violations
CREATE TABLE IF NOT EXISTS capture_guardrail_alerts (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
