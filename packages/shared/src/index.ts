/** Standard GDA response envelope used by every API endpoint. */
export interface GDAEnvelope<T = unknown> {
  success: boolean;
  workflow: string;
  action: string;
  dryRun: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: GDAError | null;
}

export interface GDAError {
  code: string;
  message: string;
  detail: string | null;
}

/** QA health check result shape. */
export interface QAHealthStatus {
  platform: string;
  status: "healthy" | "degraded" | "down";
  checks: QACheck[];
  checkedAt: string;
}

export interface QACheck {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  durationMs: number;
}

/** QA failure record shape. */
export interface QAFailure {
  id: string;
  workflow: string;
  action: string;
  errorCode: string;
  errorMessage: string;
  occurredAt: string;
  resolved: boolean;
}

/** Opportunity status values. */
export type OpportunityStatus =
  | "discovery"
  | "qualified"
  | "pipeline"
  | "lost"
  | "won";

/** Opportunity record matching Postgres schema + S-009 spec. */
export interface Opportunity {
  id: string;
  title: string;
  agency: string | null;
  department: string | null;
  status: OpportunityStatus;
  score: number;
  value_estimated: number | null;
  probability_of_win: number | null;
  naics: string | null;
  psc: string | null;
  due_date: string | null;
  solicitation_number: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  incumbent: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  tags: string[];
  raw_source_url: string | null;
  created_at: string;
  updated_at: string;
}

/** Qualify write result shape per S-008 spec. */
export interface QualifyResult {
  opportunity_id: string;
  title: string;
  prev_status: OpportunityStatus;
  new_status: OpportunityStatus;
  qualified_at: string;
  correlation_id: string;
}

/** Opportunity list query filters. */
export interface OpportunityFilters {
  search?: string;
  status?: OpportunityStatus;
  department?: string;
  minPwin?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// S-009 Opportunity Detail types
// ---------------------------------------------------------------------------

/** Executive analysis for a single opportunity. */
export interface OpportunityAnalysis {
  executive_summary: string;
  strengths: string[];
  risks: string[];
  competitive_landscape: string | null;
  relevance_rationale: string | null;
  recommended_action: string | null;
  confidence: number | null;
  last_analyzed_at: string | null;
  analyst_feedback: string | null;
  analysis_version: string;
}

export interface OodaObserveItem {
  label: string;
  value: string;
  source_ids: string[];
}

export interface OodaOrientItem {
  label: string;
  value: string;
  source_ids: string[];
  type: "strength" | "risk" | "fact" | "inference";
}

export interface OodaDecideOption {
  label: string;
  rationale: string;
  recommended: boolean;
}

export interface OodaActStep {
  action: string;
  owner: string | null;
  due_date: string | null;
  priority: "high" | "medium" | "low";
}

export interface OodaBlock {
  observe: { summary: string; items: OodaObserveItem[] };
  orient: { summary: string; items: OodaOrientItem[] };
  decide: { summary: string; options: OodaDecideOption[] };
  act: { summary: string; next_steps: OodaActStep[] };
}

export interface OpportunitySource {
  id: string;
  title: string;
  type: string;
  url: string | null;
  publisher: string | null;
  published_at: string | null;
  retrieved_at: string | null;
  snippet: string | null;
  relevance_reason: string;
}

export interface OpportunityLearning {
  learning_notes: string | null;
  feedback_submitted: boolean;
  feedback_at: string | null;
  source_count: number;
  coverage_gaps: string[];
  next_review_at: string | null;
}

export interface OpportunityDetailData {
  opportunity: Opportunity;
  analysis: OpportunityAnalysis;
  ooda: OodaBlock;
  sources: OpportunitySource[];
  learning: OpportunityLearning;
}

// ---------------------------------------------------------------------------
// Doctrine Automation types
// ---------------------------------------------------------------------------

export type DoctrineDocType =
  | "book_of_truths"
  | "sprint_notes"
  | "decision_log"
  | "master_build_note";

export type DoctrineDraftStatus =
  | "draft"
  | "finalized"
  | "superseded"
  | "blocked";

export type DoctrinePublishTrigger =
  | "pr-merge"
  | "finalize"
  | "manual";

export type DoctrinePublishStatus =
  | "running"
  | "success"
  | "blocked"
  | "failed";

export interface DoctrineDraft {
  id: string;
  sprint_id: string;
  component: string;
  doc_type: DoctrineDocType;
  title: string;
  status: DoctrineDraftStatus;
  source_pr_number: number | null;
  source_pr_url: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoctrinePublishRun {
  id: string;
  sprint_id: string;
  trigger_type: DoctrinePublishTrigger;
  status: DoctrinePublishStatus;
  gate_results: GateCheckResult[] | null;
  commit_sha: string | null;
  reason: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface GateCheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  message: string;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Intel Hub types
// ---------------------------------------------------------------------------

export type IntelPriority = "critical" | "high" | "medium" | "low";

export type IntelCategory =
  | "competitive"
  | "market"
  | "threat"
  | "opportunity"
  | "regulatory"
  | "technology";

export type IntelSource =
  | "n8n_crawl"
  | "manual"
  | "sam_gov"
  | "fpds"
  | "news"
  | "research";

export interface IntelItem {
  id: string;
  title: string;
  summary: string;
  category: IntelCategory;
  priority: IntelPriority;
  source: IntelSource;
  source_url: string | null;
  related_opportunity_id: string | null;
  related_competitor: string | null;
  tags: string[];
  created_at: string;
  read: boolean;
}

export interface MorningBriefing {
  id: string;
  date: string;
  headline: string;
  key_metrics: BriefingMetric[];
  alerts: BriefingAlert[];
  action_items: BriefingActionItem[];
  market_snapshot: string;
  generated_at: string;
}

export interface BriefingMetric {
  label: string;
  value: string;
  change: string | null;
  trend: "up" | "down" | "flat";
}

export interface BriefingAlert {
  severity: IntelPriority;
  message: string;
  source: string;
  action_required: boolean;
}

export interface BriefingActionItem {
  action: string;
  priority: IntelPriority;
  due: string | null;
  context: string;
}

export type ResearchStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed";

export interface DeepResearchReport {
  id: string;
  query: string;
  status: ResearchStatus;
  summary: string | null;
  findings: string | null;
  sources_count: number;
  requested_at: string;
  completed_at: string | null;
  requested_by: string;
}

export interface CompetitorProfile {
  id: string;
  name: string;
  threat_score: number;
  contracts_won: number;
  contracts_value: number;
  primary_naics: string[];
  strengths: string[];
  weaknesses: string[];
  recent_wins: string[];
  watch_status: "active" | "monitoring" | "inactive";
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Capture Planner types
// ---------------------------------------------------------------------------

export type CapturePhase =
  | "pre_rfp"
  | "rfp_released"
  | "proposal_prep"
  | "submitted"
  | "evaluation"
  | "awarded";

export type CaptureGateStatus = "passed" | "failed" | "pending" | "waived";

export interface CapturePlan {
  id: string;
  opportunity_id: string;
  opportunity_title: string;
  agency: string;
  phase: CapturePhase;
  pwin: number;
  value_estimated: number;
  capture_manager: string;
  bid_decision: "bid" | "no_bid" | "pending";
  teaming_partners: TeamingPartner[];
  milestones: CaptureMilestone[];
  gate_reviews: CaptureGateReview[];
  win_themes: string[];
  discriminators: string[];
  risks: CaptureRisk[];
  created_at: string;
  updated_at: string;
}

export interface TeamingPartner {
  name: string;
  role: "prime" | "sub" | "mentor" | "jv_partner";
  capability: string;
  status: "confirmed" | "negotiating" | "identified";
  past_performance_score: number | null;
}

export interface CaptureMilestone {
  id: string;
  title: string;
  due_date: string;
  status: "completed" | "on_track" | "at_risk" | "overdue";
  owner: string;
  notes: string | null;
}

export interface CaptureGateReview {
  gate: string;
  status: CaptureGateStatus;
  reviewer: string;
  reviewed_at: string | null;
  notes: string | null;
}

export interface CaptureRisk {
  description: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
}

export interface CaptureActivity {
  id: string;
  capture_plan_id: string;
  opportunity_title: string;
  activity_type: CaptureActivityType;
  description: string;
  performed_by: string;
  performed_at: string;
  outcome: string | null;
}

export type CaptureActivityType =
  | "meeting"
  | "call"
  | "email"
  | "site_visit"
  | "research"
  | "gate_review"
  | "teaming_discussion"
  | "proposal_work";

// ---------------------------------------------------------------------------
// Approvals Queue types
// ---------------------------------------------------------------------------

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalCategory =
  | "qualify_write"
  | "bid_decision"
  | "doctrine_publish"
  | "gate_review"
  | "teaming_agreement"
  | "deploy"
  | "budget_override";

export type ApprovalPriority = "critical" | "high" | "medium" | "low";

export interface ApprovalItem {
  id: string;
  title: string;
  description: string;
  category: ApprovalCategory;
  priority: ApprovalPriority;
  status: ApprovalStatus;
  requester: string;
  assignee: string;
  correlation_id: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
  dry_run_result: ApprovalDryRunResult | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

export interface ApprovalDryRunResult {
  checks: ApprovalCheck[];
  overall: "pass" | "warn" | "fail";
  correlation_id: string;
  ran_at: string;
}

export interface ApprovalCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

// ---------------------------------------------------------------------------
// Compliance Matrix types
// ---------------------------------------------------------------------------

export type ComplianceStatus = "compliant" | "partial" | "gap" | "not_applicable";

export type ComplianceCategory =
  | "technical"
  | "management"
  | "past_performance"
  | "cost_price"
  | "certifications"
  | "security"
  | "small_business"
  | "other";

export type ClauseType = "far" | "dfars" | "agency" | "custom";

export interface ComplianceRequirement {
  id: string;
  solicitation_id: string;
  solicitation_title: string;
  section: string;
  requirement: string;
  category: ComplianceCategory;
  status: ComplianceStatus;
  evidence: string | null;
  responsible_party: string;
  notes: string | null;
  related_clause_ids: string[];
  updated_at: string;
}

export interface ClauseReference {
  id: string;
  clause_number: string;
  title: string;
  type: ClauseType;
  full_text: string;
  summary: string;
  applicability: string[];
  common_pitfalls: string[];
  related_clauses: string[];
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Proposal Review types
// ---------------------------------------------------------------------------

export type ProposalStatus =
  | "draft"
  | "in_review"
  | "red_team"
  | "final"
  | "submitted"
  | "archived";

export type ProposalVolumeType =
  | "technical"
  | "management"
  | "past_performance"
  | "cost_price"
  | "executive_summary"
  | "cover_letter"
  | "other";

export interface ProposalVolume {
  id: string;
  type: ProposalVolumeType;
  title: string;
  page_count: number;
  word_count: number;
  compliance_score: number;
  last_editor: string;
  updated_at: string;
}

export interface RedTeamFinding {
  id: string;
  severity: "critical" | "major" | "minor" | "observation";
  section: string;
  finding: string;
  recommendation: string;
  status: "open" | "addressed" | "accepted_risk";
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ProposalScorecard {
  criteria: string;
  weight: number;
  score: number;
  max_score: number;
  notes: string;
  evaluator: string;
}

export interface ProposalTimeline {
  id: string;
  milestone: string;
  due_date: string;
  status: "completed" | "on_track" | "at_risk" | "overdue";
  owner: string;
  notes: string | null;
}

export interface Proposal {
  id: string;
  title: string;
  solicitation_id: string;
  solicitation_title: string;
  agency: string;
  status: ProposalStatus;
  value_estimated: number;
  due_date: string;
  submission_date: string | null;
  capture_manager: string;
  proposal_manager: string;
  volumes: ProposalVolume[];
  red_team_findings: RedTeamFinding[];
  scorecard: ProposalScorecard[];
  timeline: ProposalTimeline[];
  compliance_score: number;
  overall_score: number;
  win_themes: string[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Contacts & Relationships types
// ---------------------------------------------------------------------------

export type ContactStatus = "active" | "inactive" | "prospect";

export type RelationshipStrength = "strong" | "moderate" | "weak" | "new";

export type MeetingType = "in_person" | "virtual" | "phone" | "conference";

export interface MeetingNote {
  id: string;
  date: string;
  type: MeetingType;
  subject: string;
  attendees: string[];
  topics: string[];
  action_items: ActionItem[];
  notes: string;
}

export interface ActionItem {
  description: string;
  owner: string;
  due_date: string | null;
  status: "open" | "completed" | "overdue";
}

export interface ContactRelationship {
  contact_id: string;
  contact_name: string;
  relationship_type: "peer" | "supervisor" | "subordinate" | "stakeholder" | "champion";
  strength: RelationshipStrength;
  notes: string | null;
}

export interface LinkedOpportunity {
  opportunity_id: string;
  opportunity_title: string;
  role: string;
  agency: string;
  status: string;
  value_estimated: number;
}

export interface TeamingRecord {
  partner_name: string;
  role: "prime" | "sub" | "mentor" | "jv_partner";
  status: "active" | "past" | "prospective";
  capability: string;
  past_collaborations: string[];
  assessment: string;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  agency: string;
  department: string;
  email: string;
  phone: string;
  status: ContactStatus;
  relationship_strength: RelationshipStrength;
  last_contact_date: string;
  relationship_history: string;
  meeting_notes: MeetingNote[];
  relationships: ContactRelationship[];
  linked_opportunities: LinkedOpportunity[];
  teaming_records: TeamingRecord[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Reporting & Export types
// ---------------------------------------------------------------------------

export type ReportCategory =
  | "pipeline"
  | "bd_performance"
  | "executive_summary"
  | "sitrep"
  | "financial"
  | "compliance";

export type ReportStatus =
  | "completed"
  | "generating"
  | "scheduled"
  | "failed";

export type ExportFormat = "pdf" | "excel" | "pptx" | "csv";

export interface ReportTemplate {
  id: string;
  name: string;
  category: ReportCategory;
  description: string;
  sections: ReportSection[];
  default_format: ExportFormat;
  available_formats: ExportFormat[];
  estimated_pages: number;
  last_used: string | null;
  use_count: number;
  created_by: string;
  tags: string[];
}

export interface ReportSection {
  id: string;
  title: string;
  description: string;
  included: boolean;
  order: number;
}

export interface GeneratedReport {
  id: string;
  template_id: string;
  template_name: string;
  category: ReportCategory;
  title: string;
  status: ReportStatus;
  format: ExportFormat;
  generated_at: string;
  generated_by: string;
  file_size_bytes: number | null;
  page_count: number | null;
  sections_included: string[];
  parameters: Record<string, string>;
  download_url: string | null;
  expires_at: string | null;
  notes: string | null;
}

export interface ScheduledReport {
  id: string;
  template_id: string;
  template_name: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  next_run: string;
  last_run: string | null;
  recipients: string[];
  format: ExportFormat;
  enabled: boolean;
  created_by: string;
}

export interface ExportJob {
  id: string;
  source_page: string;
  format: ExportFormat;
  status: ReportStatus;
  started_at: string;
  completed_at: string | null;
  file_size_bytes: number | null;
  download_url: string | null;
  row_count: number | null;
  correlation_id: string;
}

// ---------------------------------------------------------------------------
// RFP Shredder types (Phase G)
// ---------------------------------------------------------------------------

export type ShredJobStatus = "completed" | "processing" | "failed" | "queued";

export type RequirementType =
  | "technical"
  | "management"
  | "past_performance"
  | "cost_price"
  | "security"
  | "certifications"
  | "small_business"
  | "compliance"
  | "staffing"
  | "transition";

export type RequirementComplexity = "simple" | "moderate" | "complex";

export type ComplianceMatchLevel = "full" | "partial" | "none";

export interface ShredJob {
  id: string;
  solicitation_id: string;
  solicitation_title: string;
  agency: string;
  file_name: string;
  file_size_bytes: number;
  page_count: number;
  status: ShredJobStatus;
  requirements_found: number;
  sections_parsed: string[];
  started_at: string;
  completed_at: string | null;
  processing_time_seconds: number | null;
  correlation_id: string;
  error_message: string | null;
}

export interface ExtractedRequirement {
  id: string;
  shred_job_id: string;
  section: string;
  requirement_text: string;
  requirement_type: RequirementType;
  complexity: RequirementComplexity;
  keyword: string;
  far_references: string[];
  compliance_match: ComplianceMatchLevel;
  matched_evidence: string | null;
  matched_document_id: string | null;
  matched_document_title: string | null;
  page_number: number;
  confidence: number;
}

export interface ComplianceMapEntry {
  requirement_id: string;
  section: string;
  requirement_text: string;
  requirement_type: RequirementType;
  match_level: ComplianceMatchLevel;
  matched_records: Array<{
    document_id: string;
    document_title: string;
    section: string;
    relevance: number;
    excerpt: string;
  }>;
  gap_notes: string | null;
  suggested_approach: string | null;
}

export interface ResponseOutlineSection {
  id: string;
  section_number: string;
  title: string;
  requirements_covered: string[];
  recommended_approach: string;
  past_performance_citations: string[];
  page_estimate: number;
  complexity: RequirementComplexity;
  status: "draft_available" | "needs_new_content" | "reuse_available";
}
