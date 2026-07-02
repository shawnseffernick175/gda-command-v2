/* ── Shared types for frontend ────────────────────────────────── */

export type Band = "forecast" | "signal" | "discovery" | "pass";

export interface RuleContribution {
  name: string;
  value: number;
  description: string;
}

export interface PwinScore {
  score: number;
  band: Band;
  top_drivers?: string[];
  feature_weights?: RuleContribution[];
  days_to_due: number | null;
  model_version: string;
  scored_at: string;
  incumbent_competitor?: string | null;
  // TODO: incumbent_source will be populated once issue #793 (incumbent enrichment) ships
  incumbent_source?: string | null;
}

export type EligibilityStatus = "prime" | "team" | "ineligible" | "unrestricted";

export interface SetAsideEligibility {
  status: EligibilityStatus;
  label: string;
  partner: string | null;
  rationale: string;
}

export interface OpportunitySummary {
  id: number | string;
  internal_id?: string;
  title: string;
  agency: string | null;
  department: string | null;
  agency_name?: string | null;
  office?: string | null;
  contracting_office?: string | null;
  naics: string | null;
  status: string | null;
  stage?: string | null;
  value?: number | null;
  value_min?: number | null;
  value_max?: number | null;
  value_source?: string | null;
  value_confidence?: string | null;
  due_date?: string | null;
  response_due_at?: string | null;
  date_source?: string | null;
  date_confidence?: string | null;
  set_aside: string | null;
  eligibility?: SetAsideEligibility | null;
  hot?: boolean;
  is_idiq?: boolean;
  created_at: string;
  updated_at: string;
  pwin?: PwinScore | null;
  doctrine_score?: number | null;
  doctrine_badge?: DoctrineBadge | null;
  capture_pwin?: number | null;
  source?: string | null;
  data_source?: string | null;
  solicitation_number?: string | null;
  pipeline_stage?: string | null;
  days_in_stage?: number | null;
  deadline_warning?: boolean;
  source_uri?: string | null;
  tags?: string[];
  ai_analyzed_at?: string | null;
}

export interface AnalysisTimeline {
  rfp_release: string | null;
  proposals_due: string | null;
  award_estimate: string | null;
}

export interface AnalysisBlock {
  version: string;
  generated_at: string;
  pwin: number | null;
  timeline: AnalysisTimeline | null;
}

export type DoctrineFitLabel = "strong" | "moderate" | "weak" | "none";

export interface DoctrineBadge {
  label: DoctrineFitLabel;
  score: number;
  matchedPrinciples: string[];
  primaryPrinciple: string | null;
  rationale: string;
}

export interface OpportunityDetail extends OpportunitySummary {
  description: string | null;
  place_of_performance: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  response_deadline: string | null;
  posted_at: string | null;
  org_path?: string | null;
  doctrine_badge?: DoctrineBadge | null;
  analysis?: AnalysisBlock | null;
  llm_analysis?: LlmAnalysis | null;
  llm_quality_flag?: string | null;
  llm_error_kind?: string | null;
  llm_error_message?: string | null;
  relevance_status?: string | null;
  relevance_reason?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor: string | null;
  total?: number;
}

/* ── Funnel report ────────────────────────────────────────────── */

export interface FunnelStage {
  stage: string;
  count: number;
  conversion_rate: number | null;
}

export interface FunnelReport {
  stages: FunnelStage[];
  window_days: number;
  generated_at: string;
}

/* ── Match suggestions (Approvals) ────────────────────────────── */

export interface MatchSuggestion {
  link_id: number;
  internal_id: string;
  title_a: string;
  title_b: string;
  source_a: string;
  source_b: string;
  confidence: string;
  similarity_score: number;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface MatchSuggestionsResponse {
  items: MatchSuggestion[];
  cursor: string | null;
}

export interface BulkDecisionItem {
  link_id: number;
  action: "confirm" | "reject";
}

/* ── FasTrac (formerly Fast Track) ────────────────────────────── */

export interface FastTrackSignal {
  id: string;
  title: string;
  source: string;
  source_url?: string;
  innovation_summary?: string;
  gov_match?: string;
  match_strength?: string;
  your_angle?: string;
  status: string;
  created_at: string;
}

export interface FastTrackAssessment {
  id: string;
  grade: string;
  rationale: string;
  naics_match_score: number;
  recommended_action: string;
  model_used: string;
  generated_at: string;
  cache_hit: boolean;
}

/* ── Pipeline ─────────────────────────────────────────────────── */

export interface PipelineItem {
  id: number;
  internal_id: string;
  title: string;
  agency: string | null;
  stage: string;
  days_in_stage: number;
  next_milestone?: string | null;
  owner?: string | null;
  pwin?: number | null;
  value: number | null;
  stalled: boolean;
}

/* ── Captures ─────────────────────────────────────────────────── */

export interface CaptureDetail {
  id: number;
  opportunity_id: string;
  title: string;
  stage: string;
  pwin: number | null;
  value: number | null;
  win_strategy?: string | null;
  discriminators?: string[] | null;
  color_review_status?: string | null;
  compliance_pct?: number | null;
  next_milestone?: string | null;
  capture_plan?: Record<string, unknown> | null;
  entry_point?: "full_pipeline" | "white_only";
  rfp_filename?: string | null;
  rfp_uploaded_at?: string | null;
}

/* ── Capture Color Team Workflow ──────────────────────────────── */

export interface StageAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  action_items: string[];
  gate_recommendation: "go" | "no_go" | "conditional";
  gate_rationale: string;
  model_used: string;
}

export interface CaptureStageAnnotation {
  id: number;
  stage_id: number;
  author: string;
  body: string;
  created_at: string;
}

export interface CaptureColorStage {
  id: number;
  capture_id: number;
  stage: "blue" | "pink" | "red" | "green" | "white";
  status: "pending" | "in_progress" | "complete" | "skipped";
  reviewer: string | null;
  gate_decision: "go" | "no_go" | "conditional" | null;
  gate_note: string | null;
  ai_analysis: StageAnalysis | null;
  ai_ran_at: string | null;
  version_snapshot: Record<string, unknown> | null;
  snapshot_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ── Capture Review Engine (F-868) ────────────────────────────── */

export type ReviewColor = "pink" | "red" | "black" | "blue" | "white" | "green";
export type ReviewStatus = "scheduled" | "in_progress" | "complete" | "cancelled";
export type ColorRating = "Blue" | "Green" | "Yellow" | "Red" | "Pink";
export type ReviewerRole = "lead" | "technical" | "mgmt" | "past_perf" | "pricing" | "compliance";

export interface CapturePlan {
  id: number;
  capture_id: number;
  customer_relationship_score: number | null;
  customer_relationship_notes: string | null;
  customer_budget_confirmed: boolean;
  customer_funded_date: string | null;
  solution_fit_score: number | null;
  solution_differentiators: string | null;
  solution_risks: string | null;
  competitive_position_score: number | null;
  known_competitors: Array<{ name: string; threat_level: string; win_themes: string }>;
  ghosting_strategy: string | null;
  ptw_estimate: number | null;
  pricing_posture: "aggressive" | "balanced" | "premium" | null;
  margin_target: number | null;
  cpars_references: unknown[];
  team_required_pp_categories: unknown[];
  prime_or_sub: "PRIME" | "SUB" | null;
  teammates: Array<{ company: string; role: string; scope_pct: number; status: string }>;
  computed_pwin: number | null;
  pwin_last_computed_at: string | null;
  is_forecastable: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaptureMilestone {
  id: number;
  capture_id: number;
  milestone_name: string;
  due_date: string;
  status: "pending" | "in_progress" | "complete" | "slipped";
  owner_contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ColorReview {
  id: number;
  capture_id: number;
  proposal_vault_doc_id: number | null;
  rfp_vault_doc_id: number | null;
  color: ReviewColor;
  scheduled_date: string | null;
  completed_date: string | null;
  status: ReviewStatus;
  rubric: string;
  overall_color_rating: ColorRating | null;
  overall_score: number | null;
  pwin_impact: number | null;
  report_vault_doc_id: number | null;
  total_sections?: number;
  scored_sections?: number;
  reviewers?: ColorReviewReviewer[] | null;
  created_at: string;
  updated_at: string;
}

export interface ColorReviewReviewer {
  id: number;
  review_id?: number;
  reviewer_name?: string;
  name?: string;
  reviewer_email?: string;
  role: ReviewerRole | null;
  submitted_at: string | null;
}

export interface ColorReviewSection {
  id: number;
  review_id: number;
  section_name: string;
  section_m_criterion: string | null;
  section_l_requirement: string | null;
  rfp_text_excerpt: string | null;
  proposal_text_excerpt: string | null;
  weight_pct: number | null;
  display_order: number;
}

export interface ColorReviewScore {
  id: number;
  section_id: number;
  reviewer_id: number;
  score: number | null;
  color_rating: ColorRating | null;
  strengths: string | null;
  weaknesses: string | null;
  recommendations: string | null;
  submitted_at: string | null;
}

export interface ColorReviewCompliance {
  id: number;
  review_id: number;
  shall_statement: string;
  rfp_reference: string | null;
  proposal_addressed_in: string | null;
  is_compliant: boolean | null;
  notes: string | null;
}

export interface ReviewDetail extends ColorReview {
  sections: ColorReviewSection[];
  reviewers: ColorReviewReviewer[];
  scores: ColorReviewScore[];
  compliance: ColorReviewCompliance[];
}

export interface MyOpenReview {
  review_id: number;
  color: ReviewColor;
  status: ReviewStatus;
  scheduled_date: string | null;
  capture_id: number;
  capture_name: string | null;
  total_sections: number;
  scored_sections: number;
}

/* ── Awards ───────────────────────────────────────────────────── */

export interface AwardSourceRef {
  kind: string;
  title: string;
  url: string;
  retrieved_at?: string;
}

export interface AwardAnalysis {
  win_rationale: string;
  agency_signal: string;
  recompete_assessment: string;
  winner_classification: 'THREAT' | 'PARTNER' | 'IRRELEVANT';
  recommended_action: 'Pursue Re-Compete' | 'Monitor' | 'Pass' | 'Partner with Winner';
  so_what: string;
  threat_level?: string;
  envision_angle?: string;
}

export interface Award {
  id: string;
  piid?: string;
  recipient_name: string | null;
  recipient_name_sources: AwardSourceRef[];
  agency: string | null;
  agency_sources: AwardSourceRef[];
  contracting_office?: string | null;
  contract_type: string | null;
  contract_type_sources: AwardSourceRef[];
  awarded_amount: number | null;
  awarded_amount_sources: AwardSourceRef[];
  total_value?: number | null;
  awarded_at: string | null;
  awarded_at_sources: AwardSourceRef[];
  fpds_url: string | null;
  data_source: string;
  is_recompete_candidate: boolean;
  period_of_performance_end: string | null;
  days_to_pop_end?: number | null;
  set_aside: string | null;
  naics: string | null;
  parent_award_id?: string | null;
  award_analysis: AwardAnalysis | null;
  award_analysis_run_at: string | null;
  incumbent_name: string | null;
  incumbent_name_sources: AwardSourceRef[];
  linked_opportunity_id: number | null;
  priority_score?: number | null;
  not_interested?: boolean;
  not_interested_at?: string | null;
  dismissal_reason?: string | null;
  dismissal_note?: string | null;
  vehicle_fit?: { short_name: string; name: string }[];
}

export interface AwardsKpis {
  hot_recompetes: number;
  wheelhouse_awards: number;
  weak_incumbents: number;
  in_my_vehicles: number;
  already_pursuing: number;
}

export interface AwardsMeta {
  total_count: number;
  expiring_90d: number;
  expiring_1yr: number;
  total_value: number;
  incumbents_identified: number;
  pursuing_count: number;
}

export interface AwardsPaginatedResponse {
  items: Award[];
  pagination: { limit: number; cursor: string | null; hasMore: boolean };
}

export interface WheelhouseNaics {
  naics: string;
  label: string | null;
  reason: string | null;
  active: boolean;
  created_at: string;
}

/* ── Action Items ─────────────────────────────────────────────── */

export interface ActionItemDraft {
  id: number;
  action_item_id: number;
  kind: "reply" | "research" | "milestone";
  content: string;
  model_used: string | null;
  status: "generating" | "done" | "failed";
  created_at: string;
}

export type ActionItemPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type DoctrineSource =
  | "capture_review_killitem"
  | "capture_stale"
  | "capture_deadline"
  | "recompete_expiring"
  | "manual";

export interface ActionItemAssignee {
  id: number;
  name: string;
  email: string;
}

export type ActionItemDraftStatus =
  | "pending"
  | "ready"
  | "approved"
  | "sent"
  | "rejected"
  | "no_context";

export interface ActionItemEvidenceRef {
  kind: "internal" | "external";
  title: string;
  url: string;
  retrieved_at: string;
}

export interface ActionItem {
  id: number;
  title: string;
  due_date: string | null;
  owner: string | null;
  priority: ActionItemPriority;
  doctrine_source: DoctrineSource;
  source_type: string | null;
  is_auto: boolean;
  assignee_id: number | null;
  assignee: ActionItemAssignee | null;
  capture_id: number | null;
  award_id: number | null;
  review_stage_id: number | null;
  linked_record_type: string | null;
  linked_record_id: string | null;
  draft_text: string | null;
  draft_evidence_ids: ActionItemEvidenceRef[];
  draft_generated_at: string | null;
  draft_status: ActionItemDraftStatus;
  status: "open" | "in_progress" | "done" | "overdue";
  created_at: string;
  drafts?: ActionItemDraft[];
}

/* ── KPI Header ───────────────────────────────────────────────── */

export interface KpiMetric {
  value: number;
  delta: number | null;
  plan: number | null;
}

export interface KpiHeaderData {
  period?: string;
  orders: KpiMetric;
  sales: KpiMetric;
  ebit: KpiMetric;
  gross_margin?: KpiMetric;
  ros: KpiMetric;
  funded_backlog: KpiMetric;
  backlog: KpiMetric;
}

/* ── Balance Sheet ────────────────────────────────────────────── */

export interface BalanceSheetRow {
  period: string;
  fiscal_year: number;
  quarter: number | null;
  cash: number;
  accounts_receivable: number;
  total_current_assets: number;
  total_assets: number;
  accounts_payable: number;
  total_current_liabilities: number;
  total_liabilities: number;
  total_equity: number;
}

export interface BalanceSheetData {
  latest: BalanceSheetRow | null;
  trend: BalanceSheetRow[];
}

/* ── Accounts Payable (F-625) ─────────────────────────────────── */

export interface ApRow {
  id: number;
  period: string;
  fiscal_year: number;
  quarter: number | null;
  vendor_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number;
  age_bucket: string | null;
  source_doc_id: number | null;
}

export interface ApData {
  items: ApRow[];
  meta: { table: string; row_count: number };
}

/* ── Accounts Receivable (F-625) ──────────────────────────────── */

export interface ArRow {
  id: number;
  period: string;
  fiscal_year: number;
  quarter: number | null;
  customer_name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount: number;
  age_bucket: string | null;
  source_doc_id: number | null;
}

export interface ArData {
  items: ArRow[];
  meta: { table: string; row_count: number };
}

/* ── AR By Contract (issue #1007) ─────────────────────────────── */

export interface ArContractRow {
  contract: string;
  is_rs3: boolean;
  months: Record<string, number>;
  total: number;
}

export interface ArContractSubtotal {
  label: string;
  months: Record<string, number>;
  total: number;
}

export interface ArByContractData {
  mode: CalendarMode;
  period_label: string;
  month_columns: string[];
  contracts: ArContractRow[];
  rs3_subtotal: ArContractSubtotal;
  grand_total: { months: Record<string, number>; total: number };
}

/* ── Trial Balance (F-625) ────────────────────────────────────── */

export interface TrialBalanceRow {
  id: number;
  period: string;
  fiscal_year: number;
  quarter: number | null;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  net_balance: number;
  source_doc_id: number | null;
}

export interface TrialBalanceData {
  items: TrialBalanceRow[];
  meta: { table: string; row_count: number };
}

/* ── Project Revenue (F-625) ──────────────────────────────────── */

export interface ProjectRevenueRow {
  id: number;
  period: string;
  fiscal_year: number;
  quarter: number | null;
  project_name: string;
  contract_number: string | null;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number | null;
  source_doc_id: number | null;
}

export interface ProjectRevenueData {
  items: ProjectRevenueRow[];
  meta: { table: string; row_count: number };
}

/* ── Project Financial Drill-Down (F-628) ─────────────────────── */

export interface ProjectFullRow {
  id: number;
  period: string;
  fiscal_year: number;
  quarter: number | null;
  project_id: string | null;
  project_name: string;
  contract_number: string | null;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number | null;
  itd_value: number;
  itd_funding: number;
  itd_billed_amount: number;
  open_ar: number;
  prior_year_costs: number;
  prior_year_profit: number;
  prior_year_revenue: number;
  actual_period_costs: number;
  actual_period_profit: number;
  actual_period_revenue: number;
  actual_ytd_costs: number;
  actual_ytd_profit: number;
  actual_ytd_revenue: number;
  actual_itd_costs: number;
  actual_itd_profit: number;
  actual_itd_revenue: number;
  target_period_costs: number;
  target_period_profit: number;
  target_period_revenue: number;
  target_ytd_costs: number;
  target_ytd_profit: number;
  target_ytd_revenue: number;
  target_itd_costs: number;
  target_itd_profit: number;
  target_itd_revenue: number;
  source_doc_id: number | null;
}

export interface ProjectListData {
  items: ProjectFullRow[];
  periods: string[];
  meta: { table: string; row_count: number };
}

export interface ProjectSnapshotData {
  project: ProjectFullRow;
}

export interface ProjectTrendData {
  items: ProjectFullRow[];
}

/* ── Ingestion Coverage (F-625) ───────────────────────────────── */

export interface IngestionCoverageDoc {
  doc_id: number;
  filename: string;
  extraction_status: string;
  destinations: Array<{ table: string; row_count: number }>;
  status: "ingested" | "no_handler" | "extraction_failed";
}

export interface IngestionCoverageData {
  coverage: IngestionCoverageDoc[];
  summary: {
    total: number;
    ingested: number;
    no_handler: number;
    extraction_failed: number;
  };
}

/* ── Cost Detail (TGT vs ACT) ─────────────────────────────────── */

export interface CostDetailItem {
  period: string;
  fiscal_year: number;
  quarter: number;
  cost_element: string;
  pool: string;
  target_amount: number;
  actual_amount: number;
  variance_amount: number;
}

/* ── Indirect Expenses (SIE) ──────────────────────────────────── */

export interface IndirectExpenseItem {
  period: string;
  fiscal_year: number;
  quarter: number;
  pool: string;
  account_code: string | null;
  account_name: string;
  current_period_actual: number;
  current_period_budget: number;
  ytd_actual: number;
  ytd_budget: number;
}

export interface IndirectExpenseTrendItem {
  period: string;
  fiscal_year: number;
  quarter: number;
  pool: string;
  period_actual: number;
  period_budget: number;
  ytd_actual: number;
  ytd_budget: number;
}

/* ── Period Detail (drill-down) ───────────────────────────────── */

export interface PeriodDetailMetrics {
  source: string;
  orders: number;
  sales: number;
  ebit: number;
  gross_margin: number;
  ros: number;
}

export interface PeriodDetailDoc {
  id: number;
  filename: string;
  doc_type: string;
  uploaded_at: string;
}

export interface PeriodDetailData {
  period: string;
  actuals: PeriodDetailMetrics[];
  plans: PeriodDetailMetrics[];
  source_documents: PeriodDetailDoc[];
}

/* ── Contacts (pending backend) ───────────────────────────────── */

export interface Contact {
  id: number;
  name: string;
  role: string | null;
  organization: string | null;
  source: string | null;
  first_seen: string | null;
  contact_type: "Gov" | "Academia" | "Industry" | "Partner";
  last_activity: string | null;
  needs_or_capabilities?: string | null;
  notes?: string | null;
}

/* ── GovTribe Contacts (F-494) ────────────────────────────────── */

export type ContactCategory = 'government' | 'teaming_partner' | 'competitor' | 'industry' | 'internal' | 'other';

export interface ContactAiProfile {
  role_summary: string;
  procurement_influence: 'high' | 'medium' | 'low' | 'unknown';
  likely_decision_authority: string;
  engagement_approach: string;
  relevance_to_envision: string;
  model_used: string;
}

export type RelationshipTemp = 'hot' | 'warm' | 'cold' | 'unknown';

export interface LinkedOpp { id: number; title: string; stage: string | null }
export interface LinkedCapture { id: number; title: string; color_stage: string | null }

export interface GovTriContact {
  id: number;
  govtribe_id: string | null;
  name: string | null;
  title: string | null;
  agency: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
  source_url: string | null;
  last_seen_at: string;
  contact_category: ContactCategory;
  company: string | null;
  linkedin_url: string | null;
  notes: string | null;
  relationship_score: number | null;
  ai_profile: ContactAiProfile | null;
  ai_ran_at: string | null;
  is_manual: boolean;
  added_by: string;
  source_label: string | null;
  relationship_temp: RelationshipTemp | null;
  last_contacted_at: string | null;
  contact_notes: string | null;
  linked_opportunity_ids: number[];
  linked_capture_ids: number[];
  linked_opportunities: LinkedOpp[];
  linked_captures: LinkedCapture[];
}

export interface ContactsMeta {
  total_count: number;
  warm_no_touch: number;
  linked_to_pursuits: number;
  agency_count: number;
}

/* ── Competitors (pending backend) ────────────────────────────── */

export interface CompetitorRecompeteContract {
  contract_id: string;
  title: string;
  value: number;
  expiration_date: string;
  agency: string;
}

export interface CompetitorAnalysis {
  size_classification: string;
  classification: 'THREAT' | 'PARTNER' | 'MONITOR';
  classification_rationale: string;
  so_what: string;
  recompete_contracts: CompetitorRecompeteContract[];
  recommended_action: 'Compete' | 'Partner' | 'Monitor' | 'Ignore';
  trend: 'Up' | 'Down' | 'Flat';
  from_cache?: boolean;
}

export interface Competitor {
  name: string;
  awardee_uei: string | null;
  win_count: number;
  total_obligated: number | null;
  largest_award: number | null;
  last_win_date: string | null;
  agencies: string[] | null;
  naics_codes: string[] | null;
  naics_count: number | null;
  set_asides: string[] | null;
  contract_types: string[] | null;
  competitor_analysis: CompetitorAnalysis | null;
}

/* ── Risks (F-307: First-Class Objects) ───────────────────────── */

export type RiskCategory =
  | "doctrine_violation" | "margin" | "compliance" | "past_performance"
  | "teaming" | "incumbent_advantage" | "schedule" | "staffing"
  | "certification" | "price" | "technical" | "other"
  | "operational" | "financial" | "competitive" | "personnel";

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export type RiskStatus = "open" | "mitigating" | "resolved" | "accepted" | "mitigated" | "closed";

export type RiskSource = "manual" | "ai_generated" | "doctrine_rule" | "color_review" | "sentinel" | "hook";

export interface Risk {
  id: number;
  title: string;
  description: string | null;
  category: RiskCategory | string;
  severity: RiskSeverity;
  likelihood: number;
  impact: number;
  status: RiskStatus;
  owner: string | null;
  mitigation: string | null;
  opportunity_id: number | null;
  opportunity_title: string | null;
  related_capture_id: number | null;
  related_pipeline_item_id: string | null;
  related_action_item_id: string | null;
  source: RiskSource;
  source_event: Record<string, unknown>;
  mitigation_plan: string | null;
  mitigation_doc_ids: string[];
  evidence_grade: string | null;
  identified_at: string;
  resolved_at: string | null;
  due_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  risk_type: "negative" | "positive";
  if_condition: string | null;
  then_impact: string | null;
  exploitation_plan: string | null;
  due_date: string | null;
  next_step: string | null;
}

export interface RiskEvent {
  id: number;
  risk_id: number;
  event_type: string;
  detail: Record<string, unknown>;
  actor: string;
  created_at: string;
}

export interface RiskWithEvents extends Risk {
  events: RiskEvent[];
}

/* ── Sentinel ─────────────────────────────────────────────────── */

export interface SentinelStatus {
  overall: "healthy" | "degraded" | "down";
  sources: Array<{
    source_key: string;
    label: string;
    status: "healthy" | "stale" | "error" | "unknown";
    last_success_at: string | null;
    lag_seconds: number | null;
    message?: string;
    credits?: {
      used: number;
      budget: number;
      pct: number;
      last_call_at: string | null;
    };
  }>;
  govtribe_severity: "ok" | "warning" | "critical";
  govtribe_credits: {
    credits_used: number;
    credits_budget: number;
    pct: number;
    last_call_at: string | null;
  };
}

/* ── LLM Router ───────────────────────────────────────────────── */

export interface LlmResponse {
  ok: boolean;
  task: string;
  model_used: string | null;
  output: Record<string, unknown> | null;
  latency_ms: number;
  trace_id: string;
  error_message?: string | null;
}

/* ── LLM Analysis (F-453) ────────────────────────────────────── */

export interface ShipleyDimension {
  score: number;
  reasoning: string;
}

export interface ShipleyBidNoBid {
  overall: "Bid" | "No Bid" | "Conditional";
  customer_knowledge: ShipleyDimension;
  solution_match: ShipleyDimension;
  competitive_position: ShipleyDimension;
  past_performance: ShipleyDimension;
}

export interface CompetitorEntry {
  name: string;
  threat_level?: "high" | "medium" | "low";
  our_differentiator: string;
}

export interface RiskEntry {
  level: "HIGH" | "MED" | "LOW";
  description: string;
  mitigation: string;
  regulatory_citation?: string | null;
}

export interface LlmAnalysis {
  executive_summary?: string;
  bid_recommendation?: "Bid" | "No Bid" | "Conditional";
  bid_rationale?: string;
  win_probability: number;
  win_probability_reasoning: string;
  shipley_bid_no_bid: ShipleyBidNoBid;
  competitive_landscape: CompetitorEntry[];
  risks?: RiskEntry[];
  source_chips: Array<{ label: string; url: string; kind: string }>;
  model_used: string;
}

/* ── Vault (F-614) ────────────────────────────────────────────── */

export interface VaultEntity {
  name: string;
  type: string;
  value: string;
}

export interface VaultAuditEntry {
  id: number;
  document_id: number;
  action: string;
  actor: string;
  detail: string | null;
  created_at: string;
}

export type VaultExtractionStatus = 'pending' | 'success' | 'failed' | 'unsupported' | 'dismissed';

export interface VaultDocument {
  id: number;
  filename: string;
  doc_type: string;
  doc_category: string;
  is_system_doc: boolean;
  file_size_bytes: number | null;
  file_path: string | null;
  extracted_text: string | null;
  extraction_status: VaultExtractionStatus;
  ai_summary: string | null;
  ai_tags: string[] | null;
  ai_entities: VaultEntity[] | null;
  regulatory_citation: string | null;
  effective_date: string | null;
  applicable_naics: string[] | null;
  linked_opportunity_id: number | null;
  linked_capture_id: number | null;
  linked_award_id: number | null;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
  deleted_at: string | null;
  opp_title?: string | null;
  capture_title?: string | null;
  award_title?: string | null;
  audit_trail?: VaultAuditEntry[];
  routing?: {
    linked_opportunity_id: number | null;
    linked_capture_id: number | null;
    routing_rationale: string | null;
  };
}

export interface VaultDocumentText {
  extracted_text: string | null;
  filename: string;
  doc_type: string;
}

export interface VaultPaginatedResponse {
  items: VaultDocument[];
  total: number;
  page: number;
  totalPages: number;
}

export interface RegulatoryCatalogEntry {
  id: number;
  citation: string;
  title: string;
  category: string;
  summary: string | null;
  url: string | null;
  effective_date: string | null;
  ndaa_year: number | null;
  eo_number: string | null;
  gao_docket: string | null;
  applies_to: string[] | null;
  key_clauses: { clause: string; topic: string }[] | null;
  is_active: boolean;
  created_at: string;
}

/* ── Financial Bible v3 ───────────────────────────────────────── */

export interface FinancialMeta {
  sources: Array<{
    vault_doc_id?: number;
    filename?: string;
    ingested_at?: string;
    parser?: string;
    table?: string;
    row_count?: number;
    type?: string;
    label?: string;
    stages?: string[];
  }>;
  last_refresh: string | number | null;
  period: string | null;
}

export interface IngestionStatus {
  docs_ingested: number;
  docs_total: number;
  max_period: string | null;
  last_refresh: string | null;
  doc_filenames: string[];
}

export interface ContractVehicleRow {
  id: number;
  name: string;
  short_name: string;
  contract_number: string | null;
  vehicle_type: string;
  agency: string | null;
  naics_primary: string | null;
  expiration_date: string | null;
  ceiling_value: number | null;
  is_active: boolean;
  notes: string | null;
}

export interface OptionPeriod {
  name: string;
  start: string;
  end: string;
  exercised: boolean;
}

export interface TaskOrderRow {
  id: number;
  to_name: string;
  to_number: string;
  parent_vehicle_id: number | null;
  parent_vehicle_short_name: string | null;
  parent_color: string;
  prime_or_sub: string;
  customer_agency: string | null;
  contracting_office: string | null;
  pop_start: string | null;
  pop_end: string | null;
  base_pop_end: string | null;
  option_periods: OptionPeriod[] | null;
  ceiling: number | null;
  funded_to_date: number | null;
  status: string;
  cpars_status: string | null;
  days_until_expiration: number | null;
  is_expiring_soon: boolean;
  notes: string | null;
}

export interface WaterfallContract {
  id: number;
  to_name: string;
  to_number: string;
  parent_vehicle_short_name: string | null;
  ceiling: number;
  funded_to_date: number;
  pop_start: string;
  pop_end: string;
  annual_revenue: number;
  monthly_revenue: number;
  margin_pct: number;
  margin_source: "actual" | "portfolio_average";
  status: string;
}

export interface WaterfallForecastMonth {
  month: string;
  total_revenue: number;
  total_profit: number;
  total_funded: number;
  total_unfunded: number;
  by_contract: {
    contract_id: number;
    funded_revenue: number;
    unfunded_revenue: number;
    profit: number;
  }[];
}

export interface WaterfallPipelineMonth {
  month: string;
  weighted_value: number;
  opportunities: { name: string; value: number; pwin: number }[];
}

export interface ContractWaterfallData {
  contracts: WaterfallContract[];
  forecast: WaterfallForecastMonth[];
  pipeline: WaterfallPipelineMonth[];
  spread_method: "ceiling_div_12_annual" | "ceiling_div_pop_months" | "per_year_ceiling";
  portfolio_avg_margin: number;
  today: string;
  available_vehicles: { id: number; short_name: string }[];
  meta: FinancialMeta;
}

export interface AopExecutionItem {
  period: string;
  cost_element: string;
  pool: string;
  planned: number;
  actual: number;
  variance: number;
}

export interface AopMetricMonth {
  period: string;
  plan: number | null;
  actual: number | null;
  variance: number | null;
}

export interface AopMetric {
  key: string;
  label: string;
  kind: "currency" | "percent";
  favorable: "higher" | "lower";
  months: AopMetricMonth[];
  plan_total: number | null;
  actual_total: number | null;
  variance_total: number | null;
}

// Back-compat alias for the Sales metric block.
export type AopRevenue = AopMetric;

export type CalendarMode = "FY" | "CY";

export interface AopExecutionData {
  items: AopExecutionItem[];
  metrics?: AopMetric[];
  revenue?: AopMetric | null;
  has_plan?: boolean;
  plan_source?: string | null;
  calendar_mode?: CalendarMode;
  periods: string[];
  meta: FinancialMeta;
}

// AOP Plan input: the owner's annual board-approved plan for a fiscal year.
export interface AopPlanValues {
  plan_orders: number;
  plan_sales: number;
  plan_ebit: number;
  plan_gross_margin: number;
  plan_ros: number;
}

export interface AopPlanData {
  fiscal_year: number;
  fy: string;
  has_plan: boolean;
  plan: AopPlanValues | null;
}

export interface AopPlanSaveResponse {
  fiscal_year: number;
  fy: string;
  months_written: number;
  plan: AopPlanValues;
  monthly: AopPlanValues;
}

export interface AopCaptureItem {
  id: number;
  title: string;
  agency: string | null;
  stage: string;
  value: number | null;
  pwin: number | null;
  capture_owner: string;
  milestone_90day: string | null;
  solicitation_number: string | null;
  response_due_at: string | null;
}

export interface AopCaptureData {
  items: AopCaptureItem[];
  meta: FinancialMeta;
}

export interface CostByPool {
  pool: string;
  target: number;
  actual: number;
  variance: number;
}

export interface P2MonthlyActual {
  period: string;
  source: string;
  orders: number;
  sales: number;
  ebit: number;
  gross_margin: number;
  ros: number;
}

export interface IncomeStatementLineItem {
  period: string;
  revenue: number;
  direct_costs: number;
  gross_profit: number;
  gross_margin_pct: number;
  operating_expenses: number;
  ebit: number;
  ros_pct: number;
  new_orders: number;
}

export interface CostDetailItem {
  label: string;
  amount: number;
}

export interface P2FinancialsData {
  kpi: {
    ytd_revenue: number;
    ytd_expenses: number;
    ytd_profit: number;
    ytd_margin: number;
    period: string;
  } | null;
  plan: {
    plan_sales: number;
    plan_ebit: number;
    plan_gross_margin: number;
  } | null;
  income_statement: {
    months: IncomeStatementLineItem[];
    quarters: IncomeStatementLineItem[];
    direct_cost_detail: Record<string, CostDetailItem[]>;
    indirect_cost_detail: Record<string, CostDetailItem[]>;
  };
  monthly_actuals: P2MonthlyActual[];
  cost_by_pool: CostByPool[];
  meta: FinancialMeta;
}

export interface FinancialDefinition {
  term: string;
  definition: string;
}

export interface DefinitionsData {
  definitions: FinancialDefinition[];
  meta: FinancialMeta;
}

export interface AiAnalyzeResponse {
  analysis: string;
  generated_at: string;
}


/* ── Workshop (#873) ──────────────────────────────────────────── */

export interface TeardownStructureEntry {
  section_name: string;
  page_start: number;
  page_end: number;
  summary: string;
}

export interface TeardownKeyNumber {
  value: string;
  context: string;
  page: number;
}

export interface TeardownTable {
  caption: string;
  csv: string;
  rows?: string[][];
}

export interface TeardownFigure {
  caption: string;
  page: number;
}

export interface TeardownEnvisionRelevance {
  wheelhouse_match: "high" | "medium" | "low" | "none";
  agencies_mentioned: string[];
  naics_mentioned: string[];
  vehicles_mentioned: string[];
  competitors_mentioned: string[];
  teammate_candidates: string[];
  threat_candidates: string[];
}

export interface TeardownAnalysis {
  title: string;
  doc_type: string;
  page_count: number;
  structure: TeardownStructureEntry[];
  key_claims: string[];
  key_numbers: TeardownKeyNumber[];
  tables_extracted: TeardownTable[];
  figures_extracted: TeardownFigure[];
  risks_or_gaps: string[];
  envision_relevance: TeardownEnvisionRelevance;
  summary_3_sentence: string;
}

export interface WorkshopOutput {
  id: string;
  source_upload_id: string;
  output_type: string;
  output_format: string;
  vault_doc_id: number | null;
  generated_at: string;
  generated_by: string | null;
  config: Record<string, unknown> | null;
  rendered_text: string | null;
}

export interface DocumentUpload {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  classification: string | null;
  teardown_analysis: TeardownAnalysis | null;
  teardown_run_at: string | null;
  teardown_model: string | null;
  status: "uploaded" | "analyzing" | "analyzed" | "failed";
  outputs?: WorkshopOutput[];
}

export interface WorkshopListResponse {
  items: DocumentUpload[];
  total: number;
  page: number;
  totalPages: number;
}

/* ── Color Team Reviews (F-Color-Team-Reviews) ────────────────── */

export type ColorTeamColor = "pink" | "red" | "black" | "blue" | "white" | "green";
export type ColorTeamSeverity = "info" | "warning" | "critical" | "blocker";
export type ColorTeamRunStatus = "queued" | "running" | "complete" | "error";

export interface ColorTeamCitation {
  source: string;
  url: string;
  grade: "A" | "B" | "C";
}

export interface ColorTeamDoctrineScore {
  principle: string;
  score: number;
  detail: string;
}

export interface ColorTeamMarginCheck {
  projected_margin: number;
  floor: number;
  pass: boolean;
}

export interface ColorTeamFinding {
  id: number;
  run_id: number;
  color: ColorTeamColor;
  severity: ColorTeamSeverity;
  section_ref: string | null;
  finding: string;
  recommended_fix: string | null;
  citations: ColorTeamCitation[];
  doctrine_score: ColorTeamDoctrineScore[] | null;
  exclusion_hits: string[] | null;
  margin_check: ColorTeamMarginCheck | null;
  action_item_id: number | null;
  created_at: string;
}

export interface ColorTeamColorCount {
  color: string;
  count: number;
}

export interface ColorTeamRun {
  id: number;
  document_id: number;
  linked_rfp_id: number | null;
  colors: string[];
  status: ColorTeamRunStatus;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  source_id: number | null;
  created_at: string;
  finding_counts?: ColorTeamColorCount[];
}

export interface ColorTeamDocument {
  id: number;
  filename: string;
  mime_type: string;
  file_size_bytes: number | null;
  doc_type: string;
  storage_path: string;
  uploaded_by: string;
  opportunity_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ColorTeamDiffResult {
  new_findings: ColorTeamFinding[];
  resolved_findings: ColorTeamFinding[];
  regressed_findings: ColorTeamFinding[];
  unchanged_findings: ColorTeamFinding[];
}

/* ── F-305: Auto-Analysis Brief ───────────────────────────────── */

export interface AnalysisCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export type AnalysisSectionStatus = "pending" | "running" | "done" | "error" | "outdated";

export interface AnalysisSectionBase {
  section_id: string;
  section_label: string;
  status: AnalysisSectionStatus;
  trace_id: string | null;
  cached: boolean;
  source_changed: boolean;
  error_message?: string | null;
  generated_at: string | null;
}

export interface PwinSectionData {
  score: number;
  grade: "Go" | "Reconsider" | "Pass";
  top_factors: string[];
  model_version: string;
  citations: AnalysisCitation[];
}

export interface DoctrineSectionData {
  principles: Array<{
    id: string;
    name: string;
    result: "pass" | "fail" | "n/a";
    reason: string;
    citations: AnalysisCitation[];
  }>;
  exclusions: Array<{
    id: string;
    name: string;
    result: "pass" | "fail" | "n/a";
    reason: string;
  }>;
  margin_floor: {
    passed: boolean;
    margin_pct: number | null;
    threshold: number;
  };
  citations: AnalysisCitation[];
}

export interface IncumbentSectionData {
  company_name: string | null;
  contract_number: string | null;
  ceiling: number | null;
  end_date: string | null;
  performance_signals: string[];
  citations: AnalysisCitation[];
}

export interface SimilarAwardsSectionData {
  awards: Array<{
    title: string;
    date: string | null;
    agency: string | null;
    value: number | null;
    awardee: string | null;
    url: string | null;
  }>;
  citations: AnalysisCitation[];
}

export interface CompetitorsSectionData {
  competitors: Array<{
    name: string;
    win_rate: number | null;
    cleared: boolean | null;
    ceiling_fit: string | null;
    threat_level: "high" | "medium" | "low";
  }>;
  citations: AnalysisCitation[];
}

export interface DecisionFactorsSectionData {
  evaluation_method: string | null;
  past_performance_weight: string | null;
  key_personnel_requirements: string | null;
  other_factors: string[];
  citations: AnalysisCitation[];
}

export interface TeamingSectionData {
  opportunities: Array<{
    partner: string;
    ou: string;
    rationale: string;
    cert_leverage: string | null;
  }>;
  citations: AnalysisCitation[];
}

export interface WinThemesSectionData {
  themes: Array<{
    theme: string;
    doctrine_anchor: string | null;
  }>;
  citations: AnalysisCitation[];
}

export interface RisksSectionData {
  risks: Array<{
    title: string;
    severity: "HIGH" | "MED" | "LOW";
    description: string;
    mitigation: string | null;
    linked_risk_id: string | null;
  }>;
  citations: AnalysisCitation[];
}

export interface CitationsSectionData {
  all_citations: AnalysisCitation[];
}

export type AnalysisSectionDataMap = {
  pwin: PwinSectionData;
  doctrine: DoctrineSectionData;
  incumbent: IncumbentSectionData;
  similar_awards: SimilarAwardsSectionData;
  competitors: CompetitorsSectionData;
  decision_factors: DecisionFactorsSectionData;
  teaming: TeamingSectionData;
  win_themes: WinThemesSectionData;
  risks: RisksSectionData;
  citations: CitationsSectionData;
};

export type AnalysisSectionId = keyof AnalysisSectionDataMap;

export type AnalysisSection<K extends AnalysisSectionId = AnalysisSectionId> =
  AnalysisSectionBase & {
    section_id: K;
    data: AnalysisSectionDataMap[K] | null;
  };

export interface AnalysisBriefComplete {
  opportunity_id: string;
  sources_revision_hash: string | null;
  generated_at: string;
  cached: boolean;
  section_count: number;
}

/* ── Sentinel Handoff Monitor (F-309) ──────────────────────────── */

export interface SentinelHandoffCard {
  id: string;
  title: string;
  context: string | null;
  action_label: string | null;
  action_url: string | null;
  severity: string;
  source_key: string | null;
  due_by: string | null;
  created_at: string;
}

export interface SentinelRecentWinCard {
  id: string;
  title: string;
  context: string | null;
  source_key: string | null;
  created_at: string;
}

export interface SentinelUpcomingBreakCard {
  id: string;
  title: string;
  context: string | null;
  action_label: string | null;
  action_url: string | null;
  severity: string;
  due_by: string | null;
  created_at: string;
}

export interface SentinelCreditPacingGovTribe {
  month: string;
  credits_used: number;
  credits_budget: number;
  pct: number;
  burn_rate_7d: number;
  projected_exhaustion_date: string | null;
  days_remaining_in_month: number;
  daily_allowance: number;
  today_spent: number;
  top_queries: Array<{ tool_name: string; credits: number; call_count: number }>;
  daily_burn_history: Array<{ date: string; credits: number }>;
}

export interface SentinelCreditPacingGovWin {
  month: string;
  calls_mtd: number;
  avg_daily_calls: number;
  last_call_at: string | null;
  auth_status: {
    token_valid: boolean;
    expires_in_minutes: number;
  };
  top_endpoints: Array<{ endpoint: string; call_count: number }>;
}
