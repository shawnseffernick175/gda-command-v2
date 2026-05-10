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

export interface CommandFastTrack {
  opportunity_title: string;
  signal: string;
  urgency: "high" | "medium" | "low";
}

export interface CommandSignalsData {
  activeRisks: CommandRisk[];
  upcomingDecisions: CommandDecision[];
  dueSoonItems: CommandDueSoon[];
  fastTrackSignals: CommandFastTrack[];
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
