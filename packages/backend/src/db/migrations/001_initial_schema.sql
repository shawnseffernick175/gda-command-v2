-- GDA Command v2 — Initial Schema
-- All tables derived from shared TypeScript types

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Auth & Users
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT, -- null for OAuth-only users
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'bd_manager', 'capture_lead', 'analyst', 'viewer')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================================================
-- Core — Opportunities
-- ============================================================================

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  agency TEXT,
  department TEXT,
  status TEXT NOT NULL DEFAULT 'discovery'
    CHECK (status IN ('discovery', 'qualified', 'pipeline', 'won', 'lost')),
  score NUMERIC NOT NULL DEFAULT 0,
  value_estimated NUMERIC,
  probability_of_win NUMERIC,
  naics TEXT,
  psc TEXT,
  due_date TIMESTAMPTZ,
  solicitation_number TEXT,
  set_aside TEXT,
  place_of_performance TEXT,
  incumbent TEXT,
  qualified_at TIMESTAMPTZ,
  qualified_by TEXT,
  tags TEXT[] DEFAULT '{}',
  raw_source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opps_status ON opportunities(status);
CREATE INDEX idx_opps_agency ON opportunities(agency);
CREATE INDEX idx_opps_score ON opportunities(score DESC);
CREATE INDEX idx_opps_due_date ON opportunities(due_date);

-- ============================================================================
-- Capture Planning
-- ============================================================================

CREATE TABLE capture_plans (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES opportunities(id),
  opportunity_title TEXT NOT NULL,
  agency TEXT,
  phase TEXT NOT NULL DEFAULT 'pre_rfp'
    CHECK (phase IN ('pre_rfp', 'rfp_released', 'proposal_prep', 'submitted', 'evaluation', 'awarded')),
  pwin NUMERIC NOT NULL DEFAULT 0,
  value_estimated NUMERIC,
  capture_manager TEXT,
  bid_decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (bid_decision IN ('bid', 'no_bid', 'pending')),
  teaming_partners JSONB DEFAULT '[]',
  milestones JSONB DEFAULT '[]',
  gate_reviews JSONB DEFAULT '[]',
  win_themes TEXT[] DEFAULT '{}',
  discriminators TEXT[] DEFAULT '{}',
  risks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_capture_opp ON capture_plans(opportunity_id);
CREATE INDEX idx_capture_phase ON capture_plans(phase);

CREATE TABLE capture_activities (
  id TEXT PRIMARY KEY,
  capture_plan_id TEXT REFERENCES capture_plans(id) ON DELETE CASCADE,
  opportunity_title TEXT,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('meeting', 'call', 'email', 'site_visit', 'research', 'gate_review', 'teaming_discussion', 'proposal_work')),
  description TEXT NOT NULL,
  performed_by TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome TEXT
);

CREATE INDEX idx_capture_act_plan ON capture_activities(capture_plan_id);

-- ============================================================================
-- Doctrine Automation
-- ============================================================================

CREATE TABLE doctrine_drafts (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL,
  component TEXT NOT NULL,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('book_of_truths', 'sprint_notes', 'decision_log', 'master_build_note')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'superseded', 'blocked')),
  source_pr_number INT,
  source_pr_url TEXT,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE doctrine_publish_runs (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('pr-merge', 'finalize', 'manual')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'blocked', 'failed')),
  gate_results JSONB,
  commit_sha TEXT,
  reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- Intel Hub
-- ============================================================================

CREATE TABLE intel_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('competitive', 'market', 'threat', 'opportunity', 'regulatory', 'technology')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('n8n_crawl', 'manual', 'sam_gov', 'fpds', 'news', 'research')),
  source_url TEXT,
  related_opportunity_id TEXT,
  related_competitor TEXT,
  tags TEXT[] DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_intel_category ON intel_items(category);
CREATE INDEX idx_intel_priority ON intel_items(priority);

CREATE TABLE morning_briefings (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  headline TEXT NOT NULL,
  key_metrics JSONB DEFAULT '[]',
  alerts JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  market_snapshot TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deep_research_reports (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'completed', 'failed')),
  summary TEXT,
  findings TEXT,
  sources_count INT NOT NULL DEFAULT 0,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  requested_by TEXT
);

CREATE TABLE competitor_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  threat_score NUMERIC NOT NULL DEFAULT 0,
  contracts_won INT NOT NULL DEFAULT 0,
  contracts_value NUMERIC NOT NULL DEFAULT 0,
  primary_naics TEXT[] DEFAULT '{}',
  strengths TEXT[] DEFAULT '{}',
  weaknesses TEXT[] DEFAULT '{}',
  recent_wins TEXT[] DEFAULT '{}',
  watch_status TEXT NOT NULL DEFAULT 'active'
    CHECK (watch_status IN ('active', 'monitoring', 'inactive')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Approvals Queue
-- ============================================================================

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('qualify_write', 'bid_decision', 'doctrine_publish', 'gate_review', 'teaming_agreement', 'deploy', 'budget_override')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requester TEXT NOT NULL,
  assignee TEXT NOT NULL,
  correlation_id TEXT,
  related_entity_id TEXT,
  related_entity_type TEXT,
  dry_run_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT
);

CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_assignee ON approvals(assignee);

-- ============================================================================
-- Compliance Matrix
-- ============================================================================

CREATE TABLE compliance_requirements (
  id TEXT PRIMARY KEY,
  solicitation_id TEXT NOT NULL,
  solicitation_title TEXT NOT NULL,
  section TEXT NOT NULL,
  requirement TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('technical', 'management', 'past_performance', 'cost_price', 'certifications', 'security', 'small_business', 'other')),
  status TEXT NOT NULL DEFAULT 'gap'
    CHECK (status IN ('compliant', 'partial', 'gap', 'not_applicable')),
  evidence TEXT,
  responsible_party TEXT NOT NULL,
  notes TEXT,
  related_clause_ids TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clause_references (
  id TEXT PRIMARY KEY,
  clause_number TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('far', 'dfars', 'agency', 'custom')),
  full_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  applicability TEXT[] DEFAULT '{}',
  common_pitfalls TEXT[] DEFAULT '{}',
  related_clauses TEXT[] DEFAULT '{}',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Proposal Review
-- ============================================================================

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  solicitation_id TEXT,
  solicitation_title TEXT,
  agency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'red_team', 'final', 'submitted', 'archived')),
  value_estimated NUMERIC,
  due_date TIMESTAMPTZ,
  submission_date TIMESTAMPTZ,
  capture_manager TEXT,
  proposal_manager TEXT,
  volumes JSONB DEFAULT '[]',
  red_team_findings JSONB DEFAULT '[]',
  scorecard JSONB DEFAULT '[]',
  timeline JSONB DEFAULT '[]',
  compliance_score NUMERIC NOT NULL DEFAULT 0,
  overall_score NUMERIC NOT NULL DEFAULT 0,
  win_themes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposals_status ON proposals(status);

-- ============================================================================
-- Contacts & Relationships
-- ============================================================================

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  agency TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'prospect')),
  relationship_strength TEXT NOT NULL DEFAULT 'new'
    CHECK (relationship_strength IN ('strong', 'moderate', 'weak', 'new')),
  last_contact_date TIMESTAMPTZ,
  relationship_history TEXT,
  meeting_notes JSONB DEFAULT '[]',
  relationships JSONB DEFAULT '[]',
  linked_opportunities JSONB DEFAULT '[]',
  teaming_records JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_agency ON contacts(agency);
CREATE INDEX idx_contacts_status ON contacts(status);

-- ============================================================================
-- Reporting & Export
-- ============================================================================

CREATE TABLE report_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('pipeline', 'bd_performance', 'executive_summary', 'sitrep', 'financial', 'compliance')),
  description TEXT,
  sections JSONB DEFAULT '[]',
  default_format TEXT NOT NULL DEFAULT 'pdf'
    CHECK (default_format IN ('pdf', 'excel', 'pptx', 'csv')),
  available_formats TEXT[] DEFAULT '{pdf}',
  estimated_pages INT,
  last_used TIMESTAMPTZ,
  use_count INT NOT NULL DEFAULT 0,
  created_by TEXT,
  tags TEXT[] DEFAULT '{}'
);

CREATE TABLE generated_reports (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES report_templates(id),
  template_name TEXT,
  category TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('completed', 'generating', 'scheduled', 'failed')),
  format TEXT NOT NULL DEFAULT 'pdf',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT,
  file_size_bytes INT,
  page_count INT,
  sections_included TEXT[] DEFAULT '{}',
  parameters JSONB DEFAULT '{}',
  download_url TEXT,
  expires_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE scheduled_reports (
  id TEXT PRIMARY KEY,
  template_id TEXT REFERENCES report_templates(id),
  template_name TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
  next_run TIMESTAMPTZ NOT NULL,
  last_run TIMESTAMPTZ,
  recipients TEXT[] DEFAULT '{}',
  format TEXT NOT NULL DEFAULT 'pdf',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT
);

CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  source_page TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  file_size_bytes INT,
  download_url TEXT,
  row_count INT,
  correlation_id TEXT
);

-- ============================================================================
-- Financials
-- ============================================================================

CREATE TABLE financial_kpis (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  value NUMERIC NOT NULL,
  target NUMERIC,
  unit TEXT, -- '$', '%', 'ratio', etc.
  period TEXT, -- 'FY25', 'Q2 FY25', etc.
  trend TEXT CHECK (trend IN ('up', 'down', 'flat')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Prompt Architect
-- ============================================================================

CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  template TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INT NOT NULL DEFAULT 0,
  last_used TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Fast Track (Phase: upstream discovery)
-- ============================================================================

CREATE TABLE fast_track_matches (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  signal_title TEXT NOT NULL,
  signal_source TEXT,
  signal_date TIMESTAMPTZ,
  company_name TEXT,
  company_role TEXT,
  technology_tags TEXT[] DEFAULT '{}',
  contract_path TEXT,
  score NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'watching', 'promoted', 'discarded')),
  executive_summary TEXT,
  risks_and_gaps TEXT[] DEFAULT '{}',
  recommended_action TEXT,
  ooda JSONB,
  sources JSONB DEFAULT '[]',
  needs_attention BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fast_track_status ON fast_track_matches(status);

-- ============================================================================
-- Knowledge Base (Phase F — RAG)
-- ============================================================================

CREATE TABLE knowledge_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  document_count INT NOT NULL DEFAULT 0,
  total_chunks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES knowledge_collections(id),
  title TEXT NOT NULL,
  doc_type TEXT, -- 'proposal', 'past_performance', 'compliance', etc.
  file_name TEXT,
  file_size_bytes INT,
  page_count INT,
  chunk_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('indexed', 'processing', 'failed', 'pending')),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_docs_collection ON knowledge_documents(collection_id);
CREATE INDEX idx_knowledge_docs_status ON knowledge_documents(status);

CREATE TABLE knowledge_chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  messages JSONB DEFAULT '[]',
  sources JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- RFP Shredder (Phase G)
-- ============================================================================

CREATE TABLE shred_jobs (
  id TEXT PRIMARY KEY,
  solicitation_id TEXT,
  solicitation_title TEXT NOT NULL,
  agency TEXT,
  file_name TEXT,
  file_size_bytes INT,
  page_count INT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('completed', 'processing', 'failed', 'queued')),
  requirements_found INT NOT NULL DEFAULT 0,
  sections_parsed TEXT[] DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  processing_time_seconds NUMERIC,
  correlation_id TEXT,
  error_message TEXT
);

CREATE TABLE extracted_requirements (
  id TEXT PRIMARY KEY,
  shred_job_id TEXT REFERENCES shred_jobs(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  requirement_text TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  complexity TEXT NOT NULL DEFAULT 'moderate'
    CHECK (complexity IN ('simple', 'moderate', 'complex')),
  keyword TEXT,
  far_references TEXT[] DEFAULT '{}',
  compliance_match TEXT DEFAULT 'none'
    CHECK (compliance_match IN ('full', 'partial', 'none')),
  matched_evidence TEXT,
  matched_document_id TEXT,
  matched_document_title TEXT,
  page_number INT,
  confidence NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX idx_extracted_reqs_job ON extracted_requirements(shred_job_id);

-- ============================================================================
-- Predictive Analytics (Phase I)
-- ============================================================================

CREATE TABLE pwin_models (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  opp_id TEXT NOT NULL,
  opp_title TEXT NOT NULL,
  agency TEXT,
  ml_pwin NUMERIC NOT NULL DEFAULT 0,
  static_pwin NUMERIC NOT NULL DEFAULT 0,
  confidence_interval JSONB DEFAULT '{"lower": 0, "upper": 0}',
  confidence_level TEXT DEFAULT 'medium'
    CHECK (confidence_level IN ('high', 'medium', 'low')),
  model_version TEXT,
  features JSONB DEFAULT '[]',
  improvement_actions JSONB DEFAULT '[]',
  similar_opps_won INT DEFAULT 0,
  similar_opps_lost INT DEFAULT 0,
  trend TEXT DEFAULT 'stable'
    CHECK (trend IN ('improving', 'stable', 'declining')),
  trend_delta NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pipeline_forecasts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  summary JSONB NOT NULL,
  monthly JSONB DEFAULT '[]',
  scenarios JSONB DEFAULT '[]',
  risk_factors JSONB DEFAULT '[]',
  top_contributors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bid_assessments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  opp_id TEXT NOT NULL,
  opp_title TEXT NOT NULL,
  agency TEXT,
  value NUMERIC,
  recommendation TEXT NOT NULL DEFAULT 'watch'
    CHECK (recommendation IN ('bid', 'no_bid', 'watch')),
  overall_score NUMERIC NOT NULL DEFAULT 0,
  factors JSONB DEFAULT '[]',
  rationale TEXT,
  resource_impact TEXT,
  strategic_alignment TEXT DEFAULT 'medium'
    CHECK (strategic_alignment IN ('high', 'medium', 'low')),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE win_loss_analyses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  summary JSONB NOT NULL,
  patterns JSONB DEFAULT '[]',
  agency_performance JSONB DEFAULT '[]',
  pwin_calibration JSONB DEFAULT '[]',
  quarterly_trends JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Color Review (Phase H)
-- ============================================================================

CREATE TABLE color_reviews (
  id TEXT PRIMARY KEY,
  proposal_id TEXT,
  proposal_title TEXT NOT NULL,
  agency TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('white', 'pink', 'green', 'red', 'gold', 'blue', 'black_hat', 'white_glove')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  overall_score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 100,
  pass_rate NUMERIC NOT NULL DEFAULT 0,
  total_checks INT NOT NULL DEFAULT 0,
  passed_checks INT NOT NULL DEFAULT 0,
  failed_checks INT NOT NULL DEFAULT 0,
  warning_checks INT NOT NULL DEFAULT 0,
  reviewer TEXT,
  summary TEXT,
  go_no_go TEXT CHECK (go_no_go IN ('go', 'conditional_go', 'no_go')),
  confidence NUMERIC,
  requirement_checks JSONB DEFAULT '[]',
  section_scores JSONB DEFAULT '[]',
  gold_checks JSONB DEFAULT '[]',
  cost_line_items JSONB DEFAULT '[]',
  green_checks JSONB DEFAULT '[]',
  format_checks JSONB DEFAULT '[]',
  risk_factors TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_color_reviews_phase ON color_reviews(phase);
CREATE INDEX idx_color_reviews_status ON color_reviews(status);

-- ============================================================================
-- Anomaly Detection (Phase J)
-- ============================================================================

CREATE TABLE anomalies (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
  title TEXT NOT NULL,
  description TEXT,
  opportunity_id TEXT,
  opportunity_title TEXT,
  agency TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  metric_name TEXT,
  metric_value NUMERIC,
  baseline_value NUMERIC,
  deviation_pct NUMERIC,
  trend JSONB DEFAULT '[]',
  root_cause TEXT,
  recommended_actions TEXT[] DEFAULT '{}',
  related_anomaly_ids TEXT[] DEFAULT '{}',
  source_workflow TEXT
);

CREATE INDEX idx_anomalies_severity ON anomalies(severity);
CREATE INDEX idx_anomalies_status ON anomalies(status);

CREATE TABLE competitor_movements (
  id TEXT PRIMARY KEY,
  competitor_name TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  impact_assessment TEXT,
  threat_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (threat_level IN ('critical', 'high', 'medium', 'low')),
  affected_opportunities TEXT[] DEFAULT '{}',
  source TEXT,
  source_url TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE escalation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  condition TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'info'
    CHECK (priority IN ('critical', 'warning', 'info'))
);

CREATE TABLE escalations (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES escalation_rules(id),
  rule_name TEXT,
  priority TEXT NOT NULL DEFAULT 'info'
    CHECK (priority IN ('critical', 'warning', 'info')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'overdue')),
  title TEXT NOT NULL,
  description TEXT,
  opportunity_id TEXT,
  opportunity_title TEXT,
  agency TEXT,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  assigned_to TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  days_overdue INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_escalations_status ON escalations(status);

-- ============================================================================
-- SAM.gov Monitor (Phase K)
-- ============================================================================

CREATE TABLE sam_opportunities (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  agency TEXT NOT NULL,
  sub_agency TEXT,
  type TEXT NOT NULL,
  set_aside TEXT,
  naics TEXT,
  naics_description TEXT,
  psc TEXT,
  value_estimate NUMERIC,
  response_deadline TIMESTAMPTZ,
  posted_date TIMESTAMPTZ,
  place_of_performance TEXT,
  relevance_score NUMERIC NOT NULL DEFAULT 0,
  relevance_reasons TEXT[] DEFAULT '{}',
  ai_summary TEXT,
  scan_status TEXT NOT NULL DEFAULT 'new'
    CHECK (scan_status IN ('new', 'tracked', 'qualified', 'dismissed')),
  matched_naics BOOLEAN NOT NULL DEFAULT false,
  matched_keywords TEXT[] DEFAULT '{}',
  sam_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sam_opps_status ON sam_opportunities(scan_status);
CREATE INDEX idx_sam_opps_agency ON sam_opportunities(agency);

CREATE TABLE sam_scan_runs (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  opportunities_found INT NOT NULL DEFAULT 0,
  new_matches INT NOT NULL DEFAULT 0,
  naics_codes_scanned TEXT[] DEFAULT '{}',
  error TEXT
);

-- ============================================================================
-- Discussions (Phase K)
-- ============================================================================

CREATE TABLE discussion_threads (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('opportunity', 'capture_plan', 'proposal', 'compliance', 'general')),
  entity_id TEXT,
  entity_title TEXT,
  title TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  participants TEXT[] DEFAULT '{}',
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_threads_entity ON discussion_threads(entity_type, entity_id);

CREATE TABLE discussion_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  reactions JSONB DEFAULT '{}',
  mentions TEXT[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]'
);

CREATE INDEX idx_messages_thread ON discussion_messages(thread_id);

-- ============================================================================
-- CPARS / Past Performance (Phase K)
-- ============================================================================

CREATE TABLE cpars_records (
  id TEXT PRIMARY KEY,
  contract_number TEXT NOT NULL,
  contract_title TEXT NOT NULL,
  agency TEXT NOT NULL,
  period_of_performance TEXT,
  contract_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'submitted', 'finalized')),
  overall_rating TEXT CHECK (overall_rating IN ('Exceptional', 'Very Good', 'Satisfactory', 'Marginal', 'Unsatisfactory')),
  quality_rating TEXT,
  schedule_rating TEXT,
  cost_rating TEXT,
  management_rating TEXT,
  narrative TEXT,
  ai_generated_narrative TEXT,
  key_accomplishments TEXT[] DEFAULT '{}',
  relevance_tags TEXT[] DEFAULT '{}',
  matched_opportunities TEXT[] DEFAULT '{}',
  evaluator TEXT,
  evaluation_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- FPDS Award Monitor (Phase K)
-- ============================================================================

CREATE TABLE fpds_awards (
  id TEXT PRIMARY KEY,
  piid TEXT NOT NULL,
  title TEXT NOT NULL,
  agency TEXT NOT NULL,
  vendor TEXT NOT NULL,
  vendor_duns TEXT,
  award_amount NUMERIC NOT NULL DEFAULT 0,
  ceiling_amount NUMERIC,
  award_date TIMESTAMPTZ NOT NULL,
  period_of_performance_start TIMESTAMPTZ,
  period_of_performance_end TIMESTAMPTZ,
  award_type TEXT NOT NULL,
  competition_type TEXT NOT NULL,
  naics TEXT,
  psc TEXT,
  place_of_performance TEXT,
  is_competitor BOOLEAN NOT NULL DEFAULT false,
  competitor_name TEXT,
  is_recompete_candidate BOOLEAN NOT NULL DEFAULT false,
  recompete_date TIMESTAMPTZ,
  relevance_score NUMERIC NOT NULL DEFAULT 0,
  fpds_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fpds_vendor ON fpds_awards(vendor);
CREATE INDEX idx_fpds_award_date ON fpds_awards(award_date DESC);
CREATE INDEX idx_fpds_competitor ON fpds_awards(is_competitor) WHERE is_competitor = true;

-- ============================================================================
-- Notifications
-- ============================================================================

CREATE TABLE notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('critical', 'warning', 'info', 'success')),
  category TEXT,
  related_entity_id TEXT,
  related_entity_type TEXT,
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read) WHERE read = false;

-- ============================================================================
-- Audit Log
-- ============================================================================

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  changes JSONB,
  ip_address TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
