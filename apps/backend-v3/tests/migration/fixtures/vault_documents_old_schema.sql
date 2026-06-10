-- Pre-v3_072 vault_documents + vault_audit_trail schema for migration testing.
-- Must be applied BEFORE v3_072 so the migration has something to transform.

-- Drop dependencies first
DROP TABLE IF EXISTS vault_audit_trail CASCADE;
DROP TABLE IF EXISTS vault_documents CASCADE;

CREATE TABLE vault_documents (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type = ANY (ARRAY[
    'contract', 'proposal', 'invoice', 'certificate',
    'teaming_agreement', 'rfp', 'past_performance', 'color_review',
    'bid_protest', 'market_research', 'other',
    'far', 'dfars', 'dfars_pgi', 'ndaa', 'executive_order', 'gao_decision',
    'dod_policy', 'cmmc', 'cui_policy', 'itar_ear', 'usd_policy', 'other_regulatory'
  ])),
  doc_category TEXT NOT NULL DEFAULT 'work_product',
  file_size_bytes BIGINT,
  file_path TEXT,
  extracted_text TEXT,
  ai_summary TEXT,
  ai_tags JSONB,
  ai_entities JSONB,
  linked_opportunity_id INTEGER,
  linked_capture_id INTEGER,
  linked_award_id INTEGER,
  regulatory_citation TEXT,
  uploaded_by TEXT NOT NULL DEFAULT 'admin',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE vault_audit_trail (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'admin',
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed test data covering all migration paths
INSERT INTO vault_documents (filename, doc_type, doc_category, uploaded_by) VALUES
  ('contract_2026.pdf', 'invoice', 'work_product', 'test:v3_072'),
  ('teaming_nda.pdf', 'teaming_agreement', 'work_product', 'test:v3_072'),
  ('far_52_212.pdf', 'far', 'regulatory', 'test:v3_072'),
  ('dfars_252.pdf', 'dfars', 'regulatory', 'test:v3_072'),
  ('cmmc_lvl2.pdf', 'cmmc', 'regulatory', 'test:v3_072'),
  ('ndaa_2026.pdf', 'ndaa', 'regulatory', 'test:v3_072'),
  ('exec_order_14028.pdf', 'executive_order', 'regulatory', 'test:v3_072'),
  ('gao_protest.pdf', 'gao_decision', 'regulatory', 'test:v3_072'),
  ('dod_memo.pdf', 'dod_policy', 'regulatory', 'test:v3_072'),
  ('cui_marking.pdf', 'cui_policy', 'regulatory', 'test:v3_072'),
  ('itar_guide.pdf', 'itar_ear', 'regulatory', 'test:v3_072'),
  ('usd_memo.pdf', 'usd_policy', 'regulatory', 'test:v3_072'),
  ('other_reg.pdf', 'other_regulatory', 'regulatory', 'test:v3_072'),
  ('invoice_q4.pdf', 'other', 'work_product', 'test:v3_072'),
  ('capability_statement_envision.pdf', 'other', 'work_product', 'test:v3_072'),
  ('email_from_co.pdf', 'other', 'work_product', 'test:v3_072'),
  ('resume_john.pdf', 'other', 'work_product', 'test:v3_072'),
  ('architecture_doc.pdf', 'other', 'work_product', 'test:v3_072'),
  ('sop_onboarding.pdf', 'other', 'work_product', 'test:v3_072'),
  ('random_file.pdf', 'other', 'work_product', 'test:v3_072');
