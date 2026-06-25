-- v3_115: F-631 — FasTrac commodity/supply/facilities cleanup.
--
-- Adds excluded_at / exclusion_reason columns for soft-delete of
-- commodity junk, then flags existing polluted rows.
-- Reversible: SET excluded_at = NULL to restore.

-- Add soft-delete columns
ALTER TABLE fast_track_signals
  ADD COLUMN IF NOT EXISTS excluded_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exclusion_reason TEXT;

-- Index to efficiently skip excluded rows in queries
CREATE INDEX IF NOT EXISTS idx_fts_excluded
  ON fast_track_signals (excluded_at)
  WHERE excluded_at IS NULL;

-- Flag records whose title starts with a FSC/PSC supply code pattern (NN--)
UPDATE fast_track_signals
   SET excluded_at = NOW(),
       exclusion_reason = 'fsc_title_pattern'
 WHERE excluded_at IS NULL
   AND title ~ '^\d{2,4}--';

-- Flag records with commodity/facilities keywords in title
UPDATE fast_track_signals
   SET excluded_at = NOW(),
       exclusion_reason = 'commodity_keyword'
 WHERE excluded_at IS NULL
   AND (
     title ~* '\massembly\M'
     OR title ~* 'bushing'
     OR title ~* '\mseal\M'
     OR title ~* '\mcable\M'
     OR title ~* '\mvalve\M'
     OR title ~* '\mfitting\M'
     OR title ~* 'gasket'
     OR title ~* '\mhose\M'
     OR title ~* '\mclamp\M'
     OR title ~* 'bracket'
     OR title ~* 'coupling'
     OR title ~* 'bearing'
     OR title ~* 'flange'
     OR title ~* '\mbolt\M'
     OR title ~* '\mnut\M'
     OR title ~* '\mwasher\M'
     OR title ~* '\mscrew\M'
     OR title ~* '\mrivet\M'
     OR title ~* '\mspring\M'
     OR title ~* '\mshim\M'
     OR title ~* 'spacer'
     OR title ~* 'ring seal'
     OR title ~* 'frame,hoist'
     OR title ~* 'sensor cable'
     OR title ~* 'scissors assembly'
     OR title ~* 'janitorial'
     OR title ~* 'custodial'
     OR title ~* 'boiler'
     OR title ~* '\mhvac\M'
     OR title ~* 'plumbing'
     OR title ~* 'roofing'
     OR title ~* 'paving'
     OR title ~* 'mowing'
     OR title ~* 'landscaping'
     OR title ~* 'groundskeeping'
     OR title ~* 'snow removal'
     OR title ~* 'trash removal'
     OR title ~* 'waste removal'
     OR title ~* 'pest control'
     OR title ~* 'herbicide'
     OR title ~* 'pesticide'
     OR title ~* 'fence installation'
     OR title ~* 'security fence'
     OR title ~* 'building materials'
     OR title ~* 'elevator maintenance'
     OR title ~* 'fire suppression'
     OR title ~* 'fire alarm'
     OR title ~* 'drain rehab'
     OR title ~* 'powerhouse drain'
     OR title ~* 'replace boiler'
     OR title ~* 'replace chiller'
     OR title ~* 'window replacement'
     OR title ~* 'floor replacement'
     OR title ~* 'carpet replacement'
     OR title ~* 'office supplies'
     OR title ~* 'cleaning supplies'
     OR title ~* 'paper products'
     OR title ~* 'toner cartridge'
     OR title ~* 'printer cartridge'
     OR title ~* 'fuel delivery'
     OR title ~* 'fuel supply'
     OR title ~* 'food service'
     OR title ~* 'laundry service'
     OR title ~* 'linen service'
     OR title ~* 'uniform supply'
   );

-- F-631: fix source mistagging — records labeled 'xTech' that don't
-- actually mention xTech in their title are SAM.gov commodity results
-- that leaked through the keyword search.
UPDATE fast_track_signals
   SET source = 'SAM.gov'
 WHERE source = 'xTech'
   AND excluded_at IS NULL
   AND title NOT ILIKE '%xtech%';

-- Also flag matches that reference excluded signals
UPDATE fast_track_matches m
   SET mission_fit_score = 0,
       match_rationale = '[excluded: parent signal flagged as commodity — F-631]'
 WHERE EXISTS (
   SELECT 1 FROM fast_track_signals s
    WHERE s.excluded_at IS NOT NULL
      AND (s.id = m.tech_signal_id OR s.id = m.req_signal_id)
 );
