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
  new_opportunities_count: number;
  pipeline_summary: string;
  expiring_certs: string[];
  action_items_due: string[];
  sentinel_alerts: string[];
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

export interface CapturePlanOutput {
  executive_summary: string;
  win_themes: string[];
  discriminators: string[];
  solution_approach: string;
  teaming_strategy: string;
  pricing_guidance: string;
  risk_assessment: string;
  milestone_plan: CaptureMilestone[];
  color_review_readiness: 'not_ready' | 'pink_ready' | 'red_ready' | 'gold_ready';
}

export interface CaptureMilestone {
  name: string;
  target_date: string;
  owner: string;
  status: 'pending' | 'in_progress' | 'complete';
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
