/**
 * LLM Router — Type Definitions
 *
 * Spec: docs/architecture/v3/frontend/d4-model-router.md
 * Ticket: F-215-D4
 *
 * Business logic never references model names.
 * Adding a new task = adding a Task type + routing table entry.
 */

import type { SourceRef } from './sources.js';

// ---------------------------------------------------------------------------
// Task taxonomy (binding)
// ---------------------------------------------------------------------------

export type Task =
  | 'fast_track_triage'
  | 'opportunity_analysis'
  | 'capture_plan'
  | 'daily_briefing'
  | 'sentinel_summary'
  | 'doctrine_score'
  | 'semantic_embed'
  | 'source_research';

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export type Provider = 'anthropic' | 'openai' | 'perplexity';

// ---------------------------------------------------------------------------
// Task-specific inputs
// ---------------------------------------------------------------------------

export interface FastTrackTriageInput {
  title: string;
  description: string;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
}

export interface OpportunityAnalysisInput {
  opportunity_id: string;
  title: string;
  description: string;
  solicitation_number: string | null;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
  response_deadline: string | null;
  incumbent_info: string | null;
  sources: SourceRef[];
}

export interface CapturePlanInput {
  opportunity_id: string;
  title: string;
  description: string;
  solicitation_number: string | null;
  analysis_summary: string;
  incumbent_info: string | null;
  competitor_landscape: string | null;
  envision_capabilities: string[];
  teaming_partners: string[];
  sources: SourceRef[];
}

export interface DailyBriefingInput {
  date: string;
  open_opportunities: OpportunitySummary[];
  captures_with_gaps: CaptureSummary[];
  action_items_due: ActionItemSummary[];
  sentinel_status: SentinelStatusSummary;
  pending_recommendations: AgentRecommendation[];
  pipeline_at_risk: PipelineMilestoneItem[];
  expiring_certs: ExpiringCert[];
}

export interface OpportunitySummary {
  opportunity_id: string;
  title: string;
  solicitation_number: string | null;
  response_deadline: string | null;
  grade: 'A' | 'B' | 'C';
  pwin: number | null;
  days_until_deadline: number | null;
}

export interface CaptureSummary {
  capture_id: string;
  opportunity_title: string;
  color_review_stage: 'pink' | 'red' | 'gold' | 'none';
  gaps: string[];
  next_milestone: string | null;
}

export interface ActionItemSummary {
  id: string;
  title: string;
  due_date: string;
  urgency: 'overdue' | 'today' | 'this_week';
  related_entity: string | null;
}

export interface SentinelStatusSummary {
  overall_health: 'healthy' | 'degraded' | 'critical';
  active_alerts: SentinelAlert[];
  last_check_at: string;
}

export interface SentinelAlert {
  component: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  detected_at: string;
}

export interface AgentRecommendation {
  agent: string;
  recommendation: string;
  related_entity: string | null;
  confidence: number;
}

export interface PipelineMilestoneItem {
  opportunity_id: string;
  opportunity_title: string;
  milestone: string;
  target_date: string;
  risk_reason: string;
}

export interface ExpiringCert {
  cert_name: string;
  expiration_date: string;
  days_remaining: number;
  severity: 'critical' | 'warning';
}

export interface SentinelSummaryInput {
  alert_type: string;
  component: string;
  details: string;
  recent_log_lines: string[];
}

export interface DoctrineScoreInput {
  opportunity_id: string;
  title: string;
  description: string;
  naics_codes: string[];
  set_aside: string | null;
  envision_alignment_context: string;
}

export interface SemanticEmbedInput {
  text: string;
  namespace: string;
}

export interface SourceResearchInput {
  query: string;
  context: string | null;
  max_sources: number;
}

// ---------------------------------------------------------------------------
// Task-specific outputs
// ---------------------------------------------------------------------------

export interface FastTrackTriageOutput {
  grade: 'A' | 'B' | 'C';
  rationale: string;
  naics_match_score: number;
  recommended_action: 'pursue' | 'watch' | 'skip';
}

export interface OpportunityAnalysisOutput {
  pwin: number;
  pwin_rationale: string;
  incumbent_analysis: string;
  competitor_landscape: string;
  blackhat_assessment: string;
  wargame_summary: string;
  timeline_analysis: string;
  strengths: string[];
  weaknesses: string[];
  recommended_teaming: string[];
  doctrine_alignment_score: number;
}

// ---------------------------------------------------------------------------
// MIRROR OF D3 §5.5 CoachOutput — DO NOT EDIT WITHOUT UPDATING D3
// docs/architecture/v3/frontend/d3-agent-behavior.md §5.5
// When the shared @gda/shared-types/agents package exists, replace
// these definitions with: export type CapturePlanOutput = CoachOutput;
// ---------------------------------------------------------------------------

export interface CapturePlanOutput {
  capture_plan: CapturePlan;
  pink_hat_gaps: PinkHatGap[];
  red_team_weaknesses: RedTeamWeakness[];
  gold_team_readiness: GoldTeamChecklist;
  black_hat_competitor_positioning: CompetitorPosition[];
  next_action: NextAction;
  source_chips: SourceChip[];
  is_partial: boolean;
  generated_at: string;
  model_used: string;
}

export interface CapturePlan {
  customer_profile: string;
  requirements_summary: string;
  solution_strategy: string;
  win_themes: string[];
  ghost_themes: string[];
  discriminators: string[];
  pricing_strategy: string;
  teaming_plan: string;
}

export interface PinkHatGap {
  requirement_ref: string;
  gap_description: string;
  severity: 'blocking' | 'significant' | 'minor';
  suggested_fix: string;
}

export interface RedTeamWeakness {
  area: string;
  weakness: string;
  competitor_advantage: string | null;
  mitigation: string;
}

export interface GoldTeamChecklist {
  ready: boolean;
  items: GoldTeamItem[];
}

export interface GoldTeamItem {
  area: string;
  status: 'pass' | 'fail' | 'warning';
  note: string;
}

export interface CompetitorPosition {
  competitor_name: string;
  likely_strategy: string;
  strengths: string[];
  weaknesses: string[];
  counter_strategy: string;
}

export interface NextAction {
  action: string;
  owner: string;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low';
}

export interface SourceChip {
  kind: string;
  title: string;
  url: string;
}

export interface DailyBriefingOutput {
  headline: string;
  priority_actions: BriefingAction[];
  risk_flags: string[];
  market_intel_summary: string;
  cert_expiration_warnings: string[];
}

export interface BriefingAction {
  action: string;
  urgency: 'immediate' | 'today' | 'this_week';
  related_entity: string | null;
}

export interface SentinelSummaryOutput {
  severity: 'info' | 'warning' | 'critical';
  root_cause: string;
  recommended_fix: string;
  affected_components: string[];
}

export interface DoctrineScoreOutput {
  overall_score: number;
  principle_scores: DoctrinePrincipleScore[];
  alignment_summary: string;
  concerns: string[];
}

export interface DoctrinePrincipleScore {
  principle: string;
  score: number;
  rationale: string;
}

export interface SemanticEmbedOutput {
  embedding: number[];
  dimensions: number;
}

export interface SourceResearchOutput {
  findings: ResearchFinding[];
  summary: string;
  sources_consulted: number;
}

export interface ResearchFinding {
  title: string;
  url: string;
  snippet: string;
  relevance_score: number;
}

// ---------------------------------------------------------------------------
// TaskInput / TaskOutput maps
// ---------------------------------------------------------------------------

export interface TaskInputMap {
  fast_track_triage: FastTrackTriageInput;
  opportunity_analysis: OpportunityAnalysisInput;
  capture_plan: CapturePlanInput;
  daily_briefing: DailyBriefingInput;
  sentinel_summary: SentinelSummaryInput;
  doctrine_score: DoctrineScoreInput;
  semantic_embed: SemanticEmbedInput;
  source_research: SourceResearchInput;
}

export interface TaskOutputMap {
  fast_track_triage: FastTrackTriageOutput;
  opportunity_analysis: OpportunityAnalysisOutput;
  capture_plan: CapturePlanOutput;
  daily_briefing: DailyBriefingOutput;
  sentinel_summary: SentinelSummaryOutput;
  doctrine_score: DoctrineScoreOutput;
  semantic_embed: SemanticEmbedOutput;
  source_research: SourceResearchOutput;
}

// ---------------------------------------------------------------------------
// Error kinds
// ---------------------------------------------------------------------------

export type RouterErrorKind =
  | 'ANALYSIS_TIMEOUT'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR';

// ---------------------------------------------------------------------------
// Route request / response
// ---------------------------------------------------------------------------

export interface RouteRequest<T extends Task> {
  task: T;
  input: TaskInputMap[T];
  opts?: RouteRequestOpts;
}

export interface RouteRequestOpts {
  timeout_ms?: number;
  mock?: boolean;
  operator_id?: string;
  object_ref?: string;
  /**
   * Disable router-internal retry loop. Used for tasks invoked via pg-boss
   * jobs (Scout, Commander, Sentinel background) where the job queue owns
   * retry semantics. Default: false (router retry enabled).
   */
  disable_router_retry?: boolean;
}

export interface RouteResponseOk<T extends Task> {
  ok: true;
  task: T;
  model_used: string;
  output: TaskOutputMap[T];
  latency_ms: number;
  tokens: TokenUsage;
  cost_estimate_usd: number;
  fallback_used: boolean;
  quality_flag: QualityFlag;
  trace_id: string;
}

export interface RouteResponseErr<T extends Task> {
  ok: false;
  task: T;
  model_used: string | null;
  output: null;
  latency_ms: number;
  tokens: TokenUsage | null;
  cost_estimate_usd: number;
  fallback_used: boolean;
  quality_flag: QualityFlag;
  error_kind: RouterErrorKind;
  error_message: string;
  trace_id: string;
}

export type RouteResponse<T extends Task> = RouteResponseOk<T> | RouteResponseErr<T>;

export interface TokenUsage {
  input: number;
  output: number;
}

export type QualityFlag = 'full' | 'degraded';

// ---------------------------------------------------------------------------
// Routing table entry (used by router internals)
// ---------------------------------------------------------------------------

export interface RoutingTableEntry {
  task: Task;
  provider: Provider;
  model: string;
  timeout_ms: number;
  fallback: FallbackConfig | null;
}

export interface FallbackConfig {
  provider: Provider;
  model: string;
  /**
   * Minimum remaining wall-clock budget (ms) required to attempt fallback.
   * If remaining budget is less than this threshold, the router returns
   * an error immediately without attempting fallback.
   * Default: 500.
   */
  min_remaining_budget_ms?: number;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  max_retries: number;
  backoff_ms: readonly number[];
  retry_on_5xx: boolean;
  retry_on_network: boolean;
  retry_on_429: boolean;
}

// ---------------------------------------------------------------------------
// LLM call log row (mirrors llm_calls table for F-217)
// ---------------------------------------------------------------------------

export interface LlmCallRow {
  id: string;
  trace_id: string;
  task: Task;
  provider: Provider;
  model: string;
  operator_id: string | null;
  object_ref: string | null;
  latency_ms: number;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_estimate_usd: number | null;
  fallback_used: boolean;
  error_kind: RouterErrorKind | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cost rollup (GET /api/v3/llm-cost-rollup)
// ---------------------------------------------------------------------------

export interface CostRollupQuery {
  window: '1d' | '7d' | '30d';
}

export interface CostRollupEntry {
  task: Task;
  call_count: number;
  total_latency_ms: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_cost_usd: number;
}

export interface CostRollupResponse {
  window: string;
  entries: CostRollupEntry[];
  totals: {
    call_count: number;
    total_cost_usd: number;
  };
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Mock mode
// ---------------------------------------------------------------------------

export interface MockRegistry {
  get<T extends Task>(task: T, inputHash: string): RouteResponseOk<T> | null;
  register<T extends Task>(task: T, inputHash: string, response: RouteResponseOk<T>): void;
}
