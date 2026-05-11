import type {
  IntelItem,
  MorningBriefing,
  DeepResearchReport,
  CompetitorProfile,
} from "@gda/shared";

export const MOCK_INTEL_ITEMS: IntelItem[] = [
  {
    id: "intel-001",
    title: "USACE announces $180M FUDS remediation IDIQ",
    summary:
      "Army Corps posted a new pre-solicitation for Formerly Used Defense Sites environmental remediation. " +
      "Multiple award IDIQ, 5-year base plus 2 option years. Set-aside: Full & Open with SB reserve.",
    category: "opportunity",
    priority: "critical",
    source: "sam_gov",
    source_url: "https://sam.gov/opp/abc123",
    related_opportunity_id: "opp-001",
    related_competitor: null,
    tags: ["USACE", "FUDS", "environmental", "IDIQ"],
    created_at: "2026-05-10T06:00:00Z",
    data_source: "sam.gov",
    read: false,
  },
  {
    id: "intel-002",
    title: "Tetra Tech wins $42M EPA Superfund contract",
    summary:
      "Tetra Tech was awarded EPA Region 4 Superfund Technical Support contract. " +
      "This was a recompete we were tracking — incumbent advantage played out as expected.",
    category: "competitive",
    priority: "high",
    source: "fpds",
    source_url: "https://www.fpds.gov/ezsearch/search.do?q=tetra+tech+epa",
    related_opportunity_id: "opp-003",
    related_competitor: "Tetra Tech",
    tags: ["Tetra Tech", "EPA", "Superfund", "loss analysis"],
    created_at: "2026-05-09T18:30:00Z",
    data_source: "fpds",
    read: true,
  },
  {
    id: "intel-003",
    title: "New PFAS regulation draft published by EPA",
    summary:
      "EPA released proposed rule for PFAS maximum contaminant levels in drinking water. " +
      "This will drive significant new remediation requirements at DoD installations. " +
      "Potential pipeline impact: $500M+ in new PFAS remediation contracts over 3 years.",
    category: "regulatory",
    priority: "high",
    source: "news",
    source_url: "https://www.epa.gov/pfas/proposed-pfas-rule",
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["PFAS", "EPA", "regulation", "remediation", "DoD"],
    created_at: "2026-05-09T14:00:00Z",
    data_source: "manual",
    read: false,
  },
  {
    id: "intel-004",
    title: "Jacobs acquires small AI/ML environmental analytics firm",
    summary:
      "Jacobs Engineering announced acquisition of EnviroAI, a 50-person firm specializing in " +
      "machine learning for contamination plume modeling. Signals increased competitor investment in AI capabilities.",
    category: "competitive",
    priority: "medium",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: "Jacobs Engineering",
    tags: ["Jacobs", "AI", "acquisition", "competitive"],
    created_at: "2026-05-09T10:15:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-005",
    title: "Navy NAVFAC solicitation for Tyndall AFB rebuild — Phase 3",
    summary:
      "NAVFAC Southeast released Phase 3 of the Tyndall AFB resilient infrastructure rebuild. " +
      "Scope: $42M for utilities modernization and climate-resilient building systems. " +
      "Due date: June 15, 2026. Prior phases awarded to Hensel Phelps.",
    category: "opportunity",
    priority: "high",
    source: "sam_gov",
    source_url: "https://sam.gov/opp/def456",
    related_opportunity_id: "opp-005",
    related_competitor: "Hensel Phelps",
    tags: ["Navy", "NAVFAC", "Tyndall", "infrastructure", "resilience"],
    created_at: "2026-05-08T22:00:00Z",
    data_source: "sam.gov",
    read: false,
  },
  {
    id: "intel-006",
    title: "DOE NNSA security upgrades — insider threat detected in competitor bid",
    summary:
      "Intelligence from industry sources suggests a competitor's bid for NNSA security upgrades " +
      "has personnel clearance issues. This may create a re-bid opportunity for GDA if the award is protested.",
    category: "threat",
    priority: "medium",
    source: "manual",
    source_url: null,
    related_opportunity_id: "opp-007",
    related_competitor: null,
    tags: ["DOE", "NNSA", "security", "protest", "recompete"],
    created_at: "2026-05-08T16:45:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-007",
    title: "NASA KSC Launch Complex modernization RFI published",
    summary:
      "NASA Kennedy Space Center issued an RFI for next-generation launch pad environmental systems. " +
      "Includes acoustic suppression, flame trench water recovery, and emissions monitoring. " +
      "Responses due May 30.",
    category: "opportunity",
    priority: "medium",
    source: "sam_gov",
    source_url: "https://sam.gov/opp/ghi789",
    related_opportunity_id: "opp-009",
    related_competitor: null,
    tags: ["NASA", "KSC", "launch complex", "environmental", "RFI"],
    created_at: "2026-05-08T12:00:00Z",
    data_source: "sam.gov",
    read: false,
  },
  {
    id: "intel-008",
    title: "AECOM reports 15% revenue growth in federal environmental segment",
    summary:
      "AECOM's Q2 2026 earnings call highlighted 15% YoY revenue growth in their federal environmental " +
      "segment, driven by PFAS remediation and military base cleanup contracts. They plan to hire 200+ " +
      "environmental engineers this year.",
    category: "competitive",
    priority: "low",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: "AECOM",
    tags: ["AECOM", "earnings", "growth", "environmental", "hiring"],
    created_at: "2026-05-07T20:00:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-009",
    title: "AI-assisted proposal scoring gains traction in DoD evaluations",
    summary:
      "Multiple DoD agencies are piloting AI-assisted proposal evaluation tools. Early reports suggest " +
      "proposals with structured data formats and clear compliance matrices score higher. " +
      "GDA should consider adapting proposal templates.",
    category: "technology",
    priority: "medium",
    source: "research",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["AI", "proposal", "DoD", "evaluation", "technology"],
    created_at: "2026-05-07T14:30:00Z",
    data_source: "manual",
    read: false,
  },
  {
    id: "intel-010",
    title: "EPA Region 2 budget increase for environmental justice programs",
    summary:
      "EPA Region 2 (NY/NJ/PR/VI) announced a 25% budget increase for environmental justice grants " +
      "and technical assistance. New funding for community air monitoring and lead remediation. " +
      "GDA has strong past performance in Region 2.",
    category: "market",
    priority: "high",
    source: "n8n_crawl",
    source_url: "https://www.epa.gov/aboutepa/epa-region-2",
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["EPA", "Region 2", "environmental justice", "budget", "lead"],
    created_at: "2026-05-07T08:00:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-011",
    title: "Competitor Parsons posts weak Q1 in environmental services",
    summary:
      "Parsons Corp Q1 2026 results show flat revenue in environmental services segment, " +
      "citing project delays and staff turnover. May signal weakened competitive positioning " +
      "on upcoming recompetes.",
    category: "competitive",
    priority: "low",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: "Parsons",
    tags: ["Parsons", "earnings", "weakness", "recompete"],
    created_at: "2026-05-06T19:00:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-012",
    title: "Air Force announces comprehensive BRAC environmental restoration plan",
    summary:
      "Air Force Civil Engineer Center published a 5-year plan for accelerating environmental " +
      "restoration at 120+ BRAC sites. Total estimated value: $2.1B. Multiple IDIQ vehicles " +
      "expected in Q3-Q4 2026.",
    category: "market",
    priority: "critical",
    source: "n8n_crawl",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["Air Force", "BRAC", "restoration", "IDIQ", "pipeline"],
    created_at: "2026-05-06T11:00:00Z",
    data_source: "manual",
    read: false,
  },
];

export const MOCK_BRIEFINGS: MorningBriefing[] = [
  {
    id: "brief-001",
    date: "2026-05-10",
    headline: "Critical: USACE FUDS IDIQ posted — matches our top-priority capture target",
    key_metrics: [
      { label: "Active Opportunities", value: "10", change: "+1", trend: "up" },
      { label: "Pipeline Value", value: "$79.3M", change: "+$24.5M", trend: "up" },
      { label: "Avg Win Probability", value: "58%", change: "-2%", trend: "down" },
      { label: "Intel Items (7d)", value: "12", change: "+4", trend: "up" },
      { label: "Competitor Alerts", value: "5", change: "+2", trend: "up" },
      { label: "Due This Month", value: "3", change: null, trend: "flat" },
    ],
    alerts: [
      {
        severity: "critical",
        message: "USACE FUDS IDIQ ($180M) posted on SAM.gov — aligns with opp-001 capture strategy",
        source: "SAM.gov crawler",
        action_required: true,
      },
      {
        severity: "high",
        message: "Tetra Tech won EPA Superfund contract we were tracking (opp-003)",
        source: "FPDS monitor",
        action_required: false,
      },
      {
        severity: "high",
        message: "New PFAS regulation could drive $500M+ in new remediation contracts",
        source: "Federal Register monitor",
        action_required: true,
      },
      {
        severity: "medium",
        message: "Jacobs acquired AI/ML environmental analytics firm — competitive signal",
        source: "News crawler",
        action_required: false,
      },
    ],
    action_items: [
      {
        action: "Review and respond to USACE FUDS IDIQ pre-solicitation",
        priority: "critical",
        due: "2026-05-17",
        context: "Must submit capability statement within 7 days of posting",
      },
      {
        action: "Update loss analysis for EPA Superfund recompete (opp-003)",
        priority: "high",
        due: "2026-05-12",
        context: "Document lessons learned from Tetra Tech win",
      },
      {
        action: "Assess PFAS regulation impact on current pipeline",
        priority: "high",
        due: "2026-05-15",
        context: "Identify which existing opportunities benefit from new PFAS MCLs",
      },
      {
        action: "Review Tyndall AFB Phase 3 solicitation details",
        priority: "medium",
        due: "2026-06-01",
        context: "Proposal due June 15 — need teaming partner decision by June 1",
      },
    ],
    market_snapshot:
      "Federal environmental services market showing strong momentum heading into Q3 FY26. " +
      "DoD environmental restoration budgets up 12% YoY with PFAS driving new requirements. " +
      "Key competitors AECOM and Tetra Tech posting growth while Parsons shows weakness. " +
      "Air Force BRAC restoration plan ($2.1B) creates significant near-term pipeline opportunity. " +
      "Regulatory environment favoring increased environmental compliance spending across all agencies.",
    generated_at: "2026-05-10T05:00:00Z",
  },
  {
    id: "brief-002",
    date: "2026-05-09",
    headline: "EPA PFAS rule and competitor movements drive busy intel day",
    key_metrics: [
      { label: "Active Opportunities", value: "9", change: null, trend: "flat" },
      { label: "Pipeline Value", value: "$54.8M", change: null, trend: "flat" },
      { label: "Avg Win Probability", value: "60%", change: "+1%", trend: "up" },
      { label: "Intel Items (7d)", value: "8", change: "+3", trend: "up" },
      { label: "Competitor Alerts", value: "3", change: "+1", trend: "up" },
      { label: "Due This Month", value: "2", change: null, trend: "flat" },
    ],
    alerts: [
      {
        severity: "high",
        message: "EPA proposed PFAS MCL rule — major market expansion signal",
        source: "Federal Register monitor",
        action_required: true,
      },
      {
        severity: "medium",
        message: "Jacobs M&A activity — acquired AI environmental analytics startup",
        source: "News crawler",
        action_required: false,
      },
    ],
    action_items: [
      {
        action: "Review EPA PFAS proposed rule and identify pipeline impact",
        priority: "high",
        due: "2026-05-12",
        context: "30-day public comment period — consider submitting industry comment",
      },
      {
        action: "Update competitor profile for Jacobs Engineering",
        priority: "medium",
        due: "2026-05-14",
        context: "Assess impact of EnviroAI acquisition on competitive landscape",
      },
    ],
    market_snapshot:
      "Regulatory activity increasing with EPA PFAS rule publication. " +
      "Competitor consolidation continues as Jacobs acquires AI capability. " +
      "DoD budget execution on track for year-end spending surge.",
    generated_at: "2026-05-09T05:00:00Z",
  },
  {
    id: "brief-003",
    date: "2026-05-08",
    headline: "Air Force BRAC plan unlocks $2.1B restoration pipeline",
    key_metrics: [
      { label: "Active Opportunities", value: "9", change: null, trend: "flat" },
      { label: "Pipeline Value", value: "$54.8M", change: null, trend: "flat" },
      { label: "Avg Win Probability", value: "59%", change: null, trend: "flat" },
      { label: "Intel Items (7d)", value: "5", change: "+2", trend: "up" },
      { label: "Competitor Alerts", value: "2", change: null, trend: "flat" },
      { label: "Due This Month", value: "2", change: null, trend: "flat" },
    ],
    alerts: [
      {
        severity: "critical",
        message: "Air Force 5-year BRAC restoration plan ($2.1B) published — new IDIQ vehicles expected Q3-Q4",
        source: "n8n crawl",
        action_required: true,
      },
      {
        severity: "medium",
        message: "NASA KSC RFI for launch complex environmental systems — responses due May 30",
        source: "SAM.gov crawler",
        action_required: true,
      },
    ],
    action_items: [
      {
        action: "Analyze Air Force BRAC restoration plan for capture targets",
        priority: "critical",
        due: "2026-05-15",
        context: "120+ sites, multiple IDIQ vehicles — identify top 10 targets",
      },
      {
        action: "Draft NASA KSC RFI response",
        priority: "medium",
        due: "2026-05-28",
        context: "Environmental systems for launch complex — strong past performance at KSC",
      },
    ],
    market_snapshot:
      "Air Force BRAC plan is the biggest pipeline signal this quarter. " +
      "Combined with ongoing PFAS remediation demand, environmental services market outlook remains bullish.",
    generated_at: "2026-05-08T05:00:00Z",
  },
];

export const MOCK_RESEARCH_REPORTS: DeepResearchReport[] = [
  {
    id: "research-001",
    query: "PFAS remediation technology landscape and DoD adoption timeline",
    status: "completed",
    summary:
      "Comprehensive analysis of emerging PFAS treatment technologies including ion exchange, " +
      "granular activated carbon, high-pressure membranes, and destructive technologies (electrochemical oxidation, " +
      "supercritical water oxidation). DoD has allocated $2.1B for PFAS investigation and remediation through FY28.",
    findings:
      "## Key Findings\n\n" +
      "### Technology Readiness\n" +
      "- **Ion exchange resins**: TRL 9, widely deployed, cost-effective for groundwater\n" +
      "- **GAC adsorption**: TRL 9, proven but high O&M costs for long-chain PFAS\n" +
      "- **Electrochemical oxidation**: TRL 6-7, promising for concentrated waste streams\n" +
      "- **Supercritical water oxidation**: TRL 5-6, potential for complete PFAS destruction\n\n" +
      "### DoD Timeline\n" +
      "- FY26: 340 installations under investigation\n" +
      "- FY27: First wave of full-scale remediation systems\n" +
      "- FY28: $800M+ in new remediation contracts expected\n\n" +
      "### Competitive Landscape\n" +
      "- AECOM leads with 45+ PFAS remediation projects\n" +
      "- Tetra Tech expanding through EPA partnerships\n" +
      "- Arcadis strong in European markets, growing US presence\n\n" +
      "### GDA Positioning\n" +
      "- Leverage environmental monitoring expertise for investigation phase\n" +
      "- Partner with technology vendors for remediation systems\n" +
      "- Target Air Force and Navy installations (largest PFAS footprint)",
    sources_count: 47,
    requested_at: "2026-05-05T10:00:00Z",
    completed_at: "2026-05-06T14:30:00Z",
    requested_by: "Shawn",
  },
  {
    id: "research-002",
    query: "Competitor analysis: Tetra Tech federal environmental services strategy",
    status: "completed",
    summary:
      "Tetra Tech has aggressively expanded federal environmental services through strategic acquisitions " +
      "and EPA master contract positions. Revenue in this segment grew 18% YoY in FY25.",
    findings:
      "## Tetra Tech Federal Environmental Analysis\n\n" +
      "### Financial Performance\n" +
      "- Federal environmental revenue: $1.2B (FY25)\n" +
      "- Growth rate: 18% YoY\n" +
      "- Win rate on recompetes: 72%\n\n" +
      "### Key Contract Vehicles\n" +
      "- EPA ERRS/ERTS: $2.4B ceiling\n" +
      "- USACE FUDS: $900M across 3 regions\n" +
      "- Navy CLEAN: $650M IDIQ\n\n" +
      "### Strategic Priorities\n" +
      "- AI/ML integration in site characterization\n" +
      "- PFAS treatment technology partnerships\n" +
      "- Digital twin models for long-term monitoring\n\n" +
      "### Vulnerabilities\n" +
      "- Over-reliance on large IDIQ vehicles\n" +
      "- Recent project delays in Region 4\n" +
      "- Staff turnover in mid-level project managers",
    sources_count: 32,
    requested_at: "2026-05-03T09:00:00Z",
    completed_at: "2026-05-04T11:45:00Z",
    requested_by: "Shawn",
  },
  {
    id: "research-003",
    query: "Air Force BRAC environmental restoration — opportunity sizing and teaming strategy",
    status: "in_progress",
    summary: null,
    findings: null,
    sources_count: 0,
    requested_at: "2026-05-09T15:00:00Z",
    completed_at: null,
    requested_by: "Shawn",
  },
  {
    id: "research-004",
    query: "NASA environmental compliance requirements for Artemis program facilities",
    status: "queued",
    summary: null,
    findings: null,
    sources_count: 0,
    requested_at: "2026-05-10T08:00:00Z",
    completed_at: null,
    requested_by: "Shawn",
  },
];

export const MOCK_COMPETITORS: CompetitorProfile[] = [
  {
    id: "comp-001",
    name: "Tetra Tech",
    threat_score: 92,
    contracts_won: 34,
    contracts_value: 1_200_000_000,
    primary_naics: ["562910", "541620", "541330"],
    strengths: [
      "Largest EPA contract portfolio",
      "Strong recompete win rate (72%)",
      "Integrated digital/AI capabilities",
      "Deep bench of certified environmental professionals",
    ],
    weaknesses: [
      "Over-reliance on large IDIQ vehicles",
      "Recent project delays in Region 4",
      "High overhead rates",
    ],
    recent_wins: [
      "EPA Region 4 Superfund ($42M)",
      "USACE Huntsville FUDS ($28M)",
      "Navy CLEAN Task Order 17 ($15M)",
    ],
    watch_status: "active",
    last_updated: "2026-05-09T18:30:00Z",
  },
  {
    id: "comp-002",
    name: "AECOM",
    threat_score: 88,
    contracts_won: 28,
    contracts_value: 980_000_000,
    primary_naics: ["562910", "541330", "237110"],
    strengths: [
      "45+ active PFAS remediation projects",
      "Strong DoD relationships",
      "Global scale and resources",
      "15% revenue growth in federal environmental",
    ],
    weaknesses: [
      "Complex organizational structure slows proposal response",
      "Recent spinoff of infrastructure segment creates uncertainty",
      "Higher price points than smaller competitors",
    ],
    recent_wins: [
      "Air Force PFAS Investigation ($35M)",
      "Army BRAC Cleanup ($22M)",
      "DOE Hanford Support ($48M)",
    ],
    watch_status: "active",
    last_updated: "2026-05-07T20:00:00Z",
  },
  {
    id: "comp-003",
    name: "Jacobs Engineering",
    threat_score: 85,
    contracts_won: 22,
    contracts_value: 750_000_000,
    primary_naics: ["541330", "562910", "541620"],
    strengths: [
      "Recent AI/ML acquisition (EnviroAI) boosts technical capabilities",
      "Strong nuclear/DOE portfolio",
      "Diversified across environmental and infrastructure",
    ],
    weaknesses: [
      "Slower to adopt new technologies historically",
      "Less focused on small/medium environmental contracts",
      "Key personnel departures in environmental division",
    ],
    recent_wins: [
      "DOE Oak Ridge Cleanup ($65M)",
      "Army Pueblo Chemical Depot ($18M)",
    ],
    watch_status: "active",
    last_updated: "2026-05-09T10:15:00Z",
  },
  {
    id: "comp-004",
    name: "Parsons",
    threat_score: 72,
    contracts_won: 15,
    contracts_value: 420_000_000,
    primary_naics: ["562910", "541330", "541620"],
    strengths: [
      "Strong past performance in chemical demilitarization",
      "Established relationships at Army installations",
      "Competitive pricing on mid-size contracts",
    ],
    weaknesses: [
      "Flat revenue in environmental services Q1 2026",
      "Staff turnover in project management",
      "Limited PFAS remediation experience",
      "Reduced investment in new capabilities",
    ],
    recent_wins: [
      "Army APG Environmental ($12M)",
    ],
    watch_status: "monitoring",
    last_updated: "2026-05-06T19:00:00Z",
  },
  {
    id: "comp-005",
    name: "Hensel Phelps",
    threat_score: 68,
    contracts_won: 8,
    contracts_value: 310_000_000,
    primary_naics: ["236220", "237990", "562910"],
    strengths: [
      "Strong construction/infrastructure execution",
      "Incumbent on Tyndall AFB rebuild phases 1-2",
      "Design-build expertise",
    ],
    weaknesses: [
      "Limited environmental remediation expertise",
      "Primarily a construction firm — environmental is secondary",
      "Small environmental staff relative to scope",
    ],
    recent_wins: [
      "Tyndall AFB Phase 2 ($38M)",
      "NAVFAC Pacific Construction ($27M)",
    ],
    watch_status: "monitoring",
    last_updated: "2026-05-08T22:00:00Z",
  },
];
