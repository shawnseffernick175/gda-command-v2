/* ── Shared types for frontend ────────────────────────────────── */

export type Band = "forecast" | "signal" | "discovery" | "pass";

export interface PwinScore {
  score: number;
  band: Band;
  top_drivers: string[];
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
  due_date?: string | null;
  response_due_at?: string | null;
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
  grade?: string | null;
  source_uri?: string | null;
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
  notice_id: string | null;
  response_deadline: string | null;
  posted_at: string | null;
  source: string | null;
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

/* ── Launchpad ────────────────────────────────────────────────── */

export interface LaunchpadSummary {
  total_opportunities: number;
  forecast_count: number;
  signal_count: number;
  discovery_count: number;
  pass_count: number;
  avg_pwin: number | null;
  top_agencies: Array<{ agency: string; count: number }>;
  recent_scores: Array<{
    internal_id: string;
    title: string;
    score: number;
    band: Band;
  }>;
}

export interface LaunchpadFlags {
  flags: Array<{
    type: string;
    message: string;
    severity: "info" | "warning" | "critical";
    opportunity_id?: string;
  }>;
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

/* ── Fast Track ───────────────────────────────────────────────── */

export interface FastTrackSignal {
  id: string;
  title: string;
  source: string;
  source_url?: string;
  innovation_summary?: string;
  gov_match?: string;
  match_strength?: string;
  your_angle?: string;
  grade?: string;
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
}

export interface Award {
  id: string;
  recipient_name: string | null;
  recipient_name_sources: AwardSourceRef[];
  agency: string | null;
  agency_sources: AwardSourceRef[];
  contract_type: string | null;
  contract_type_sources: AwardSourceRef[];
  awarded_amount: number | null;
  awarded_amount_sources: AwardSourceRef[];
  awarded_at: string | null;
  awarded_at_sources: AwardSourceRef[];
  fpds_url: string | null;
  data_source: string;
  is_recompete_candidate: boolean;
  period_of_performance_end: string | null;
  set_aside: string | null;
  naics: string | null;
  award_analysis: AwardAnalysis | null;
  award_analysis_run_at: string | null;
  incumbent_name: string | null;
  incumbent_name_sources: AwardSourceRef[];
  linked_opportunity_id: number | null;
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

export interface ActionItemAssignee {
  id: number;
  name: string;
  email: string;
}

export interface ActionItem {
  id: number;
  title: string;
  due_date: string | null;
  owner: string | null;
  priority: ActionItemPriority;
  source_type: string | null;
  is_auto: boolean;
  assignee_id: number | null;
  assignee: ActionItemAssignee | null;
  linked_record_type: string | null;
  linked_record_id: string | null;
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
  gross_margin: KpiMetric;
  ros: KpiMetric;
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
  agencies: string[];
  naics_codes: string[];
  set_asides: string[];
  contract_types: string[];
  competitor_analysis: CompetitorAnalysis | null;
}

/* ── Risks (pending backend) ──────────────────────────────────── */

export interface Risk {
  id: number;
  title: string;
  description: string | null;
  category: "operational" | "technical" | "financial" | "compliance" | "schedule" | "competitive" | "personnel" | string;
  likelihood: number;
  impact: number;
  score: number;
  status: "open" | "mitigated" | "accepted" | "closed";
  owner: string | null;
  mitigation: string | null;
  opportunity_id: number | null;
  opportunity_title: string | null;
  source: "manual" | "ai_generated";
  created_at: string;
  updated_at: string;
  risk_type: "negative" | "positive";
  if_condition: string | null;
  then_impact: string | null;
  mitigation_plan: string | null;
  exploitation_plan: string | null;
  due_date: string | null;
  next_step: string | null;
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

export interface VaultDocument {
  id: number;
  filename: string;
  doc_type: string;
  doc_category: string;
  is_system_doc: boolean;
  file_size_bytes: number | null;
  file_path: string | null;
  extracted_text: string | null;
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

export interface ContractWaterfallData {
  task_orders: TaskOrderRow[];
  today: string;
  earliest_pop: string | null;
  latest_pop: string | null;
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

export interface AopExecutionData {
  items: AopExecutionItem[];
  periods: string[];
  meta: FinancialMeta;
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

/* ── Daily Briefing (F-460b) ──────────────────────────────────── */

export interface BriefingAction {
  action: string;
  urgency: "immediate" | "today" | "this_week";
  related_entity: string | null;
}

export interface DailyBriefing {
  headline: string;
  priority_actions: BriefingAction[];
  risk_flags: string[];
  market_intel_summary: string;
  cert_expiration_warnings: string[];
  model_used: string | null;
  quality_flag: string | null;
  generated_at: string;
  briefing_date: string;
}
