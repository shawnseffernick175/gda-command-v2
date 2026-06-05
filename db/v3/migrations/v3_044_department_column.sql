-- F-606: Add department column and backfill from agency mapping.

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS department TEXT;

-- Backfill using the department mapping rules (exact/substring, case-insensitive).
-- Department of Defense
UPDATE opportunities SET department = 'Department of Defense'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Defense%'
  OR agency ILIKE '%DoD%'
  OR agency ILIKE '%DEPT OF DEFENSE%'
  OR agency ILIKE '%Army%'
  OR agency ILIKE '%Navy%'
  OR agency ILIKE '%Air Force%'
  OR agency ILIKE '%Marine Corps%'
  OR agency ILIKE '%DARPA%'
  OR agency ILIKE '%DLA%'
  OR agency ILIKE '%DISA%'
  OR agency ILIKE '%SOCOM%'
);

-- Department of Homeland Security
UPDATE opportunities SET department = 'Department of Homeland Security'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Homeland Security%'
  OR agency ILIKE '%DHS%'
  OR agency ILIKE '%FEMA%'
  OR agency ILIKE '%CBP%'
  OR agency ILIKE '%TSA%'
  OR agency ILIKE '%USCG%'
  OR agency ILIKE '%Secret Service%'
);

-- Department of Veterans Affairs
UPDATE opportunities SET department = 'Department of Veterans Affairs'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Veterans Affairs%'
  OR agency ILIKE '%VA%'
);

-- Department of Health and Human Services
UPDATE opportunities SET department = 'Department of Health and Human Services'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Health and Human Services%'
  OR agency ILIKE '%HHS%'
  OR agency ILIKE '%NIH%'
  OR agency ILIKE '%CDC%'
  OR agency ILIKE '%FDA%'
);

-- Department of Energy
UPDATE opportunities SET department = 'Department of Energy'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Energy%'
  OR agency ILIKE '%DOE%'
);

-- Department of Justice
UPDATE opportunities SET department = 'Department of Justice'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Justice%'
  OR agency ILIKE '%DOJ%'
  OR agency ILIKE '%FBI%'
  OR agency ILIKE '%DEA%'
  OR agency ILIKE '%ATF%'
);

-- Department of State
UPDATE opportunities SET department = 'Department of State'
WHERE department IS NULL AND (
  agency ILIKE '%Department of State%'
  OR agency ILIKE '%DOS%'
);

-- Department of Treasury
UPDATE opportunities SET department = 'Department of Treasury'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Treasury%'
  OR agency ILIKE '%Treasury%'
  OR agency ILIKE '%IRS%'
  OR agency ILIKE '%FinCEN%'
);

-- Department of Transportation
UPDATE opportunities SET department = 'Department of Transportation'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Transportation%'
  OR agency ILIKE '%DOT%'
  OR agency ILIKE '%FAA%'
);

-- Department of Commerce
UPDATE opportunities SET department = 'Department of Commerce'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Commerce%'
  OR agency ILIKE '%DOC%'
  OR agency ILIKE '%NIST%'
  OR agency ILIKE '%NOAA%'
  OR agency ILIKE '%Census%'
);

-- Department of Labor
UPDATE opportunities SET department = 'Department of Labor'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Labor%'
  OR agency ILIKE '%DOL%'
);

-- Department of Education
UPDATE opportunities SET department = 'Department of Education'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Education%'
  OR agency ILIKE '%ED%'
);

-- Department of Agriculture
UPDATE opportunities SET department = 'Department of Agriculture'
WHERE department IS NULL AND (
  agency ILIKE '%Department of Agriculture%'
  OR agency ILIKE '%USDA%'
);

-- Catch-all: anything still NULL gets 'Independent Agency'
UPDATE opportunities SET department = 'Independent Agency'
WHERE department IS NULL;
