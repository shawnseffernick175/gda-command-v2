/**
 * Mock data for Phase I — ML & Predictive Analytics:
 * - Dynamic Pwin Model (ML-enhanced with feature importance)
 * - Pipeline Revenue Forecasting (Monte Carlo simulation)
 * - Bid/No-Bid Optimizer
 * - Win/Loss Pattern Analysis
 */

// ---------------------------------------------------------------------------
// I-1: Dynamic Pwin Model
// ---------------------------------------------------------------------------

export interface PwinModelOutput {
  opp_id: string;
  opp_title: string;
  agency: string;
  ml_pwin: number;
  static_pwin: number;
  confidence_interval: { lower: number; upper: number };
  confidence_level: "high" | "medium" | "low";
  model_version: string;
  last_updated: string;
  features: PwinFeature[];
  improvement_actions: PwinImprovement[];
  similar_opps_won: number;
  similar_opps_lost: number;
  trend: "improving" | "stable" | "declining";
  trend_delta: number;
  data_source: string | null;
}

export interface PwinFeature {
  name: string;
  value: string;
  importance: number;
  impact: "positive" | "negative" | "neutral";
  benchmark: string;
}

export interface PwinImprovement {
  action: string;
  estimated_pwin_lift: number;
  effort: "low" | "medium" | "high";
  deadline: string | null;
}

const PWIN_MODELS: PwinModelOutput[] = [
  {
    opp_id: "opp-001",
    opp_title: "USACE FUDS IDIQ Environmental Remediation",
    agency: "US Army Corps of Engineers",
    ml_pwin: 0.73,
    static_pwin: 0.72,
    confidence_interval: { lower: 0.65, upper: 0.81 },
    confidence_level: "high",
    model_version: "GDA-ML-v3.2",
    last_updated: "2026-05-09T18:00:00Z",
    features: [
      { name: "Agency Win Rate", value: "USACE", importance: 0.22, impact: "positive", benchmark: "Your USACE win rate: 58% vs. portfolio avg 42%" },
      { name: "Contract Value", value: "$12.4M", importance: 0.18, impact: "positive", benchmark: "Sweet spot: $5M-$15M IDIQ (67% win rate)" },
      { name: "Incumbent Status", value: "Non-incumbent", importance: 0.16, impact: "negative", benchmark: "Incumbents win 71% of re-competes" },
      { name: "Teaming Structure", value: "Prime + 2 subs", importance: 0.14, impact: "positive", benchmark: "Teamed bids win 54% vs. solo 38%" },
      { name: "NAICS Match", value: "562910 - perfect", importance: 0.12, impact: "positive", benchmark: "Primary NAICS match: +12% win rate" },
      { name: "Past Performance", value: "3 relevant refs", importance: 0.10, impact: "positive", benchmark: "3+ refs = 63% win rate vs. <3 = 41%" },
      { name: "Competition Level", value: "4-6 bidders expected", importance: 0.05, impact: "negative", benchmark: "4-6 bidders: avg 22% chance per bidder" },
      { name: "Time Since RFP", value: "28 days remaining", importance: 0.03, impact: "neutral", benchmark: "Adequate preparation time (>21 days)" },
    ],
    improvement_actions: [
      { action: "Schedule meeting with USACE Huntsville COR to discuss technical approach", estimated_pwin_lift: 0.05, effort: "medium", deadline: "2026-05-20" },
      { action: "Add geophysical survey sub to team (covers gap in UXO capability)", estimated_pwin_lift: 0.04, effort: "low", deadline: "2026-05-15" },
      { action: "Prepare PFAS remediation case study as discriminator", estimated_pwin_lift: 0.03, effort: "low", deadline: null },
      { action: "Negotiate competitive labor rates with key sub", estimated_pwin_lift: 0.02, effort: "high", deadline: "2026-05-25" },
    ],
    similar_opps_won: 12,
    similar_opps_lost: 9,
    trend: "improving",
    trend_delta: 0.03,
    data_source: "sam.gov",
  },
  {
    opp_id: "opp-002",
    opp_title: "EPA Superfund Technical Support",
    agency: "Environmental Protection Agency",
    ml_pwin: 0.54,
    static_pwin: 0.58,
    confidence_interval: { lower: 0.42, upper: 0.66 },
    confidence_level: "medium",
    model_version: "GDA-ML-v3.2",
    last_updated: "2026-05-09T16:30:00Z",
    features: [
      { name: "Agency Win Rate", value: "EPA", importance: 0.22, impact: "negative", benchmark: "Your EPA win rate: 28% vs. portfolio avg 42%" },
      { name: "Contract Value", value: "$8.2M", importance: 0.18, impact: "positive", benchmark: "Sweet spot: $5M-$15M (67% win rate)" },
      { name: "Incumbent Status", value: "Non-incumbent", importance: 0.16, impact: "negative", benchmark: "Incumbents win 71% of re-competes" },
      { name: "Teaming Structure", value: "Solo bid", importance: 0.14, impact: "negative", benchmark: "Solo bids win 38% vs. teamed 54%" },
      { name: "NAICS Match", value: "562910 - partial", importance: 0.12, impact: "neutral", benchmark: "Partial NAICS match: baseline rate" },
      { name: "Past Performance", value: "1 relevant ref", importance: 0.10, impact: "negative", benchmark: "<3 refs = 41% win rate vs. 3+ = 63%" },
      { name: "Competition Level", value: "8+ bidders expected", importance: 0.05, impact: "negative", benchmark: "8+ bidders: avg 12% chance per bidder" },
      { name: "Time Since RFP", value: "45 days remaining", importance: 0.03, impact: "positive", benchmark: "Ample preparation time" },
    ],
    improvement_actions: [
      { action: "Identify and formalize teaming partner with EPA past performance", estimated_pwin_lift: 0.08, effort: "high", deadline: "2026-05-18" },
      { action: "Attend EPA Region 4 industry day on May 25", estimated_pwin_lift: 0.05, effort: "low", deadline: "2026-05-25" },
      { action: "Develop competitive pricing model for LPTA evaluation", estimated_pwin_lift: 0.04, effort: "medium", deadline: null },
    ],
    similar_opps_won: 5,
    similar_opps_lost: 13,
    trend: "declining",
    trend_delta: -0.04,
    data_source: "sam.gov",
  },
  {
    opp_id: "opp-003",
    opp_title: "Air Force Tyndall AFB Smart Base Infrastructure",
    agency: "US Air Force",
    ml_pwin: 0.81,
    static_pwin: 0.75,
    confidence_interval: { lower: 0.74, upper: 0.88 },
    confidence_level: "high",
    model_version: "GDA-ML-v3.2",
    last_updated: "2026-05-09T20:00:00Z",
    features: [
      { name: "Agency Win Rate", value: "USAF", importance: 0.22, impact: "positive", benchmark: "Your USAF win rate: 52% vs. portfolio avg 42%" },
      { name: "Contract Value", value: "$24.6M", importance: 0.18, impact: "neutral", benchmark: "Above sweet spot but within capability range" },
      { name: "Incumbent Status", value: "Incumbent", importance: 0.16, impact: "positive", benchmark: "Incumbents win 71% of re-competes" },
      { name: "Teaming Structure", value: "JV with SB", importance: 0.14, impact: "positive", benchmark: "JV bids win 61% vs. solo 38%" },
      { name: "NAICS Match", value: "236220 - perfect", importance: 0.12, impact: "positive", benchmark: "Primary NAICS match: +12% win rate" },
      { name: "Past Performance", value: "5 relevant refs", importance: 0.10, impact: "positive", benchmark: "5+ refs in same domain: 78% win rate" },
      { name: "Competition Level", value: "2-3 bidders expected", importance: 0.05, impact: "positive", benchmark: "2-3 bidders: avg 40% chance per bidder" },
      { name: "Time Since RFP", value: "60 days remaining", importance: 0.03, impact: "positive", benchmark: "Ample preparation time" },
    ],
    improvement_actions: [
      { action: "Update CPARS narratives from current contract period", estimated_pwin_lift: 0.02, effort: "low", deadline: "2026-05-30" },
      { action: "Pre-position key personnel with updated resumes", estimated_pwin_lift: 0.01, effort: "low", deadline: null },
    ],
    similar_opps_won: 18,
    similar_opps_lost: 4,
    trend: "stable",
    trend_delta: 0.01,
    data_source: "govwin",
  },
  {
    opp_id: "opp-004",
    opp_title: "NASA KSC Ground Systems Support",
    agency: "NASA",
    ml_pwin: 0.41,
    static_pwin: 0.45,
    confidence_interval: { lower: 0.30, upper: 0.52 },
    confidence_level: "low",
    model_version: "GDA-ML-v3.2",
    last_updated: "2026-05-09T14:00:00Z",
    features: [
      { name: "Agency Win Rate", value: "NASA", importance: 0.22, impact: "negative", benchmark: "Your NASA win rate: 22% vs. portfolio avg 42%" },
      { name: "Contract Value", value: "$45.0M", importance: 0.18, impact: "negative", benchmark: "Above sweet spot ($5M-$15M); 31% win rate >$30M" },
      { name: "Incumbent Status", value: "Non-incumbent", importance: 0.16, impact: "negative", benchmark: "Incumbents win 71% of re-competes" },
      { name: "Teaming Structure", value: "Prime + 3 subs", importance: 0.14, impact: "positive", benchmark: "Teamed bids win 54% vs. solo 38%" },
      { name: "NAICS Match", value: "541715 - partial", importance: 0.12, impact: "neutral", benchmark: "Partial NAICS match: baseline rate" },
      { name: "Past Performance", value: "2 relevant refs", importance: 0.10, impact: "negative", benchmark: "<3 refs = 41% win rate vs. 3+ = 63%" },
      { name: "Competition Level", value: "6-8 bidders expected", importance: 0.05, impact: "negative", benchmark: "6-8 bidders: avg 15% chance per bidder" },
      { name: "Time Since RFP", value: "90 days remaining", importance: 0.03, impact: "positive", benchmark: "Ample preparation time" },
    ],
    improvement_actions: [
      { action: "Form JV with established NASA contractor to address past perf gap", estimated_pwin_lift: 0.12, effort: "high", deadline: "2026-06-01" },
      { action: "Engage NASA KSC small business liaison for teaming intro", estimated_pwin_lift: 0.05, effort: "medium", deadline: "2026-05-20" },
      { action: "Develop cost reduction strategy targeting 10% below incumbent baseline", estimated_pwin_lift: 0.04, effort: "high", deadline: null },
      { action: "Attend NASA Industry Day (confirmed June 5)", estimated_pwin_lift: 0.03, effort: "low", deadline: "2026-06-05" },
    ],
    similar_opps_won: 3,
    similar_opps_lost: 11,
    trend: "declining",
    trend_delta: -0.06,
    data_source: "sam.gov",
  },
  {
    opp_id: "opp-005",
    opp_title: "DHS CISA CDM DEFEND Phase 4",
    agency: "Department of Homeland Security",
    ml_pwin: 0.62,
    static_pwin: 0.60,
    confidence_interval: { lower: 0.53, upper: 0.71 },
    confidence_level: "medium",
    model_version: "GDA-ML-v3.2",
    last_updated: "2026-05-09T12:00:00Z",
    features: [
      { name: "Agency Win Rate", value: "DHS", importance: 0.22, impact: "neutral", benchmark: "Your DHS win rate: 40% vs. portfolio avg 42%" },
      { name: "Contract Value", value: "$18.5M", importance: 0.18, impact: "neutral", benchmark: "Slightly above sweet spot; within range" },
      { name: "Incumbent Status", value: "Sub on current", importance: 0.16, impact: "positive", benchmark: "Current subs who prime next: 55% win rate" },
      { name: "Teaming Structure", value: "Prime + 1 sub", importance: 0.14, impact: "positive", benchmark: "Teamed bids win 54% vs. solo 38%" },
      { name: "NAICS Match", value: "541512 - perfect", importance: 0.12, impact: "positive", benchmark: "Primary NAICS match: +12% win rate" },
      { name: "Past Performance", value: "4 relevant refs", importance: 0.10, impact: "positive", benchmark: "3+ refs = 63% win rate" },
      { name: "Competition Level", value: "5-7 bidders expected", importance: 0.05, impact: "negative", benchmark: "5-7 bidders: avg 18% chance per bidder" },
      { name: "Time Since RFP", value: "35 days remaining", importance: 0.03, impact: "neutral", benchmark: "Adequate preparation time" },
    ],
    improvement_actions: [
      { action: "Leverage current sub relationship for transition plan credibility", estimated_pwin_lift: 0.04, effort: "low", deadline: null },
      { action: "Develop CDM DEFEND Phase 3 lessons-learned discriminator", estimated_pwin_lift: 0.03, effort: "medium", deadline: "2026-05-22" },
      { action: "Engage CISA ISSO for cybersecurity architecture review", estimated_pwin_lift: 0.02, effort: "medium", deadline: "2026-05-28" },
    ],
    similar_opps_won: 8,
    similar_opps_lost: 6,
    trend: "improving",
    trend_delta: 0.02,
    data_source: "govwin",
  },
  {
    opp_id: "opp-006",
    opp_title: "DCSA MPP BAA Support Services",
    agency: "Defense Counterintelligence and Security Agency",
    ml_pwin: 0.35,
    static_pwin: 0.35,
    confidence_interval: { lower: 0.24, upper: 0.46 },
    confidence_level: "low",
    model_version: "GDA-ML-v3.2",
    last_updated: "2026-05-09T09:00:00Z",
    features: [
      { name: "Agency Win Rate", value: "DCSA", importance: 0.22, impact: "negative", benchmark: "Your DCSA win rate: 20% (limited history)" },
      { name: "Contract Value", value: "$1.2M", importance: 0.18, impact: "neutral", benchmark: "Small contract; lower competition typically" },
      { name: "Incumbent Status", value: "New requirement", importance: 0.16, impact: "neutral", benchmark: "No incumbent advantage applies" },
      { name: "Teaming Structure", value: "Solo bid", importance: 0.14, impact: "negative", benchmark: "Solo bids win 38% vs. teamed 54%" },
      { name: "NAICS Match", value: "541990 - partial", importance: 0.12, impact: "neutral", benchmark: "Partial NAICS match: baseline rate" },
      { name: "Past Performance", value: "1 relevant ref", importance: 0.10, impact: "negative", benchmark: "<3 refs = 41% win rate" },
      { name: "Competition Level", value: "10+ bidders expected", importance: 0.05, impact: "negative", benchmark: "BAAs attract high competition" },
      { name: "Time Since RFP", value: "14 days remaining", importance: 0.03, impact: "negative", benchmark: "Tight timeline (<21 days)" },
    ],
    improvement_actions: [
      { action: "Evaluate strategic value — consider no-bid to focus resources", estimated_pwin_lift: 0.00, effort: "low", deadline: "2026-05-12" },
      { action: "If bidding, develop unique technical innovation angle", estimated_pwin_lift: 0.05, effort: "high", deadline: "2026-05-14" },
    ],
    similar_opps_won: 2,
    similar_opps_lost: 8,
    trend: "stable",
    trend_delta: 0.00,
    data_source: "sam.gov",
  },
];

export function getPwinModels(): PwinModelOutput[] {
  return PWIN_MODELS;
}

export function getPwinModel(oppId: string): PwinModelOutput | null {
  return PWIN_MODELS.find((m) => m.opp_id === oppId) ?? null;
}

// ---------------------------------------------------------------------------
// I-2: Pipeline Revenue Forecasting
// ---------------------------------------------------------------------------

export interface ForecastScenario {
  label: string;
  revenue: number;
  probability: number;
}

export interface MonthlyForecast {
  month: string;
  p10: number;
  p50: number;
  p90: number;
  target: number;
  actuals: number | null;
}

export interface PipelineForecast {
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
  monthly: MonthlyForecast[];
  scenarios: ForecastScenario[];
  risk_factors: ForecastRisk[];
  top_contributors: ForecastContributor[];
}

export interface ForecastRisk {
  id: string;
  risk: string;
  impact_revenue: number;
  probability: number;
  mitigation: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface ForecastContributor {
  opp_id: string;
  title: string;
  agency: string;
  value: number;
  pwin: number;
  weighted_value: number;
  expected_close: string;
  status: "pursue" | "evaluate" | "capture" | "proposal";
}

const PIPELINE_FORECAST: PipelineForecast = {
  summary: {
    total_pipeline: 156_400_000,
    weighted_pipeline: 68_200_000,
    p10_revenue: 42_100_000,
    p50_revenue: 68_200_000,
    p90_revenue: 94_800_000,
    annual_target: 85_000_000,
    gap_to_target: 16_800_000,
    pipeline_coverage_ratio: 1.84,
    simulations_run: 10_000,
    model_version: "Monte Carlo v2.1",
    last_updated: "2026-05-09T22:00:00Z",
  },
  monthly: [
    { month: "2026-01", p10: 3_200_000, p50: 5_100_000, p90: 7_400_000, target: 7_083_333, actuals: 6_800_000 },
    { month: "2026-02", p10: 3_000_000, p50: 4_800_000, p90: 7_100_000, target: 7_083_333, actuals: 5_200_000 },
    { month: "2026-03", p10: 3_400_000, p50: 5_400_000, p90: 7_800_000, target: 7_083_333, actuals: 7_100_000 },
    { month: "2026-04", p10: 3_100_000, p50: 5_200_000, p90: 7_600_000, target: 7_083_333, actuals: 5_900_000 },
    { month: "2026-05", p10: 3_500_000, p50: 5_600_000, p90: 8_000_000, target: 7_083_333, actuals: null },
    { month: "2026-06", p10: 3_600_000, p50: 5_800_000, p90: 8_200_000, target: 7_083_333, actuals: null },
    { month: "2026-07", p10: 3_800_000, p50: 6_100_000, p90: 8_500_000, target: 7_083_333, actuals: null },
    { month: "2026-08", p10: 3_700_000, p50: 5_900_000, p90: 8_300_000, target: 7_083_333, actuals: null },
    { month: "2026-09", p10: 3_400_000, p50: 5_500_000, p90: 7_900_000, target: 7_083_333, actuals: null },
    { month: "2026-10", p10: 3_200_000, p50: 5_300_000, p90: 7_700_000, target: 7_083_333, actuals: null },
    { month: "2026-11", p10: 3_000_000, p50: 4_900_000, p90: 7_200_000, target: 7_083_333, actuals: null },
    { month: "2026-12", p10: 3_200_000, p50: 5_100_000, p90: 7_500_000, target: 7_083_333, actuals: null },
  ],
  scenarios: [
    { label: "Win Top 3 Opportunities", revenue: 94_800_000, probability: 0.18 },
    { label: "Base Case (P50)", revenue: 68_200_000, probability: 0.50 },
    { label: "Lose Top 3 Opportunities", revenue: 42_100_000, probability: 0.15 },
    { label: "Win All Incumbent Re-competes", revenue: 82_400_000, probability: 0.32 },
    { label: "Conservative (P10)", revenue: 42_100_000, probability: 0.10 },
    { label: "Optimistic (P90)", revenue: 94_800_000, probability: 0.10 },
  ],
  risk_factors: [
    { id: "rf-001", risk: "Tyndall AFB re-compete delayed to FY27", impact_revenue: -24_600_000, probability: 0.15, mitigation: "Maintain warm relationship; prepare for accelerated timeline", severity: "critical" },
    { id: "rf-002", risk: "USACE FUDS IDIQ canceled or scope reduced", impact_revenue: -12_400_000, probability: 0.10, mitigation: "Diversify pipeline with additional USACE task orders", severity: "high" },
    { id: "rf-003", risk: "Continuing Resolution limits new starts", impact_revenue: -18_000_000, probability: 0.35, mitigation: "Focus on funded backlog and existing vehicles", severity: "high" },
    { id: "rf-004", risk: "Key personnel unavailable for NASA KSC proposal", impact_revenue: -8_500_000, probability: 0.20, mitigation: "Identify backup PM with NASA clearance", severity: "medium" },
    { id: "rf-005", risk: "Competitor undercuts pricing on DHS CDM DEFEND", impact_revenue: -5_200_000, probability: 0.40, mitigation: "Emphasize transition risk and past performance over price", severity: "medium" },
  ],
  top_contributors: [
    { opp_id: "opp-003", title: "Tyndall AFB Smart Base Infrastructure", agency: "US Air Force", value: 24_600_000, pwin: 0.81, weighted_value: 19_926_000, expected_close: "2026-08-15", status: "capture" },
    { opp_id: "opp-005", title: "DHS CISA CDM DEFEND Phase 4", agency: "DHS", value: 18_500_000, pwin: 0.62, weighted_value: 11_470_000, expected_close: "2026-07-01", status: "proposal" },
    { opp_id: "opp-001", title: "USACE FUDS Environmental Remediation", agency: "USACE", value: 12_400_000, pwin: 0.73, weighted_value: 9_052_000, expected_close: "2026-06-30", status: "proposal" },
    { opp_id: "opp-004", title: "NASA KSC Ground Systems Support", agency: "NASA", value: 45_000_000, pwin: 0.41, weighted_value: 18_450_000, expected_close: "2026-10-01", status: "evaluate" },
    { opp_id: "opp-002", title: "EPA Superfund Technical Support", agency: "EPA", value: 8_200_000, pwin: 0.54, weighted_value: 4_428_000, expected_close: "2026-09-01", status: "pursue" },
    { opp_id: "opp-006", title: "DCSA MPP BAA Support Services", agency: "DCSA", value: 1_200_000, pwin: 0.35, weighted_value: 420_000, expected_close: "2026-05-30", status: "proposal" },
  ],
};

export function getPipelineForecast(): PipelineForecast {
  return PIPELINE_FORECAST;
}

// ---------------------------------------------------------------------------
// I-3: Bid/No-Bid Optimizer
// ---------------------------------------------------------------------------

export interface BidNoBidAssessment {
  opp_id: string;
  opp_title: string;
  agency: string;
  value: number;
  recommendation: "bid" | "no_bid" | "watch";
  overall_score: number;
  factors: BidFactor[];
  rationale: string;
  resource_impact: string;
  strategic_alignment: "high" | "medium" | "low";
  assessed_at: string;
}

export interface BidFactor {
  category: string;
  score: number;
  weight: number;
  weighted_score: number;
  notes: string;
  signal: "green" | "amber" | "red";
}

const BID_ASSESSMENTS: BidNoBidAssessment[] = [
  {
    opp_id: "opp-001",
    opp_title: "USACE FUDS IDIQ Environmental Remediation",
    agency: "US Army Corps of Engineers",
    value: 12_400_000,
    recommendation: "bid",
    overall_score: 82,
    factors: [
      { category: "Pwin (ML)", score: 73, weight: 0.30, weighted_score: 21.9, notes: "Strong 73% with improvement path to 80%+", signal: "green" },
      { category: "Strategic Fit", score: 90, weight: 0.20, weighted_score: 18.0, notes: "Core NAICS, target agency, builds USACE relationship", signal: "green" },
      { category: "Resource Availability", score: 85, weight: 0.15, weighted_score: 12.75, notes: "PM, technical lead, and 2 of 3 key staff available", signal: "green" },
      { category: "Financial Return", score: 78, weight: 0.15, weighted_score: 11.7, notes: "Expected 12% margin; BD cost ratio 1.8% (acceptable)", signal: "green" },
      { category: "Competitive Landscape", score: 65, weight: 0.10, weighted_score: 6.5, notes: "AECOM incumbent is strong; 4-6 expected bidders", signal: "amber" },
      { category: "Proposal Readiness", score: 88, weight: 0.10, weighted_score: 8.8, notes: "75% reusable content from RAG; team assembled", signal: "green" },
    ],
    rationale: "Strong strategic fit with core environmental services capability. High Pwin with clear improvement actions. USACE is a priority relationship. BD investment justified by contract value and growth potential.",
    resource_impact: "Requires 3 FTE for 45 days (PM, Technical Writer, Cost Analyst). Manageable with current capacity.",
    strategic_alignment: "high",
    assessed_at: "2026-05-09T18:30:00Z",
  },
  {
    opp_id: "opp-003",
    opp_title: "Air Force Tyndall AFB Smart Base Infrastructure",
    agency: "US Air Force",
    value: 24_600_000,
    recommendation: "bid",
    overall_score: 91,
    factors: [
      { category: "Pwin (ML)", score: 81, weight: 0.30, weighted_score: 24.3, notes: "Highest in portfolio — incumbent advantage", signal: "green" },
      { category: "Strategic Fit", score: 95, weight: 0.20, weighted_score: 19.0, notes: "Flagship contract; losing would be a significant setback", signal: "green" },
      { category: "Resource Availability", score: 92, weight: 0.15, weighted_score: 13.8, notes: "Current team in place; minimal ramp-up", signal: "green" },
      { category: "Financial Return", score: 88, weight: 0.15, weighted_score: 13.2, notes: "Expected 14% margin; largest single contract", signal: "green" },
      { category: "Competitive Landscape", score: 90, weight: 0.10, weighted_score: 9.0, notes: "Strong incumbent position; limited competition expected", signal: "green" },
      { category: "Proposal Readiness", score: 95, weight: 0.10, weighted_score: 9.5, notes: "90% reusable from current contract; deep knowledge", signal: "green" },
    ],
    rationale: "Must-win re-compete. Incumbent advantage, highest Pwin, and largest contract value. Losing this would create a $24.6M revenue gap that would take 3+ years to replace.",
    resource_impact: "Requires 5 FTE for 60 days (dedicated proposal team). Priority allocation — block other proposals if conflict arises.",
    strategic_alignment: "high",
    assessed_at: "2026-05-09T19:00:00Z",
  },
  {
    opp_id: "opp-002",
    opp_title: "EPA Superfund Technical Support",
    agency: "Environmental Protection Agency",
    value: 8_200_000,
    recommendation: "watch",
    overall_score: 52,
    factors: [
      { category: "Pwin (ML)", score: 54, weight: 0.30, weighted_score: 16.2, notes: "Below threshold (60%); declining trend", signal: "amber" },
      { category: "Strategic Fit", score: 60, weight: 0.20, weighted_score: 12.0, notes: "Expands EPA relationship but not core agency", signal: "amber" },
      { category: "Resource Availability", score: 45, weight: 0.15, weighted_score: 6.75, notes: "Key toxicologist shared with opp-001; conflict risk", signal: "red" },
      { category: "Financial Return", score: 55, weight: 0.15, weighted_score: 8.25, notes: "LPTA expected; margins may be thin (8% estimate)", signal: "amber" },
      { category: "Competitive Landscape", score: 35, weight: 0.10, weighted_score: 3.5, notes: "8+ expected bidders; strong incumbents", signal: "red" },
      { category: "Proposal Readiness", score: 50, weight: 0.10, weighted_score: 5.0, notes: "40% reusable; significant new content needed", signal: "amber" },
    ],
    rationale: "Below bid threshold on multiple factors. Resource conflict with higher-priority opp-001. Recommend watching — pursue only if opp-001 resolves early and teaming partner with EPA past perf is secured.",
    resource_impact: "Would require 2 FTE for 30 days, competing with opp-001 for toxicologist. Defer unless resource conflict resolves.",
    strategic_alignment: "medium",
    assessed_at: "2026-05-09T16:45:00Z",
  },
  {
    opp_id: "opp-004",
    opp_title: "NASA KSC Ground Systems Support",
    agency: "NASA",
    value: 45_000_000,
    recommendation: "watch",
    overall_score: 48,
    factors: [
      { category: "Pwin (ML)", score: 41, weight: 0.30, weighted_score: 12.3, notes: "Low Pwin; declining trend (-6%)", signal: "red" },
      { category: "Strategic Fit", score: 70, weight: 0.20, weighted_score: 14.0, notes: "Would establish NASA relationship; strategic value", signal: "green" },
      { category: "Resource Availability", score: 50, weight: 0.15, weighted_score: 7.5, notes: "Need to hire PM with NASA clearance; 3-month lead time", signal: "amber" },
      { category: "Financial Return", score: 65, weight: 0.15, weighted_score: 9.75, notes: "Large value but high BD cost; ROI uncertain", signal: "amber" },
      { category: "Competitive Landscape", score: 25, weight: 0.10, weighted_score: 2.5, notes: "Jacobs incumbent; Boeing and L3Harris also expected", signal: "red" },
      { category: "Proposal Readiness", score: 30, weight: 0.10, weighted_score: 3.0, notes: "20% reusable; extensive new content required", signal: "red" },
    ],
    rationale: "Strategic opportunity but current Pwin too low to justify full bid investment ($400K+ BD cost). Recommend watching: pursue JV/teaming first, then reassess. If JV secured with NASA incumbent, upgrade to bid.",
    resource_impact: "Full bid requires 6 FTE for 90 days + new hire. Only justified if JV secures incumbent advantage.",
    strategic_alignment: "medium",
    assessed_at: "2026-05-09T14:15:00Z",
  },
  {
    opp_id: "opp-005",
    opp_title: "DHS CISA CDM DEFEND Phase 4",
    agency: "Department of Homeland Security",
    value: 18_500_000,
    recommendation: "bid",
    overall_score: 74,
    factors: [
      { category: "Pwin (ML)", score: 62, weight: 0.30, weighted_score: 18.6, notes: "Above threshold; improving trend (+2%)", signal: "green" },
      { category: "Strategic Fit", score: 80, weight: 0.20, weighted_score: 16.0, notes: "Cyber/CDM is growth area; builds DHS portfolio", signal: "green" },
      { category: "Resource Availability", score: 75, weight: 0.15, weighted_score: 11.25, notes: "Core cyber team available; need cleared ISSO", signal: "green" },
      { category: "Financial Return", score: 72, weight: 0.15, weighted_score: 10.8, notes: "Expected 11% margin; good value for portfolio growth", signal: "green" },
      { category: "Competitive Landscape", score: 55, weight: 0.10, weighted_score: 5.5, notes: "5-7 bidders expected but current sub position helps", signal: "amber" },
      { category: "Proposal Readiness", score: 65, weight: 0.10, weighted_score: 6.5, notes: "55% reusable; CDM DEFEND experience is strong base", signal: "amber" },
    ],
    rationale: "Good strategic opportunity in growing cyber domain. Current sub position provides transition credibility. Above Pwin threshold with room for improvement. Recommend aggressive pursuit.",
    resource_impact: "Requires 4 FTE for 50 days (Cyber Architect, PM, Tech Writer, Cost Analyst). Available with current staffing.",
    strategic_alignment: "high",
    assessed_at: "2026-05-09T12:30:00Z",
  },
  {
    opp_id: "opp-006",
    opp_title: "DCSA MPP BAA Support Services",
    agency: "Defense Counterintelligence and Security Agency",
    value: 1_200_000,
    recommendation: "no_bid",
    overall_score: 31,
    factors: [
      { category: "Pwin (ML)", score: 35, weight: 0.30, weighted_score: 10.5, notes: "Well below threshold; no trend improvement", signal: "red" },
      { category: "Strategic Fit", score: 30, weight: 0.20, weighted_score: 6.0, notes: "DCSA not a target agency; low alignment", signal: "red" },
      { category: "Resource Availability", score: 40, weight: 0.15, weighted_score: 6.0, notes: "Would pull resources from higher-priority bids", signal: "red" },
      { category: "Financial Return", score: 25, weight: 0.15, weighted_score: 3.75, notes: "$1.2M too small; BD cost ratio 8% (unacceptable)", signal: "red" },
      { category: "Competitive Landscape", score: 20, weight: 0.10, weighted_score: 2.0, notes: "BAA: 10+ bidders expected, many with DCSA relationships", signal: "red" },
      { category: "Proposal Readiness", score: 30, weight: 0.10, weighted_score: 3.0, notes: "15% reusable; almost entirely new content", signal: "red" },
    ],
    rationale: "Does not meet minimum bid criteria on any dimension. Low Pwin, small value, high BD cost ratio, poor strategic fit, and resource drain from priority pursuits. Recommended no-bid.",
    resource_impact: "Not recommended. Resources better allocated to opp-001, opp-003, opp-005.",
    strategic_alignment: "low",
    assessed_at: "2026-05-09T09:15:00Z",
  },
];

export function getBidAssessments(): BidNoBidAssessment[] {
  return BID_ASSESSMENTS;
}

export function getBidAssessment(oppId: string): BidNoBidAssessment | null {
  return BID_ASSESSMENTS.find((a) => a.opp_id === oppId) ?? null;
}

// ---------------------------------------------------------------------------
// I-4: Win/Loss Pattern Analysis
// ---------------------------------------------------------------------------

export interface WinLossPattern {
  id: string;
  category: string;
  insight: string;
  detail: string;
  confidence: number;
  sample_size: number;
  direction: "positive" | "negative" | "neutral";
  actionable: boolean;
}

export interface AgencyPerformance {
  agency: string;
  wins: number;
  losses: number;
  win_rate: number;
  total_value_won: number;
  avg_pwin_accuracy: number;
  trend: "improving" | "declining" | "stable";
}

export interface WinLossAnalysis {
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
  patterns: WinLossPattern[];
  agency_performance: AgencyPerformance[];
  pwin_calibration: PwinCalibrationBucket[];
  quarterly_trends: QuarterlyTrend[];
}

export interface PwinCalibrationBucket {
  range: string;
  predicted_win_rate: number;
  actual_win_rate: number;
  count: number;
  calibration: "accurate" | "overconfident" | "underconfident";
}

export interface QuarterlyTrend {
  quarter: string;
  wins: number;
  losses: number;
  win_rate: number;
  avg_contract_value: number;
  total_pipeline: number;
}

const WIN_LOSS_ANALYSIS: WinLossAnalysis = {
  summary: {
    total_opportunities: 147,
    total_wins: 62,
    total_losses: 85,
    overall_win_rate: 0.422,
    avg_pwin_accuracy: 0.87,
    total_value_won: 284_500_000,
    total_value_lost: 412_000_000,
    model_calibration: "well_calibrated",
    analysis_period: "FY23-FY26 (3 years)",
    last_updated: "2026-05-09T23:00:00Z",
  },
  patterns: [
    { id: "pat-001", category: "Agency", insight: "USACE contracts have 58% win rate vs. 42% portfolio average", detail: "34 bids to USACE: 20 wins, 14 losses. Strongest in environmental services (68%) and construction management (52%). Weakest in IT services at USACE (25%).", confidence: 0.92, sample_size: 34, direction: "positive", actionable: true },
    { id: "pat-002", category: "Contract Size", insight: "$5M-$15M contracts are the sweet spot (67% win rate)", detail: "Contracts below $5M have 35% win rate (high competition, low differentiation). Contracts above $30M have 31% win rate (scale disadvantage vs. large primes). $5M-$15M is where technical excellence and relationships create competitive advantage.", confidence: 0.95, sample_size: 89, direction: "positive", actionable: true },
    { id: "pat-003", category: "Teaming", insight: "Teamed bids win 54% vs. solo bids at 38%", detail: "When teamed with a small business partner, win rate rises to 61% (SB set-aside advantage). JV structures win 58% but take longer to establish. Solo bids are viable only for <$3M tasks or sole-source.", confidence: 0.91, sample_size: 147, direction: "positive", actionable: true },
    { id: "pat-004", category: "Incumbent", insight: "Incumbents win 71% of re-competes; we win 82% when incumbent", detail: "When we are the incumbent, our win rate is 82% (14 of 17). When challenging an incumbent, our win rate drops to 34% (23 of 68). Key: invest in transition plan credibility when not incumbent.", confidence: 0.94, sample_size: 85, direction: "positive", actionable: true },
    { id: "pat-005", category: "Past Performance", insight: "3+ relevant past performance references correlate with 63% win rate", detail: "Opportunities with <3 relevant references: 41% win rate. With 3-5 references: 63% win rate. With 5+: 78% win rate. The jump from 2 to 3 relevant references is the most impactful threshold.", confidence: 0.89, sample_size: 147, direction: "positive", actionable: true },
    { id: "pat-006", category: "Timing", insight: "Proposals started >45 days before deadline have 52% win rate vs. 31% for <21 days", detail: "Early engagement correlates with more thorough proposals. Late-start proposals have 31% win rate and 2x the rate of compliance deficiencies. Most losses in the <21 day category cited 'insufficient detail' in debriefs.", confidence: 0.88, sample_size: 112, direction: "negative", actionable: true },
    { id: "pat-007", category: "Evaluation", insight: "Best-value bids win at 48% vs. LPTA at 29%", detail: "Our strengths (technical innovation, past performance) matter more in best-value evaluations. LPTA bids compress differentiation to price only — where larger firms with lower overhead rates have advantage.", confidence: 0.93, sample_size: 130, direction: "negative", actionable: true },
    { id: "pat-008", category: "NAICS", insight: "Primary NAICS match adds 12% to win rate", detail: "When our primary NAICS code matches the solicitation: 54% win rate. When secondary NAICS: 42% win rate. When no match: 28% win rate. Bidding outside core NAICS codes is high-risk.", confidence: 0.90, sample_size: 147, direction: "positive", actionable: true },
  ],
  agency_performance: [
    { agency: "US Army Corps of Engineers", wins: 20, losses: 14, win_rate: 0.588, total_value_won: 98_400_000, avg_pwin_accuracy: 0.91, trend: "improving" },
    { agency: "US Air Force", wins: 12, losses: 11, win_rate: 0.522, total_value_won: 72_000_000, avg_pwin_accuracy: 0.88, trend: "stable" },
    { agency: "Department of Homeland Security", wins: 8, losses: 12, win_rate: 0.400, total_value_won: 34_800_000, avg_pwin_accuracy: 0.85, trend: "improving" },
    { agency: "NASA", wins: 4, losses: 14, win_rate: 0.222, total_value_won: 18_000_000, avg_pwin_accuracy: 0.82, trend: "declining" },
    { agency: "Environmental Protection Agency", wins: 5, losses: 13, win_rate: 0.278, total_value_won: 12_400_000, avg_pwin_accuracy: 0.79, trend: "stable" },
    { agency: "Defense Counterintelligence and Security Agency", wins: 2, losses: 8, win_rate: 0.200, total_value_won: 3_200_000, avg_pwin_accuracy: 0.76, trend: "stable" },
    { agency: "Department of Energy", wins: 6, losses: 7, win_rate: 0.462, total_value_won: 28_500_000, avg_pwin_accuracy: 0.87, trend: "improving" },
    { agency: "Other DoD", wins: 5, losses: 6, win_rate: 0.455, total_value_won: 17_200_000, avg_pwin_accuracy: 0.84, trend: "stable" },
  ],
  pwin_calibration: [
    { range: "0-20%", predicted_win_rate: 0.10, actual_win_rate: 0.08, count: 24, calibration: "accurate" },
    { range: "20-40%", predicted_win_rate: 0.30, actual_win_rate: 0.27, count: 38, calibration: "accurate" },
    { range: "40-60%", predicted_win_rate: 0.50, actual_win_rate: 0.46, count: 42, calibration: "accurate" },
    { range: "60-80%", predicted_win_rate: 0.70, actual_win_rate: 0.72, count: 28, calibration: "accurate" },
    { range: "80-100%", predicted_win_rate: 0.90, actual_win_rate: 0.87, count: 15, calibration: "accurate" },
  ],
  quarterly_trends: [
    { quarter: "FY24-Q1", wins: 5, losses: 8, win_rate: 0.385, avg_contract_value: 8_200_000, total_pipeline: 124_000_000 },
    { quarter: "FY24-Q2", wins: 6, losses: 7, win_rate: 0.462, avg_contract_value: 9_800_000, total_pipeline: 131_000_000 },
    { quarter: "FY24-Q3", wins: 4, losses: 9, win_rate: 0.308, avg_contract_value: 7_100_000, total_pipeline: 118_000_000 },
    { quarter: "FY24-Q4", wins: 8, losses: 5, win_rate: 0.615, avg_contract_value: 11_400_000, total_pipeline: 142_000_000 },
    { quarter: "FY25-Q1", wins: 7, losses: 6, win_rate: 0.538, avg_contract_value: 10_200_000, total_pipeline: 138_000_000 },
    { quarter: "FY25-Q2", wins: 5, losses: 8, win_rate: 0.385, avg_contract_value: 8_900_000, total_pipeline: 145_000_000 },
    { quarter: "FY25-Q3", wins: 6, losses: 7, win_rate: 0.462, avg_contract_value: 9_500_000, total_pipeline: 148_000_000 },
    { quarter: "FY25-Q4", wins: 9, losses: 4, win_rate: 0.692, avg_contract_value: 12_800_000, total_pipeline: 152_000_000 },
    { quarter: "FY26-Q1", wins: 7, losses: 8, win_rate: 0.467, avg_contract_value: 10_600_000, total_pipeline: 156_000_000 },
    { quarter: "FY26-Q2", wins: 5, losses: 13, win_rate: 0.278, avg_contract_value: 7_800_000, total_pipeline: 156_400_000 },
  ],
};

export function getWinLossAnalysis(): WinLossAnalysis {
  return WIN_LOSS_ANALYSIS;
}
