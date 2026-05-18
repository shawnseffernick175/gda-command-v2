-- Migration 040: Seed default anomaly detection rules
-- Use NOT EXISTS on condition column for idempotency (gen_random_uuid makes ON CONFLICT on PK a no-op)
INSERT INTO escalation_rules (id, name, condition, priority, description, created_at)
SELECT gen_random_uuid(), v.name, v.condition, v.priority::text, v.description, NOW()
FROM (VALUES
  ('Competitor Win on Tracked Opp', 'competitor_wins_on_tracked_opportunity', 'critical', 'A tracked competitor wins an award on an opportunity we are actively pursuing'),
  ('Deadline Change > 30 Days', 'response_deadline_change_gt_30d', 'critical', 'An opportunity response deadline shifts by more than 30 days'),
  ('Value Estimate Change > 50%', 'value_estimate_change_gt_50pct', 'critical', 'An opportunity estimated value changes by more than 50% from original'),
  ('Set-Aside Type Changed', 'set_aside_type_changed', 'warning', 'The set-aside designation on a tracked opportunity changes (e.g., full-open to SDVOSB)'),
  ('Stale Pipeline Opp (No Activity 30d)', 'no_activity_30_days', 'warning', 'An opportunity in active pipeline has no status change or notes in 30+ days'),
  ('High-Value Opp No Capture Plan', 'high_value_no_capture_plan', 'critical', 'An opportunity valued over $5M has no associated capture plan'),
  ('Contract Recompete Within 6 Months', 'contract_recompete_6m', 'warning', 'A tracked FPDS contract is ending within 6 months (recompete opportunity)'),
  ('New SAM Opp NAICS Match', 'new_sam_naics_match', 'info', 'A new SAM.gov opportunity matches one of Envision registered NAICS codes')
) AS v(name, condition, priority, description)
WHERE NOT EXISTS (
  SELECT 1 FROM escalation_rules er WHERE er.condition = v.condition
);
