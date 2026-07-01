-- F-312: Partner Profiles — Riverstone + PD Systems Read-Only Teaming Context
-- Maintains read-only partner profiles for OU1 (PD Systems) and OU2 (Riverstone).
-- Profiles surface as teaming context inside Envision opportunity/capture pages.
-- No financial detail. No pricing. No profit history.

CREATE TABLE IF NOT EXISTS partner_profiles (
  ou                       TEXT PRIMARY KEY CHECK (ou IN ('riverstone','pd_systems')),
  name                     TEXT NOT NULL,
  owner                    UUID NOT NULL,
  overview                 TEXT NOT NULL,
  agencies_of_strength     TEXT[] NOT NULL DEFAULT '{}',
  naics_codes              TEXT[] NOT NULL DEFAULT '{}',
  capabilities_summary     JSONB NOT NULL DEFAULT '[]',
  past_performance_summary JSONB NOT NULL DEFAULT '[]',
  key_personnel            JSONB NOT NULL DEFAULT '[]',
  certifications           TEXT[] NOT NULL DEFAULT '{}',
  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  last_reviewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Riverstone profile (OU2 — Derrick Elliot)
INSERT INTO partner_profiles (ou, name, owner, overview, agencies_of_strength, naics_codes, capabilities_summary, past_performance_summary, key_personnel, certifications, last_reviewed_at)
VALUES (
  'riverstone',
  'Riverstone Solutions',
  '00000000-0000-0000-0000-000000000002',
  'IC-focused cyber and TechSIGINT provider. HUBZone certified small business with MDA SHIELD prime contract. Core strengths in classified DevSecOps, SecurScale platform, and intelligence community operations.',
  ARRAY['MDA', 'NSA', 'NRO', 'DIA'],
  ARRAY['541512', '541511', '541519', '541330'],
  '[
    {"area": "TechSIGINT", "detail": "Signals intelligence collection and processing systems", "evidence_doc_id": null},
    {"area": "Cyber Operations", "detail": "Offensive and defensive cyber capabilities for IC customers", "evidence_doc_id": null},
    {"area": "Classified DevSecOps", "detail": "CI/CD pipelines in classified environments (TS/SCI+)", "evidence_doc_id": null},
    {"area": "SecurScale Platform", "detail": "Proprietary secure cloud scaling platform for IC workloads", "evidence_doc_id": null}
  ]'::jsonb,
  '[
    {"agency": "MDA", "contract_id": "HQ085926DF469", "value": null, "period": "2025-present", "evidence_doc_id": null},
    {"agency": "NSA", "contract_id": null, "value": null, "period": "2022-present", "evidence_doc_id": null}
  ]'::jsonb,
  '[
    {"name": "Angela (OU2 POC)", "clearance": "TS/SCI", "certifications": ["PMP", "CISSP"]}
  ]'::jsonb,
  ARRAY['HUBZone', 'WOSB', 'SDB', 'CMMC Level 2'],
  NOW()
)
ON CONFLICT (ou) DO NOTHING;

-- Seed PD Systems profile (OU1 — Tom Rogers)
INSERT INTO partner_profiles (ou, name, owner, overview, agencies_of_strength, naics_codes, capabilities_summary, past_performance_summary, key_personnel, certifications, last_reviewed_at)
VALUES (
  'pd_systems',
  'PD Systems',
  '00000000-0000-0000-0000-000000000001',
  'Training-focused integrator with 300+ headcount. V3 Veteran certified. Specializes in XR/AR/VR immersive training, digital twin platforms, and LVC integration for DoD training commands.',
  ARRAY['TRADOC', 'PEO STRI', 'DLA', 'USSOCOM'],
  ARRAY['611430', '541512', '541330', '334511'],
  '[
    {"area": "XR/AR/VR Training", "detail": "Immersive training systems using extended reality technologies", "evidence_doc_id": null},
    {"area": "Digital Twin Platforms", "detail": "Real-time digital twin simulation for equipment and facilities", "evidence_doc_id": null},
    {"area": "LVC Integration", "detail": "Live, Virtual, Constructive training environment integration", "evidence_doc_id": null},
    {"area": "Simulation Engineering", "detail": "Custom simulation development for military training programs", "evidence_doc_id": null}
  ]'::jsonb,
  '[
    {"agency": "TRADOC", "contract_id": null, "value": null, "period": "2021-present", "evidence_doc_id": null},
    {"agency": "PEO STRI", "contract_id": null, "value": null, "period": "2023-present", "evidence_doc_id": null}
  ]'::jsonb,
  '[
    {"name": "Tom Rogers (OU1 Lead)", "clearance": "Secret", "certifications": ["PMP"]}
  ]'::jsonb,
  ARRAY['V3 Veteran', 'SDB', 'ISO 9001'],
  NOW()
)
ON CONFLICT (ou) DO NOTHING;
