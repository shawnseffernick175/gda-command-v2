-- F-606: Add department column and backfill from agency mapping.

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS department TEXT;

-- Backfill using the department mapping rules.
-- Uses word-boundary regex (~* with \y) to prevent false positives from
-- short abbreviations appearing inside longer words (e.g. "VA" in "Naval").

-- Department of Defense
UPDATE opportunities SET department = 'Department of Defense'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Defense\y'
  OR agency ~* '\yDoD\y'
  OR agency ~* '\yDEPT OF DEFENSE\y'
  OR agency ~* '\yArmy\y'
  OR agency ~* '\yNavy\y'
  OR agency ~* '\yAir Force\y'
  OR agency ~* '\yMarine Corps\y'
  OR agency ~* '\yDARPA\y'
  OR agency ~* '\yDLA\y'
  OR agency ~* '\yDISA\y'
  OR agency ~* '\ySOCOM\y'
);

-- Department of Homeland Security
UPDATE opportunities SET department = 'Department of Homeland Security'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Homeland Security\y'
  OR agency ~* '\yDHS\y'
  OR agency ~* '\yFEMA\y'
  OR agency ~* '\yCBP\y'
  OR agency ~* '\yTSA\y'
  OR agency ~* '\yUSCG\y'
  OR agency ~* '\ySecret Service\y'
);

-- Department of Veterans Affairs
UPDATE opportunities SET department = 'Department of Veterans Affairs'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Veterans Affairs\y'
  OR agency ~* '\yVA\y'
);

-- Department of Health and Human Services
UPDATE opportunities SET department = 'Department of Health and Human Services'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Health and Human Services\y'
  OR agency ~* '\yHHS\y'
  OR agency ~* '\yNIH\y'
  OR agency ~* '\yCDC\y'
  OR agency ~* '\yFDA\y'
);

-- Department of Energy
UPDATE opportunities SET department = 'Department of Energy'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Energy\y'
  OR agency ~* '\yDOE\y'
);

-- Department of Justice
UPDATE opportunities SET department = 'Department of Justice'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Justice\y'
  OR agency ~* '\yDOJ\y'
  OR agency ~* '\yFBI\y'
  OR agency ~* '\yDEA\y'
  OR agency ~* '\yATF\y'
);

-- Department of State
UPDATE opportunities SET department = 'Department of State'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of State\y'
  OR agency ~* '\yDOS\y'
);

-- Department of Treasury
UPDATE opportunities SET department = 'Department of Treasury'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Treasury\y'
  OR agency ~* '\yTreasury\y'
  OR agency ~* '\yIRS\y'
  OR agency ~* '\yFinCEN\y'
);

-- Department of Transportation
UPDATE opportunities SET department = 'Department of Transportation'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Transportation\y'
  OR agency ~* '\yDOT\y'
  OR agency ~* '\yFAA\y'
);

-- Department of Commerce
UPDATE opportunities SET department = 'Department of Commerce'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Commerce\y'
  OR agency ~* '\yDOC\y'
  OR agency ~* '\yNIST\y'
  OR agency ~* '\yNOAA\y'
  OR agency ~* '\yCensus\y'
);

-- Department of Labor
UPDATE opportunities SET department = 'Department of Labor'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Labor\y'
  OR agency ~* '\yDOL\y'
);

-- Department of Education
UPDATE opportunities SET department = 'Department of Education'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Education\y'
  OR agency ~* '\yED\y'
);

-- Department of Agriculture
UPDATE opportunities SET department = 'Department of Agriculture'
WHERE department IS NULL AND (
  agency ~* '\yDepartment of Agriculture\y'
  OR agency ~* '\yUSDA\y'
);

-- Catch-all: anything still NULL gets 'Independent Agency'
UPDATE opportunities SET department = 'Independent Agency'
WHERE department IS NULL;
