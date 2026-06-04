/* ── Shared types for GDA Command frontend ────────────────────── */

export type Band = "forecast" | "signal" | "discovery" | "pass";

export interface PwinScore {
  score: number;
  band: Band;
  top_drivers: string[];
  days_to_due: number | null;
  model_version: string;
  scored_at: string;
  incumbent_competitor?: string | null;
}

export interface OpportunitySummary {
  id: number;
  internal_id: string;
  title: string;
  agency: string | null;
  naics: string | null;
  status: string | null;
  stage?: string | null;
  value: number | null;
  due_date: string | null;
  set_aside: string | null;
  hot: boolean;
  created_at: string;
  updated_at: string;
  pwin?: PwinScore | null;
  doctrine_score?: number | null;
  capture_pwin?: number | null;
  source?: string | null;
  days_in_stage?: number | null;
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
  doctrine_badge?: DoctrineBadge | null;
  analysis?: AnalysisBlock | null;
  llm_analysis?: LlmAnalysis | null;
  llm_quality_flag?: string | null;
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
}

/* ── Awards ───────────────────────────────────────────────────── */

export interface AwardSourceRef {
  kind: string;
  title: string;
  url: string;
  retrieved_at?: string;
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

export interface ActionItem {
  id: number;
  title: string;
  due_date: string | null;
  owner: string | null;
  linked_object?: string | null;
  linked_object_type?: string | null;
  status: "open" | "in_progress" | "done" | "overdue";
  created_at: string;
  drafts?: ActionItemDraft[];
}

/* ── KPI Header ───────────────────────────────────────────────── */

export interface KpiHeaderData {
  orders: { value: number; delta: number; plan: number };
  sales: { value: number; delta: number; plan: number };
  ebit: { value: number; delta: number; plan: number };
  gross_margin: { value: number; delta: number; plan: number };
  ros: { value: number; delta: number; plan: number };
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

export interface GovTriContact {
  id: number;
  govtribe_id: string;
  name: string | null;
  title: string | null;
  agency: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
  source_url: string | null;
  last_seen_at: string;
}

/* ── Competitors (pending backend) ────────────────────────────── */

export interface Competitor {
  id: number;
  name: string;
  size: "S" | "M" | "L";
  overlap: number;
  threat: string | null;
  fpds_wins: number;
  last_researched: string | null;
  status: "done" | "queued" | "in_progress";
}

/* ── Risks (pending backend) ──────────────────────────────────── */

export interface Risk {
  id: number;
  description: string;
  category: string;
  likelihood: number;
  impact: number;
  score: number;
  status: "Open" | "Mitigating" | "Closed";
  mitigation: string | null;
  linked_pursuit?: string | null;
  owner: string | null;
  source?: string | null;
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
  our_differentiator: string;
}

export interface LlmAnalysis {
  win_probability: number;
  win_probability_reasoning: string;
  shipley_bid_no_bid: ShipleyBidNoBid;
  competitive_landscape: CompetitorEntry[];
  source_chips: Array<{ label: string; url: string; kind: string }>;
  model_used: string;
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
