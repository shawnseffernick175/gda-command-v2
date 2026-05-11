// ---------------------------------------------------------------------------
// Risk Register mock data — if-this-then-that risk tracking
// ---------------------------------------------------------------------------

export interface RiskRegisterEntry {
  id: string;
  opportunity_id: string | null;
  opportunity_title: string | null;
  category: "technical" | "programmatic" | "cost" | "schedule" | "competitive" | "regulatory" | "teaming" | "past_performance";
  if_statement: string;
  then_statement: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  risk_score: number; // 1-25 (likelihood * impact matrix)
  status: "open" | "mitigating" | "accepted" | "closed" | "realized";
  mitigation_plan: string;
  mitigation_owner: string;
  trigger_indicators: string[];
  contingency_plan: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  data_source: string | null;
}

function riskScore(likelihood: string, impact: string): number {
  const map: Record<string, number> = { high: 5, medium: 3, low: 1 };
  return (map[likelihood] ?? 1) * (map[impact] ?? 1);
}

export const MOCK_RISK_REGISTER: RiskRegisterEntry[] = [
  {
    id: "RISK-001",
    opportunity_id: "opp-001",
    opportunity_title: "USACE FUDS IDIQ — Environmental Restoration Services",
    category: "teaming",
    if_statement: "Enviro-Compliance teaming agreement does not close by May 15",
    then_statement: "Proposal will lack state EPA coordination capability, reducing technical score by 10-15 points",
    likelihood: "medium",
    impact: "high",
    risk_score: riskScore("medium", "high"),
    status: "mitigating",
    mitigation_plan: "Parallel negotiations with TRC Environmental as backup sub. Weekly status calls with Enviro-Compliance legal.",
    mitigation_owner: "Shawn Seffernick",
    trigger_indicators: [
      "No signed LOI by May 10",
      "Legal review takes > 5 business days",
      "Enviro-Compliance requests exclusivity terms",
    ],
    contingency_plan: "Execute TRC Environmental teaming agreement within 48 hours. TRC has pre-negotiated terms ready.",
    due_date: "2026-05-15",
    created_at: "2026-04-20T10:00:00Z",
    updated_at: "2026-05-09T14:30:00Z",
    data_source: "manual",
  },
  {
    id: "RISK-002",
    opportunity_id: "opp-001",
    opportunity_title: "USACE FUDS IDIQ — Environmental Restoration Services",
    category: "regulatory",
    if_statement: "EPA finalizes new PFAS MCL standards before RFP closes",
    then_statement: "Scope and pricing assumptions become invalid, requiring major proposal revision within compressed timeline",
    likelihood: "high",
    impact: "medium",
    risk_score: riskScore("high", "medium"),
    status: "open",
    mitigation_plan: "Monitor Federal Register daily. Prepare two pricing scenarios: current MCLs and proposed MCLs.",
    mitigation_owner: "Technical Lead",
    trigger_indicators: [
      "EPA publishes final rule in Federal Register",
      "OMB completes review of proposed rule",
      "Congressional hearing scheduled on PFAS standards",
    ],
    contingency_plan: "Submit proposal amendment within 5 business days of rule change. Pre-drafted amendment language ready.",
    due_date: "2026-06-15",
    created_at: "2026-04-15T09:00:00Z",
    updated_at: "2026-05-08T11:00:00Z",
    data_source: "sam.gov",
  },
  {
    id: "RISK-003",
    opportunity_id: "opp-004",
    opportunity_title: "Air Force Tyndall AFB Environmental Restoration — Phase 3",
    category: "competitive",
    if_statement: "Hensel Phelps leverages existing construction contract to expand into environmental scope",
    then_statement: "Government may sole-source environmental work to Hensel Phelps, eliminating competitive opportunity",
    likelihood: "medium",
    impact: "high",
    risk_score: riskScore("medium", "high"),
    status: "open",
    mitigation_plan: "Demonstrate through industry day briefing that environmental scope requires specialized CERCLA expertise not available through construction contractor.",
    mitigation_owner: "BD Coordinator",
    trigger_indicators: [
      "Hensel Phelps hires environmental staff",
      "Base issues RFI combining construction and environmental",
      "Environmental scope referenced in construction contract mod",
    ],
    contingency_plan: "File protest if sole-source determination is made without market research.",
    due_date: "2026-06-01",
    created_at: "2026-04-25T08:00:00Z",
    updated_at: "2026-05-07T16:00:00Z",
    data_source: "sam.gov",
  },
  {
    id: "RISK-004",
    opportunity_id: "opp-004",
    opportunity_title: "Air Force Tyndall AFB Environmental Restoration — Phase 3",
    category: "technical",
    if_statement: "RFP requires 8(a) set-aside designation",
    then_statement: "Golden Dome cannot bid as prime; must restructure as sub to an 8(a) firm, reducing control and margin",
    likelihood: "medium",
    impact: "high",
    risk_score: riskScore("medium", "high"),
    status: "mitigating",
    mitigation_plan: "Pre-identified 8(a) teaming partner (EnviroTech Solutions). Draft mentor-protégé agreement prepared.",
    mitigation_owner: "Shawn Seffernick",
    trigger_indicators: [
      "Draft RFP references 8(a) set-aside",
      "SBA approves 8(a) sole-source request",
      "Market research indicates limited small business interest",
    ],
    contingency_plan: "Execute mentor-protégé agreement with EnviroTech. Golden Dome performs 40% as sub.",
    due_date: "2026-05-20",
    created_at: "2026-04-22T10:00:00Z",
    updated_at: "2026-05-06T09:00:00Z",
    data_source: "manual",
  },
  {
    id: "RISK-005",
    opportunity_id: "opp-010",
    opportunity_title: "NASA KSC Launch Complex Modernization",
    category: "past_performance",
    if_statement: "Evaluation team weights NASA past performance above technical approach",
    then_statement: "Golden Dome scores poorly on past performance (no NASA contracts), dropping below competitive range",
    likelihood: "high",
    impact: "high",
    risk_score: riskScore("high", "high"),
    status: "mitigating",
    mitigation_plan: "JV with Jacobs who has 10+ years NASA KSC experience. Structure JV so Jacobs past performance qualifies the team.",
    mitigation_owner: "BD Coordinator",
    trigger_indicators: [
      "RFP evaluation criteria weights PP > 25%",
      "Jacobs JV negotiations stall",
      "NASA rejects JV past performance relevancy",
    ],
    contingency_plan: "Pivot to sub role under Jacobs as prime if JV is rejected.",
    due_date: "2026-05-30",
    created_at: "2026-04-18T09:00:00Z",
    updated_at: "2026-05-10T10:00:00Z",
    data_source: "govwin",
  },
  {
    id: "RISK-006",
    opportunity_id: "opp-002",
    opportunity_title: "EPA Superfund Technical Support — Region 4",
    category: "competitive",
    if_statement: "AECOM submits significantly lower price based on incumbent efficiencies",
    then_statement: "Government selects AECOM despite lower technical score, as LPTA evaluation favors price",
    likelihood: "high",
    impact: "high",
    risk_score: riskScore("high", "high"),
    status: "open",
    mitigation_plan: "Identify cost efficiencies through innovation (AI-powered site characterization, remote sensing). Target 15% cost reduction vs. traditional approach.",
    mitigation_owner: "Pricing Manager",
    trigger_indicators: [
      "RFP confirms LPTA evaluation methodology",
      "AECOM posts job listings for Region 4 staff",
      "IGCE indicates government budget below our initial estimate",
    ],
    contingency_plan: "If LPTA confirmed, restructure proposal around minimum viable approach with option tasks for enhanced capabilities.",
    due_date: "2026-07-20",
    created_at: "2026-03-10T09:00:00Z",
    updated_at: "2026-05-09T15:00:00Z",
    data_source: "sam.gov",
  },
  {
    id: "RISK-007",
    opportunity_id: null,
    opportunity_title: null,
    category: "programmatic",
    if_statement: "Key capture manager leaves the company during proposal season",
    then_statement: "Multiple active captures lose institutional knowledge, delaying proposals by 2-4 weeks across 3+ opportunities",
    likelihood: "low",
    impact: "high",
    risk_score: riskScore("low", "high"),
    status: "accepted",
    mitigation_plan: "Cross-train BD coordinators on all active captures. Maintain shared capture plan documentation in GDA Command.",
    mitigation_owner: "VP of BD",
    trigger_indicators: [
      "Key personnel receives competing job offer",
      "Employee engagement survey shows dissatisfaction",
      "Capture manager misses 2+ deadlines in succession",
    ],
    contingency_plan: "Activate bench capture manager. All capture plans documented in GDA Command for continuity.",
    due_date: null,
    created_at: "2026-01-15T09:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
    data_source: "manual",
  },
  {
    id: "RISK-008",
    opportunity_id: "opp-006",
    opportunity_title: "DOE Oak Ridge Decommissioning & Demolition Support",
    category: "schedule",
    if_statement: "DOE delays RFP release beyond July 2026",
    then_statement: "Proposal team availability conflicts with USACE FUDS proposal preparation, splitting resources",
    likelihood: "medium",
    impact: "medium",
    risk_score: riskScore("medium", "medium"),
    status: "open",
    mitigation_plan: "Monitor DOE procurement timeline. Identify supplemental proposal writers from bench if overlap occurs.",
    mitigation_owner: "Program Manager",
    trigger_indicators: [
      "DOE postpones industry day",
      "Pre-solicitation notice revised with later timeline",
      "Q-clearance processing backlog exceeds 6 months",
    ],
    contingency_plan: "Engage proposal support contractor (Lohfeld Consulting) for supplemental writing capacity.",
    due_date: "2026-07-01",
    created_at: "2026-03-20T09:00:00Z",
    updated_at: "2026-05-05T14:00:00Z",
    data_source: "sam.gov",
  },
  {
    id: "RISK-009",
    opportunity_id: "opp-001",
    opportunity_title: "USACE FUDS IDIQ — Environmental Restoration Services",
    category: "cost",
    if_statement: "Subcontractor rates increase by more than 5% during proposal preparation",
    then_statement: "Proposed pricing becomes uncompetitive or margin drops below 8% threshold",
    likelihood: "low",
    impact: "medium",
    risk_score: riskScore("low", "medium"),
    status: "closed",
    mitigation_plan: "Lock in subcontractor rates via signed rate agreements before proposal submission. Include escalation clauses.",
    mitigation_owner: "Pricing Manager",
    trigger_indicators: [
      "CPI exceeds 4% YoY",
      "Subcontractor requests rate renegotiation",
      "Labor market tightens for environmental engineers",
    ],
    contingency_plan: null,
    due_date: "2026-05-01",
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-05-01T10:00:00Z",
    data_source: "manual",
  },
  {
    id: "RISK-010",
    opportunity_id: "opp-003",
    opportunity_title: "Navy PFAS Investigation & Remedial Action — NAS Jacksonville",
    category: "regulatory",
    if_statement: "DoD issues interim PFAS cleanup guidance that differs from EPA standards",
    then_statement: "Remedial approach in proposal may not align with updated DoD requirements, requiring technical rewrite",
    likelihood: "medium",
    impact: "medium",
    risk_score: riskScore("medium", "medium"),
    status: "open",
    mitigation_plan: "Track DoD PFAS Task Force announcements. Design remedial approach flexible enough to accommodate both EPA and DoD standards.",
    mitigation_owner: "Technical Lead",
    trigger_indicators: [
      "DoD PFAS Task Force publishes new guidance",
      "Navy issues PFAS-specific remediation directive",
      "Congress includes PFAS cleanup funding in NDAA",
    ],
    contingency_plan: "Pivot to DoD-specific approach within 10 business days. Technical team has drafted alternative methodology.",
    due_date: "2026-08-30",
    created_at: "2026-04-01T09:00:00Z",
    updated_at: "2026-05-08T12:00:00Z",
    data_source: "govwin",
  },
  {
    id: "RISK-011",
    opportunity_id: "opp-001",
    opportunity_title: "USACE FUDS IDIQ — Environmental Restoration Services",
    category: "technical",
    if_statement: "USACE requires specific PFAS destruction technology not yet commercially available",
    then_statement: "Cannot meet mandatory technical requirement, rendering proposal non-compliant",
    likelihood: "low",
    impact: "high",
    risk_score: riskScore("low", "high"),
    status: "mitigating",
    mitigation_plan: "Partner with Battelle (PFAS Annihilator developer) and include technology maturation plan in proposal. Pre-qualify with USACE EM.",
    mitigation_owner: "Technical Lead",
    trigger_indicators: [
      "RFP mandates specific PFAS destruction technology",
      "EPA approves PFAS destruction technology standard",
      "USACE issues technology qualification requirement",
    ],
    contingency_plan: "Propose phased approach: conventional treatment first, then transition to emerging technology as it matures.",
    due_date: "2026-06-15",
    created_at: "2026-04-10T09:00:00Z",
    updated_at: "2026-05-09T11:00:00Z",
    data_source: "manual",
  },
  {
    id: "RISK-012",
    opportunity_id: null,
    opportunity_title: null,
    category: "programmatic",
    if_statement: "Government shutdown occurs during October-November 2026",
    then_statement: "All active procurements freeze, proposal deadlines shift, and capture momentum is lost across portfolio",
    likelihood: "medium",
    impact: "high",
    risk_score: riskScore("medium", "high"),
    status: "accepted",
    mitigation_plan: "Front-load proposal activities before October CR deadline. Maintain team availability through shutdown period.",
    mitigation_owner: "VP of BD",
    trigger_indicators: [
      "Congress fails to pass CR by September 30",
      "Appropriations bills stall in committee",
      "OMB issues shutdown planning guidance",
    ],
    contingency_plan: "Shift resources to state/commercial environmental work during shutdown. Resume federal captures upon reopening.",
    due_date: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-05-01T09:00:00Z",
    data_source: "manual",
  },
];

export function getRiskRegister() {
  return MOCK_RISK_REGISTER;
}

export function getRiskById(id: string) {
  return MOCK_RISK_REGISTER.find((r) => r.id === id) ?? null;
}

export function getRisksByOpportunity(oppId: string) {
  return MOCK_RISK_REGISTER.filter((r) => r.opportunity_id === oppId);
}
