-- F-613: Fast Track — industry pipeline side + match drill-in analysis cache

-- 1. Add pipeline_side + institution columns to fast_track_signals
ALTER TABLE fast_track_signals
  ADD COLUMN IF NOT EXISTS pipeline_side TEXT NOT NULL DEFAULT 'government'
    CHECK (pipeline_side IN ('government', 'industry')),
  ADD COLUMN IF NOT EXISTS institution_type TEXT,
  ADD COLUMN IF NOT EXISTS doi TEXT,
  ADD COLUMN IF NOT EXISTS institution_name TEXT;

CREATE INDEX IF NOT EXISTS idx_fts_pipeline_side ON fast_track_signals (pipeline_side);

-- 2. Match card drill-in analysis cache
CREATE TABLE IF NOT EXISTS fast_track_match_analysis (
  id                  SERIAL PRIMARY KEY,
  match_id            INTEGER NOT NULL UNIQUE REFERENCES fast_track_matches(id) ON DELETE CASCADE,
  broker_role         TEXT,
  gap_analysis        TEXT,
  recommended_actions JSONB,
  risk_flags          JSONB,
  envision_fit        TEXT,
  ai_narrative        TEXT,
  model_used          TEXT,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ftma_match ON fast_track_match_analysis (match_id);

-- 3. Seed illustrative industry signals
INSERT INTO fast_track_signals
  (pipeline, source, title, summary, mission_tags, problem_tags, maturity, urgency, horizon, signal_strength, transition_tags, source_url, published_at, next_review_action, pipeline_side, institution_type, institution_name, doi)
VALUES
  ('tech','MIT Lincoln Laboratory','mmWave Mesh Networking for Contested Environments',
   'Lincoln Lab demonstrated a self-healing millimeter-wave mesh architecture sustaining 10 Gbps aggregate throughput under heavy jamming.',
   ARRAY['C5ISR','networking'],ARRAY['comms resilience','contested spectrum'],
   'prototype','high','6-12mo',4,ARRAY['CRADA','direct'],
   'https://doi.org/10.1109/TMTT.2026.1234567','2026-05-01','Engage Lincoln Lab POC for teaming on DARPA PDTN.',
   'industry','ffrdc','MIT Lincoln Laboratory','10.1109/TMTT.2026.1234567'),

  ('tech','Carnegie Mellon SEI','Zero-Trust Orchestration for Tactical Edge',
   'SEI published reference architecture for zero-trust micro-segmentation deployable on SWAP-C constrained tactical nodes.',
   ARRAY['cyber','edge computing'],ARRAY['zero trust','SWaP-C'],
   'concept','medium','12-24mo',3,ARRAY['SBIR/STTR','partner vehicle'],
   'https://doi.org/10.1145/3600000.3600001','2026-04-15','Monitor for Phase I SBIR alignment. Strong Envision digital transformation fit.',
   'industry','ffrdc','Carnegie Mellon SEI','10.1145/3600000.3600001'),

  ('tech','Georgia Tech GTRI','Autonomous ISR Sensor Fusion Platform',
   'GTRI demonstrated multi-modal sensor fusion (EO/IR + SIGINT + ELINT) on a single SBC achieving 95% target classification accuracy.',
   ARRAY['ISR','AI/ML','autonomous systems'],ARRAY['sensor fusion','target classification'],
   'prototype','high','0-6mo',5,ARRAY['OT','CRADA'],
   NULL,'2026-05-20','High fit — schedule GTRI demo. Potential teaming for NavalX ISR opportunity.',
   'industry','academia','Georgia Tech GTRI',NULL),

  ('requirement','RAND Corporation','AI Readiness Assessment Framework for DoD Acquisitions',
   'RAND report recommends AI readiness scoring for all DoD IT acquisitions over $10M, with mandatory TRL gate reviews.',
   ARRAY['AI/ML','acquisition reform'],ARRAY['AI readiness','TRL gates'],
   NULL,'medium','6-12mo',3,ARRAY['direct'],
   'https://doi.org/10.7249/RRA2000-1','2026-03-10','Align GDA Command AI scoring with RAND framework recommendations.',
   'industry','ffrdc','RAND Corporation','10.7249/RRA2000-1'),

  ('tech','AFWERX Innovation Hub','Predictive Logistics for Expeditionary Ops',
   'AFWERX Spark Cell selected three startups for Phase II predictive logistics trials using commercial IoT + ML pipelines.',
   ARRAY['logistics','AI/ML'],ARRAY['predictive maintenance','expeditionary'],
   'pilot','high','0-6mo',4,ARRAY['SBIR/STTR','CSO'],
   'https://afwerx.com/spark-logistics','2026-05-15','Evaluate teaming with Phase II selectees. Envision data pipeline integration angle.',
   'industry','innovation_factory','AFWERX Innovation Hub',NULL)
ON CONFLICT DO NOTHING;
