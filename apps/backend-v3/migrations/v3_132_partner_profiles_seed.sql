-- F-312: Seed partner profiles for Riverstone + PD Systems
INSERT INTO partner_profiles (ou, name, owner, overview, agencies_of_strength, naics_codes, capabilities_summary, past_performance_summary, key_personnel, certifications, last_reviewed_at)
VALUES
  (
    'riverstone',
    'Riverstone Solutions',
    '00000000-0000-0000-0000-000000000002',
    'IC-focused cyber and TechSIGINT provider. HUBZone certified — unlocks set-aside bids for Envision teaming. MDA SHIELD prime contract holder with classified DevSecOps capability.',
    ARRAY['NSA', 'MDA', 'DIA', 'NRO'],
    ARRAY['541512', '541511', '541519', '518210'],
    '[
      {"area": "TechSIGINT", "description": "Technical signals intelligence collection and processing"},
      {"area": "Cyber Operations", "description": "Offensive and defensive cyber operations"},
      {"area": "Classified DevSecOps", "description": "CI/CD pipelines for classified environments"},
      {"area": "SecurScale Platform", "description": "Proprietary secure cloud scaling solution"}
    ]'::jsonb,
    '[
      {"agency": "MDA", "contract_id": "HQ085926DF469", "value": "SHIELD IDIQ", "period": "2022-2027", "evidence_doc_id": null},
      {"agency": "NSA", "contract_id": "Classified", "value": "Cyber support", "period": "2021-2026", "evidence_doc_id": null}
    ]'::jsonb,
    '[
      {"name": "Angela (CEO)", "clearance": "TS/SCI w/ Poly", "certifications": ["PMP", "CISSP"]},
      {"name": "Derrick Elliot (OU2 Lead)", "clearance": "TS/SCI", "certifications": ["CISM"]}
    ]'::jsonb,
    ARRAY['HUBZone', 'WOSB', 'SDB', 'CMMC Level 2', 'ISO 27001'],
    NOW()
  ),
  (
    'pd_systems',
    'PD Systems',
    '00000000-0000-0000-0000-000000000003',
    'Training-focused integrator with 300+ headcount. V3 Veteran certified — strengthens bids requiring veteran preference. XR/AR/VR depth fills immersive training gaps for DoD customers.',
    ARRAY['Army', 'SOCOM', 'DLA', 'TRADOC'],
    ARRAY['611430', '541512', '541330', '611710'],
    '[
      {"area": "XR/AR/VR Training", "description": "Immersive extended reality training solutions"},
      {"area": "Digital Twin Platforms", "description": "High-fidelity digital twin simulation environments"},
      {"area": "LVC Integration", "description": "Live, Virtual, Constructive training integration"},
      {"area": "Simulation Engineering", "description": "Custom simulation development for military readiness"}
    ]'::jsonb,
    '[
      {"agency": "Army", "contract_id": "W900KK-21-D-0042", "value": "Training systems support", "period": "2021-2026", "evidence_doc_id": null},
      {"agency": "SOCOM", "contract_id": "H92222-20-D-0010", "value": "SOF training simulation", "period": "2020-2025", "evidence_doc_id": null}
    ]'::jsonb,
    '[
      {"name": "Tom Rogers (OU1 Lead)", "clearance": "Secret", "certifications": ["PMP"]},
      {"name": "Lead Engineer", "clearance": "Secret", "certifications": ["AWS Solutions Architect"]}
    ]'::jsonb,
    ARRAY['V3 Veteran', 'SDB', 'ISO 9001', 'CMMI ML3'],
    NOW()
  )
ON CONFLICT (ou) DO NOTHING;
