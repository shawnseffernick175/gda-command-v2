/**
 * LLM Router — Type Definitions
 *
 * Spec: docs/architecture/v3/frontend/d4-model-router.md
 * Ticket: F-215-D4
 *
 * Business logic never references model names.
 * Adding a new task = adding a Task type + routing table entry.
 */

// AGENT OUTPUT TYPES BELOW ARE ZERO-DIFF MIRRORS OF D3 §4.5 AND §5.5.
// DO NOT EDIT WITHOUT UPDATING D3 FIRST. The acceptance bar is zero structural diff.
// docs/architecture/v3/frontend/d3-agent-behavior.md §4.5 (AnalystOutput)
// docs/architecture/v3/frontend/d3-agent-behavior.md §5.5 (CoachOutput → CapturePlanOutput)

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
  | 'source_research'
  | 'black_hat_analysis'
  | 'risk_generation'
  | 'award_analysis'
  | 'competitor_analysis'
  | 'contact_enrich'
  | 'match_analysis'
  | 'vault_document_parse'
  | 'vault_smart_route';

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
  color_stage: 'pink' | 'red' | 'gold' | 'submitted';
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

export interface BlackHatAnalysisInput {
  competitor_name: string;
  competitor_wins: number;
  competitor_total_obligated: number;
  competitor_agencies: string[];
  competitor_naics: string[];
  competitor_contract_types: string[];
  envision_context: string;
}

export interface BlackHatAnalysisOutput {
  competitor: string;
  likely_approach: string;
  strengths: string[];
  weaknesses: string[];
  counter_strategy: string;
  intel_summary: string;
  generated_at: string;
}

export interface AwardAnalysisInput {
  award_id: string;
  recipient_name: string | null;
  agency_name: string | null;
  naics: string | null;
  set_aside: string | null;
  contract_type: string | null;
  value_obligated: number | null;
  award_date: string | null;
  period_of_performance_end: string | null;
}

export interface AwardAnalysisOutput {
  win_rationale: string;
  agency_signal: string;
  recompete_assessment: string;
  winner_classification: 'THREAT' | 'PARTNER' | 'IRRELEVANT';
  recommended_action: 'Pursue Re-Compete' | 'Monitor' | 'Pass' | 'Partner with Winner';
  so_what: string;
}

export interface CompetitorAnalysisInput {
  competitor_name: string;
  awardee_uei: string | null;
  win_count: number;
  total_obligated: number;
  agencies: string[];
  naics_codes: string[];
  set_asides: string[];
  contract_types: string[];
  recompete_contracts: CompetitorRecompeteContract[];
  envision_context: string;
}

export interface CompetitorRecompeteContract {
  contract_id: string;
  title: string;
  value: number;
  expiration_date: string;
  agency: string;
}

export interface CompetitorAnalysisOutput {
  size_classification: string;
  classification: 'THREAT' | 'PARTNER' | 'MONITOR';
  classification_rationale: string;
  so_what: string;
  recompete_contracts: CompetitorRecompeteContract[];
  recommended_action: 'Compete' | 'Partner' | 'Monitor' | 'Ignore';
  trend: 'Up' | 'Down' | 'Flat';
}

export interface ContactEnrichInput {
  name: string;
  title: string | null;
  agency_or_company: string | null;
  category: string;
  email: string | null;
  linkedin: string | null;
  notes: string | null;
}

export interface ContactEnrichOutput {
  role_summary: string;
  procurement_influence: 'high' | 'medium' | 'low' | 'unknown';
  likely_decision_authority: string;
  engagement_approach: string;
  relevance_to_envision: string;
  model_used: string;
}

export interface MatchAnalysisInput {
  match_id: number;
  tech_title: string;
  tech_source: string;
  req_title: string;
  req_source: string;
  mission_fit: number;
  technical_fit: number;
  timing: number;
  recommended_vehicle: string | null;
}

export interface MatchAnalysisRecommendedAction {
  action: string;
  priority: 'high' | 'medium' | 'low';
  vehicle: string;
}

export interface MatchAnalysisRiskFlag {
  risk: string;
  severity: 'high' | 'medium' | 'low';
}

export interface MatchAnalysisOutput {
  broker_role: string;
  gap_analysis: string;
  recommended_actions: MatchAnalysisRecommendedAction[];
  risk_flags: MatchAnalysisRiskFlag[];
  envision_fit: string;
  ai_narrative: string;
  model_used: string;
}

export interface VaultDocumentParseInput {
  doc_type: string;
  filename: string;
  extracted_text: string;
}

export interface VaultDocumentParseOutput {
  summary: string;
  tags: string[];
  entities: { name: string; type: string; value: string }[];
  regulatory_citations: string[];
  doc_type_confirmed: string;
  key_dates: { label: string; date: string }[];
  dollar_amounts: { label: string; amount: string }[];
  model_used: string;
}

export interface VaultSmartRouteInput {
  filename: string;
  ai_summary: string;
  extracted_text_preview: string;
  matching_opportunities: { id: number; title: string; agency: string }[];
  matching_captures: { id: number; title: string }[];
  regulatory_citations: string[];
}

export interface VaultSmartRouteOutput {
  doc_type: string;
  doc_category: string;
  linked_opportunity_id: number | null;
  linked_capture_id: number | null;
  regulatory_citation: string | null;
  routing_rationale: string;
  confidence: string;
}

export interface RiskGenerationInput {
  opportunity_id: string;
  opportunity_title: string;
  opportunity_description: string;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
  response_deadline: string | null;
  agency: string | null;
  existing_risks: string[];
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

// ---------------------------------------------------------------------------
// MIRROR OF D3 §4.5 AnalystOutput — DO NOT EDIT WITHOUT UPDATING D3
// docs/architecture/v3/frontend/d3-agent-behavior.md §4.5
// When the shared @gda/shared-types/agents package exists, replace
// these definitions with: export type OpportunityAnalysisOutput = AnalystOutput;
// ---------------------------------------------------------------------------

export interface OpportunityAnalysisOutput {
  win_probability: number;                    // 0-100
  win_probability_reasoning: string;          // plain-English explanation
  shipley_bid_no_bid: ShipleyScore;
  incumbent: IncumbentProfile | null;
  competitive_landscape: CompetitorEntry[];
  doctrine_alignment: DoctrineAlignment[];
  source_chips: SourceChip[];                 // R1: every claim has a clickable URL
  generated_at: string;                       // ISO 8601
  model_used: string;                         // e.g. 'claude-sonnet-4-5'
  analysis_version: string;                   // cache key version
}

export interface ShipleyScore {
  overall: 'Bid' | 'No Bid' | 'Conditional';
  customer_knowledge: ShipleyDimension;
  solution_match: ShipleyDimension;
  competitive_position: ShipleyDimension;
  past_performance: ShipleyDimension;
}

export interface ShipleyDimension {
  score: number;                              // 1-10
  reasoning: string;
  evidence: string[];                         // specific facts supporting score
}

export interface IncumbentProfile {
  name: string;
  contract_number: string | null;
  contract_value: number | null;
  expiration_date: string | null;             // ISO 8601
  performance_signals: string[];              // CPAR indicators, recompete signals
  source_url: string;                         // R1
}

export interface CompetitorEntry {
  name: string;
  positioning: string;                        // how they would approach this opp
  strengths: string[];
  weaknesses: string[];
  our_differentiator: string;                 // Envision's advantage vs. this competitor
  source_url: string | null;                  // R1
}

export interface DoctrineAlignment {
  principle_number: number;                   // 1-7
  principle_name: string;
  alignment_score: 'Strong' | 'Moderate' | 'Weak' | 'N/A';
  reasoning: string;
}

// ---------------------------------------------------------------------------
// MIRROR OF D3 §5.5 CoachOutput — DO NOT EDIT WITHOUT UPDATING D3
// docs/architecture/v3/frontend/d3-agent-behavior.md §5.5
// When the shared @gda/shared-types/agents package exists, replace
// these definitions with: export type CapturePlanOutput = CoachOutput;
// ---------------------------------------------------------------------------

export interface CapturePlanOutput {
  capture_plan: {
    customer_profile: string;
    requirements_summary: string;
    solution_strategy: string;
    win_themes: WinTheme[];
    ghost_themes: GhostTheme[];
    discriminators: string[];
    pricing_strategy: string;
    teaming_plan: TeamingPlan | null;
  };
  pink_hat_gaps: PinkHatGap[];
  red_team_weaknesses: RedTeamWeakness[];
  gold_team_readiness: GoldTeamChecklist;
  black_hat_competitor_positioning: BlackHatEntry[];
  next_action: NextAction;
  source_chips: SourceChip[];
  generated_at: string;
  model_used: string;
  is_partial: boolean;
}

export interface WinTheme {
  theme: string;
  evidence: string[];
  customer_hot_button: string;
}

export interface GhostTheme {
  target_competitor: string;
  theme: string;
  rationale: string;
}

export interface TeamingPlan {
  partners: TeamingPartner[];
  rationale: string;
  teaming_arrangement: 'prime_sub' | 'joint_venture' | 'mentor_protege';
}

export interface TeamingPartner {
  name: string;
  role: 'sub' | 'prime' | 'jv_partner';
  contribution: string;
  certs_leveraged: string[];
  vehicles_leveraged: string[];
}

export interface PinkHatGap {
  gap: string;
  section: string;
  severity: 'blocking' | 'significant' | 'minor';
  recommended_fix: string;
}

export interface RedTeamWeakness {
  weakness: string;
  likelihood: 'High' | 'Med' | 'Low';
  mitigation: string;
}

export interface GoldTeamChecklist {
  ready: boolean;
  items: GoldTeamItem[];
}

export interface GoldTeamItem {
  item: string;
  status: 'complete' | 'incomplete' | 'not_applicable';
  notes: string | null;
}

export interface BlackHatEntry {
  competitor: string;
  likely_approach: string;
  strengths_vs_us: string[];
  weaknesses_vs_us: string[];
  counter_strategy: string;
}

export interface NextAction {
  action: string;
  owner: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
}

/** Source citation — R1 compliance. Matches D3 §13.1. */
export type SourceKind =
  | 'sam_gov'
  | 'fpds'
  | 'usaspending'
  | 'govwin'
  | 'govtribe'
  | 'sbir_sttr'
  | 'darpa_baa'
  | 'afwerx'
  | 'sofwerx'
  | 'edu_rfi'
  | 'orangeslices'
  | 'news'
  | 'doctrine'
  | 'partner_site'
  | 'internal';

export interface SourceChip {
  label: string;
  url: string;
  kind: SourceKind;
  retrieved_at: string;
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

export interface GeneratedRisk {
  title: string;
  description: string;
  category: 'technical' | 'schedule' | 'financial' | 'compliance' | 'operational' | 'competitive';
  likelihood: number;
  impact: number;
  mitigation: string;
  rationale: string;
  risk_type?: 'negative' | 'positive';
  if_condition?: string;
  then_impact?: string;
  mitigation_plan?: string;
  exploitation_plan?: string;
}

export interface RiskGenerationOutput {
  risks: GeneratedRisk[];
  generation_summary: string;
  generated_at: string;
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
  black_hat_analysis: BlackHatAnalysisInput;
  risk_generation: RiskGenerationInput;
  award_analysis: AwardAnalysisInput;
  competitor_analysis: CompetitorAnalysisInput;
  contact_enrich: ContactEnrichInput;
  match_analysis: MatchAnalysisInput;
  vault_document_parse: VaultDocumentParseInput;
  vault_smart_route: VaultSmartRouteInput;
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
  black_hat_analysis: BlackHatAnalysisOutput;
  risk_generation: RiskGenerationOutput;
  award_analysis: AwardAnalysisOutput;
  competitor_analysis: CompetitorAnalysisOutput;
  contact_enrich: ContactEnrichOutput;
  match_analysis: MatchAnalysisOutput;
  vault_document_parse: VaultDocumentParseOutput;
  vault_smart_route: VaultSmartRouteOutput;
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
