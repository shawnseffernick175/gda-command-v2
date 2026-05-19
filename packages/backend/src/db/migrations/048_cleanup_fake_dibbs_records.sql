-- Clean up fake DIBBS placeholder records from opportunity tables.
-- F-005 follow-up: the DIBBS integration had no real API — it created
-- placeholder records with titles like "DLA DIBBS — {keyword} requirements check"
-- and IDs matching 'dibbs-check-%'. These are not real opportunities.
-- State-dependent: only affects production databases that ran the old DIBBS code.

-- Delete child records first (FK constraints reference opportunities)
DELETE FROM capture_plans WHERE opportunity_id LIKE 'dibbs-check-%';
DELETE FROM risk_register WHERE opportunity_id LIKE 'dibbs-check-%';
DELETE FROM bid_recommendations WHERE opportunity_id LIKE 'dibbs-check-%';
DELETE FROM merger_opp_impacts WHERE opportunity_id LIKE 'dibbs-check-%';
DELETE FROM capture_gate_reviews WHERE opportunity_id LIKE 'dibbs-check-%';
DELETE FROM capture_guardrail_alerts WHERE opportunity_id LIKE 'dibbs-check-%';

-- Delete fake DIBBS records from the main opportunities table
DELETE FROM opportunities WHERE id LIKE 'dibbs-check-%';
