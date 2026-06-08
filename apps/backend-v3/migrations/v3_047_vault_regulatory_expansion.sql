-- F-619: Vault — regulatory library, smart ingest router, full-text search, in-browser reader

-- Expand doc_type constraint to include regulatory types
ALTER TABLE vault_documents
  DROP CONSTRAINT IF EXISTS vault_documents_doc_type_check;

ALTER TABLE vault_documents
  ADD CONSTRAINT vault_documents_doc_type_check
  CHECK (doc_type IN (
    -- Work product (uploaded by Envision)
    'contract','proposal','invoice','certificate','teaming_agreement','rfp',
    'past_performance','color_review','bid_protest','market_research','other',
    -- Regulatory library (pre-loaded, read-only)
    'far','dfars','dfars_pgi','ndaa','executive_order','gao_decision',
    'dod_policy','cmmc','cui_policy','itar_ear','usd_policy','other_regulatory'
  ));

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS doc_category TEXT NOT NULL DEFAULT 'work_product'
    CHECK (doc_category IN ('work_product', 'regulatory'));

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS is_system_doc BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS regulatory_citation TEXT;

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS effective_date DATE;

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS applicable_naics TEXT[];

ALTER TABLE vault_documents
  ADD COLUMN IF NOT EXISTS full_text_search TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(filename,'') || ' ' || coalesce(ai_summary,'') || ' ' || coalesce(extracted_text,'') || ' ' || coalesce(regulatory_citation,''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_vault_fts ON vault_documents USING GIN(full_text_search);
CREATE INDEX IF NOT EXISTS idx_vault_category ON vault_documents(doc_category);

-- Drop the old partial index and recreate with proper filter
DROP INDEX IF EXISTS idx_vault_deleted;
CREATE INDEX IF NOT EXISTS idx_vault_deleted_active ON vault_documents(deleted_at) WHERE deleted_at IS NULL;

-- Regulatory catalog: pre-loaded reference docs (metadata only)
CREATE TABLE IF NOT EXISTS vault_regulatory_catalog (
  id              SERIAL PRIMARY KEY,
  citation        TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('far','dfars','dfars_pgi','ndaa','executive_order','gao_decision','dod_policy','cmmc','cui_policy','itar_ear','other')),
  summary         TEXT,
  url             TEXT,
  effective_date  DATE,
  ndaa_year       INTEGER,
  eo_number       TEXT,
  gao_docket      TEXT,
  applies_to      TEXT[],
  key_clauses     JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_catalog_category ON vault_regulatory_catalog(category);
CREATE INDEX IF NOT EXISTS idx_reg_catalog_citation ON vault_regulatory_catalog(citation);

-- Seed regulatory catalog
INSERT INTO vault_regulatory_catalog (citation, title, category, summary, url, applies_to, key_clauses) VALUES
  -- FAR
  ('FAR Part 9', 'Contractor Qualifications', 'far',
   'Establishes standards for determining contractor responsibility, debarment and suspension rules, and organizational conflicts of interest.',
   'https://www.acquisition.gov/far/part-9',
   ARRAY['solicitations','contracts'],
   '[{"clause": "FAR 9.104", "topic": "Standards of responsibility"}, {"clause": "FAR 9.406", "topic": "Debarment"}]'::jsonb),

  ('FAR Part 12', 'Acquisition of Commercial Products and Services', 'far',
   'Policies and procedures for acquiring commercial products and commercial services, including streamlined solicitation procedures.',
   'https://www.acquisition.gov/far/part-12',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "FAR 12.207", "topic": "Contract type"}, {"clause": "FAR 12.301", "topic": "Solicitation provisions"}]'::jsonb),

  ('FAR Part 15', 'Contracting by Negotiation', 'far',
   'Governs competitive and sole-source negotiated acquisitions, including source selection procedures and evaluation factors.',
   'https://www.acquisition.gov/far/part-15',
   ARRAY['solicitations','proposals'],
   '[{"clause": "FAR 15.304", "topic": "Evaluation factors"}, {"clause": "FAR 15.306", "topic": "Exchanges with offerors"}]'::jsonb),

  ('FAR Part 16', 'Types of Contracts', 'far',
   'Describes contract types including fixed-price, cost-reimbursement, incentive, indefinite-delivery, and time-and-materials.',
   'https://www.acquisition.gov/far/part-16',
   ARRAY['solicitations','contracts'],
   '[{"clause": "FAR 16.504", "topic": "IDIQ contracts"}, {"clause": "FAR 16.601", "topic": "Time-and-materials"}]'::jsonb),

  ('FAR Part 19', 'Small Business Programs', 'far',
   'Implements small business contracting programs including 8(a), HUBZone, SDVOSB, WOSB set-asides and subcontracting plans.',
   'https://www.acquisition.gov/far/part-19',
   ARRAY['solicitations','proposals','small_business'],
   '[{"clause": "FAR 19.502", "topic": "Setting aside acquisitions"}, {"clause": "FAR 19.804", "topic": "8(a) program"}]'::jsonb),

  ('FAR Part 52', 'Solicitation Provisions and Contract Clauses', 'far',
   'Contains the text of all FAR provisions and clauses, organized by subject matter, with prescription cross-references.',
   'https://www.acquisition.gov/far/part-52',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "FAR 52.212-1", "topic": "Commercial items instructions"}, {"clause": "FAR 52.219-8", "topic": "Small business subcontracting"}]'::jsonb),

  -- DFARS
  ('DFARS 252.204-7012', 'Safeguarding Covered Defense Information', 'dfars',
   'Requires contractors to implement NIST SP 800-171 for CUI protection and report cyber incidents within 72 hours. Precursor to CMMC.',
   'https://www.acquisition.gov/dfars/252.204-7012',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "DFARS 252.204-7012(b)", "topic": "Adequate security"}, {"clause": "DFARS 252.204-7012(c)", "topic": "Cyber incident reporting"}]'::jsonb),

  ('DFARS 252.204-7019', 'NIST SP 800-171 DoD Assessment Requirements', 'dfars',
   'Requires offerors to have current NIST SP 800-171 DoD assessment posted in SPRS before contract award.',
   'https://www.acquisition.gov/dfars/252.204-7019',
   ARRAY['solicitations','proposals'],
   '[{"clause": "DFARS 252.204-7019(b)", "topic": "SPRS assessment requirement"}]'::jsonb),

  ('DFARS 252.204-7020', 'NIST SP 800-171 DoD Assessment Methodology', 'dfars',
   'Establishes assessment methodology levels (Basic, Medium, High) for contractor NIST SP 800-171 implementation.',
   'https://www.acquisition.gov/dfars/252.204-7020',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "DFARS 252.204-7020(b)", "topic": "Assessment levels"}]'::jsonb),

  ('DFARS 252.215-7008', 'Only One Offer', 'dfars',
   'Requires additional cost or pricing data when only one offer is received in competitive acquisitions.',
   'https://www.acquisition.gov/dfars/252.215-7008',
   ARRAY['solicitations','proposals'],
   '[{"clause": "DFARS 252.215-7008(b)", "topic": "Cost data requirement"}]'::jsonb),

  ('DFARS 252.225', 'Buy American and Trade Agreements', 'dfars',
   'Implements domestic preference requirements and trade agreement exceptions for defense acquisitions.',
   'https://www.acquisition.gov/dfars/subpart-252.2',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "DFARS 252.225-7001", "topic": "Buy American"}, {"clause": "DFARS 252.225-7021", "topic": "Trade Agreements"}]'::jsonb),

  ('DFARS 252.246', 'Quality Assurance', 'dfars',
   'Establishes quality assurance requirements for defense contracts, including inspection, acceptance, and warranty provisions.',
   'https://www.acquisition.gov/dfars/subpart-252.2',
   ARRAY['contracts'],
   '[{"clause": "DFARS 252.246-7001", "topic": "Warranty of data"}, {"clause": "DFARS 252.246-7007", "topic": "Contractor counterfeit electronic part"}]'::jsonb),

  -- NDAA
  ('NDAA FY2024 Section 811', 'Domestic Production Requirements', 'ndaa',
   'Strengthens domestic production requirements for critical defense components and supply chain resilience mandates.',
   'https://www.congress.gov/bill/118th-congress/house-bill/2670',
   ARRAY['contracts','solicitations'],
   '[{"clause": "Section 811", "topic": "Domestic production"}]'::jsonb),

  ('NDAA FY2024 Section 828', 'Commercial Software Acquisition', 'ndaa',
   'Streamlines acquisition of commercial software for defense, with emphasis on rapid deployment and agile procurement.',
   'https://www.congress.gov/bill/118th-congress/house-bill/2670',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "Section 828", "topic": "Commercial software"}]'::jsonb),

  ('NDAA FY2025', 'Defense IT and Cybersecurity Provisions', 'ndaa',
   'Contains provisions on defense IT modernization, zero trust architecture requirements, and AI governance for DoD systems.',
   'https://www.congress.gov/bill/118th-congress/senate-bill/4638',
   ARRAY['solicitations','proposals','contracts'],
   NULL),

  -- Executive Orders
  ('EO 13960', 'Promoting the Use of Trustworthy AI in the Federal Government', 'executive_order',
   'Establishes principles for federal AI use: lawful, purposeful, accurate, safe, understandable, responsible, monitored, transparent, accountable.',
   'https://www.federalregister.gov/documents/2020/12/08/2020-27065',
   ARRAY['contracts','proposals'],
   NULL),

  ('EO 14028', 'Improving the Nations Cybersecurity', 'executive_order',
   'Mandates zero trust architecture, software supply chain security (SBOM), enhanced logging, and incident response for federal systems.',
   'https://www.federalregister.gov/documents/2021/05/17/2021-10460',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "Section 4", "topic": "Software supply chain security"}, {"clause": "Section 3", "topic": "Modernizing federal cybersecurity"}]'::jsonb),

  ('EO 14110', 'Safe, Secure, and Trustworthy AI', 'executive_order',
   'Establishes standards for AI safety, security testing, equity, privacy, and government AI use with reporting and compliance requirements.',
   'https://www.federalregister.gov/documents/2023/11/01/2023-24283',
   ARRAY['contracts','proposals'],
   '[{"clause": "Section 4", "topic": "AI safety and security"}, {"clause": "Section 10", "topic": "Government AI use"}]'::jsonb),

  -- GAO Decisions
  ('Matter of Peraton Inc.', 'LPTA Evaluation Precedent', 'gao_decision',
   'Key GAO protest decision establishing standards for Lowest Price Technically Acceptable evaluations — agencies must clearly define acceptability thresholds.',
   'https://www.gao.gov/products/b-417373',
   ARRAY['solicitations','proposals'],
   '[{"clause": "B-417373", "topic": "LPTA evaluation standards"}]'::jsonb),

  ('Matter of IBM', 'Technical Evaluation Precedent', 'gao_decision',
   'Landmark GAO decision on technical evaluation consistency — agencies must evaluate proposals against stated criteria, not unstated requirements.',
   'https://www.gao.gov/products/b-415798',
   ARRAY['solicitations','proposals'],
   '[{"clause": "B-415798", "topic": "Evaluation consistency"}]'::jsonb),

  ('GAO Protest Grounds — Unequal Evaluation', 'Unequal Treatment in Evaluation', 'gao_decision',
   'Body of GAO decisions establishing that agencies must evaluate offerors equally and apply the same standards to all proposals.',
   'https://www.gao.gov/legal/bid-protests',
   ARRAY['solicitations','proposals'],
   '[{"clause": "Unequal evaluation", "topic": "Equal treatment requirement"}, {"clause": "Misleading discussions", "topic": "Meaningful discussions"}, {"clause": "Price realism", "topic": "Flawed price analysis"}]'::jsonb),

  -- DoD Policy
  ('DoD Instruction 5000.02', 'Adaptive Acquisition Framework', 'dod_policy',
   'Establishes the six acquisition pathways: Urgent, Middle Tier, Major Capability, Software, Defense Business Systems, and Acquisition of Services.',
   'https://www.esd.whs.mil/Portals/54/Documents/DD/issuances/dodi/500002p.pdf',
   ARRAY['solicitations','contracts'],
   '[{"clause": "Enclosure 1", "topic": "Acquisition pathways"}, {"clause": "Enclosure 7", "topic": "Software acquisition"}]'::jsonb),

  ('USD(A&S) Cybersecurity Maturity Model', 'Contractor Cybersecurity Assessment', 'dod_policy',
   'Policy memos from the Under Secretary of Defense for Acquisition and Sustainment on contractor cybersecurity posture requirements.',
   'https://www.acq.osd.mil/cmmc/',
   ARRAY['solicitations','proposals','contracts'],
   NULL),

  -- CMMC
  ('CMMC 2.0 Final Rule', 'Cybersecurity Maturity Model Certification', 'cmmc',
   'Three-level cybersecurity certification model: Level 1 (basic safeguarding), Level 2 (NIST 800-171), Level 3 (enhanced). Required for CUI-handling contractors.',
   'https://www.acq.osd.mil/cmmc/',
   ARRAY['solicitations','proposals','contracts'],
   '[{"clause": "Level 1", "topic": "Federal Contract Information"}, {"clause": "Level 2", "topic": "Controlled Unclassified Information"}, {"clause": "Level 3", "topic": "Enhanced security for critical programs"}]'::jsonb)

ON CONFLICT (citation) DO NOTHING;
