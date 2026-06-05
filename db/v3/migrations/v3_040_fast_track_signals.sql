-- v3_040: Fast Track Need Sensing — dual pipeline signal store
-- Two pipelines: 'tech' (emerging technology) and 'requirement' (emerging requirements)

CREATE TABLE IF NOT EXISTS fast_track_signals (
  id              BIGSERIAL PRIMARY KEY,
  pipeline        TEXT        NOT NULL CHECK (pipeline IN ('tech','requirement')),
  source          TEXT        NOT NULL,                   -- e.g. "DARPA", "SAM.gov RFI", "SBIR.gov"
  title           TEXT        NOT NULL,
  summary         TEXT,
  mission_tags    TEXT[]      NOT NULL DEFAULT '{}',      -- e.g. {"C5ISR","cyber","logistics"}
  problem_tags    TEXT[]      NOT NULL DEFAULT '{}',
  maturity        TEXT        CHECK (maturity IN ('concept','prototype','pilot','production')),
  urgency         TEXT        CHECK (urgency IN ('low','medium','high','critical')),
  horizon         TEXT        NOT NULL DEFAULT '0-6mo',   -- display string: "0-6mo","6-12mo","12-24mo"
  signal_strength SMALLINT    NOT NULL DEFAULT 3 CHECK (signal_strength BETWEEN 1 AND 5),
  transition_tags TEXT[]      NOT NULL DEFAULT '{}',      -- e.g. {"SBIR/STTR","OT","direct"}
  source_url      TEXT,
  published_at    TIMESTAMPTZ,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_review_at  TIMESTAMPTZ,
  next_review_action TEXT,                                -- human-readable recommendation
  extra           JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_fts_pipeline   ON fast_track_signals (pipeline);
CREATE INDEX IF NOT EXISTS idx_fts_urgency    ON fast_track_signals (urgency);
CREATE INDEX IF NOT EXISTS idx_fts_ingested   ON fast_track_signals (ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_fts_mission    ON fast_track_signals USING GIN (mission_tags);

-- Seed: representative signals so the UI renders on day-1
INSERT INTO fast_track_signals
  (pipeline, source, title, summary, mission_tags, problem_tags, maturity, urgency, horizon, signal_strength, transition_tags, source_url, published_at, next_review_action)
VALUES
  -- ── TECHNOLOGY PIPELINE ─────────────────────────────────────────────
  ('tech','DARPA','Programmatic Disruption-Tolerant Networks (PDTN)',
   'DARPA seeks novel networking topologies that maintain command integrity across GPS-denied, comms-degraded environments.',
   ARRAY['C5ISR','networking'],ARRAY['comms resilience','GPS denied'],
   'prototype','high','6-12mo',4,ARRAY['OT','SBIR/STTR'],
   'https://darpa.mil/pdtn','2026-04-15','Monitor BAA — submit White Paper by Q3 FY26'),

  ('tech','DIU','Autonomous Logistics Vehicles (ALV)',
   'DIU Commercial Solutions Opening for last-mile autonomous ground vehicles in contested environments.',
   ARRAY['logistics','autonomous systems'],ARRAY['last-mile delivery','force protection'],
   'pilot','high','0-6mo',5,ARRAY['CSO','OT'],
   'https://diu.mil/alv','2026-05-01','CSO open — Envision teaming opportunity with prime. Submit by Aug 2026.'),

  ('tech','AFWERX','AI-Enabled Predictive Maintenance (AEPM)',
   'AFWERX SBIR Topic: AI models predicting component failure for fixed-wing aircraft fleets.',
   ARRAY['sustainment','AI/ML'],ARRAY['maintenance burden','aircraft readiness'],
   'concept','medium','6-12mo',3,ARRAY['SBIR/STTR'],
   'https://afwerx.com/aepm','2026-03-20','SBIR Phase I solicitation expected Sept FY26. Prepare capability statement.'),

  ('tech','NavalX','Human-Machine Teaming for ISR Analysis',
   'NavalX Tech Bridge exploring commercial AI tools for accelerating ISR imagery analysis workflows.',
   ARRAY['ISR','AI/ML'],ARRAY['analyst workload','sensor fusion'],
   'prototype','medium','6-12mo',4,ARRAY['direct','partner vehicle'],
   'https://navalx.org','2026-04-30','Schedule demo through NavalX Tech Bridge. Identify Navy program office sponsor.'),

  ('tech','Army Applications Lab','Tactical Edge AI Inference',
   'AAL xTechSearch track focused on AI inference at tactical edge with SWAP-C constraints.',
   ARRAY['AI/ML','edge computing'],ARRAY['bandwidth','latency','SWaP-C'],
   'prototype','high','0-6mo',5,ARRAY['OT','SBIR/STTR','CSO'],
   'https://armyapplicationslab.army.mil','2026-05-10','xTechSearch Phase II open. High fit for GDA Command analytics stack.'),

  ('tech','NSIN','University Research: Contested Maritime Autonomy',
   'NSIN university challenge seeking dual-use tech for contested maritime autonomous platforms.',
   ARRAY['maritime','autonomous systems'],ARRAY['multi-domain','contested environment'],
   'concept','low','12-24mo',2,ARRAY['SBIR/STTR'],
   'https://nsin.mil','2026-02-01','Low urgency. Revisit for SBIR Phase I alignment in 12 months.'),

  -- ── REQUIREMENTS PIPELINE ───────────────────────────────────────────
  ('requirement','SAM.gov RFI','DoD CJADC2 Data Fabric — Sources Sought',
   'DISA sources sought for a unified data fabric enabling Combined Joint All-Domain Command and Control data sharing.',
   ARRAY['C5ISR','data management'],ARRAY['interoperability','data fabric','JADC2'],
   NULL,'critical','0-6mo',5,ARRAY['direct','OT'],
   'https://sam.gov/opp/cjadc2-ss','2026-05-20','Respond to SS by June 30. Draft capability narrative now.'),

  ('requirement','SAM.gov Forecast','Army Synthetic Training Environment (STE) Integration Services',
   'FY27 procurement forecast for software integration services supporting Army STE program office.',
   ARRAY['training','simulation'],ARRAY['STE integration','software engineering'],
   NULL,'medium','6-12mo',3,ARRAY['prime','subcontract'],
   'https://sam.gov','2026-05-01','Forecast only. Identify PRIME contractors. Target subcontract positioning by Oct FY26.'),

  ('requirement','SAM.gov Industry Day','AFMC Cybersecurity DevSecOps Platform',
   'Industry day notice for FY27 award of a multi-year DevSecOps platform modernization contract.',
   ARRAY['cybersecurity','DevSecOps'],ARRAY['platform modernization','zero trust'],
   NULL,'high','6-12mo',4,ARRAY['direct','partner vehicle'],
   'https://sam.gov/opp/afmc-devsecops','2026-05-25','Attend industry day July 2026. Register in AFMC industry portal.'),

  ('requirement','GovWin IQ','USSOCOM Digital Transformation BPA',
   'GovWin forecast: USSOCOM standing up a new BPA for digital transformation and cloud migration services.',
   ARRAY['digital transformation','cloud'],ARRAY['cloud migration','legacy modernization'],
   NULL,'high','6-12mo',4,ARRAY['BPA','direct'],
   NULL,'2026-05-15','Identify USSOCOM contracting vehicle. Validate socioeconomic eligibility.'),

  ('requirement','SAM.gov Draft RFP','NGA Geospatial Analytics Services (GAS-III)',
   'Draft RFP released for NGA follow-on analytics services contract. Incumbent Booz Allen Hamilton.',
   ARRAY['geospatial','analytics'],ARRAY['imagery analysis','data science'],
   NULL,'critical','0-6mo',5,ARRAY['subcontract','partner vehicle'],
   'https://sam.gov/opp/gas-iii','2026-05-28','Comment period closes June 20. Position as subcontractor to non-incumbent team.'),

  ('requirement','SAM.gov CSO','DARPA ECHOS: Enhancing Contested Hybrid Operations Support',
   'DARPA Broad Agency Announcement for novel cognitive decision support in contested hybrid environments.',
   ARRAY['C5ISR','AI/ML'],ARRAY['decision support','cognitive load'],
   NULL,'medium','6-12mo',3,ARRAY['CSO','OT'],
   'https://darpa.mil/echos','2026-04-10','White paper window re-opens Q4 FY26. Align GDA Command data pipeline angle.')
ON CONFLICT DO NOTHING;

-- Match view materialized data (populated by future ingest workers)
CREATE TABLE IF NOT EXISTS fast_track_matches (
  id                  BIGSERIAL PRIMARY KEY,
  tech_signal_id      BIGINT REFERENCES fast_track_signals(id) ON DELETE CASCADE,
  req_signal_id       BIGINT REFERENCES fast_track_signals(id) ON DELETE CASCADE,
  mission_fit_score   NUMERIC(4,3) NOT NULL DEFAULT 0,
  technical_fit_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  timing_score        NUMERIC(4,3) NOT NULL DEFAULT 0,
  adoption_path       TEXT,
  recommended_vehicle TEXT,
  match_rationale     TEXT,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tech_signal_id, req_signal_id)
);

CREATE INDEX IF NOT EXISTS idx_ftm_scores ON fast_track_matches (mission_fit_score DESC, technical_fit_score DESC);

-- Seed one illustrative match
INSERT INTO fast_track_matches
  (tech_signal_id, req_signal_id, mission_fit_score, technical_fit_score, timing_score, adoption_path, recommended_vehicle, match_rationale)
SELECT
  t.id, r.id, 0.88, 0.82, 0.75,
  'Partner with PRIME as AI analytics sub — leverage GDA Command pipeline',
  'OT Agreement via AFMC Other Transaction Authority',
  'AAL Tactical Edge AI prototype directly addresses AFMC DevSecOps AI tooling gap. Mission tags overlap: AI/ML. Timing aligns — both in 6-12mo window.'
FROM fast_track_signals t, fast_track_signals r
WHERE t.source = 'Army Applications Lab' AND r.source = 'SAM.gov Industry Day'
ON CONFLICT DO NOTHING;
