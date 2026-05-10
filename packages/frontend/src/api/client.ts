const API_BASE = "/api";

interface GDAEnvelope<T> {
  success: boolean;
  workflow: string;
  action: string;
  dryRun: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: { code: string; message: string; detail: string | null } | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<GDAEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<GDAEnvelope<T>>;
}

// Health check row — supports both mock (name/durationMs) and live (id/label/path/http/ms/bytes/tone) shapes
export interface QACheckRow {
  // Mock fields
  name?: string;
  status: string;
  message?: string;
  durationMs?: number;
  // Live n8n fields
  id?: string;
  label?: string;
  path?: string;
  http?: number;
  ms?: number;
  bytes?: number;
  tone?: string;
  error?: string | null;
}

export interface QAHealthSummary {
  total: number;
  passed: number;
  failed: number;
  warned?: number;
  authFails?: number;
  empty?: number;
  notConfigured?: number;
}

export interface QAHealthData {
  overall: string;
  summary: QAHealthSummary;
  rows: QACheckRow[];
  nextAction: string;
  source?: "mock" | "live";
}

// Failure row — supports both mock and live (n8n execution) shapes
export interface QAFailure {
  // Mock fields
  id?: string;
  workflow?: string;
  action?: string;
  errorCode?: string;
  errorMessage?: string;
  occurredAt?: string;
  resolved?: boolean;
  // Live n8n fields
  workflowName?: string;
  workflowId?: string;
  failedNode?: string;
  message?: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface QAFailuresData {
  rows: QAFailure[];
  source?: "mock" | "live";
}

export interface WorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number | null;
  updatedAt: string | null;
}

export interface WorkflowRegistryData {
  source: string;
  summary: { total: number; active: number };
  workflows: WorkflowSummary[];
}

export interface GatewayHealthData {
  status: string;
  uptimeSec: number;
  pid: number;
  nodeVersion: string;
  config: {
    webhookConfigured: boolean;
    apiConfigured: boolean;
    dbConfigured: boolean;
    missingForWebhook: string[];
    missingForApi: string[];
    missingForDb: string[];
  };
  db: { ok: boolean; latencyMs: number; error?: string } | null;
}

export function fetchQAHealth() {
  return request<QAHealthData>("/qa/health");
}

export function fetchQALatestFailures() {
  return request<QAFailuresData>("/qa/latest-failures");
}

export function fetchWorkflowRegistry() {
  return request<WorkflowRegistryData>("/workflows/registry");
}

export async function fetchGatewayHealth(): Promise<GDAEnvelope<GatewayHealthData>> {
  const res = await fetch("/health");
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<GDAEnvelope<GatewayHealthData>>;
}

// --- Opportunities ---

export interface OpportunityRow {
  id: string;
  title: string;
  agency: string | null;
  department: string | null;
  status: string;
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

export interface OpportunitiesData {
  opportunities: OpportunityRow[];
  source: "mock" | "db" | "n8n";
}

export interface QualifyResultData {
  opportunity_id: string;
  title: string;
  prev_status: string;
  new_status: string;
  qualified_at: string;
  correlation_id: string;
  would_write?: boolean;
  gates?: { dryRun: boolean; approve: boolean; writesEnabled: boolean };
}

export interface OpportunityQueryParams {
  search?: string;
  status?: string;
  department?: string;
  minPwin?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function fetchOpportunities(params: OpportunityQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.department) qs.set("department", params.department);
  if (params.minPwin !== undefined) qs.set("minPwin", String(params.minPwin));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const query = qs.toString();
  return request<OpportunitiesData>(`/opportunities${query ? `?${query}` : ""}`);
}

export interface PipelineQueryParams {
  search?: string;
  department?: string;
  minPwin?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function fetchPipelineOpportunities(params: PipelineQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.department) qs.set("department", params.department);
  if (params.minPwin !== undefined) qs.set("minPwin", String(params.minPwin));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const query = qs.toString();
  return request<OpportunitiesData>(`/opportunities/pipeline${query ? `?${query}` : ""}`);
}

export function qualifyOpportunity(id: string, dryRun = true, approve = false) {
  return request<QualifyResultData>(`/opportunities/${id}/qualify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun, approve }),
  });
}

// --- Opportunity Detail (S-009) ---

export interface OpportunityDetailAnalysis {
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
  type: string;
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
  priority: string;
}

export interface OodaBlock {
  observe: { summary: string; items: OodaObserveItem[] };
  orient: { summary: string; items: OodaOrientItem[] };
  decide: { summary: string; options: OodaDecideOption[] };
  act: { summary: string; next_steps: OodaActStep[] };
}

export interface OpportunitySourceRow {
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

export interface OpportunityLearningData {
  learning_notes: string | null;
  feedback_submitted: boolean;
  feedback_at: string | null;
  source_count: number;
  coverage_gaps: string[];
  next_review_at: string | null;
}

export interface OpportunityDetailData {
  opportunity: OpportunityRow;
  analysis: OpportunityDetailAnalysis;
  ooda: OodaBlock;
  sources: OpportunitySourceRow[];
  learning: OpportunityLearningData;
  source: "mock" | "db";
}

export function fetchOpportunityDetail(id: string) {
  return request<OpportunityDetailData>(`/opportunities/${id}/detail`);
}

// --- Dashboard KPIs ---

export interface DashboardFunnelStage {
  stage: string;
  count: number;
  totalValue: number;
  avgPwin: number;
  avgScore: number;
}

export interface DashboardKPIs {
  totalOpportunities: number;
  totalPipelineValue: number;
  avgPwin: number;
  avgScore: number;
  funnel: DashboardFunnelStage[];
  topByScore: OpportunityRow[];
  source: "mock" | "db" | "n8n";
  n8nKpis?: {
    pursueCount: number;
    evaluateCount: number;
    monitorCount: number;
    weightedPipeline: string;
  };
  captureStages?: Array<{ stage: string; count: number; valueM: number }>;
  analysisStatus?: { available: boolean; message: string };
  ftSignals?: unknown[];
}

export function fetchDashboardKPIs() {
  return request<DashboardKPIs>("/dashboard/kpis");
}

// --- Command Signals ---

export interface CommandRisk {
  plan_id: string;
  opportunity_title: string;
  agency: string;
  description: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
}

export interface CommandDecision {
  plan_id: string;
  opportunity_title: string;
  agency: string;
  phase: string;
  pwin: number;
  value_estimated: number;
  next_deadline: string | null;
  next_milestone: string | null;
}

export interface CommandDueSoon {
  plan_id: string;
  opportunity_title: string;
  milestone_id: string;
  title: string;
  due_date: string;
  status: string;
  owner: string;
}

export interface CommandAccelerator {
  opportunity_title: string;
  signal: string;
  urgency: "high" | "medium" | "low";
}

export interface CommandSignalsData {
  activeRisks: CommandRisk[];
  upcomingDecisions: CommandDecision[];
  dueSoonItems: CommandDueSoon[];
  accelerators: CommandAccelerator[];
  approvalsSummary: { pending: number; critical: number };
  captureSource: "n8n" | "mock";
}

export function fetchCommandSignals() {
  return request<CommandSignalsData>("/dashboard/command-signals");
}

// --- Doctrine Automation ---

export interface DoctrineDraftRow {
  id: string;
  sprint_id: string;
  component: string;
  doc_type: string;
  title: string;
  status: string;
  source_pr_number: number | null;
  source_pr_url: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoctrineStatusCounts {
  draft: number;
  finalized: number;
  superseded: number;
  blocked: number;
}

export interface DoctrineDraftsData {
  drafts: DoctrineDraftRow[];
  total: number;
  filtered: number;
  sprints: string[];
  statusCounts: DoctrineStatusCounts;
  source: "mock" | "db";
}

export interface DoctrineDraftDetailData {
  draft: DoctrineDraftRow;
  source: "mock" | "db";
}

export interface GateCheckResultRow {
  name: string;
  status: "pass" | "fail" | "skip";
  message: string;
  required: boolean;
}

export interface DoctrinePublishRunRow {
  id: string;
  sprint_id: string;
  trigger_type: string;
  status: string;
  gate_results: GateCheckResultRow[] | null;
  commit_sha: string | null;
  reason: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface DoctrinePublishRunsData {
  runs: DoctrinePublishRunRow[];
  total: number;
  source: "mock" | "db";
}

export interface DoctrineFinalizeData {
  sprintId: string;
  status: "success" | "blocked";
  correlationId: string;
  draftsCount: number;
  draftsFinalized?: string[];
  gateResults: GateCheckResultRow[];
  commitSha: string | null;
  reason: string | null;
  dryRun: boolean;
  note?: string;
}

export interface DoctrineDraftsQueryParams {
  sprint?: string;
  component?: string;
  doc_type?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function fetchDoctrineDrafts(params: DoctrineDraftsQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.sprint) qs.set("sprint", params.sprint);
  if (params.component) qs.set("component", params.component);
  if (params.doc_type) qs.set("doc_type", params.doc_type);
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const query = qs.toString();
  return request<DoctrineDraftsData>(`/doctrine/drafts${query ? `?${query}` : ""}`);
}

export function fetchDoctrineDraft(id: string) {
  return request<DoctrineDraftDetailData>(`/doctrine/drafts/${id}`);
}

export function fetchDoctrinePublishRuns(sprint?: string) {
  const qs = sprint ? `?sprint=${sprint}` : "";
  return request<DoctrinePublishRunsData>(`/doctrine/publish-runs${qs}`);
}

export function finalizeDoctrineSprint(sprintId: string) {
  return request<DoctrineFinalizeData>("/doctrine/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sprintId }),
  });
}

// --- Settings ---

export interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  description: string;
}

export interface ConnectorStatus {
  name: string;
  configured: boolean;
  missing: string[];
  latencyMs?: number;
  error?: string;
}

export interface SettingsData {
  connectors: ConnectorStatus[];
  featureFlags: FeatureFlag[];
  environment: {
    nodeVersion: string;
    uptimeSec: number;
    pid: number;
    port: string;
    env: string;
  };
}

export function fetchSettings() {
  return request<SettingsData>("/settings");
}

// --- Financials ---

export interface FinancialKPI {
  key: string;
  label: string;
  current: number;
  prior: number;
  plan: number;
  unit: "currency" | "percent" | "ratio";
  period: string;
  updated_at: string;
}

export interface FinancialKPIsData {
  kpis: FinancialKPI[];
  period: string;
  source: "mock" | "db" | "n8n";
}

export interface FinancialLineItem {
  id: string;
  kpi_key: string;
  label: string;
  amount: number;
  category: string;
  contract_id: string | null;
  period: string;
  notes: string | null;
}

export interface FinancialTrend {
  period: string;
  value: number;
}

export interface FinancialDrillDownData {
  kpi: FinancialKPI;
  line_items: FinancialLineItem[];
  trends: FinancialTrend[];
  variance_from_plan: number;
  variance_pct: number;
  insights: string[];
  source: "mock" | "db" | "n8n";
}

export function fetchFinancialKPIs() {
  return request<FinancialKPIsData>("/financials/kpis");
}

export function fetchFinancialDrillDown(key: string) {
  return request<FinancialDrillDownData>(`/financials/${key}`);
}

// ---------------------------------------------------------------------------
// Approvals Queue
// ---------------------------------------------------------------------------

export interface ApprovalCheckRow {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface ApprovalDryRunRow {
  checks: ApprovalCheckRow[];
  overall: "pass" | "warn" | "fail";
  correlation_id: string;
  ran_at: string;
}

export interface ApprovalRow {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  requester: string;
  assignee: string;
  correlation_id: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
  dry_run_result: ApprovalDryRunRow | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
}

export interface ApprovalsData {
  approvals: ApprovalRow[];
  total: number;
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    expired: number;
    critical: number;
    expiringSoon: number;
  };
  categories: Record<string, number>;
  source: "mock" | "db" | "n8n";
}

export interface ApprovalResolveData {
  approval_id: string;
  previous_status?: string;
  proposed_action?: string;
  current_status?: string;
  would_change_to?: string;
  new_status?: string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_notes?: string | null;
  dry_run_result?: ApprovalDryRunRow | null;
  correlation_id: string;
}

export function fetchApprovals(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<ApprovalsData>(`/approvals${qs}`);
}

export function resolveApproval(id: string, action: "approve" | "reject", notes?: string, dryRun = true) {
  return request<ApprovalResolveData>(`/approvals/${id}/resolve?dryRun=${dryRun}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, notes }),
  });
}

// ---------------------------------------------------------------------------
// Compliance Matrix
// ---------------------------------------------------------------------------

export interface ComplianceRequirementRow {
  id: string;
  solicitation_id: string;
  solicitation_title: string;
  section: string;
  requirement: string;
  category: string;
  status: string;
  evidence: string | null;
  responsible_party: string;
  notes: string | null;
  related_clause_ids: string[];
  updated_at: string;
}

export interface ComplianceSolicitation {
  id: string;
  title: string;
}

export interface ComplianceRequirementsData {
  requirements: ComplianceRequirementRow[];
  total: number;
  filtered: number;
  summary: {
    compliant: number;
    partial: number;
    gap: number;
    not_applicable: number;
    score: number;
  };
  solicitations: ComplianceSolicitation[];
  categories: Record<string, number>;
  source: "mock" | "db" | "n8n";
}

export interface ClauseReferenceRow {
  id: string;
  clause_number: string;
  title: string;
  type: string;
  full_text: string;
  summary: string;
  applicability: string[];
  common_pitfalls: string[];
  related_clauses: string[];
  last_updated: string;
}

export interface ClauseLibraryData {
  clauses: ClauseReferenceRow[];
  total: number;
  filtered: number;
  typeCounts: Record<string, number>;
  source: "mock" | "db" | "n8n";
}

export interface ClauseDetailData {
  clause: ClauseReferenceRow;
  source: "mock" | "db" | "n8n";
}

export function fetchComplianceRequirements(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<ComplianceRequirementsData>(`/compliance/requirements${qs}`);
}

export function fetchClauseLibrary(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<ClauseLibraryData>(`/compliance/clauses${qs}`);
}

export function fetchClauseDetail(id: string) {
  return request<ClauseDetailData>(`/compliance/clauses/${id}`);
}

// ---------------------------------------------------------------------------
// Proposal Review
// ---------------------------------------------------------------------------

export interface ProposalVolumeRow {
  id: string;
  type: string;
  title: string;
  page_count: number;
  word_count: number;
  compliance_score: number;
  last_editor: string;
  updated_at: string;
}

export interface RedTeamFindingRow {
  id: string;
  severity: string;
  section: string;
  finding: string;
  recommendation: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ProposalScorecardRow {
  criteria: string;
  weight: number;
  score: number;
  max_score: number;
  notes: string;
  evaluator: string;
}

export interface ProposalTimelineRow {
  id: string;
  milestone: string;
  due_date: string;
  status: string;
  owner: string;
  notes: string | null;
}

export interface ProposalRow {
  id: string;
  title: string;
  solicitation_id: string;
  solicitation_title: string;
  agency: string;
  status: string;
  value_estimated: number;
  due_date: string;
  submission_date: string | null;
  capture_manager: string;
  proposal_manager: string;
  volumes: ProposalVolumeRow[];
  red_team_findings: RedTeamFindingRow[];
  scorecard: ProposalScorecardRow[];
  timeline: ProposalTimelineRow[];
  compliance_score: number;
  overall_score: number;
  win_themes: string[];
  created_at: string;
  updated_at: string;
}

export interface ProposalsData {
  proposals: ProposalRow[];
  total: number;
  filtered: number;
  summary: {
    statusCounts: Record<string, number>;
    totalValue: number;
    avgCompliance: number;
    totalRedTeamOpen: number;
    agencies: string[];
  };
  source: "mock" | "db" | "n8n";
}

export interface ProposalDetailData {
  proposal: ProposalRow;
  source: "mock" | "db" | "n8n";
}

export function fetchProposals(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<ProposalsData>(`/proposals${qs}`);
}

export function fetchProposalDetail(id: string) {
  return request<ProposalDetailData>(`/proposals/${id}`);
}

// ---------------------------------------------------------------------------
// Contacts & Relationships
// ---------------------------------------------------------------------------

export interface ActionItemRow {
  description: string;
  owner: string;
  due_date: string | null;
  status: "open" | "completed" | "overdue";
}

export interface MeetingNoteRow {
  id: string;
  date: string;
  type: string;
  subject: string;
  attendees: string[];
  topics: string[];
  action_items: ActionItemRow[];
  notes: string;
}

export interface ContactRelationshipRow {
  contact_id: string;
  contact_name: string;
  relationship_type: string;
  strength: string;
  notes: string | null;
}

export interface LinkedOpportunityRow {
  opportunity_id: string;
  opportunity_title: string;
  role: string;
  agency: string;
  status: string;
  value_estimated: number;
}

export interface TeamingRecordRow {
  partner_name: string;
  role: string;
  status: string;
  capability: string;
  past_collaborations: string[];
  assessment: string;
}

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  agency: string;
  department: string;
  email: string;
  phone: string;
  status: string;
  relationship_strength: string;
  last_contact_date: string;
  relationship_history: string;
  meeting_notes: MeetingNoteRow[];
  relationships: ContactRelationshipRow[];
  linked_opportunities: LinkedOpportunityRow[];
  teaming_records: TeamingRecordRow[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ContactsData {
  contacts: ContactRow[];
  total: number;
  filtered: number;
  summary: {
    statusCounts: Record<string, number>;
    strengthCounts: Record<string, number>;
    activeRelationships: number;
    pendingMeetings: number;
    teamingGaps: number;
    agencies: string[];
  };
  source: "mock" | "db" | "n8n";
}

export interface ContactDetailData {
  contact: ContactRow;
  source: "mock" | "db" | "n8n";
}

export function fetchContacts(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<ContactsData>(`/contacts${qs}`);
}

export function fetchContactDetail(id: string) {
  return request<ContactDetailData>(`/contacts/${id}`);
}

// ---------------------------------------------------------------------------
// Reports & Export
// ---------------------------------------------------------------------------

export interface ReportSection {
  id: string;
  title: string;
  description: string;
  included: boolean;
  order: number;
}

export interface ReportTemplateRow {
  id: string;
  name: string;
  category: string;
  description: string;
  sections: ReportSection[];
  default_format: string;
  available_formats: string[];
  estimated_pages: number;
  last_used: string | null;
  use_count: number;
  created_by: string;
  tags: string[];
}

export interface GeneratedReportRow {
  id: string;
  template_id: string;
  template_name: string;
  category: string;
  title: string;
  status: string;
  format: string;
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

export interface ScheduledReportRow {
  id: string;
  template_id: string;
  template_name: string;
  frequency: string;
  next_run: string;
  last_run: string | null;
  recipients: string[];
  format: string;
  enabled: boolean;
  created_by: string;
}

export interface ExportJobRow {
  id: string;
  source_page: string;
  format: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  file_size_bytes: number | null;
  download_url: string | null;
  row_count: number | null;
  correlation_id: string;
}

export interface ReportTemplatesData {
  templates: ReportTemplateRow[];
  total: number;
  filtered: number;
  summary: {
    categoryCounts: Record<string, number>;
    totalUses: number;
    categories: number;
  };
  source: "mock" | "n8n";
}

export interface GeneratedReportsData {
  reports: GeneratedReportRow[];
  total: number;
  filtered: number;
  summary: {
    statusCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    totalSizeBytes: number;
  };
  source: "mock" | "n8n";
}

export interface ScheduledReportsData {
  schedules: ScheduledReportRow[];
  total: number;
  summary: { enabled: number; disabled: number };
  source: "mock" | "n8n";
}

export interface ExportJobsData {
  exports: ExportJobRow[];
  total: number;
  source: "mock" | "n8n";
}

export interface GenerateReportResult {
  status: string;
  correlation_id: string;
  template_id: string;
  template_name: string;
  format: string;
  sections_included: string[];
  estimated_pages: number;
  message: string;
}

export interface ExportResult {
  status: string;
  correlation_id: string;
  source_page: string;
  format: string;
  message: string;
}

export function fetchReportTemplates(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<ReportTemplatesData>(`/reports/templates${qs}`);
}

export function fetchReportTemplateDetail(id: string) {
  return request<{ template: ReportTemplateRow; source: string }>(`/reports/templates/${id}`);
}

export function fetchGeneratedReports(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<GeneratedReportsData>(`/reports/generated${qs}`);
}

export function triggerReportGeneration(body: {
  template_id: string;
  format?: string;
  sections?: string[];
}) {
  return request<GenerateReportResult>("/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchScheduledReports() {
  return request<ScheduledReportsData>("/reports/scheduled");
}

export function fetchExportJobs() {
  return request<ExportJobsData>("/reports/exports");
}

export function triggerExport(body: { source_page: string; format: string }) {
  return request<ExportResult>("/reports/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Enrichments — Pwin, Recommendations, Competitors, Search, Notifications
// ---------------------------------------------------------------------------

export interface PwinFactor {
  name: string;
  weight: number;
  score: number;
  weighted_score: number;
  rationale: string;
}

export interface PwinBreakdownData {
  opp_id: string;
  overall_pwin: number;
  factors: PwinFactor[];
  historical_win_rate: number;
  confidence: "high" | "medium" | "low";
  last_calculated: string;
  methodology: string;
  source: "mock" | "n8n";
}

export function fetchPwinBreakdown(oppId: string) {
  return request<PwinBreakdownData>(`/enrichments/pwin/${oppId}`);
}

export interface SmartRecommendation {
  id: string;
  opp_id: string;
  type: "action" | "risk" | "opportunity" | "insight";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  deadline: string | null;
  source: string;
}

export interface RecommendationsData {
  recommendations: SmartRecommendation[];
  total: number;
  source: "mock" | "n8n";
}

export function fetchRecommendations(oppId?: string) {
  const qs = oppId ? `?opp_id=${oppId}` : "";
  return request<RecommendationsData>(`/enrichments/recommendations${qs}`);
}

export interface IncumbentData {
  opp_id: string;
  incumbent_name: string;
  contract_number: string;
  contract_value: number;
  contract_start: string;
  contract_end: string;
  performance_rating: string;
  recompete_advantage: number;
  strengths: string[];
  weaknesses: string[];
  key_personnel: Array<{ name: string; role: string; years_on_contract: number }>;
  protest_risk: string;
  notes: string;
  source: "mock" | "n8n";
}

export function fetchIncumbentAnalysis(oppId: string) {
  return request<IncumbentData>(`/enrichments/incumbent/${oppId}`);
}

export interface CompetitorEntry {
  id: string;
  name: string;
  threat_level: "high" | "medium" | "low";
  estimated_pwin: number;
  strengths: string[];
  weaknesses: string[];
  likely_teaming: string[];
  recent_wins: number;
  size_status: string;
  notes: string;
}

export interface CompetitorFieldData {
  opp_id: string;
  competitors: CompetitorEntry[];
  our_position: number;
  total_expected_bidders: number;
  market_analysis: string;
  source: "mock" | "n8n";
}

export function fetchCompetitorField(oppId: string) {
  return request<CompetitorFieldData>(`/enrichments/competitors/${oppId}`);
}

export interface BlackHatScenario {
  competitor: string;
  likely_strategy: string;
  technical_approach: string;
  pricing_strategy: string;
  teaming_strategy: string;
  discriminators: string[];
  vulnerabilities: string[];
  counter_strategy: string;
}

export interface BlackHatAnalysisData {
  opp_id: string;
  scenarios: BlackHatScenario[];
  our_discriminators: string[];
  key_takeaways: string[];
  source: "mock" | "n8n";
}

export function fetchBlackHatAnalysis(oppId: string) {
  return request<BlackHatAnalysisData>(`/enrichments/blackhat/${oppId}`);
}

export interface WargameScenario {
  id: string;
  name: string;
  probability: number;
  description: string;
  our_move: string;
  competitor_response: string;
  outcome: string;
  risk_level: "high" | "medium" | "low";
}

export interface WargameAnalysisData {
  opp_id: string;
  scenarios: WargameScenario[];
  recommended_strategy: string;
  confidence: number;
  source: "mock" | "n8n";
}

export function fetchWargameAnalysis(oppId: string) {
  return request<WargameAnalysisData>(`/enrichments/wargame/${oppId}`);
}

export interface IntelModule {
  id: string;
  capture_plan_id: string;
  module_type: "market" | "competitor" | "customer" | "technical" | "pricing";
  title: string;
  status: "complete" | "in_progress" | "pending";
  findings: string[];
  sources: string[];
  last_updated: string;
  confidence: number;
  action_items: string[];
}

export interface IntelModulesData {
  modules: IntelModule[];
  total: number;
  source: "mock" | "n8n";
}

export function fetchIntelModules(capturePlanId?: string) {
  const qs = capturePlanId ? `?capture_plan_id=${capturePlanId}` : "";
  return request<IntelModulesData>(`/enrichments/intel-modules${qs}`);
}

export interface TeamingCandidate {
  id: string;
  company_name: string;
  size_status: string;
  cage_code: string;
  capabilities: string[];
  past_performance_score: number;
  relationship_strength: "strong" | "moderate" | "new";
  geographic_coverage: string[];
  clearance_level: string;
  teaming_score: number;
  rationale: string;
  risks: string[];
  recommended_role: string;
}

export interface TeamingData {
  opp_id: string;
  candidates: TeamingCandidate[];
  gaps_identified: string[];
  recommended_team: string[];
  source: "mock" | "n8n";
}

export function fetchTeamingCandidates(oppId: string) {
  return request<TeamingData>(`/enrichments/teaming/${oppId}`);
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  score: number;
  snippet: string;
  path: string;
}

export interface SearchData {
  query: string;
  results: SearchResult[];
  total: number;
  source: "mock" | "n8n";
}

export function fetchSearchResults(query: string) {
  return request<SearchData>("/enrichments/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

export interface NotificationItem {
  id: string;
  type: "deadline" | "milestone" | "approval" | "intel" | "risk" | "system";
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link: string | null;
  source: string;
}

export interface NotificationsData {
  notifications: NotificationItem[];
  total: number;
  unread: number;
  source: "mock" | "n8n";
}

export function fetchNotifications(unreadOnly?: boolean) {
  const qs = unreadOnly ? "?unread=true" : "";
  return request<NotificationsData>(`/enrichments/notifications${qs}`);
}

// --- Prompts ---

export interface PromptRow {
  id: string;
  title: string;
  category: string;
  description: string;
  body: string;
  tags: string[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt: string | null;
  starred: boolean;
  status: "active" | "draft" | "archived";
}

export interface PromptsSummary {
  total: number;
  filtered: number;
  active: number;
  draft: number;
  archived: number;
  starred: number;
  categories: string[];
  tags: string[];
}

export interface PromptsData {
  prompts: PromptRow[];
  summary: PromptsSummary;
  source: "mock" | "db" | "n8n";
}

export interface PromptVersion {
  version: number;
  body: string;
  changedBy: string;
  changedAt: string;
  changeNote: string;
}

export interface PromptUsage {
  id: string;
  promptId: string;
  usedBy: string;
  usedAt: string;
  context: string;
  outcome: "success" | "partial" | "failed" | null;
  notes: string | null;
}

export interface PromptDetailData {
  prompt: PromptRow;
  versions: PromptVersion[];
  usage: PromptUsage[];
  source: "mock" | "db" | "n8n";
}

export interface PromptQueryParams {
  search?: string;
  category?: string;
  status?: string;
  tag?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function fetchPrompts(params: PromptQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.status) qs.set("status", params.status);
  if (params.tag) qs.set("tag", params.tag);
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  const query = qs.toString();
  return request<PromptsData>(`/prompts${query ? `?${query}` : ""}`);
}

export function fetchPromptDetail(id: string) {
  return request<PromptDetailData>(`/prompts/${id}`);
}

export interface RecentUsageData {
  usage: PromptUsage[];
  total: number;
  source: "mock" | "db" | "n8n";
}

export function fetchRecentUsage() {
  return request<RecentUsageData>("/prompts/usage");
}

// ---------------------------------------------------------------------------
// Fast Track
// ---------------------------------------------------------------------------
export interface FastTrackSource {
  source_id: string;
  type: string;
  title: string;
  url: string | null;
  publisher: string;
  published_at: string;
  retrieved_at: string;
  claim_support: string;
}

export interface FastTrackMatch {
  id: string;
  status: "new" | "reviewing" | "watching" | "promoted" | "discarded";
  signal_type: string;
  signal_summary: string;
  technology: string;
  company_name: string;
  company_role: "internal" | "partner" | "target" | "competitor" | "unknown";
  candidate_agency: string | null;
  candidate_requirement: string | null;
  contract_path_hypothesis: string;
  match_score: number;
  recommended_next_action: string;
  safety_lane: "read-only" | "dry-run";
  sources: FastTrackSource[];
  created_at: string;
  updated_at: string;
  technology_tags: string[];
  company_url: string | null;
  incumbent_or_competitor_context: string | null;
  buyer_problem: string | null;
  next_review_at: string | null;
  promotion_target: string | null;
}

export interface FastTrackSummaryData {
  new_count: number;
  reviewing_count: number;
  watching_count: number;
  promoted_count: number;
  discarded_count: number;
  needs_attention_count: number;
  total_count: number;
}

export interface FastTrackListData {
  matches: FastTrackMatch[];
  meta: { count: number; filtersApplied: Record<string, string> };
}

export interface FastTrackDetailData {
  match: FastTrackMatch;
  analysis: {
    executive_summary: string;
    why_it_matters: string;
    risks_or_gaps: string[];
  } | null;
  ooda: {
    observe: string[];
    orient: string[];
    decide: string;
    act: string;
  } | null;
  sources: FastTrackSource[];
  learning: {
    notes: string[];
    reserved: boolean;
  };
}

export function fetchFastTrackSummary() {
  return request<FastTrackSummaryData>("/fast-track/summary");
}

export interface FastTrackQueryParams {
  status?: string;
  signal_type?: string;
  technology?: string;
  company_role?: string;
  min_match_score?: string;
  search?: string;
}

export function fetchFastTrackMatches(params: FastTrackQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.signal_type) qs.set("signal_type", params.signal_type);
  if (params.technology) qs.set("technology", params.technology);
  if (params.company_role) qs.set("company_role", params.company_role);
  if (params.min_match_score) qs.set("min_match_score", params.min_match_score);
  if (params.search) qs.set("search", params.search);
  const query = qs.toString();
  return request<FastTrackListData>(`/fast-track/matches${query ? `?${query}` : ""}`);
}

export function fetchFastTrackDetail(id: string) {
  return request<FastTrackDetailData>(`/fast-track/${id}`);
}

// ---------------------------------------------------------------------------
// Knowledge Base (Phase F)
// ---------------------------------------------------------------------------

export interface KnowledgeSummaryData {
  total_documents: number;
  indexed_count: number;
  processing_count: number;
  total_chunks: number;
  total_access_count: number;
  collection_count: number;
  top_documents: Array<{ id: string; title: string; access_count: number }>;
}

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  document_count: number;
  total_chunks: number;
  last_updated: string;
  icon: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  type: string;
  status: string;
  file_name: string;
  file_size_bytes: number;
  pages: number | null;
  chunks_indexed: number;
  uploaded_at: string;
  indexed_at: string | null;
  last_accessed: string | null;
  access_count: number;
  collection: string;
  tags: string[];
  metadata: {
    agency?: string;
    contract_number?: string;
    naics?: string;
    period_of_performance?: string;
    solicitation_number?: string;
    author?: string;
  };
  summary: string;
}

export interface KnowledgeSearchResult {
  document_id: string;
  document_title: string;
  document_type: string;
  collection: string;
  chunks: Array<{
    chunk_id: string;
    text: string;
    page: number | null;
    section: string | null;
    similarity_score?: number;
  }>;
  relevance_score: number;
  highlight: string;
}

export interface KnowledgeSearchData {
  query: string;
  results: KnowledgeSearchResult[];
  total_results: number;
}

export interface ChatMessageSource {
  document_id: string;
  document_title: string;
  chunk_text: string;
  page: number | null;
  relevance: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: ChatMessageSource[];
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  last_message: string;
}

export interface ChatSessionDetail {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  context?: string;
}

export interface ChatResponseData {
  session_id: string;
  message: ChatMessage;
}

export interface UploadResponseData {
  id: string;
  file_name: string;
  document_type: string;
  collection: string;
  tags: string[];
  status: string;
  message: string;
  estimated_processing_time: string;
  pipeline: string;
}

export function fetchKnowledgeSummary() {
  return request<KnowledgeSummaryData>("/knowledge/summary");
}

export function fetchKnowledgeCollections() {
  return request<KnowledgeCollection[]>("/knowledge/collections");
}

export interface KnowledgeDocumentQueryParams {
  collection?: string;
  type?: string;
  status?: string;
  search?: string;
  sort?: string;
}

export function fetchKnowledgeDocuments(params: KnowledgeDocumentQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.collection) qs.set("collection", params.collection);
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  return request<KnowledgeDocument[]>(`/knowledge/documents${query ? `?${query}` : ""}`);
}

export function fetchKnowledgeDocument(id: string) {
  return request<KnowledgeDocument>(`/knowledge/documents/${id}`);
}

export function searchKnowledge(query: string, limit = 10) {
  const qs = new URLSearchParams({ q: query, limit: String(limit) });
  return request<KnowledgeSearchData>(`/knowledge/search?${qs}`);
}

export function fetchChatSessions() {
  return request<ChatSessionSummary[]>("/knowledge/chat/sessions");
}

export function fetchChatSession(id: string) {
  return request<ChatSessionDetail>(`/knowledge/chat/sessions/${id}`);
}

export function sendChatMessage(message: string, sessionId?: string) {
  return request<ChatResponseData>("/knowledge/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
}

export function uploadDocument(fileName: string, documentType?: string, collection?: string, tags?: string[]) {
  return request<UploadResponseData>("/knowledge/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: fileName, document_type: documentType, collection, tags }),
  });
}

// --- RFP Shredder ---

export interface ShredJobRow {
  id: string;
  solicitation_id: string;
  solicitation_title: string;
  agency: string;
  file_name: string;
  file_size_bytes: number;
  page_count: number;
  status: "completed" | "processing" | "failed" | "queued";
  requirements_found: number;
  sections_parsed: string[];
  started_at: string;
  completed_at: string | null;
  processing_time_seconds: number | null;
  correlation_id: string;
  error_message: string | null;
}

export interface ShredJobsSummary {
  total: number;
  completed: number;
  processing: number;
  failed: number;
  queued: number;
  total_requirements: number;
  total_pages: number;
}

export interface ShredJobsData {
  jobs: ShredJobRow[];
  summary: ShredJobsSummary;
}

export interface ExtractedRequirementRow {
  id: string;
  shred_job_id: string;
  section: string;
  requirement_text: string;
  requirement_type: string;
  complexity: "simple" | "moderate" | "complex";
  keyword: string;
  far_references: string[];
  compliance_match: "full" | "partial" | "none";
  matched_evidence: string | null;
  matched_document_id: string | null;
  matched_document_title: string | null;
  page_number: number;
  confidence: number;
}

export interface RequirementsSummary {
  total: number;
  full_match: number;
  partial_match: number;
  no_match: number;
  by_type: Record<string, number>;
  by_complexity: Record<string, number>;
  avg_confidence: number;
}

export interface RequirementsData {
  requirements: ExtractedRequirementRow[];
  summary: RequirementsSummary;
}

export interface ComplianceMapRecord {
  document_id: string;
  document_title: string;
  section: string;
  relevance: number;
  excerpt: string;
}

export interface ComplianceMapEntryRow {
  requirement_id: string;
  section: string;
  requirement_text: string;
  requirement_type: string;
  match_level: "full" | "partial" | "none";
  matched_records: ComplianceMapRecord[];
  gap_notes: string | null;
  suggested_approach: string | null;
}

export interface ComplianceMapSummary {
  total: number;
  full_match: number;
  partial_match: number;
  no_match: number;
  coverage_score: number;
}

export interface ComplianceMapData {
  job_id: string;
  solicitation_title: string;
  entries: ComplianceMapEntryRow[];
  summary: ComplianceMapSummary;
}

export interface ResponseOutlineSectionRow {
  id: string;
  section_number: string;
  title: string;
  requirements_covered: string[];
  recommended_approach: string;
  past_performance_citations: string[];
  page_estimate: number;
  complexity: "simple" | "moderate" | "complex";
  status: "draft_available" | "needs_new_content" | "reuse_available";
}

export interface ResponseOutlineSummary {
  total_sections: number;
  total_page_estimate: number;
  reuse_available: number;
  draft_available: number;
  needs_new_content: number;
}

export interface ResponseOutlineData {
  job_id: string;
  solicitation_title: string;
  sections: ResponseOutlineSectionRow[];
  summary: ResponseOutlineSummary;
}

export interface ShredInitData {
  id: string;
  file_name: string;
  solicitation_title: string;
  agency: string;
  status: string;
  correlation_id: string;
  message: string;
  estimated_processing_time: string;
  pipeline: string;
}

export interface RequirementQueryParams {
  job_id?: string;
  type?: string;
  complexity?: string;
  match?: string;
  search?: string;
  sort?: string;
}

export function fetchShredJobs(params: { status?: string; search?: string; agency?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.agency) qs.set("agency", params.agency);
  const query = qs.toString();
  return request<ShredJobsData>(`/rfp-shredder/jobs${query ? `?${query}` : ""}`);
}

export function fetchShredJob(id: string) {
  return request<ShredJobRow>(`/rfp-shredder/jobs/${id}`);
}

export function fetchShredRequirements(params: RequirementQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.job_id) qs.set("job_id", params.job_id);
  if (params.type) qs.set("type", params.type);
  if (params.complexity) qs.set("complexity", params.complexity);
  if (params.match) qs.set("match", params.match);
  if (params.search) qs.set("search", params.search);
  if (params.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  return request<RequirementsData>(`/rfp-shredder/requirements${query ? `?${query}` : ""}`);
}

export function fetchComplianceMap(jobId: string) {
  return request<ComplianceMapData>(`/rfp-shredder/compliance-map/${jobId}`);
}

export function fetchResponseOutline(jobId: string) {
  return request<ResponseOutlineData>(`/rfp-shredder/response-outline/${jobId}`);
}

export function initiateShred(fileName: string, solicitationTitle: string, agency?: string) {
  return request<ShredInitData>("/rfp-shredder/shred", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: fileName, solicitation_title: solicitationTitle, agency }),
  });
}

// ---------------------------------------------------------------------------
// Phase I — Predictive Analytics
// ---------------------------------------------------------------------------

export interface PwinFeatureClient {
  name: string;
  value: string;
  importance: number;
  impact: "positive" | "negative" | "neutral";
  benchmark: string;
}

export interface PwinImprovementClient {
  action: string;
  estimated_pwin_lift: number;
  effort: "low" | "medium" | "high";
  deadline: string | null;
}

export interface PwinModelData {
  opp_id: string;
  opp_title: string;
  agency: string;
  ml_pwin: number;
  static_pwin: number;
  confidence_interval: { lower: number; upper: number };
  confidence_level: "high" | "medium" | "low";
  model_version: string;
  last_updated: string;
  features: PwinFeatureClient[];
  improvement_actions: PwinImprovementClient[];
  similar_opps_won: number;
  similar_opps_lost: number;
  trend: "improving" | "stable" | "declining";
  trend_delta: number;
}

export interface PwinModelsListData {
  models: PwinModelData[];
  total: number;
}

export function fetchPwinModels() {
  return request<PwinModelsListData>("/predictive/pwin-models");
}

export function fetchPwinModel(oppId: string) {
  return request<PwinModelData>(`/predictive/pwin-models/${oppId}`);
}

export interface MonthlyForecastClient {
  month: string;
  p10: number;
  p50: number;
  p90: number;
  target: number;
  actuals: number | null;
}

export interface ForecastContributorClient {
  opp_id: string;
  title: string;
  agency: string;
  value: number;
  pwin: number;
  weighted_value: number;
  expected_close: string;
  status: "pursue" | "evaluate" | "capture" | "proposal";
}

export interface ForecastRiskClient {
  id: string;
  risk: string;
  impact_revenue: number;
  probability: number;
  mitigation: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface ForecastScenarioClient {
  label: string;
  revenue: number;
  probability: number;
}

export interface PipelineForecastData {
  summary: {
    total_pipeline: number;
    weighted_pipeline: number;
    p10_revenue: number;
    p50_revenue: number;
    p90_revenue: number;
    annual_target: number;
    gap_to_target: number;
    pipeline_coverage_ratio: number;
    simulations_run: number;
    model_version: string;
    last_updated: string;
  };
  monthly: MonthlyForecastClient[];
  scenarios: ForecastScenarioClient[];
  risk_factors: ForecastRiskClient[];
  top_contributors: ForecastContributorClient[];
}

export function fetchPipelineForecast() {
  return request<PipelineForecastData>("/predictive/forecast");
}

export interface BidFactorClient {
  category: string;
  score: number;
  weight: number;
  weighted_score: number;
  notes: string;
  signal: "green" | "amber" | "red";
}

export interface BidAssessmentData {
  opp_id: string;
  opp_title: string;
  agency: string;
  value: number;
  recommendation: "bid" | "no_bid" | "watch";
  overall_score: number;
  factors: BidFactorClient[];
  rationale: string;
  resource_impact: string;
  strategic_alignment: "high" | "medium" | "low";
  assessed_at: string;
}

export interface BidAssessmentsListData {
  assessments: BidAssessmentData[];
  total: number;
  bid: number;
  no_bid: number;
  watch: number;
}

export function fetchBidAssessments() {
  return request<BidAssessmentsListData>("/predictive/bid-assessments");
}

export function fetchBidAssessment(oppId: string) {
  return request<BidAssessmentData>(`/predictive/bid-assessments/${oppId}`);
}

export interface WinLossPatternClient {
  id: string;
  category: string;
  insight: string;
  detail: string;
  confidence: number;
  sample_size: number;
  direction: "positive" | "negative" | "neutral";
  actionable: boolean;
}

export interface AgencyPerfClient {
  agency: string;
  wins: number;
  losses: number;
  win_rate: number;
  total_value_won: number;
  avg_pwin_accuracy: number;
  trend: "improving" | "declining" | "stable";
}

export interface PwinCalibrationClient {
  range: string;
  predicted_win_rate: number;
  actual_win_rate: number;
  count: number;
  calibration: "accurate" | "overconfident" | "underconfident";
}

export interface QuarterlyTrendClient {
  quarter: string;
  wins: number;
  losses: number;
  win_rate: number;
  avg_contract_value: number;
  total_pipeline: number;
}

export interface WinLossAnalysisData {
  summary: {
    total_opportunities: number;
    total_wins: number;
    total_losses: number;
    overall_win_rate: number;
    avg_pwin_accuracy: number;
    total_value_won: number;
    total_value_lost: number;
    model_calibration: "well_calibrated" | "overconfident" | "underconfident";
    analysis_period: string;
    last_updated: string;
  };
  patterns: WinLossPatternClient[];
  agency_performance: AgencyPerfClient[];
  pwin_calibration: PwinCalibrationClient[];
  quarterly_trends: QuarterlyTrendClient[];
}

export function fetchWinLossAnalysis() {
  return request<WinLossAnalysisData>("/predictive/win-loss");
}

// ---------------------------------------------------------------------------
// Color Review
// ---------------------------------------------------------------------------

export interface ColorReviewRequirementCheckRow {
  id: string;
  requirement_id: string;
  requirement_text: string;
  source_reference: string;
  verdict: "pass" | "fail" | "warning" | "not_reviewed";
  response_location: string | null;
  gap_detail: string | null;
  suggestion: string | null;
}

export interface ColorReviewSectionScoreRow {
  id: string;
  section: string;
  volume: string;
  score: number;
  max_score: number;
  strengths: string[];
  weaknesses: string[];
  discriminators_found: string[];
  discriminators_missing: string[];
  improvement_actions: string[];
  evaluator_notes: string;
}

export interface ColorReviewGoldCheckRow {
  id: string;
  category: string;
  label: string;
  verdict: "pass" | "fail" | "warning" | "not_reviewed";
  score: number;
  max_score: number;
  detail: string;
  recommendations: string[];
}

export interface ColorReviewCostLineItemRow {
  id: string;
  category: string;
  proposed_amount: number;
  government_estimate: number | null;
  variance_pct: number | null;
  verdict: "pass" | "fail" | "warning" | "not_reviewed";
  basis_of_estimate: string;
  notes: string;
}

export interface ColorReviewGreenCheckRow {
  id: string;
  area: string;
  label: string;
  verdict: "pass" | "fail" | "warning" | "not_reviewed";
  detail: string;
  benchmark: string | null;
  recommendation: string | null;
}

export interface ColorReviewFormatCheckRow {
  id: string;
  category: string;
  label: string;
  verdict: "pass" | "fail" | "warning" | "not_reviewed";
  expected: string;
  actual: string;
  volume: string;
  detail: string | null;
}

export interface ColorReviewRow {
  id: string;
  proposal_id: string;
  proposal_title: string;
  agency: string;
  phase: "pink" | "red" | "gold" | "green" | "white";
  status: "pending" | "in_progress" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  overall_score: number;
  max_score: number;
  pass_rate: number;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  warning_checks: number;
  reviewer: string;
  summary: string;
  go_no_go: "go" | "conditional_go" | "no_go" | null;
  confidence: number | null;
  requirement_checks: ColorReviewRequirementCheckRow[];
  section_scores: ColorReviewSectionScoreRow[];
  gold_checks: ColorReviewGoldCheckRow[];
  cost_line_items: ColorReviewCostLineItemRow[];
  green_checks: ColorReviewGreenCheckRow[];
  format_checks: ColorReviewFormatCheckRow[];
  risk_factors: string[];
  created_at: string;
  updated_at: string;
}

export interface ColorReviewData {
  reviews: ColorReviewRow[];
  total: number;
  filtered: number;
  summary: {
    phaseCounts: Record<string, number>;
    statusCounts: Record<string, number>;
    avgScore: number;
    goCount: number;
    conditionalGoCount: number;
    noGoCount: number;
    proposalsReviewed: number;
  };
  source: "mock" | "n8n";
}

export function fetchColorReviews() {
  return request<ColorReviewData>("/color-review");
}

export function runColorReview(proposal_id: string, phase: string) {
  return request<{ correlationId: string; proposal_id: string; phase: string; status: string; message: string }>("/color-review/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal_id, phase }),
  });
}
