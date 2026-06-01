-- V3 Migration 018: GovTribe Fix Defaults (F-Govtribe-Fix)
--
-- Corrects govtribe_credit_monthly.credits_budget default from 5000 to 1200
-- to match V2 production reality (GovTribe subscription: $1.2k/yr Shawn-paid).
-- Updates any existing rows that still carry the incorrect 5000 default.
-- Forward-only.

BEGIN;

-- Fix column default from 5000 → 1200
ALTER TABLE govtribe_credit_monthly
  ALTER COLUMN credits_budget SET DEFAULT 1200;

-- Correct any existing rows still showing the wrong 5000 default
UPDATE govtribe_credit_monthly
SET credits_budget = 1200, updated_at = NOW()
WHERE credits_budget = 5000;

COMMIT;
