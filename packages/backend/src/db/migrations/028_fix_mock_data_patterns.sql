-- Migration 028: Fix mock data removal — correct ID patterns that migration 027 missed.
-- Migration 027 used incorrect ID patterns (e.g., 'briefing-%' instead of 'brief-%').
-- This migration removes the remaining seeded mock data using the actual ID patterns.

-- Morning briefings: actual IDs are brief-001, brief-002, etc.
DELETE FROM morning_briefings WHERE id LIKE 'brief-%';

-- Doctrine drafts: actual IDs are dd-001, dd-002, etc.
DELETE FROM doctrine_drafts WHERE id LIKE 'dd-%';

-- Contacts: actual IDs are CON-001, CON-002, etc.
DELETE FROM contacts WHERE id LIKE 'CON-%';

-- Approvals: actual IDs are APR-001, APR-002, etc.
DELETE FROM approvals WHERE id LIKE 'APR-%';

-- Capture plans: actual IDs are cap-001, cap-002, etc.
DELETE FROM capture_plans WHERE id LIKE 'cap-%';

-- Scheduled reports before templates (FK constraint: scheduled_reports -> report_templates)
DELETE FROM scheduled_reports WHERE id LIKE 'SCH-%';

-- Generated reports before templates (FK constraint)
DELETE FROM generated_reports WHERE id LIKE 'RPT-%';

-- Report templates: actual IDs are TPL-001, TPL-002, etc.
DELETE FROM report_templates WHERE id LIKE 'TPL-%';

-- Compliance requirements: actual IDs are CR-001, CR-002, etc.
DELETE FROM compliance_requirements WHERE id LIKE 'CR-%';
