-- F-100 Sprint 1: OU tag enum + ou_registry + launchpad_flags
-- Foundation tables for the GDA Command v2 rebuild.

-- Enum for OU tagging
DO $$ BEGIN
  CREATE TYPE ou_tag AS ENUM ('envision', 'riverstone', 'pd_systems', 'teaming', 'gda_rollup');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Reference table any door can join against for OU metadata
CREATE TABLE IF NOT EXISTS ou_registry (
  ou_tag        ou_tag PRIMARY KEY,
  display_name  TEXT NOT NULL,
  anchor_company TEXT NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  is_partner    BOOLEAN NOT NULL DEFAULT FALSE,
  uei           TEXT,
  cage          TEXT,
  primary_naics TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ou_registry (ou_tag, display_name, anchor_company, is_primary, is_partner, uei, cage, primary_naics, notes) VALUES
  ('envision',   'OU-I Defense & Mission Systems',          'Envision Innovative Solutions', TRUE,  FALSE, 'VNMLXFMQD976', '4JB87',  '541715', 'Primary tool user. Shawn operates this OU.'),
  ('riverstone', 'OU-II Intelligence & Cyber Engineering',  'Riverstone Solutions',          FALSE, TRUE,  NULL,           '71WX3',  NULL,     'Partner Intel. Tracked via Partner Intel door, not operated.'),
  ('pd_systems', 'OU-III Training, Simulation & Digital Readiness', 'PD Systems',           FALSE, TRUE,  'MBF6MBLZLMC3', '4V8V7',  '561210', 'Partner Intel. Tracked via Partner Intel door, not operated.'),
  ('teaming',    'Joint Pursuit (multi-OU)',                'GDA',                            FALSE, FALSE, NULL,           NULL,     NULL,     'Applied to opportunities/pipeline/capture when Envision is teaming with one or more partners on the same pursuit.'),
  ('gda_rollup', 'GDA Enterprise Rollup',                   'Georgetown Defense Analytics',   FALSE, FALSE, NULL,           NULL,     NULL,     'Applied to records that represent the GDA parent narrative (3-pillar story used in proposals upmarket).')
ON CONFLICT (ou_tag) DO NOTHING;

-- Launchpad flags table
CREATE TABLE launchpad_flags (
  id              BIGSERIAL PRIMARY KEY,
  ou_tag          ou_tag NOT NULL DEFAULT 'envision',
  flag_key        TEXT NOT NULL UNIQUE,
  severity        TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
  title           TEXT NOT NULL,
  detail          TEXT NOT NULL,
  due_date        DATE,
  doctrine_anchor TEXT,
  source_url      TEXT,
  is_dismissed    BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_launchpad_flags_severity ON launchpad_flags(severity, is_dismissed);
CREATE INDEX idx_launchpad_flags_due_date ON launchpad_flags(due_date) WHERE is_dismissed = FALSE;

-- Seed the 3 Day-1 critical flags
INSERT INTO launchpad_flags (ou_tag, flag_key, severity, title, detail, due_date, doctrine_anchor, source_url) VALUES
  ('envision', 'cio_sp3_expired',
   'critical',
   'CIO-SP3 SB/8(a) EXPIRED',
   'Envision''s CIO-SP3 Small Business / 8(a) status via Dynamic Vision LLC expired 4/29/2026. Cannot bid CIO-SP3 set-aside task orders until restored.',
   '2026-04-29',
   'Ethics Always',
   NULL),
  ('envision', 'cmmi_ml3_expiring',
   'critical',
   'CMMI-DEV ML3 expires 8/7/2026',
   'Envision''s CMMI-DEV Maturity Level 3 appraisal expires 8/7/2026 (~10 weeks). Recertification appraisal must be scheduled now to avoid lapse.',
   '2026-08-07',
   'Ethics Always',
   NULL),
  ('envision', 'mentor_protege_urgent',
   'critical',
   'Mentor-Protege Agreement — most urgent action',
   'Per FY26 Business Plan, Mentor-Protege Agreement is the most urgent action to preserve small-business prime eligibility as Envision''s 5-year average revenue ($54.1M) exceeds NAICS 541715 $34M threshold. No status captured.',
   NULL,
   'Market, Mission, Brand Focus',
   NULL)
ON CONFLICT (flag_key) DO NOTHING;
