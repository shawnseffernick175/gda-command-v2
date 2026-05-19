-- Migration 042: Add extended columns to competitor_profiles for deep research reports
ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS market_position TEXT;
ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS revenue_estimate NUMERIC;
ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS employee_count INTEGER;
ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS headquarters TEXT;
ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS focus_areas TEXT[] DEFAULT '{}';
ALTER TABLE competitor_profiles ADD COLUMN IF NOT EXISTS key_contracts TEXT[] DEFAULT '{}';
