-- v3_081: Ingest CEO Capture Table (12 pursuits from Vault Doc 127)
-- Source: 2026-06-15 Capture Table for 'ENVISION Open Optys'.xlsx
-- These are Envision's current live pipeline.
-- Totals: $197,150,000 raw / $67,014,000 PWin-adjusted (excluding IDIQ rows).

-- Create a source record for this ingest
INSERT INTO sources (kind, title, retrieved_at)
VALUES ('internal', 'CEO Capture Table — Vault Doc 127 (2026-06-15)', NOW())
ON CONFLICT DO NOTHING;

-- Use a DO block for transactional ingest with variable source_id
DO $$
DECLARE
  src_id BIGINT;
  opp_id BIGINT;
BEGIN
  -- Get or create source
  SELECT id INTO src_id FROM sources WHERE title = 'CEO Capture Table — Vault Doc 127 (2026-06-15)' LIMIT 1;
  IF src_id IS NULL THEN
    INSERT INTO sources (kind, title, retrieved_at)
    VALUES ('internal', 'CEO Capture Table — Vault Doc 127 (2026-06-15)', NOW())
    RETURNING id INTO src_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 1: Tradewind Solutions Marketplace (IDIQ)
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, response_due_at, tags)
  VALUES (
    'TRADEWIND SOLUTIONS MARKETPLACE',
    'Tradewind Solutions',
    'ceo_capture_table',
    src_id,
    'tracking',
    TRUE,
    '2026-05-01'::timestamptz,
    ARRAY['ceo_capture', 'codename:Tradewind Solutions Marketplace', 'priority:high', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 32, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 2: PdM M2S2 SETA
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, solicitation_number, data_source, source_id, status, is_idiq, value_max, response_due_at, tags)
  VALUES (
    'RS3-25-0035',
    'Army',
    'RS3-25-0035',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    64000000,
    '2026-05-30'::timestamptz,
    ARRAY['ceo_capture', 'codename:PdM M2S2 SETA', 'priority:low', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 34, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 3: Virtual Training Environment Development (XR)
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, value_max, tags)
  VALUES (
    'GSA OASIS+ DEVCOM SEC Virtual Training Environment Development',
    'GSA',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    5600000,
    ARRAY['ceo_capture', 'codename:Virtual Training Environment Development (XR)', 'priority:medium', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 29, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 4: PM C2I Global Fielding Services (Recompete)
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, solicitation_number, data_source, source_id, status, is_idiq, value_max, tags)
  VALUES (
    'CPE C2IN PM Mission Command Global Fielding (RS3-26-0029)',
    'Army',
    'RS3-26-0029',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    75000000,
    ARRAY['ceo_capture', 'codename:PM C2I Global Fielding Services (Recompete)', 'priority:high', 'prime:GDIT']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 0, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 5: CBM+ (XR) (IDIQ)
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, response_due_at, tags)
  VALUES (
    'CONDITION BASED MAINTENANCE PLUS (CBM+)',
    'Army',
    'ceo_capture_table',
    src_id,
    'tracking',
    TRUE,
    '2026-07-31'::timestamptz,
    ARRAY['ceo_capture', 'codename:CBM+ (XR)', 'priority:medium', 'prime:TBD']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 50, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 6: USMC MCES
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, value_max, tags)
  VALUES (
    'USMC MCES (FORCE)',
    'USMC',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    0,
    ARRAY['ceo_capture', 'codename:USMC MCES', 'priority:high', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 10, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 7: Digital Engineering Ecosystem
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, value_max, tags)
  VALUES (
    'Digital Engineering Ecosystem',
    'Army',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    0,
    ARRAY['ceo_capture', 'codename:Digital Engineering Ecosystem', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 10, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 8: VECTOR
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, solicitation_number, data_source, source_id, status, is_idiq, value_max, response_due_at, tags)
  VALUES (
    'VECTOR CPE ISW High Tech Portfolio Support (RS3-26-0020)',
    'Army',
    'RS3-26-0020',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    0,
    '2026-06-03'::timestamptz,
    ARRAY['ceo_capture', 'codename:VECTOR', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 10, 'qualify', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 9: STEP (Recompete) — HOT PURSUIT
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, value_max, response_due_at, tags)
  VALUES (
    'Soldier Tactical/Expeditionary Power (STEP)',
    'Army',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    50000000,
    '2026-09-04'::timestamptz,
    ARRAY['ceo_capture', 'codename:STEP (Recompete)', 'priority:high', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 83, 'pursue', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 10: CASCOM Munitions ASA — HOT PURSUIT
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, value_max, tags)
  VALUES (
    'CASCOM Munitions ASA',
    'Army',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    750000,
    ARRAY['ceo_capture', 'codename:CASCOM Munitions ASA', 'priority:high', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 68, 'pursue', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 11: CASCOM XR AI Lab — HOT PURSUIT (highest PWin: 90%)
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, value_max, tags)
  VALUES (
    'CASCOM XR AI Lab',
    'Army',
    'ceo_capture_table',
    src_id,
    'tracking',
    FALSE,
    1800000,
    ARRAY['ceo_capture', 'codename:CASCOM XR AI Lab', 'priority:high', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 90, 'pursue', src_id);
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- Row 12: MAPS (IDIQ) — explicitly named IDIQ
  -- ═══════════════════════════════════════════════════════════════════
  INSERT INTO opportunities (title, agency, data_source, source_id, status, is_idiq, response_due_at, tags)
  VALUES (
    'MARKETPLACE FOR THE ACQUISITION OF PROFESSIONAL SERVICES',
    'GSA',
    'ceo_capture_table',
    src_id,
    'tracking',
    TRUE,
    '2026-04-01'::timestamptz,
    ARRAY['ceo_capture', 'codename:MAPS (IDIQ)', 'priority:high', 'prime:envision']
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO opp_id;

  IF opp_id IS NOT NULL THEN
    INSERT INTO pipeline_items (opportunity_id, capture_owner, win_probability, stage, source_id)
    VALUES (opp_id, 'CEO', 47, 'solicitation', src_id);
  END IF;

END $$;
