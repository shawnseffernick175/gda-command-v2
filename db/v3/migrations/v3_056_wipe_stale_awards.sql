-- Remove all awards with null naics (the wrong dataset imported without NAICS filter)
-- Safe because these rows are all value_obligated=0 supply chain IDVs
DELETE FROM awards WHERE naics IS NULL AND data_source = 'usaspending';
