-- F-620: Regulatory AI Context — prompt_library metadata + self-ref cleanup
-- Adds columns to track which prompts should receive regulatory context injection
-- and which regulatory categories are relevant per prompt type.

-- Update all prompts to remove self-references
UPDATE prompt_library SET
  system_prompt = REPLACE(system_prompt, 'GDA Command', 'Envision'),
  updated_at = NOW()
WHERE system_prompt LIKE '%GDA Command%';

-- Add metadata columns to track regulatory context injection
ALTER TABLE prompt_library
  ADD COLUMN IF NOT EXISTS inject_regulatory_context BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS regulatory_categories TEXT[] DEFAULT NULL;

-- Set category preferences per prompt type
UPDATE prompt_library SET regulatory_categories = ARRAY['FAR','DFARS','NDAA','EO'] WHERE prompt_key = 'opportunity_analysis';
UPDATE prompt_library SET regulatory_categories = ARRAY['FAR','DFARS','NDAA','EO','CMMC'] WHERE prompt_key = 'risk_generation';
UPDATE prompt_library SET regulatory_categories = ARRAY['FAR','NDAA'] WHERE prompt_key = 'fast_track_triage';
UPDATE prompt_library SET regulatory_categories = ARRAY['FAR','DFARS'] WHERE prompt_key = 'capture_color_stage';
UPDATE prompt_library SET regulatory_categories = ARRAY['FAR','DFARS','GAO'] WHERE prompt_key = 'competitor_black_hat';
UPDATE prompt_library SET regulatory_categories = ARRAY['NDAA','EO','GAO'] WHERE prompt_key = 'daily_briefing';
UPDATE prompt_library SET regulatory_categories = ARRAY['FAR','DFARS','NDAA'] WHERE prompt_key = 'award_so_what';
