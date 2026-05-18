import { authenticatedFetch } from "./auth";

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
  const res = await authenticatedFetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<GDAEnvelope<T>>;
}

/** Chat/AI requests get an AbortController so a hung LLM call doesn't freeze the UI forever. */
const CHAT_TIMEOUT_MS = 65_000; // slightly longer than backend LLM timeout

function requestWithTimeout<T>(path: string, init?: RequestInit): Promise<GDAEnvelope<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  const merged: RequestInit = { ...init, signal: controller.signal };
  return request<T>(path, merged).finally(() => clearTimeout(timer));
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
  source?: "db" | "live";
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
  source?: "db" | "live";
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
  const res = await authenticatedFetch("/health");
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
  naics_size?: "small" | "large" | null;
  psc: string | null;
  due_date: string | null;
  solicitation_number: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  incumbent: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  description: string | null;
  capture_stage?: string | null;
  tags: string[];
  raw_source_url: string | null;
  data_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunitiesData {
  opportunities: OpportunityRow[];
  source: "db" | "n8n";
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
  naics_size?: string;
  minPwin?: number;
  includeLowFit?: boolean;
  includeAllStatuses?: boolean;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export function fetchOpportunities(params: OpportunityQueryParams = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.department) qs.set("department", params.department);
  if (params.naics_size) qs.set("naics_size", params.naics_size);
  if (params.minPwin !== undefined) qs.set("minPwin", String(params.minPwin));
  if (params.includeLowFit) qs.set("includeLowFit", "true");
  if (params.includeAllStatuses) qs.set("includeAllStatuses", "true");
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.sortDir) qs.set("sortDir", params.sortDir);
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.pageSize !== undefined) qs.set("pageSize", String(params.pageSize));
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

export function fetchNoBidOpportunities() {
  return request<OpportunitiesData>("/opportunities/no-bid");
}

export function approveOpportunity(id: string, approvedBy = "user") {
  return request<{ id: string; title: string; approved_at: string; approved_by: string }>(`/opportunities/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved_by: approvedBy }),
  });
}

export function qualifyOpportunity(id: string, dryRun = true, approve = false) {
  return request<QualifyResultData>(`/opportunities/${id}/qualify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun, approve }),
  });
}

export const SHIPLEY_STAGES = [
  { value: "interest", label: "Interest", color: "#6b7280" },
  { value: "qualify", label: "Qualify", color: "#3b82f6" },
  { value: "pursue", label: "Pursue", color: "#22c55e" },
  { value: "solicitation", label: "Solicitation", color: "#f59e0b" },
  { value: "post_submittal", label: "Post Submittal", color: "#8b5cf6" },
  { value: "won", label: "Won", color: "#22c55e" },
  { value: "lost", label: "Lost", color: "#ef4444" },
  { value: "no_bid", label: "No Bid", color: "#9ca3af" },
  { value: "gov_cancelled", label: "Gov Cancelled", color: "#9ca3af" },
] as const;

export function changeOpportunityStage(id: string, stage: string) {
  return request<{ opportunity_id: string; new_stage: string; new_status: string }>(`/opportunities/${id}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
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
  resource_url?: string | null;
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
  source: "db" | "n8n";
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
  activePipeline?: number;
  totalPipelineValue: number;
  avgPwin: number;
  avgScore: number;
  funnel: DashboardFunnelStage[];
  topByScore: OpportunityRow[];
  source: "db" | "n8n";
  countSource?: string;
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

// --- Dashboard Mega (live n8n data) ---

export interface DashboardMega {
  status: string;
  cached_at?: string;
  funnel: Array<{ stage: string; count: number; value: number; ord?: number }>;
  risks: Array<{ title: string; severity: string; category: string; status: string }>;
  stats: Record<string, unknown>;
  trends: Array<Record<string, unknown>>;
  contracts: Array<Record<string, unknown>>;
  opps: Array<Record<string, unknown>>;
  sitrep: unknown;
  source: string;
}

export function fetchDashboardMega() {
  return request<DashboardMega>("/dashboard/mega");
}

// --- Command Signals ---

export interface CommandRisk {
  plan_id: string;
  opportunity_id?: string;
  opportunity_title: string;
  agency: string;
  description: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
}

export interface CommandDecision {
  plan_id: string;
  opportunity_id?: string;
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
  opportunity_id?: string;
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
  captureSource: "n8n" | "db";
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
  source: "db";
}

export interface DoctrineDraftDetailData {
  draft: DoctrineDraftRow;
  source: "db";
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
  source: "db";
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
  webhookRegistry?: {
    total: number;
    live: number;
    exists: number;
    planned: number;
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
}

export function fetchFinancialKPIs() {
  return request<FinancialKPIsData>("/financials/kpis");
}

export function fetchFinancialDrillDown(key: string) {
  return request<FinancialDrillDownData>(`/financials/${key}`);
}

export interface MonthlyFinancial {
  month: number;
  label: string;
  revenue: number;
  directCosts: number;
  indirectCosts: number;
  grossProfit: number;
  ebit: number;
  orders: number;
  fundedBacklog: number;
  headcount: number;
  revenueTarget: number;
  grossProfitTarget: number;
  ebitTarget: number;
  ordersTarget: number;
}

export interface MonthlyFinancialsData {
  months: MonthlyFinancial[];
  year: number;
  ytd: {
    revenue: number;
    directCosts: number;
    indirectCosts: number;
    grossProfit: number;
    ebit: number;
    orders: number;
  };
  annualTargets: Record<string, number>;
}

export function fetchMonthlyFinancials(year?: number) {
  const qs = year ? `?year=${year}` : "";
  return request<MonthlyFinancialsData>(`/financials/monthly${qs}`);
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
  data_source: string | null;
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
}

export interface ClauseDetailData {
  clause: ClauseReferenceRow;
  source: "db" | "n8n";
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
  win_theme_details?: WinThemeDetailRow[];
  storyboard?: StoryboardEntryRow[];
  outline?: OutlineEntryRow[];
  linked_opportunity_id?: string | null;
  linked_shred_job_id?: string | null;
}

export interface WinThemeDetailRow {
  id: string;
  theme: string;
  description: string;
  evidence: string;
}

export interface StoryboardEntryRow {
  id: string;
  section_id: string;
  section_title: string;
  volume_type: string;
  win_themes: string[];
  key_points: string[];
  compliance_reqs: string[];
  status: string;
}

export interface OutlineEntryRow {
  id: string;
  volume_type: string;
  title: string;
  sections: { id: string; title: string; description: string }[];
}

export interface ProposalSectionRow {
  id: string;
  proposal_id: string;
  volume_type: string;
  title: string;
  sort_order: number;
  content: string;
  ai_generated: boolean;
  status: string;
  word_count: number;
  notes: string | null;
  assigned_to: string | null;
  compliance_req_ids: string[];
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
  source: "db" | "n8n";
}

export interface ProposalDetailData {
  proposal: ProposalRow;
  sections: ProposalSectionRow[];
  source: "db" | "n8n";
}

export function fetchProposals(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<ProposalsData>(`/proposals${qs}`);
}

export function fetchProposalDetail(id: string) {
  return request<ProposalDetailData>(`/proposals/${id}`);
}

export function createProposal(data: {
  title: string;
  agency: string;
  solicitation_id?: string;
  solicitation_title?: string;
  value_estimated?: number;
  due_date?: string;
  capture_manager?: string;
  proposal_manager?: string;
  win_themes?: string[];
  win_theme_details?: WinThemeDetailRow[];
  linked_opportunity_id?: string;
  linked_shred_job_id?: string;
}) {
  return request<{ proposal: ProposalRow }>("/proposals", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
}

export function updateProposal(id: string, data: Partial<ProposalRow>) {
  return request<{ proposal: ProposalRow }>(`/proposals/${id}`, { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
}

export function deleteProposal(id: string) {
  return request<{ deleted: string }>(`/proposals/${id}`, { method: "DELETE" });
}

export function createProposalSection(proposalId: string, data: { volume_type?: string; title: string; content?: string; sort_order?: number; assigned_to?: string; compliance_req_ids?: string[]; status?: string }) {
  return request<{ section: ProposalSectionRow }>(`/proposals/${proposalId}/sections`, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
}

export function updateProposalSection(proposalId: string, sectionId: string, data: Partial<ProposalSectionRow>) {
  return request<{ section: ProposalSectionRow }>(`/proposals/${proposalId}/sections/${sectionId}`, { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
}

export function deleteProposalSection(proposalId: string, sectionId: string) {
  return request<{ deleted: string }>(`/proposals/${proposalId}/sections/${sectionId}`, { method: "DELETE" });
}

export function deleteAllProposalSections(proposalId: string) {
  return request<{ deleted: number }>(`/proposals/${proposalId}/sections`, { method: "DELETE" });
}

export function applyProposalOutline(proposalId: string, sections: Array<{ volume_type: string; title: string; content?: string; sort_order?: number; status?: string }>) {
  return request<{ sections: ProposalSectionRow[]; count: number }>(`/proposals/${proposalId}/apply-outline`, { method: "POST", body: JSON.stringify({ sections }), headers: { "Content-Type": "application/json" } });
}

export function generateProposalOutline(proposalId: string) {
  return request<{ outline: OutlineEntryRow[]; model: string; tier: string }>(`/proposals/${proposalId}/generate-outline`, { method: "POST", headers: { "Content-Type": "application/json" } });
}

export function generateSectionContent(proposalId: string, sectionId: string, instructions?: string) {
  return request<{ content: string; wordCount: number; model: string }>(`/proposals/${proposalId}/sections/${sectionId}/generate`, { method: "POST", body: JSON.stringify({ instructions }), headers: { "Content-Type": "application/json" } });
}

export function transformSectionContent(proposalId: string, sectionId: string, action: string, customPrompt?: string) {
  return request<{ content: string; wordCount: number; action: string; model: string }>(`/proposals/${proposalId}/sections/${sectionId}/transform`, { method: "POST", body: JSON.stringify({ action, custom_prompt: customPrompt }), headers: { "Content-Type": "application/json" } });
}

export function generateStoryboard(proposalId: string) {
  return request<{ storyboard: StoryboardEntryRow[]; model: string }>(`/proposals/${proposalId}/generate-storyboard`, { method: "POST", headers: { "Content-Type": "application/json" } });
}

// Document import into section
export function importDocumentToSection(proposalId: string, sectionId: string, file: File, mode: "replace" | "append" = "replace") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  return request<{ content: string; wordCount: number; fileName: string; fileSize: number; mode: string }>(`/proposals/${proposalId}/sections/${sectionId}/import`, { method: "POST", body: formData });
}

// Version history
export interface SectionVersionRow {
  id: string;
  section_id: string;
  version_number: number;
  content: string;
  word_count: number;
  change_summary: string | null;
  changed_by: string;
  created_at: string;
}

export function fetchSectionVersions(proposalId: string, sectionId: string) {
  return request<{ versions: SectionVersionRow[] }>(`/proposals/${proposalId}/sections/${sectionId}/versions`);
}

export function saveSectionVersion(proposalId: string, sectionId: string, changeSummary?: string) {
  return request<{ id: string; version_number: number; word_count: number }>(`/proposals/${proposalId}/sections/${sectionId}/versions`, { method: "POST", body: JSON.stringify({ change_summary: changeSummary }), headers: { "Content-Type": "application/json" } });
}

export function restoreSectionVersion(proposalId: string, sectionId: string, versionId: string) {
  return request<{ restored_version: number; content: string; word_count: number }>(`/proposals/${proposalId}/sections/${sectionId}/restore`, { method: "POST", body: JSON.stringify({ version_id: versionId }), headers: { "Content-Type": "application/json" } });
}

// Compliance mapping (RFP requirements vs response)
export interface ComplianceMapRow {
  id: string;
  proposal_id: string;
  requirement_id: string | null;
  requirement_text: string;
  requirement_type: string;
  section_id: string | null;
  section_title: string | null;
  response_status: string;
  response_summary: string | null;
  sort_order: number;
}

export interface ComplianceMapStats {
  total: number;
  addressed: number;
  partial: number;
  not_addressed: number;
  non_compliant: number;
}

export function fetchProposalComplianceMap(proposalId: string) {
  return request<{ requirements: ComplianceMapRow[]; stats: ComplianceMapStats }>(`/proposals/${proposalId}/compliance-map`);
}

export function addComplianceRequirements(proposalId: string, requirements: Array<{ requirement_text: string; requirement_type?: string; section_id?: string; section_title?: string }>) {
  return request<{ created: Array<{ id: string; requirement_text: string }>; count: number }>(`/proposals/${proposalId}/compliance-map`, { method: "POST", body: JSON.stringify({ requirements }), headers: { "Content-Type": "application/json" } });
}

export function updateComplianceMapping(proposalId: string, reqId: string, data: { section_id?: string; section_title?: string; response_status?: string; response_summary?: string }) {
  return request<{ updated: string }>(`/proposals/${proposalId}/compliance-map/${reqId}`, { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
}

export function importComplianceFromShred(proposalId: string, shredJobId: string) {
  return request<{ imported: number; shred_job_id: string }>(`/proposals/${proposalId}/compliance-map/import-from-shred`, { method: "POST", body: JSON.stringify({ shred_job_id: shredJobId }), headers: { "Content-Type": "application/json" } });
}

// Export proposal
export function exportProposal(proposalId: string, format: "markdown" | "docx") {
  return authenticatedFetch(`${API_BASE}/proposals/${proposalId}/export?format=${format}`);
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
  source: "db" | "n8n";
}

export interface ContactDetailData {
  contact: ContactRow;
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
}

export interface ScheduledReportsData {
  schedules: ScheduledReportRow[];
  total: number;
  summary: { enabled: number; disabled: number };
  source: "db" | "n8n";
}

export interface ExportJobsData {
  exports: ExportJobRow[];
  total: number;
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  source: "db" | "n8n";
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
  data_source: string | null;
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
  source?: "pgvector" | "db";
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
  file_id?: string;
  file_name: string;
  document_type: string;
  collection: string;
  tags: string[];
  size_bytes?: number;
  mime_type?: string;
  status: string;
  download_url?: string;
  message: string;
  estimated_processing_time?: string;
  pipeline?: string;
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
  return requestWithTimeout<ChatResponseData>("/knowledge/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
}

export function uploadDocument(file: File, documentType?: string, collection?: string, tags?: string[], action?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (documentType) formData.append("document_type", documentType);
  if (collection) formData.append("collection", collection);
  if (tags && tags.length > 0) formData.append("tags", tags.join(","));
  if (action) formData.append("action", action);
  return request<UploadResponseData>("/knowledge/upload", {
    method: "POST",
    body: formData,
  });
}

export function uploadDocumentDryRun(fileName: string, documentType?: string, collection?: string, tags?: string[]) {
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

export function initiateShred(solicitationTitle: string, agency?: string, file?: File, documentText?: string) {
  const formData = new FormData();
  formData.append("solicitation_title", solicitationTitle);
  if (agency) formData.append("agency", agency);
  if (file) formData.append("file", file);
  if (documentText) formData.append("document_text", documentText);
  if (!file) formData.append("file_name", "pasted-text.txt");
  return request<ShredInitData>("/rfp-shredder/shred", {
    method: "POST",
    body: formData,
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
  data_source: string | null;
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
  data_source: string | null;
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

export interface ColorReviewBlueAssessmentRow {
  id: string;
  category: string;
  label: string;
  verdict: string;
  detail: string;
  evidence: string | null;
  recommendation: string | null;
}

export interface ColorReviewBlackHatFindingRow {
  id: string;
  competitor: string;
  area: string;
  assessment: string;
  threat_level: "high" | "medium" | "low";
  counter_strategy: string | null;
}

export interface ColorReviewRow {
  id: string;
  proposal_id: string;
  proposal_title: string;
  agency: string;
  phase: "blue" | "pink" | "red" | "green" | "gold" | "white" | "black_hat" | "white_glove";
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
  blue_assessments: ColorReviewBlueAssessmentRow[];
  black_hat_findings: ColorReviewBlackHatFindingRow[];
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
  source: "db" | "n8n";
}

export function fetchColorReviews() {
  return request<ColorReviewData>("/color-review");
}

export interface ColorReviewRunResult {
  reviewId: string;
  proposal_id: string;
  phase: string;
  status: string;
  proposal_title?: string;
  overall_score?: number;
  go_no_go?: string;
  confidence?: number;
  pass_rate?: number;
  total_checks?: number;
  passed_checks?: number;
  failed_checks?: number;
  warning_checks?: number;
  summary?: string;
  requirement_checks?: ColorReviewRequirementCheckRow[];
  section_scores?: ColorReviewSectionScoreRow[];
  gold_checks?: ColorReviewGoldCheckRow[];
  cost_line_items?: ColorReviewCostLineItemRow[];
  green_checks?: ColorReviewGreenCheckRow[];
  format_checks?: ColorReviewFormatCheckRow[];
  blue_assessments?: ColorReviewBlueAssessmentRow[];
  black_hat_findings?: ColorReviewBlackHatFindingRow[];
  risk_factors?: string[];
  file_id?: string;
  message?: string;
  ai?: { model: string; tokens: number };
}

export function runColorReviewWithFile(file: File, phase: string, proposalTitle?: string, agency?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("phase", phase);
  if (proposalTitle) formData.append("proposal_title", proposalTitle);
  if (agency) formData.append("agency", agency);
  return request<ColorReviewRunResult>("/color-review/run", {
    method: "POST",
    body: formData,
  });
}

export function runColorReviewWithText(proposalText: string, phase: string, proposalTitle?: string, agency?: string) {
  return request<ColorReviewRunResult>("/color-review/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proposal_text: proposalText, phase, proposal_title: proposalTitle, agency }),
  });
}

// ---------------------------------------------------------------------------
// Phase J — Anomaly Detection & Proactive Alerts
// ---------------------------------------------------------------------------

export interface AnomalyTrendPoint {
  date: string;
  value: number;
}

export interface AnomalyRow {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "active" | "acknowledged" | "resolved" | "dismissed";
  title: string;
  description: string;
  opportunity_id: string | null;
  opportunity_title: string | null;
  agency: string | null;
  detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  metric_name: string;
  metric_value: number;
  baseline_value: number;
  deviation_pct: number;
  trend: AnomalyTrendPoint[];
  root_cause: string | null;
  recommended_actions: string[];
  related_anomaly_ids: string[];
  source_workflow: string;
}

export interface AnomalyData {
  anomalies: AnomalyRow[];
  total: number;
  active: number;
  acknowledged: number;
  resolved: number;
  dismissed: number;
  critical: number;
  high: number;
  source: "db" | "n8n";
}

export function fetchAnomalies() {
  return request<AnomalyData>("/anomaly/anomalies");
}

export interface CompetitorMovementRow {
  id: string;
  competitor_name: string;
  movement_type: string;
  title: string;
  description: string;
  impact_assessment: string;
  threat_level: "critical" | "high" | "medium" | "low";
  affected_opportunities: string[];
  source: string;
  source_url: string | null;
  detected_at: string;
  verified: boolean;
}

export interface CompetitorMovementData {
  movements: CompetitorMovementRow[];
  total: number;
  competitors: number;
  critical: number;
  high: number;
  source: "db" | "n8n";
}

export function fetchCompetitorMovements() {
  return request<CompetitorMovementData>("/anomaly/competitor-movements");
}

export interface EscalationRuleRow {
  id: string;
  name: string;
  condition: string;
  priority: "critical" | "warning" | "info";
}

export interface EscalationRow {
  id: string;
  rule_id: string;
  rule_name: string;
  priority: "critical" | "warning" | "info";
  status: "open" | "in_progress" | "resolved" | "overdue";
  title: string;
  description: string;
  opportunity_id: string | null;
  opportunity_title: string | null;
  agency: string | null;
  triggered_at: string;
  due_date: string | null;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  days_overdue: number;
}

export interface EscalationData {
  escalations: EscalationRow[];
  total: number;
  open: number;
  in_progress: number;
  overdue: number;
  resolved: number;
  critical: number;
  source: "db" | "n8n";
}

export function fetchEscalations() {
  return request<EscalationData>("/anomaly/escalations");
}

export interface EscalationRulesData {
  rules: EscalationRuleRow[];
  total: number;
  source: "db" | "n8n";
}

export function fetchEscalationRules() {
  return request<EscalationRulesData>("/anomaly/escalation-rules");
}

export function createEscalationRule(data: { name: string; condition: string; priority: string; description?: string }) {
  return request<{ rule: EscalationRuleRow }>("/anomaly/escalation-rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function acknowledgeAnomaly(anomalyId: string) {
  return request<{ anomaly_id: string; status: string; message: string }>(`/anomaly/anomalies/${anomalyId}/acknowledge`, {
    method: "POST",
  });
}

export function resolveAnomaly(anomalyId: string) {
  return request<{ anomaly_id: string; status: string; message: string }>(`/anomaly/anomalies/${anomalyId}/resolve`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// SAM.gov Monitor
// ---------------------------------------------------------------------------

export interface SAMSummaryData {
  total: number;
  new_count: number;
  tracked_count: number;
  qualified_count: number;
  dismissed_count: number;
  avg_relevance: number;
  naics_matched: number;
  last_scan: string | null;
}

export interface SAMOpportunityRow {
  id: string;
  notice_id: string;
  title: string;
  agency: string;
  sub_agency: string | null;
  type: string;
  set_aside: string | null;
  naics: string;
  naics_description: string;
  psc: string | null;
  value_estimate: number | null;
  response_deadline: string | null;
  posted_date: string;
  place_of_performance: string | null;
  relevance_score: number;
  relevance_reasons: string[];
  ai_summary: string;
  scan_status: string;
  matched_naics: boolean;
  matched_keywords: string[];
  sam_url: string;
  created_at: string;
}

export interface SAMScanRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  opportunities_found: number;
  new_matches: number;
  naics_codes_scanned: string[];
  error: string | null;
}

export function fetchSAMSummary() {
  return request<SAMSummaryData>("/sam-monitor/summary");
}

export function fetchSAMOpportunities(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<SAMOpportunityRow[]>(`/sam-monitor/opportunities${qs}`);
}

export function fetchSAMScans() {
  return request<SAMScanRow[]>("/sam-monitor/scans");
}

export function triggerSAMScan() {
  return request<{ scan_id: string; message: string }>("/sam-monitor/scan", { method: "POST" });
}

export function qualifySAMOpportunity(id: string) {
  return request<{ id: string; message: string }>(`/sam-monitor/opportunities/${id}/qualify`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Discussions
// ---------------------------------------------------------------------------

export interface DiscussionSummaryData {
  total_threads: number;
  active: number;
  resolved: number;
  total_messages: number;
  participants: number;
  by_entity: Record<string, number>;
}

export interface DiscussionThreadRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_title: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string;
  participants: string[];
  is_resolved: boolean;
  tags: string[];
}

export interface DiscussionMessageRow {
  id: string;
  thread_id: string;
  author: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  reactions: Record<string, number>;
  mentions: string[];
  attachments: { name: string; url: string; type: string }[];
}

export function fetchDiscussionSummary() {
  return request<DiscussionSummaryData>("/discussions/summary");
}

export function fetchDiscussionThreads(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<DiscussionThreadRow[]>(`/discussions/threads${qs}`);
}

export function fetchDiscussionMessages(threadId: string) {
  return request<DiscussionMessageRow[]>(`/discussions/threads/${threadId}/messages`);
}

export function postDiscussionMessage(threadId: string, content: string) {
  return request<{ thread_id: string; message: string }>(`/discussions/threads/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

// ---------------------------------------------------------------------------
// CPARS / Past Performance Builder
// ---------------------------------------------------------------------------

export interface CPARSSummaryData {
  total: number;
  finalized: number;
  draft: number;
  in_review: number;
  submitted: number;
  total_value: number;
  exceptional: number;
  very_good: number;
  ai_generated: number;
}

export interface CPARSRecordRow {
  id: string;
  contract_number: string;
  contract_title: string;
  agency: string;
  period_of_performance: string;
  contract_value: number;
  status: string;
  overall_rating: string | null;
  quality_rating: string | null;
  schedule_rating: string | null;
  cost_rating: string | null;
  management_rating: string | null;
  narrative: string;
  ai_generated_narrative: string | null;
  key_accomplishments: string[];
  relevance_tags: string[];
  matched_opportunities: string[];
  evaluator: string | null;
  evaluation_date: string | null;
  created_at: string;
  updated_at: string;
}

export function fetchCPARSSummary() {
  return request<CPARSSummaryData>("/cpars/summary");
}

export function fetchCPARSRecords(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<CPARSRecordRow[]>(`/cpars/records${qs}`);
}

export function generateCPARSNarrative(id: string) {
  return request<{ id: string; message: string }>(`/cpars/records/${id}/generate-narrative`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// FPDS Award Monitor
// ---------------------------------------------------------------------------

export interface FPDSSummaryData {
  total_awards: number;
  total_value: number;
  competitor_awards: number;
  unique_competitors: number;
  recompete_candidates: number;
  avg_relevance: number;
}

export interface FPDSAwardRow {
  id: string;
  piid: string;
  title: string;
  agency: string;
  vendor: string;
  vendor_duns: string | null;
  award_amount: number;
  ceiling_amount: number | null;
  award_date: string;
  period_of_performance_start: string;
  period_of_performance_end: string;
  award_type: string;
  competition_type: string;
  naics: string;
  psc: string | null;
  place_of_performance: string | null;
  is_competitor: boolean;
  competitor_name: string | null;
  is_recompete_candidate: boolean;
  recompete_date: string | null;
  relevance_score: number;
  fpds_url: string;
  created_at: string;
}

export function fetchFPDSSummary() {
  return request<FPDSSummaryData>("/fpds/summary");
}

export function fetchFPDSAwards(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<FPDSAwardRow[]>(`/fpds/awards${qs}`);
}

// --- Backup Management ---

export interface BackupStatusData {
  backupDir: string;
  database: {
    size: string;
    tables: number;
    totalRows: number;
  };
  backups: {
    daily: string[];
    weekly: string[];
  };
}

export interface BackupCreateData {
  filename: string;
  sizeKB: number;
  path: string;
  createdAt: string;
}

export function fetchBackupStatus() {
  return request<BackupStatusData>("/backup/status");
}

export function createBackup() {
  return request<BackupCreateData>("/backup/create", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Admin / User Management
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminRole {
  id: string;
  label: string;
  description: string;
}

export interface AdminUsersData {
  users: AdminUser[];
  total: number;
  roles: string[];
}

export function fetchAdminUsers() {
  return request<AdminUsersData>("/admin/users");
}

export function fetchAdminRoles() {
  return request<{ roles: AdminRole[] }>("/admin/roles");
}

export function updateUserRole(userId: string, role: string) {
  return request<AdminUser>(`/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export function updateUserStatus(userId: string, is_active: boolean) {
  return request<AdminUser>(`/admin/users/${userId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active }),
  });
}

export function createUser(email: string, password: string, display_name: string, role: string) {
  return request<AdminUser>("/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name, role }),
  });
}

export function deleteUser(userId: string) {
  return request<{ id: string; deleted: boolean }>(`/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export function inviteUser(email: string, role: string) {
  return request<{ email: string; role: string; invite_url: string; message: string }>("/admin/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
}

export function fetchInvitations() {
  return request<{ invitations: Array<{ id: string; email: string; role: string; created_at: string; expires_at: string; accepted_at: string | null }>; total: number }>("/admin/invitations");
}

// ---------------------------------------------------------------------------
// Data Feeds (SAM.gov / FPDS)
// ---------------------------------------------------------------------------

export interface FeedInfo {
  id: string;
  name: string;
  source: string;
  configured: boolean;
  api_key_env: string | null;
  description: string;
  record_count?: number;
  last_sync?: string | null;
  last_status?: string | null;
  last_count?: number;
  recent_runs?: Array<{
    id: string;
    started_at: string;
    completed_at: string | null;
    status: string;
    opportunities_found: number;
    new_matches: number;
    error: string | null;
  }>;
}

export interface FeedStatusData {
  feeds: FeedInfo[];
}

export interface FeedSyncResult {
  feed: string;
  status: "success" | "error";
  fetched: number;
  upserted: number;
  errors: number;
  durationMs: number;
  error?: string;
}

export interface FeedSyncData {
  results: FeedSyncResult[];
  timestamp: string;
}

export interface FeedConfigData {
  naics_codes: string[];
  keywords: string[];
  sync_interval_hours: number;
}

export function fetchFeedStatus() {
  return request<FeedStatusData>("/feeds/status");
}

export function triggerFeedSync(feed?: "sam" | "fpds" | "all", daysBack?: number) {
  return request<FeedSyncData>("/feeds/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feed: feed ?? "all", days_back: daysBack ?? 30 }),
  });
}

export function fetchFeedConfig() {
  return request<FeedConfigData>("/feeds/config");
}

export function updateFeedConfig(config: Partial<FeedConfigData>) {
  return request<FeedConfigData>("/feeds/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

// ---------------------------------------------------------------------------
// Vector Embeddings
// ---------------------------------------------------------------------------

export interface EmbeddingStatsData {
  totalDocuments: number;
  embeddedDocuments: number;
  pendingDocuments: number;
  failedDocuments: number;
  totalChunks: number;
  embeddingAvailable: boolean;
}

export interface EmbedResult {
  total: number;
  embedded: number;
  failed: number;
  skipped: number;
}

export function fetchEmbeddingStats() {
  return request<EmbeddingStatsData>("/knowledge/embeddings/stats");
}

export function triggerEmbedAll() {
  return request<EmbedResult>("/knowledge/embeddings/generate", {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Email Notifications
// ---------------------------------------------------------------------------

export interface EmailStatusData {
  configured: boolean;
  smtp_host: string | null;
  total_sent: number;
  total_failed: number;
  recent: Array<{
    id: string;
    recipient_email: string;
    subject: string;
    template: string;
    status: string;
    created_at: string;
  }>;
}

export interface EmailPreferencesData {
  email_notifications_enabled: boolean;
  email_digest_enabled: boolean;
  email_digest_frequency: string;
  notification_categories: string[];
  email_configured?: boolean;
}

export interface EmailTestResult {
  connected?: boolean;
  sent?: boolean;
  to?: string;
  error?: string;
}

export function fetchEmailStatus() {
  return request<EmailStatusData>("/email/status");
}

export function testSmtpConnection() {
  return request<EmailTestResult>("/email/test", { method: "POST" });
}

export function sendTestEmail(to: string) {
  return request<EmailTestResult>("/email/send-test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to }),
  });
}

export function fetchEmailPreferences() {
  return request<EmailPreferencesData>("/email/preferences");
}

export function updateEmailPreferences(prefs: Partial<EmailPreferencesData>) {
  return request<EmailPreferencesData>("/email/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
}

// ---------------------------------------------------------------------------
// Quick Entry — fast create endpoints
// ---------------------------------------------------------------------------

export function quickCreateOpportunity(data: {
  title: string;
  agency?: string;
  department?: string;
  value_estimated?: number;
}) {
  return request<{ id: string; title: string }>("/opportunities/quick-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function quickCreateContact(data: {
  first_name: string;
  last_name: string;
  title?: string;
  agency?: string;
  email?: string;
  phone?: string;
}) {
  return request<{ id: string; name: string }>("/contacts/quick-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function quickCreateDiscussionThread(data: {
  title: string;
  entity_type: string;
  tags?: string[];
}) {
  return request<{ thread_id: string; title: string }>("/discussions/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function quickCreateNote(data: {
  title: string;
  content?: string;
  tags?: string[];
}) {
  return request<{ id: string; title: string }>("/knowledge/quick-create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Dashboard Layout ──────────────────────────────────────────────

export interface WidgetLayout {
  id: string;
  visible: boolean;
  order: number;
}

export function fetchDashboardLayout() {
  return request<{ layout: WidgetLayout[] | null }>("/dashboard-layout/layout");
}

export function saveDashboardLayout(layout: WidgetLayout[]) {
  return request<{ saved: boolean }>("/dashboard-layout/layout", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layout }),
  });
}

export function resetDashboardLayout() {
  return request<{ reset: boolean }>("/dashboard-layout/layout", {
    method: "DELETE",
  });
}

// ── Audit Log ──────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditStats {
  totalEntries: number;
  topActions: { action: string; count: number }[];
  topUsers: { user_email: string; count: number }[];
  recentActivity: { date: string; count: number }[];
}

export function fetchAuditLog(page = 1, limit = 50, action?: string, resourceType?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (action) params.set("action", action);
  if (resourceType) params.set("resource_type", resourceType);
  return request<{ entries: AuditEntry[]; total: number; page: number; limit: number; totalPages: number }>(
    `/audit?${params}`
  );
}

export function fetchAuditStats() {
  return request<AuditStats>("/audit/stats");
}

// --- AI Chat ---

export function askOpportunityChat(opportunityId: string, question: string, history: { role: string; content: string }[]) {
  return requestWithTimeout<{ answer: string }>("/ai/opportunity-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunityId, question, history }),
  });
}

// --- Fast Track Promote ---

export function promoteFastTrack(matchId: string) {
  return request<{ opportunityId: string | null }>("/fast-track/promote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId }),
  });
}

// --- Book of Truths / Data Dictionary ---

export interface BookOfTruthsFieldRow {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface BookOfTruthsEntityRow {
  id: string;
  name: string;
  category: "entity" | "rule" | "glossary" | "source" | "faq" | "policy" | "product" | "goal" | "knowledge" | "core" | "capture" | "intelligence" | "operations" | "system" | "reference";
  module: string;
  description: string;
  fields?: BookOfTruthsFieldRow[];
  rules?: string[];
  related?: string[];
  api_endpoints?: string[];
  updated_at: string;
}

export interface BookOfTruthsGlossaryRow {
  id: string;
  term: string;
  acronym: string | null;
  definition: string;
  category: string;
  related_entities: string[];
}

export interface BookOfTruthsSourceRow {
  id: string;
  name: string;
  type: "api" | "database" | "file" | "webhook" | "manual";
  description: string;
  endpoint: string | null;
  entities_served: string[];
  status: "active" | "planned" | "deprecated";
  refresh_frequency: string;
}

export interface BookOfTruthsData {
  entities: BookOfTruthsEntityRow[];
  glossary: BookOfTruthsGlossaryRow[];
  sources: BookOfTruthsSourceRow[];
  categoryCounts: Record<string, number>;
  modules: string[];
  source: "db";
}

export function fetchBookOfTruths(params: { search?: string; category?: string; module?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", params.category);
  if (params.module) qs.set("module", params.module);
  const query = qs.toString();
  return request<BookOfTruthsData>(`/book-of-truths${query ? `?${query}` : ""}`);
}

// --- GovWin / GovTribe Integration ---

export interface GovWinContactRow {
  name: string;
  title: string;
  agency: string;
}

export interface GovWinOpportunityRow {
  id: string;
  govwin_id: string;
  title: string;
  agency: string;
  sub_agency: string;
  status: "new" | "tracking" | "qualified" | "dismissed" | "archived";
  stage: string;
  value_low: number | null;
  value_high: number | null;
  procurement_type: string;
  naics: string;
  set_aside: string | null;
  place_of_performance: string;
  expected_release: string | null;
  expected_award: string | null;
  incumbents: string[];
  competitors: string[];
  relevance_score: number;
  ai_summary: string;
  key_contacts: GovWinContactRow[];
  tags: string[];
  govwin_url: string;
  last_updated: string;
  created_at: string;
}

export interface GovWinSyncRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "completed" | "failed";
  opportunities_synced: number;
  new_matches: number;
  error: string | null;
}

export interface GovWinSummaryData {
  total: number;
  new_count: number;
  tracking_count: number;
  qualified_count: number;
  dismissed_count: number;
  avg_relevance: number;
  total_pipeline_value: number;
  last_sync: string | null;
  source: "db";
}

export function fetchGovWinSummary() {
  return request<GovWinSummaryData>("/govwin/summary");
}

export function fetchGovWinOpportunities(params: { search?: string; status?: string; stage?: string; sort?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.stage) qs.set("stage", params.stage);
  if (params.sort) qs.set("sort", params.sort);
  const query = qs.toString();
  return request<GovWinOpportunityRow[]>(`/govwin/opportunities${query ? `?${query}` : ""}`);
}

export function fetchGovWinSyncs() {
  return request<GovWinSyncRow[]>("/govwin/syncs");
}

export function triggerGovWinSync() {
  return request<GovWinSyncRow>("/govwin/sync", { method: "POST" });
}

export function updateGovWinStatus(id: string, status: string) {
  return request<GovWinOpportunityRow>(`/govwin/opportunities/${id}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function promoteGovWinOpportunity(id: string) {
  return request<{ govwin_opportunity: GovWinOpportunityRow; promoted_to: string; new_opportunity_id: string }>(
    `/govwin/opportunities/${id}/promote`,
    { method: "POST" }
  );
}

// ---------------------------------------------------------------------------
// Company Profile
// ---------------------------------------------------------------------------

export interface CompanyProfileData {
  id: string | null;
  name: string;
  dba: string | null;
  cage_code: string | null;
  uei: string | null;
  duns: string | null;
  revenue: number | null;
  employees: number | null;
  naics_codes: string[];
  psc_codes: string[];
  capabilities: string[];
  past_performance: string[];
  set_aside_types: string[];
  address_city: string | null;
  address_state: string | null;
  website: string | null;
  contract_vehicles: string[];
  certifications: string[];
  core_competencies: string[];
  source: string;
}

export function fetchCompanyProfile() {
  return request<CompanyProfileData>("/company-profile");
}

// ---------------------------------------------------------------------------
// Agent Approvals (universal approval queue from agent system)
// ---------------------------------------------------------------------------

export interface AgentApprovalItem {
  id: string;
  type: string;
  agent: string;
  agent_run_id: string | null;
  title: string;
  summary: string | null;
  data: Record<string, unknown> | null;
  priority: "critical" | "high" | "medium" | "low";
  status: "pending" | "approved" | "rejected";
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AgentApprovalsPendingData {
  items: AgentApprovalItem[];
  count: number;
}

export interface AgentApprovalsStatsData {
  by_type: Array<{ type: string; pending: string; approved: string; rejected: string; total: string }>;
  total_pending: number;
}

export function fetchAgentApprovalsPending(params?: { type?: string; agent?: string }) {
  const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
  return request<AgentApprovalsPendingData>(`/agents/approvals/pending${qs}`);
}

export function fetchAgentApprovalsStats() {
  return request<AgentApprovalsStatsData>("/agents/approvals/stats");
}

export function approveAgentApproval(id: string, note?: string) {
  return request<{ id: string; status: string }>(`/agents/approvals/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

export function rejectAgentApproval(id: string, note?: string) {
  return request<{ id: string; status: string }>(`/agents/approvals/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

// ---------------------------------------------------------------------------
// Agent Management (list, enable/disable, config, runs)
// ---------------------------------------------------------------------------

export interface AgentConfigItem {
  agent: string;
  display_name: string;
  description: string;
  schedule: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
  last_run_at: string | null;
  last_status: string | null;
  last_duration_ms: number | null;
  last_items_processed: number | null;
  last_items_flagged: number | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunRow {
  id: string;
  agent: string;
  trigger: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  items_processed: number | null;
  items_flagged: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

export function fetchAgents() {
  return request<{ agents: AgentConfigItem[]; count: number }>("/agents");
}

export function fetchAgentDetail(name: string) {
  return request<{ agent: AgentConfigItem; recent_runs: AgentRunRow[] }>(`/agents/${name}`);
}

export function enableAgent(name: string) {
  return request<{ agent: AgentConfigItem }>(`/agents/${name}/enable`, { method: "POST" });
}

export function disableAgent(name: string) {
  return request<{ agent: AgentConfigItem }>(`/agents/${name}/disable`, { method: "POST" });
}

export function fetchRecentAgentRuns(limit = 50) {
  return request<{ runs: AgentRunRow[]; count: number }>(`/agents/runs/recent?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Opportunity Watch Agent
// ---------------------------------------------------------------------------

export interface OpportunityWatchResult {
  items_processed: number;
  items_flagged: number;
  summary: {
    total_scored: number;
    pursue: number;
    evaluate: number;
    pass: number;
    top_opportunities: Array<{ id: string; title: string; agency: string; score: number }>;
  };
}

export function triggerOpportunityWatch() {
  return request<OpportunityWatchResult>("/agents/opportunity-watch/trigger", { method: "POST" });
}

export function fetchOpportunityWatchLatest() {
  return request<{ run: AgentRunRow | null; message?: string }>("/agents/opportunity-watch/latest");
}

export function fetchOpportunityWatchHistory(limit = 20) {
  return request<{ runs: AgentRunRow[]; count: number }>(`/agents/opportunity-watch/history?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Controlled Fix Agent
// ---------------------------------------------------------------------------

export interface FixProposalItem {
  id: string;
  execution_id: string | null;
  workflow_name: string;
  workflow_id: string | null;
  failed_node: string | null;
  error_message: string;
  failed_at: string | null;
  root_cause: string;
  severity: "critical" | "high" | "medium" | "low";
  suggested_fix: string;
  fix_type: "auto" | "manual" | "restart" | "config_change";
  risk_assessment: string | null;
  safety_lane: string;
  auto_fixable: boolean;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface ControlledFixResult {
  items_processed: number;
  items_flagged: number;
  summary: {
    total_failures: number;
    new_failures: number;
    proposals_created: number;
    approvals_queued: number;
    severity_breakdown?: Record<string, number>;
    message?: string;
  };
}

export function triggerControlledFix() {
  return request<ControlledFixResult>("/agents/fix-runner/trigger", { method: "POST" });
}

export function fetchPendingFixes() {
  return request<{ fixes: FixProposalItem[]; count: number }>("/agents/fix-runner/pending-fixes");
}

export function fetchFixProposals(limit = 50) {
  return request<{ proposals: FixProposalItem[]; count: number }>(`/agents/fix-runner/proposals?limit=${limit}`);
}

export function resolveFixProposal(id: string, action: "approve" | "reject", note?: string) {
  return request<{ proposal: FixProposalItem; action: string }>("/agents/fix-runner/resolve/" + id, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
}


// ---------------------------------------------------------------------------
// Vehicle Classification (W1)
// ---------------------------------------------------------------------------

export interface VehicleData {
  key: string;
  label: string;
  description: string | null;
  category: string;
  sort_order: number;
}

export interface VehicleSummaryRow {
  vehicle_type: string;
  label: string;
  category: string;
  count: number;
  total_value: number;
  avg_score: number;
}

export interface VehiclesListData {
  vehicles: VehicleData[];
  summary: VehicleSummaryRow[];
  total_opportunities: number;
}

export interface VehicleOppsData {
  vehicle_type: string;
  opportunities: OpportunityRow[];
  total: number;
}

export function fetchVehicles() {
  return request<VehiclesListData>("/vehicles");
}

export function fetchVehicleOpportunities(vehicleType: string) {
  return request<VehicleOppsData>(`/vehicles/${vehicleType}/opportunities`);
}

export function classifyVehicles(opportunityIds?: string[]) {
  return request<{ processed: number; classified: number }>("/vehicles/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunity_ids: opportunityIds }),
  });
}

export function setVehicleType(oppId: string, vehicleType: string) {
  return request<{ id: string; vehicle_type: string }>(`/vehicles/${oppId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicle_type: vehicleType }),
  });
}

// ---------------------------------------------------------------------------
// Source Registry (W2)
// ---------------------------------------------------------------------------

export interface SourceEntry {
  id: string;
  name: string;
  source_type: string;
  category: string;
  base_url: string | null;
  auth_type: string;
  enabled: boolean;
  search_params: Record<string, unknown>;
  sync_frequency: string;
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_count: number;
  total_synced: number;
  error_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourcesListData {
  sources: SourceEntry[];
  total: number;
  enabled: number;
  total_records_synced: number;
}

export interface SyncRunEntry {
  id: string;
  source_id: string;
  source_name?: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  records_fetched: number;
  records_upserted: number;
  records_errored: number;
  duration_ms: number | null;
  error: string | null;
}

export function fetchSources() {
  return request<SourcesListData>("/sources");
}

export function fetchSourceDetail(id: string) {
  return request<{ source: SourceEntry; recent_runs: SyncRunEntry[] }>(`/sources/${id}`);
}

export function updateSource(id: string, updates: { enabled?: boolean; sync_frequency?: string; search_params?: Record<string, unknown> }) {
  return request<SourceEntry>(`/sources/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function triggerSourceSync(id: string) {
  return request<{ run_id: string; source_id: string; status: string; message: string }>(`/sources/${id}/sync`, {
    method: "POST",
  });
}

export function fetchSyncHistory() {
  return request<{ runs: SyncRunEntry[]; total: number }>("/sources/sync/history");
}
