-- 128_riverstone_uei_confirmed.sql
-- Update the Riverstone OU registry row with the confirmed UEI.
-- Source: FPDS ATOM feed for contract HQ085926DF469 + USAspending recipient endpoint (DUNS 933887031).
-- UEI: TECGLUBFP6N6 (12-char alphanumeric). Same entity as CAGE 71WX3.

UPDATE ou_registry
SET uei = 'TECGLUBFP6N6',
    notes = 'Partner Intel. Tracked via Partner Intel door, not operated. UEI confirmed via FPDS contract HQ085926DF469 + USAspending DUNS 933887031.'
WHERE ou_tag = 'riverstone'
  AND (uei IS NULL OR uei = '');
