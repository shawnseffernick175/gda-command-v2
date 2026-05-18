-- Migration 027: Remove all seeded mock/dummy data from production tables.
-- Preserves any real user data (which will not have mock-style IDs).
-- This is a one-time cleanup to prepare for go-live.

-- Morning briefings with fake KPIs ($208.8M pipeline, etc.)
DELETE FROM morning_briefings WHERE id LIKE 'briefing-%';

-- Mock intel items (intel-001, intel-002, ...)
DELETE FROM intel_items WHERE id LIKE 'intel-%';

-- Mock deep research reports
DELETE FROM deep_research_reports WHERE id LIKE 'research-%';

-- Mock competitor profiles
DELETE FROM competitor_profiles WHERE id LIKE 'comp-%';

-- Mock approvals
DELETE FROM approvals WHERE id LIKE 'appr-%';

-- Mock compliance requirements
DELETE FROM compliance_requirements WHERE id LIKE 'compliance-%';

-- Mock capture plans
DELETE FROM capture_plans WHERE id LIKE 'capture-%';

-- Mock doctrine drafts
DELETE FROM doctrine_drafts WHERE id LIKE 'doctrine-%';

-- Mock risk register entries
DELETE FROM risk_register WHERE id LIKE 'risk-%';

-- Mock contacts
DELETE FROM contacts WHERE id LIKE 'contact-%';

-- Mock report templates (keep user-created ones)
DELETE FROM report_templates WHERE id LIKE 'rpt-%';
DELETE FROM generated_reports WHERE id LIKE 'gen-%';
DELETE FROM scheduled_reports WHERE id LIKE 'sched-%';

-- Mock prompts
DELETE FROM prompts WHERE id LIKE 'prompt-%';
