-- Migration 040: Seed default anomaly detection rules
INSERT INTO escalation_rules (id, name, condition, priority, description, created_at)
VALUES
  (gen_random_uuid(), 'Competitor Win on Tracked Opp', 'competitor_wins_on_tracked_opportunity', 'critical', 'A tracked competitor wins an award on an opportunity we are actively pursuing', NOW()),
  (gen_random_uuid(), 'Deadline Change > 30 Days', 'response_deadline_change_gt_30d', 'high', 'An opportunity response deadline shifts by more than 30 days', NOW()),
  (gen_random_uuid(), 'Value Estimate Change > 50%', 'value_estimate_change_gt_50pct', 'high', 'An opportunity estimated value changes by more than 50% from original', NOW()),
  (gen_random_uuid(), 'Set-Aside Type Changed', 'set_aside_type_changed', 'warning', 'The set-aside designation on a tracked opportunity changes (e.g., full-open to SDVOSB)', NOW()),
  (gen_random_uuid(), 'Stale Pipeline Opp (No Activity 30d)', 'no_activity_30_days', 'warning', 'An opportunity in active pipeline has no status change or notes in 30+ days', NOW()),
  (gen_random_uuid(), 'High-Value Opp No Capture Plan', 'high_value_no_capture_plan', 'high', 'An opportunity valued over $5M has no associated capture plan', NOW()),
  (gen_random_uuid(), 'Contract Recompete Within 6 Months', 'contract_recompete_6m', 'warning', 'A tracked FPDS contract is ending within 6 months (recompete opportunity)', NOW()),
  (gen_random_uuid(), 'New SAM Opp NAICS Match', 'new_sam_naics_match', 'info', 'A new SAM.gov opportunity matches one of Envision registered NAICS codes', NOW())
ON CONFLICT DO NOTHING;
