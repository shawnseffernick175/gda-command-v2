/**
 * Mock data for Phase C enrichments:
 * - Pwin calculator breakdowns
 * - Smart recommendations
 * - Incumbent analysis
 * - Competitor field
 * - Black hat analysis
 * - Wargame scenarios
 * - Capture intel modules
 * - Teaming finder/scorer
 */

// --- Pwin Calculator ---

export interface PwinBreakdown {
  opp_id: string;
  overall_pwin: number;
  factors: PwinFactor[];
  historical_win_rate: number;
  confidence: "high" | "medium" | "low";
  last_calculated: string;
  methodology: string;
}

export interface PwinFactor {
  name: string;
  weight: number;
  score: number;
  weighted_score: number;
  rationale: string;
}

const PWIN_DATA: Record<string, PwinBreakdown> = {
  "opp-001": {
    opp_id: "opp-001",
    overall_pwin: 0.72,
    factors: [
      { name: "Technical Fit", weight: 0.30, score: 0.85, weighted_score: 0.255, rationale: "Strong defense IT services track record with USACE" },
      { name: "Past Performance", weight: 0.25, score: 0.78, weighted_score: 0.195, rationale: "3 similar contracts completed on-time in Region 4" },
      { name: "Price Competitiveness", weight: 0.20, score: 0.65, weighted_score: 0.130, rationale: "Mid-range pricing expected; incumbent has cost advantage" },
      { name: "Team Strength", weight: 0.15, score: 0.70, weighted_score: 0.105, rationale: "Core team available; need sub for geophysical surveys" },
      { name: "Customer Relationship", weight: 0.10, score: 0.72, weighted_score: 0.072, rationale: "Known to USACE Huntsville; no direct incumbent relationship" },
    ],
    historical_win_rate: 0.45,
    confidence: "high",
    last_calculated: "2026-05-09T10:00:00Z",
    methodology: "GDA Weighted Factor Model v2.1 — 5-factor analysis with historical calibration",
  },
  "opp-002": {
    opp_id: "opp-002",
    overall_pwin: 0.58,
    factors: [
      { name: "Technical Fit", weight: 0.30, score: 0.75, weighted_score: 0.225, rationale: "SETA experience but limited Region 4 work" },
      { name: "Past Performance", weight: 0.25, score: 0.60, weighted_score: 0.150, rationale: "1 DISA contract; need more direct SETA references" },
      { name: "Price Competitiveness", weight: 0.20, score: 0.55, weighted_score: 0.110, rationale: "DISA typically favors LPTA; must be aggressive on rates" },
      { name: "Team Strength", weight: 0.15, score: 0.65, weighted_score: 0.098, rationale: "Key toxicologist available; PM needs reassignment" },
      { name: "Customer Relationship", weight: 0.10, score: 0.40, weighted_score: 0.040, rationale: "No prior direct DISA Enterprise engagement" },
    ],
    historical_win_rate: 0.35,
    confidence: "medium",
    last_calculated: "2026-05-08T14:30:00Z",
    methodology: "GDA Weighted Factor Model v2.1 — 5-factor analysis with historical calibration",
  },
};

export function getPwinBreakdown(oppId: string): PwinBreakdown | null {
  return PWIN_DATA[oppId] ?? null;
}

// --- Smart Recommendations ---

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

const RECOMMENDATIONS: SmartRecommendation[] = [
  { id: "rec-001", opp_id: "opp-001", type: "action", priority: "high", title: "Submit capability statement to USACE Huntsville", description: "The contracting officer requested updated capability statements from interested parties. Deadline is 10 days before RFP release.", impact: "Positions for early engagement; missing this risks being unknown to evaluators", deadline: "2026-05-20", source: "GDA.api.smart-recommender" },
  { id: "rec-002", opp_id: "opp-001", type: "risk", priority: "high", title: "SAIC incumbent advantage on pricing", description: "SAIC has been performing this work for 5 years and has significant cost efficiencies. Their re-compete pricing will likely be 10-15% lower than a new entrant.", impact: "Must find cost reduction strategies or differentiate on technical approach", deadline: null, source: "GDA.api.smart-recommender" },
  { id: "rec-003", opp_id: "opp-001", type: "opportunity", priority: "medium", title: "Leverage C5ISR systems engineering expertise", description: "The SOW includes emerging contaminant assessment. Our STIG validation team has published 3 peer-reviewed papers — strong discriminator.", impact: "Could shift evaluation from LPTA to best-value if emphasized", deadline: null, source: "GDA.api.smart-recommender" },
  { id: "rec-004", opp_id: "opp-002", type: "action", priority: "high", title: "Attend DISA Enterprise industry day", description: "Industry day scheduled for May 25. Critical opportunity to meet the COR and understand evaluation priorities.", impact: "Direct customer engagement opportunity — currently our weakest Pwin factor", deadline: "2026-05-25", source: "GDA.api.smart-recommender" },
  { id: "rec-005", opp_id: "opp-002", type: "insight", priority: "medium", title: "DISA shifting to performance-based contracts", description: "Analysis of recent DISA enterprise awards shows a trend toward performance-based contracts with incentive fees. Consider structuring proposal accordingly.", impact: "Aligning with acquisition strategy increases relevance score", deadline: null, source: "GDA.api.smart-recommender" },
  { id: "rec-006", opp_id: "opp-003", type: "action", priority: "high", title: "Finalize teaming agreement with GDIT", description: "GDIT has expressed interest in teaming. Their C5ISR experience fills our capability gap. Need signed TA before RFP drops.", impact: "Teaming adds 15+ points to technical evaluation score", deadline: "2026-06-01", source: "GDA.api.smart-recommender" },
  { id: "rec-007", opp_id: "opp-003", type: "risk", priority: "medium", title: "Security clearance timeline risk", description: "Two proposed key personnel need TS/SCI upgrades. Current processing time is 8-12 months.", impact: "May need to substitute cleared personnel or propose interim solution", deadline: null, source: "GDA.api.smart-recommender" },
  { id: "rec-008", opp_id: "opp-004", type: "opportunity", priority: "high", title: "Small business set-aside positions us favorably", description: "This is a total small business set-aside. Our SB status eliminates large competitors. Only 4 SB firms have relevant past performance.", impact: "Reduces competitive field from 12 to 4 viable competitors", deadline: null, source: "GDA.api.smart-recommender" },
];

export function getRecommendations(oppId?: string): SmartRecommendation[] {
  if (oppId) return RECOMMENDATIONS.filter((r) => r.opp_id === oppId);
  return RECOMMENDATIONS;
}

// --- Incumbent Analysis ---

export interface IncumbentAnalysis {
  opp_id: string;
  incumbent_name: string;
  contract_number: string;
  contract_value: number;
  contract_start: string;
  contract_end: string;
  performance_rating: "excellent" | "satisfactory" | "marginal" | "unsatisfactory" | "unknown";
  recompete_advantage: number;
  strengths: string[];
  weaknesses: string[];
  key_personnel: Array<{ name: string; role: string; years_on_contract: number }>;
  protest_risk: "high" | "medium" | "low";
  notes: string;
}

const INCUMBENT_DATA: Record<string, IncumbentAnalysis> = {
  "opp-001": {
    opp_id: "opp-001",
    incumbent_name: "SAIC",
    contract_number: "W912DY-21-C-0023",
    contract_value: 18500000,
    contract_start: "2021-09-01",
    contract_end: "2026-08-31",
    performance_rating: "satisfactory",
    recompete_advantage: 0.15,
    strengths: ["5 years of site-specific knowledge", "Established relationships with USACE Huntsville", "Proven safety record at OU3", "Cost efficiencies from existing mobilization"],
    weaknesses: ["Recent OSHA citation at similar site", "PM turnover — 3rd PM in 2 years", "Behind schedule on Phase 2 milestones", "No C5ISR systems engineering capability"],
    key_personnel: [
      { name: "Sarah Mitchell", role: "Project Manager", years_on_contract: 1 },
      { name: "Robert Chen", role: "Site Supervisor", years_on_contract: 4 },
      { name: "Maria Gonzalez", role: "QA Manager", years_on_contract: 3 },
    ],
    protest_risk: "medium",
    notes: "SAIC likely to protest if they lose. Their proposal strength will be site knowledge; weakness is recent performance issues.",
  },
  "opp-002": {
    opp_id: "opp-002",
    incumbent_name: "Leidos",
    contract_number: "EP-W-22-001",
    contract_value: 12000000,
    contract_start: "2022-01-15",
    contract_end: "2027-01-14",
    performance_rating: "excellent",
    recompete_advantage: 0.22,
    strengths: ["Excellent CPARS ratings", "Deep DISA Enterprise relationships", "Technical staff with SETA expertise", "Strong subcontractor network in Southeast"],
    weaknesses: ["Higher overhead rates than competitors", "Key PM retiring in 2027", "Limited emerging contaminant capabilities"],
    key_personnel: [
      { name: "James Foster", role: "Program Manager", years_on_contract: 4 },
      { name: "Lisa Park", role: "Technical Lead", years_on_contract: 3 },
    ],
    protest_risk: "low",
    notes: "Leidos is the strong incumbent with excellent past performance. Displacing them requires significant technical differentiation.",
  },
};

export function getIncumbentAnalysis(oppId: string): IncumbentAnalysis | null {
  return INCUMBENT_DATA[oppId] ?? null;
}

// --- Competitor Field ---

export interface CompetitorEntry {
  id: string;
  name: string;
  threat_level: "high" | "medium" | "low";
  estimated_pwin: number;
  strengths: string[];
  weaknesses: string[];
  likely_teaming: string[];
  recent_wins: number;
  size_status: "large" | "small" | "8a" | "hubzone" | "sdvosb" | "wosb";
  notes: string;
}

export interface CompetitorFieldData {
  opp_id: string;
  competitors: CompetitorEntry[];
  our_position: number;
  total_expected_bidders: number;
  market_analysis: string;
}

const COMPETITOR_FIELDS: Record<string, CompetitorFieldData> = {
  "opp-001": {
    opp_id: "opp-001",
    competitors: [
      { id: "comp-1", name: "SAIC", threat_level: "high", estimated_pwin: 0.35, strengths: ["Incumbent", "Site knowledge", "USACE relationships"], weaknesses: ["Recent OSHA citation", "PM turnover"], likely_teaming: ["ManTech"], recent_wins: 8, size_status: "large", notes: "Strong incumbent — primary threat" },
      { id: "comp-2", name: "Jacobs", threat_level: "high", estimated_pwin: 0.25, strengths: ["Deep defense IT portfolio", "Strong technical staff", "DOD clearances"], weaknesses: ["Higher rates", "No site-specific experience"], likely_teaming: ["Kleinfelder"], recent_wins: 6, size_status: "large", notes: "Aggressive bidder on USACE work" },
      { id: "comp-3", name: "ManTech", threat_level: "medium", estimated_pwin: 0.15, strengths: ["Global systems engineering expertise", "Innovative technologies"], weaknesses: ["Limited USACE past performance", "European HQ perception"], likely_teaming: ["SAIC"], recent_wins: 3, size_status: "large", notes: "May team with incumbent rather than compete directly" },
      { id: "comp-4", name: "TRC Companies", threat_level: "low", estimated_pwin: 0.08, strengths: ["Strong STIG validation capabilities", "Competitive rates"], weaknesses: ["Smaller scale", "Limited DOD clearances"], likely_teaming: [], recent_wins: 2, size_status: "small", notes: "Niche player — competitive on technical innovation" },
    ],
    our_position: 2,
    total_expected_bidders: 6,
    market_analysis: "Competitive procurement with strong incumbent. LPTA evaluation favors cost efficiency. Differentiation must come from technical approach and STIG validation capabilities. Expected 5-7 bidders based on SAM.gov interest tracking.",
  },
  "opp-002": {
    opp_id: "opp-002",
    competitors: [
      { id: "comp-5", name: "Leidos", threat_level: "high", estimated_pwin: 0.40, strengths: ["Incumbent with excellent CPARS", "Deep DISA relationships", "Large SETA team"], weaknesses: ["Higher overhead", "PM retiring"], likely_teaming: ["Booz Allen Hamilton"], recent_wins: 12, size_status: "large", notes: "Dominant incumbent — very difficult to displace" },
      { id: "comp-6", name: "Wood PLC", threat_level: "medium", estimated_pwin: 0.18, strengths: ["International systems engineering experience", "Good DISA Region 3 record"], weaknesses: ["No Region 4 history", "Recent restructuring"], likely_teaming: ["APTIM"], recent_wins: 4, size_status: "large", notes: "Expanding DISA portfolio" },
      { id: "comp-7", name: "Booz Allen Hamilton", threat_level: "medium", estimated_pwin: 0.12, strengths: ["Technical innovation", "Published research team"], weaknesses: ["Smaller firm", "Limited program management"], likely_teaming: ["Leidos"], recent_wins: 5, size_status: "small", notes: "Likely to team rather than prime" },
    ],
    our_position: 3,
    total_expected_bidders: 5,
    market_analysis: "Incumbent-dominated procurement. Leidos's excellent past performance creates a high barrier to entry. Best strategy is to differentiate on emerging contaminant capabilities and propose innovative technical approach.",
  },
};

export function getCompetitorField(oppId: string): CompetitorFieldData | null {
  return COMPETITOR_FIELDS[oppId] ?? null;
}

// --- Black Hat Analysis ---

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

export interface BlackHatData {
  opp_id: string;
  scenarios: BlackHatScenario[];
  our_discriminators: string[];
  key_takeaways: string[];
}

const BLACK_HAT: Record<string, BlackHatData> = {
  "opp-001": {
    opp_id: "opp-001",
    scenarios: [
      {
        competitor: "SAIC",
        likely_strategy: "Leverage incumbent advantage with continuity-of-service narrative. Emphasize site knowledge, existing clearances, and transition risk of changing contractors.",
        technical_approach: "Propose continuation of current systems engineering approach with incremental improvements. Highlight 5 years of monitoring data as competitive advantage.",
        pricing_strategy: "Aggressive pricing leveraging existing mobilization and site infrastructure. Expect 10-15% cost advantage over new entrants.",
        teaming_strategy: "Likely to team with ManTech for STIG validation gap. May bring specialized geophysical survey sub.",
        discriminators: ["5 years site-specific data", "Existing security clearances", "Proven safety record", "Established community relationships"],
        vulnerabilities: ["Recent OSHA citation", "PM turnover", "Behind on Phase 2 milestones", "No in-house STIG validation capability"],
        counter_strategy: "Attack transition risk narrative by proposing accelerated Phase 2 completion plan. Highlight STIG validation capability as critical emerging requirement that incumbent lacks.",
      },
      {
        competitor: "Jacobs",
        likely_strategy: "Position as premium technical solution with DOD-wide defense IT portfolio. Emphasize innovation and technology integration.",
        technical_approach: "Propose advanced monitoring systems and data analytics platform. Likely to introduce digital twin technology for security assessment.",
        pricing_strategy: "Higher rates but may propose fixed-price elements to reduce government risk perception.",
        teaming_strategy: "Likely to team with Kleinfelder for local presence and soil/network infrastructure modeling expertise.",
        discriminators: ["Innovation narrative", "DOD-wide portfolio", "Digital transformation capabilities", "Strong financial backing"],
        vulnerabilities: ["No site-specific experience", "Higher rates", "Perceived as 'big firm' overhead", "May over-engineer solution"],
        counter_strategy: "Emphasize practical, proven systems engineering approaches over innovation theater. Show cost efficiency of right-sized team versus large-firm overhead.",
      },
    ],
    our_discriminators: ["C5ISR systems engineering expertise with published research", "Right-sized team with lower overhead", "Accelerated Phase 2 completion plan", "Proven USACE delivery in Southeastern US"],
    key_takeaways: ["Incumbent's OSHA citation and PM turnover are real vulnerabilities to exploit", "STIG validation is our strongest discriminator — make it central to technical approach", "Price competitiveness is essential — must be within 5% of incumbent to win", "Propose a transition plan that mitigates government's continuity risk concern"],
  },
};

export function getBlackHatAnalysis(oppId: string): BlackHatData | null {
  return BLACK_HAT[oppId] ?? null;
}

// --- Wargame Scenarios ---

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

export interface WargameData {
  opp_id: string;
  scenarios: WargameScenario[];
  recommended_strategy: string;
  confidence: number;
}

const WARGAME: Record<string, WargameData> = {
  "opp-001": {
    opp_id: "opp-001",
    scenarios: [
      { id: "wg-1", name: "Price War", probability: 0.35, description: "SAIC drops pricing 15% leveraging existing infrastructure. Jacobs matches with fixed-price elements.", our_move: "Propose best-value approach emphasizing STIG validation expertise and accelerated schedule. Competitive but not lowest price.", competitor_response: "SAIC argues transition risk; Jacobs increases innovation claims", outcome: "Win if evaluators weight technical merit; lose if pure LPTA", risk_level: "high" },
      { id: "wg-2", name: "Technical Differentiation", probability: 0.45, description: "We lead with C5ISR systems engineering innovation. Government recognizes emerging contaminant requirement as critical.", our_move: "Propose comprehensive STIG validation assessment and treatment pilot as Phase 3 add-on. Published research team as key discriminator.", competitor_response: "SAIC teams with ManTech for STIG validation. Jacobs proposes digital monitoring but lacks systems engineering experience.", outcome: "Favorable — our STIG validation team is the strongest differentiator in the competitive field", risk_level: "medium" },
      { id: "wg-3", name: "Incumbent Protest", probability: 0.20, description: "SAIC loses and files GAO protest citing evaluation errors. 100-day stop-work delays project.", our_move: "Ensure proposal is airtight on evaluation criteria compliance. Document all strengths clearly.", competitor_response: "SAIC files protest regardless of merit to create leverage for next recompete", outcome: "Win sustained but 3-4 month delay. Plan for extended transition.", risk_level: "medium" },
    ],
    recommended_strategy: "Lead with Technical Differentiation strategy. Position STIG validation expertise as the primary discriminator while maintaining competitive pricing within 5% of incumbent estimates. Prepare protest-proof documentation.",
    confidence: 0.72,
  },
};

export function getWargameData(oppId: string): WargameData | null {
  return WARGAME[oppId] ?? null;
}

// --- Capture Intel Modules ---

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

const INTEL_MODULES: IntelModule[] = [
  { id: "im-001", capture_plan_id: "CP-001", module_type: "market", title: "Defense IT Services Market Analysis", status: "complete", findings: ["DOD defense IT spending increased 12% YoY", "C5ISR systems engineering is fastest growing segment at 23% CAGR", "Consolidation trend — 3 major acquisitions in 2025"], sources: ["Federal Procurement Data System", "IBISWorld Industry Report", "GovTribe analytics"], last_updated: "2026-05-05", confidence: 0.85, action_items: ["Update competitive pricing model with market rates"] },
  { id: "im-002", capture_plan_id: "CP-001", module_type: "competitor", title: "SAIC Competitive Assessment", status: "complete", findings: ["SAIC recent restructuring reduced defense IT division by 15%", "Lost 2 USACE contracts in Southeast region in 2025", "New CEO prioritizing technology over field services"], sources: ["SEC filings", "Industry contacts", "GovTribe award data"], last_updated: "2026-05-07", confidence: 0.75, action_items: ["Monitor SAIC Q2 earnings for further restructuring signals"] },
  { id: "im-003", capture_plan_id: "CP-001", module_type: "customer", title: "USACE Huntsville Customer Intelligence", status: "in_progress", findings: ["New Division Chief started January 2026", "Budget increase for emerging contaminants", "Shifting preference toward best-value evaluations"], sources: ["Industry day notes", "Published acquisition forecast", "GDA relationship tracker"], last_updated: "2026-05-08", confidence: 0.65, action_items: ["Schedule introductory meeting with new Division Chief", "Attend June SAME conference for customer engagement"] },
  { id: "im-004", capture_plan_id: "CP-001", module_type: "technical", title: "STIG Validation & Automation Technology Assessment", status: "complete", findings: ["Our automated SCAP scanning achieves 99.7% STIG compliance validation", "Proprietary STIG automation framework is industry-first", "Published 3 technical whitepapers in 2025"], sources: ["Internal R&D reports", "DISA cyber IA services database", "Technical publications"], last_updated: "2026-05-03", confidence: 0.90, action_items: ["Prepare technical white paper for customer engagement"] },
  { id: "im-005", capture_plan_id: "CP-001", module_type: "pricing", title: "Pricing Intelligence & Strategy", status: "in_progress", findings: ["Incumbent SAIC rates estimated at $165-185/hr blended", "Government IGE likely based on incumbent performance", "Room for 5-8% underbid while maintaining margin"], sources: ["GSA schedule analysis", "Subcontractor rate sheets", "Historical pricing data"], last_updated: "2026-05-06", confidence: 0.60, action_items: ["Finalize wrap rate analysis", "Get updated sub quotes by May 20"] },
  { id: "im-006", capture_plan_id: "CP-002", module_type: "market", title: "DISA SETA Program Analysis", status: "complete", findings: ["FY26 NDAA added $3.5B to cyber modernization", "DISA has 15 new cybersecurity contract opportunities", "Performance-based contracts increasing"], sources: ["DoD FY26 budget justification", "Federal Register notices", "GAO report 26-104"], last_updated: "2026-05-04", confidence: 0.80, action_items: [] },
  { id: "im-007", capture_plan_id: "CP-002", module_type: "customer", title: "DISA Enterprise Acquisition Strategy", status: "pending", findings: [], sources: [], last_updated: "2026-05-01", confidence: 0, action_items: ["Request pre-solicitation meeting with DISA Enterprise COR", "Review recent DISA OSDBU briefings for SB goals"] },
];

export function getIntelModules(capturePlanId?: string): IntelModule[] {
  if (capturePlanId) return INTEL_MODULES.filter((m) => m.capture_plan_id === capturePlanId);
  return INTEL_MODULES;
}

// --- Teaming Finder/Scorer ---

export interface TeamingCandidate {
  id: string;
  company_name: string;
  size_status: "large" | "small" | "8a" | "hubzone" | "sdvosb" | "wosb";
  cage_code: string;
  capabilities: string[];
  past_performance_score: number;
  relationship_strength: "strong" | "moderate" | "new";
  geographic_coverage: string[];
  clearance_level: "ts_sci" | "secret" | "public_trust" | "none";
  teaming_score: number;
  rationale: string;
  risks: string[];
  recommended_role: "sub" | "teammate" | "mentor_protege";
}

export interface TeamingFinderData {
  opp_id: string;
  candidates: TeamingCandidate[];
  gaps_identified: string[];
  recommended_team: string[];
}

const TEAMING: Record<string, TeamingFinderData> = {
  "opp-001": {
    opp_id: "opp-001",
    candidates: [
      { id: "tc-1", company_name: "Booz Allen Hamilton Consultants", size_status: "small", cage_code: "3K4M7", capabilities: ["Network Infrastructure modeling", "cyber IA services", "Risk assessment"], past_performance_score: 88, relationship_strength: "strong", geographic_coverage: ["Southeast US", "Mid-Atlantic"], clearance_level: "secret", teaming_score: 92, rationale: "Fills geophysical survey gap and adds published STIG validation research team", risks: ["Capacity constraints — also bidding DISA Enterprise"], recommended_role: "sub" },
      { id: "tc-2", company_name: "Kleinfelder", size_status: "small", cage_code: "5R2P1", capabilities: ["Geotechnical engineering", "Defense IT monitoring", "Data analytics"], past_performance_score: 82, relationship_strength: "moderate", geographic_coverage: ["Southeast US", "Southwest US"], clearance_level: "public_trust", teaming_score: 78, rationale: "Strong local presence near Fort Bragg with relevant USACE experience", risks: ["May team with Jacobs instead"], recommended_role: "sub" },
      { id: "tc-3", company_name: "Ensafe", size_status: "small", cage_code: "8T5N2", capabilities: ["cybersecurity operations", "Defense IT security assessment", "Health & safety"], past_performance_score: 75, relationship_strength: "new", geographic_coverage: ["Southeast US"], clearance_level: "secret", teaming_score: 71, rationale: "cybersecurity operations capability if site has military munitions", risks: ["No existing relationship — need to build trust"], recommended_role: "sub" },
    ],
    gaps_identified: ["Geophysical survey capability", "STIG validation network infrastructure treatment design", "Local Fort Bragg site knowledge"],
    recommended_team: ["Booz Allen Hamilton Consultants (geophysical + STIG validation)", "Kleinfelder (local presence + monitoring)"],
  },
};

export function getTeamingCandidates(oppId: string): TeamingFinderData | null {
  return TEAMING[oppId] ?? null;
}

// --- Notifications ---

export interface Notification {
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

const NOTIFICATIONS: Notification[] = [
  { id: "n-001", type: "deadline", severity: "critical", title: "RFP Response Due in 5 Days", message: "USACE SETA Support Services (opp-001) proposal is due June 15. Final review not yet scheduled.", timestamp: "2026-05-10T08:00:00Z", read: false, link: "/opportunities/opp-001", source: "GDA.cron.deadline-escalation" },
  { id: "n-002", type: "approval", severity: "warning", title: "Bid Decision Pending — DISA SETA", message: "Bid/no-bid decision for DISA SETA Technical Support (opp-002) requires VP approval. Current Pwin: 58%.", timestamp: "2026-05-10T07:30:00Z", read: false, link: "/approvals", source: "GDA.api.approvals-queue" },
  { id: "n-003", type: "intel", severity: "info", title: "Competitor Alert: SAIC Restructuring", message: "SAIC announced defense IT division restructuring. 15% staff reduction may impact incumbent performance on opp-001.", timestamp: "2026-05-09T16:00:00Z", read: false, link: "/intel", source: "GDA.cron.competitor-crawler" },
  { id: "n-004", type: "milestone", severity: "warning", title: "Capture Plan Milestone Overdue", message: "Customer engagement meeting for PEO IEW&S SETA was due May 5. Not yet completed.", timestamp: "2026-05-09T09:00:00Z", read: true, link: "/capture", source: "GDA.cron.capture-milestone-alerts" },
  { id: "n-005", type: "risk", severity: "critical", title: "Security Clearance Timeline Risk", message: "Two proposed key personnel for C5ISR contract need TS/SCI upgrades. Current processing: 8-12 months. Contract start: Oct 2026.", timestamp: "2026-05-08T14:00:00Z", read: true, link: "/opportunities/opp-003", source: "GDA.api.smart-recommender" },
  { id: "n-006", type: "system", severity: "info", title: "n8n Workflow Health Check", message: "3 workflows recovered after credential update. gda-intel-feed still requires Tavily API key configuration.", timestamp: "2026-05-08T10:00:00Z", read: true, link: "/workflows", source: "GDA.api.platform-health" },
  { id: "n-007", type: "intel", severity: "info", title: "New SAM.gov Opportunity Match", message: "3 new opportunities matching your profile were found during the nightly scan. Highest score: 82 (NAVFAC Defense IT).", timestamp: "2026-05-08T06:00:00Z", read: true, link: "/ops-tracker", source: "GDA.cron.master-scanner" },
  { id: "n-008", type: "deadline", severity: "warning", title: "Teaming Agreement Deadline", message: "Teaming agreement with GDIT for C5ISR contract must be signed by June 1 to include in proposal.", timestamp: "2026-05-07T12:00:00Z", read: true, link: "/capture", source: "GDA.cron.capture-milestone-alerts" },
];

export function getNotifications(unreadOnly?: boolean): Notification[] {
  if (unreadOnly) return NOTIFICATIONS.filter((n) => !n.read);
  return NOTIFICATIONS;
}

export function getUnreadCount(): number {
  return NOTIFICATIONS.filter((n) => !n.read).length;
}
