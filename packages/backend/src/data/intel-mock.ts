import type {
  IntelItem,
  MorningBriefing,
  DeepResearchReport,
  CompetitorProfile,
} from "@gda/shared";

export const MOCK_INTEL_ITEMS: IntelItem[] = [
  {
    id: "intel-001",
    title: "Army PEO IEW&S releases SETA follow-on RFP — $28.5M ceiling",
    summary:
      "PEO Intelligence, Electronic Warfare & Sensors posted the final RFP for next-gen ISR SETA support. " +
      "Full & Open with SDVOSB set-aside evaluation factor. Incumbent is Leidos. Proposal due Aug 15, 2026.",
    category: "opportunity",
    priority: "critical",
    source: "sam_gov",
    source_url: "https://sam.gov/opp/iews-seta-2026",
    related_opportunity_id: "opp-001",
    related_competitor: "Leidos",
    tags: ["Army", "PEO IEW&S", "SETA", "ISR", "SDVOSB"],
    created_at: "2026-05-12T06:00:00Z",
    data_source: "sam.gov",
    read: false,
  },
  {
    id: "intel-002",
    title: "DoD CIO mandates zero trust architecture by FY28 for all networks",
    summary:
      "The DoD CIO issued a directive requiring all DoD components to implement zero trust architecture " +
      "per the DoD Zero Trust Reference Architecture v2.0 by end of FY28. This creates significant " +
      "demand for cybersecurity engineering and migration services across all military branches.",
    category: "regulatory",
    priority: "critical",
    source: "news",
    source_url: "https://dodcio.defense.gov/zero-trust",
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["DoD", "zero trust", "cybersecurity", "policy", "FY28"],
    created_at: "2026-05-11T18:30:00Z",
    data_source: "manual",
    read: false,
  },
  {
    id: "intel-003",
    title: "Leidos wins $450M DISA Global Information Grid contract",
    summary:
      "Leidos was awarded the DISA GIG Engineering & Sustainment contract, beating SAIC and Booz Allen. " +
      "5-year IDIQ with $450M ceiling. Strengthens Leidos position on Army network programs and may " +
      "signal aggressive pricing on follow-on SETA work.",
    category: "competitive",
    priority: "high",
    source: "fpds",
    source_url: "https://www.fpds.gov/ezsearch/search.do?q=leidos+disa+gig",
    related_opportunity_id: null,
    related_competitor: "Leidos",
    tags: ["Leidos", "DISA", "GIG", "network", "award"],
    created_at: "2026-05-11T14:00:00Z",
    data_source: "fpds",
    read: true,
  },
  {
    id: "intel-004",
    title: "CMMC 2.0 Level 2 assessment timeline accelerated — C3PAOs ramping up",
    summary:
      "The Cyber AB announced that CMMC Level 2 assessments are running ahead of schedule with 40+ " +
      "C3PAOs now accredited. Companies without assessments scheduled by Q4 2026 risk being locked " +
      "out of DoD contracts requiring CMMC compliance.",
    category: "regulatory",
    priority: "high",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["CMMC", "cybersecurity", "compliance", "DoD", "C3PAO"],
    created_at: "2026-05-11T10:15:00Z",
    data_source: "manual",
    read: false,
  },
  {
    id: "intel-005",
    title: "DEVCOM C5ISR posts Sources Sought for cyber security IA services",
    summary:
      "DEVCOM C5ISR Center published a Sources Sought notice for Cyber Security & Information Assurance " +
      "engineering support. Scope includes RMF assessment, STIG compliance, and penetration testing. " +
      "$22M estimated value. Responses due June 15.",
    category: "opportunity",
    priority: "high",
    source: "sam_gov",
    source_url: "https://sam.gov/opp/c5isr-cyber-2026",
    related_opportunity_id: "opp-003",
    related_competitor: null,
    tags: ["C5ISR", "DEVCOM", "cybersecurity", "RMF", "STIG"],
    created_at: "2026-05-10T22:00:00Z",
    data_source: "sam.gov",
    read: false,
  },
  {
    id: "intel-006",
    title: "FAR Case 2024-006: New cybersecurity incident reporting requirements",
    summary:
      "FAR Council issued final rule requiring contractors to report cybersecurity incidents within 8 hours " +
      "(down from 72 hours). Applies to all contracts over $250K handling CUI. Effective October 1, 2026. " +
      "Companies need updated incident response plans and 24/7 SOC capability.",
    category: "regulatory",
    priority: "high",
    source: "news",
    source_url: "https://www.federalregister.gov/documents/far-case-2024-006",
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["FAR", "cybersecurity", "incident reporting", "CUI", "compliance"],
    created_at: "2026-05-10T16:45:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-007",
    title: "SAIC acquires small AI/ML defense analytics firm for $180M",
    summary:
      "SAIC announced acquisition of DefenseAI, a 120-person firm specializing in machine learning " +
      "for ISR data fusion and predictive maintenance. Signals increased competitor investment in AI " +
      "capabilities for defense IT programs.",
    category: "competitive",
    priority: "medium",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: "SAIC",
    tags: ["SAIC", "AI", "acquisition", "ISR", "competitive"],
    created_at: "2026-05-10T12:00:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-008",
    title: "DoD FY27 budget request: +8% for cyber operations, +12% for AI/ML",
    summary:
      "The FY27 President's Budget Request includes $14.5B for cyberspace operations (+8% over FY26) " +
      "and $3.2B for AI/ML initiatives (+12%). Key growth areas: zero trust implementation, cloud " +
      "migration, autonomous systems, and AI-enabled decision support.",
    category: "market",
    priority: "critical",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["DoD", "budget", "FY27", "cyber", "AI", "funding"],
    created_at: "2026-05-09T20:00:00Z",
    data_source: "manual",
    read: false,
  },
  {
    id: "intel-009",
    title: "ManTech posts weak Q1 — potential teaming opportunity on Army programs",
    summary:
      "ManTech Q1 2026 earnings show 5% revenue decline in defense IT segment citing " +
      "staff turnover and delayed task order awards. May signal weakened competitive positioning " +
      "on Army SETA recompetes. Consider teaming approach for PEO IEW&S follow-on.",
    category: "competitive",
    priority: "medium",
    source: "news",
    source_url: null,
    related_opportunity_id: "opp-001",
    related_competitor: "ManTech",
    tags: ["ManTech", "earnings", "weakness", "teaming", "Army"],
    created_at: "2026-05-09T14:30:00Z",
    data_source: "manual",
    read: false,
  },
  {
    id: "intel-010",
    title: "OMB Memo M-26-12: AI governance framework for federal agencies",
    summary:
      "OMB issued guidance requiring agencies to establish AI governance boards and conduct impact " +
      "assessments for all AI systems in production by December 2026. Creates demand for AI governance " +
      "consulting and compliance assessment services.",
    category: "regulatory",
    priority: "medium",
    source: "news",
    source_url: "https://www.whitehouse.gov/omb/memo-m-26-12",
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["OMB", "AI", "governance", "policy", "federal"],
    created_at: "2026-05-09T08:00:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-011",
    title: "DISA awards Enterprise Cloud Computing contract modifications worth $620M",
    summary:
      "DISA issued contract modifications to milCloud 2.0 and JEDI follow-on for DoD enterprise cloud. " +
      "AWS and Azure split the awards. Creates downstream demand for cloud migration engineering, " +
      "security accreditation (ATO), and DevSecOps pipeline development.",
    category: "market",
    priority: "high",
    source: "fpds",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["DISA", "cloud", "AWS", "Azure", "migration", "DevSecOps"],
    created_at: "2026-05-08T19:00:00Z",
    data_source: "fpds",
    read: true,
  },
  {
    id: "intel-012",
    title: "Air Force Hanscom issues draft RFP for Enterprise IT Network Modernization",
    summary:
      "Hanscom AFB released draft RFP for the $42M Enterprise IT Network Modernization program. " +
      "Scope includes SD-WAN deployment, zero trust perimeter, and network operations center automation. " +
      "Final RFP expected June 2026. Strong fit for Envision capabilities.",
    category: "opportunity",
    priority: "critical",
    source: "sam_gov",
    source_url: "https://sam.gov/opp/hanscom-eit-2026",
    related_opportunity_id: "opp-006",
    related_competitor: null,
    tags: ["Air Force", "Hanscom", "network", "SD-WAN", "zero trust"],
    created_at: "2026-05-08T11:00:00Z",
    data_source: "sam.gov",
    read: false,
  },
  {
    id: "intel-013",
    title: "Executive Order on strengthening federal cybersecurity workforce",
    summary:
      "New EO directs agencies to increase cybersecurity hiring by 15% and establish cyber excepted service " +
      "positions. Also mandates contractor workforce development programs. Good signal for SETA contracts " +
      "that include training components.",
    category: "regulatory",
    priority: "medium",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["EO", "cybersecurity", "workforce", "training", "SETA"],
    created_at: "2026-05-07T15:00:00Z",
    data_source: "manual",
    read: true,
  },
  {
    id: "intel-014",
    title: "Booz Allen Hamilton restructures defense IT division — 200 layoffs",
    summary:
      "BAH announced restructuring of its defense IT consulting division, cutting 200 positions " +
      "and consolidating three business units. May weaken their bench for upcoming Army and DISA " +
      "recompetes in the C5ISR space.",
    category: "competitive",
    priority: "medium",
    source: "news",
    source_url: null,
    related_opportunity_id: null,
    related_competitor: "Booz Allen Hamilton",
    tags: ["BAH", "restructuring", "layoffs", "defense IT"],
    created_at: "2026-05-07T10:00:00Z",
    data_source: "manual",
    read: false,
  },
  {
    id: "intel-015",
    title: "DFARS Case 2025-D001: Enhanced security requirements for controlled technical information",
    summary:
      "DFARS interim rule adds new security controls for handling controlled technical information " +
      "on defense IT systems. Requires encryption at rest using FIPS 140-3 validated modules. " +
      "Affects all contracts with DFARS 252.204-7012 clause.",
    category: "regulatory",
    priority: "high",
    source: "news",
    source_url: "https://www.federalregister.gov/dfars-2025-d001",
    related_opportunity_id: null,
    related_competitor: null,
    tags: ["DFARS", "security", "CTI", "FIPS", "encryption"],
    created_at: "2026-05-06T14:00:00Z",
    data_source: "manual",
    read: true,
  },
];

export const MOCK_BRIEFINGS: MorningBriefing[] = [
  {
    id: "brief-001",
    date: "2026-05-12",
    headline: "DoD zero trust mandate accelerates — FY28 deadline creates $14.5B cyber market",
    key_metrics: [
      { label: "Active Opportunities", value: "10", change: "+2", trend: "up" },
      { label: "Pipeline Value", value: "$208.8M", change: "+$42M", trend: "up" },
      { label: "Avg Win Probability", value: "46%", change: "-1%", trend: "down" },
      { label: "Intel Items (7d)", value: "15", change: "+6", trend: "up" },
      { label: "Active Risks", value: "7", change: "+2", trend: "up" },
      { label: "Due This Quarter", value: "3", change: null, trend: "flat" },
    ],
    alerts: [
      {
        severity: "critical",
        message: "DoD CIO mandates zero trust architecture by FY28 — $14.5B budget for cyber operations",
        source: "DoD CIO Directive",
        action_required: true,
      },
      {
        severity: "critical",
        message: "Air Force Hanscom Enterprise IT Network Modernization draft RFP released ($42M)",
        source: "SAM.gov crawler",
        action_required: true,
      },
      {
        severity: "high",
        message: "Leidos wins $450M DISA GIG contract — strengthens position on Army network programs",
        source: "FPDS monitor",
        action_required: false,
      },
      {
        severity: "high",
        message: "FAR Case 2024-006: New 8-hour cyber incident reporting requirement effective Oct 1",
        source: "Federal Register",
        action_required: true,
      },
    ],
    action_items: [
      {
        action: "Respond to Army PEO IEW&S SETA RFP — finalize pricing strategy vs. Leidos incumbent",
        priority: "critical",
        due: "2026-08-15",
        context: "$28.5M ceiling, SDVOSB evaluation factor favors Envision. Need competitive pricing model.",
      },
      {
        action: "Review Air Force Hanscom draft RFP and prepare capability brief",
        priority: "critical",
        due: "2026-06-15",
        context: "$42M SD-WAN + zero trust perimeter. Strong fit for Envision capabilities.",
      },
      {
        action: "Schedule CMMC Level 2 C3PAO assessment — timeline accelerating",
        priority: "high",
        due: "2026-06-30",
        context: "40+ C3PAOs now accredited. Companies without assessments by Q4 risk being locked out.",
      },
      {
        action: "Update incident response plan for new FAR 8-hour reporting requirement",
        priority: "high",
        due: "2026-09-30",
        context: "Applies to all contracts >$250K with CUI. Need 24/7 SOC capability.",
      },
    ],
    market_snapshot:
      "Defense IT and cybersecurity market accelerating into FY27. DoD cyber budget up 8% to $14.5B with " +
      "zero trust implementation as the top priority. AI/ML funding up 12% to $3.2B. Key competitors " +
      "Leidos and SAIC strengthening through acquisitions while ManTech and BAH show weakness. " +
      "CMMC 2.0 enforcement creating compliance demand across the DIB. Envision well-positioned with " +
      "SDVOSB status and Army SETA past performance. Focus areas: zero trust migration, cloud security " +
      "accreditation, and AI-enabled C5ISR systems engineering.",
    generated_at: "2026-05-12T05:00:00Z",
  },
  {
    id: "brief-002",
    date: "2026-05-11",
    headline: "CMMC 2.0 assessment timeline accelerated — SAIC acquires AI defense firm",
    key_metrics: [
      { label: "Active Opportunities", value: "10", change: null, trend: "flat" },
      { label: "Pipeline Value", value: "$166.8M", change: null, trend: "flat" },
      { label: "Avg Win Probability", value: "47%", change: null, trend: "flat" },
      { label: "Intel Items (7d)", value: "12", change: "+4", trend: "up" },
      { label: "Active Risks", value: "5", change: null, trend: "flat" },
      { label: "Due This Quarter", value: "3", change: null, trend: "flat" },
    ],
    alerts: [
      {
        severity: "high",
        message: "CMMC Level 2 assessments running ahead of schedule — 40+ C3PAOs accredited",
        source: "Cyber AB",
        action_required: true,
      },
      {
        severity: "medium",
        message: "SAIC acquires DefenseAI ($180M) — strengthening AI/ML for ISR programs",
        source: "News crawler",
        action_required: false,
      },
    ],
    action_items: [
      {
        action: "Accelerate CMMC Level 2 readiness — engage C3PAO for assessment",
        priority: "high",
        due: "2026-06-15",
        context: "Risk-004 in register: if delayed beyond Q3, ineligible for 40% of target opps",
      },
      {
        action: "Update competitor profile for SAIC — assess DefenseAI acquisition impact",
        priority: "medium",
        due: "2026-05-18",
        context: "120-person AI/ML firm for ISR data fusion. Strengthens SAIC on C5ISR programs.",
      },
    ],
    market_snapshot:
      "CMMC enforcement creating urgency across the defense industrial base. Companies without " +
      "assessments scheduled by Q4 2026 face exclusion from major contract vehicles. Competitor " +
      "consolidation continues with SAIC's AI acquisition. ManTech showing weakness in defense IT.",
    generated_at: "2026-05-11T05:00:00Z",
  },
  {
    id: "brief-003",
    date: "2026-05-10",
    headline: "DEVCOM C5ISR cyber RFP and DoD FY27 budget signal strong demand",
    key_metrics: [
      { label: "Active Opportunities", value: "10", change: "+1", trend: "up" },
      { label: "Pipeline Value", value: "$166.8M", change: "+$22M", trend: "up" },
      { label: "Avg Win Probability", value: "47%", change: "+1%", trend: "up" },
      { label: "Intel Items (7d)", value: "8", change: "+3", trend: "up" },
      { label: "Active Risks", value: "5", change: null, trend: "flat" },
      { label: "Due This Quarter", value: "3", change: null, trend: "flat" },
    ],
    alerts: [
      {
        severity: "critical",
        message: "FY27 DoD budget: cyber operations +8% ($14.5B), AI/ML +12% ($3.2B)",
        source: "DoD Comptroller",
        action_required: true,
      },
      {
        severity: "high",
        message: "DEVCOM C5ISR Sources Sought for cyber IA services — $22M, responses due June 15",
        source: "SAM.gov crawler",
        action_required: true,
      },
      {
        severity: "medium",
        message: "ManTech Q1 defense IT revenue down 5% — potential teaming opportunity",
        source: "News crawler",
        action_required: false,
      },
    ],
    action_items: [
      {
        action: "Prepare C5ISR Sources Sought response — highlight RMF and STIG expertise",
        priority: "critical",
        due: "2026-06-10",
        context: "$22M cyber IA scope. Envision has direct C5ISR past performance.",
      },
      {
        action: "Map FY27 budget increases to pipeline opportunities",
        priority: "high",
        due: "2026-05-20",
        context: "Identify which tracked opps benefit from +8% cyber / +12% AI budget growth",
      },
      {
        action: "Explore teaming with ManTech on Army IEW&S follow-on",
        priority: "medium",
        due: "2026-05-25",
        context: "ManTech weakness + our SDVOSB status could create strong teaming arrangement",
      },
    ],
    market_snapshot:
      "DoD FY27 budget signals sustained growth in cyber and AI. Army C5ISR center actively seeking " +
      "industry partners for cyber security and IA support. Competitor ManTech showing vulnerability " +
      "that could be leveraged for teaming. DISA cloud contract expansions create downstream demand " +
      "for migration and security accreditation services.",
    generated_at: "2026-05-10T05:00:00Z",
  },
];

export const MOCK_RESEARCH_REPORTS: DeepResearchReport[] = [
  {
    id: "research-001",
    query: "C5ISR systems engineering technology landscape and DoD adoption timeline",
    status: "completed",
    summary:
      "Comprehensive analysis of emerging cyber IA services technologies including ion exchange, " +
      "granular activated carbon, high-pressure membranes, and destructive technologies (electrochemical oxidation, " +
      "supercritical water oxidation). DoD has allocated $2.1B for STIG validation investigation and systems engineering through FY28.",
    findings:
      "## Key Findings\n\n" +
      "### Technology Readiness\n" +
      "- **Ion exchange resins**: TRL 9, widely deployed, cost-effective for network infrastructure\n" +
      "- **GAC adsorption**: TRL 9, proven but high O&M costs for long-chain STIG validation\n" +
      "- **Electrochemical oxidation**: TRL 6-7, promising for concentrated waste streams\n" +
      "- **Supercritical water oxidation**: TRL 5-6, potential for complete STIG validation destruction\n\n" +
      "### DoD Timeline\n" +
      "- FY26: 340 installations under investigation\n" +
      "- FY27: First wave of full-scale systems engineering systems\n" +
      "- FY28: $800M+ in new systems engineering contracts expected\n\n" +
      "### Competitive Landscape\n" +
      "- SAIC leads with 45+ C5ISR systems engineering projects\n" +
      "- Leidos expanding through DISA partnerships\n" +
      "- ManTech strong in European markets, growing US presence\n\n" +
      "### GDA Positioning\n" +
      "- Leverage cybersecurity monitoring expertise for investigation phase\n" +
      "- Partner with technology vendors for systems engineering systems\n" +
      "- Target Air Force and Navy installations (largest STIG validation footprint)",
    sources_count: 47,
    requested_at: "2026-05-05T10:00:00Z",
    completed_at: "2026-05-06T14:30:00Z",
    requested_by: "Shawn",
  },
  {
    id: "research-002",
    query: "Competitor analysis: Leidos federal defense IT services strategy",
    status: "completed",
    summary:
      "Leidos has aggressively expanded federal defense IT services through strategic acquisitions " +
      "and DISA master contract positions. Revenue in this segment grew 18% YoY in FY25.",
    findings:
      "## Leidos Federal Defense IT Analysis\n\n" +
      "### Financial Performance\n" +
      "- Federal defense IT revenue: $1.2B (FY25)\n" +
      "- Growth rate: 18% YoY\n" +
      "- Win rate on recompetes: 72%\n\n" +
      "### Key Contract Vehicles\n" +
      "- DISA ERRS/ERTS: $2.4B ceiling\n" +
      "- PEO IEW&S SETA: $900M across 3 regions\n" +
      "- Navy CLEAN: $650M IDIQ\n\n" +
      "### Strategic Priorities\n" +
      "- AI/ML integration in security assessment\n" +
      "- cyber IA services technology partnerships\n" +
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
    query: "Air Force DISA IT modernization — opportunity sizing and teaming strategy",
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
    query: "NASA cyber compliance requirements for Artemis program facilities",
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
    name: "Leidos",
    threat_score: 92,
    contracts_won: 34,
    contracts_value: 1_200_000_000,
    primary_naics: ["562910", "541620", "541330"],
    strengths: [
      "Largest DISA contract portfolio",
      "Strong recompete win rate (72%)",
      "Integrated digital/AI capabilities",
      "Deep bench of certified defense IT professionals",
    ],
    weaknesses: [
      "Over-reliance on large IDIQ vehicles",
      "Recent project delays in Region 4",
      "High overhead rates",
    ],
    recent_wins: [
      "DISA Enterprise SETA ($42M)",
      "USACE Huntsville SETA ($28M)",
      "Navy CLEAN Task Order 17 ($15M)",
    ],
    watch_status: "active",
    last_updated: "2026-05-09T18:30:00Z",
  },
  {
    id: "comp-002",
    name: "SAIC",
    threat_score: 88,
    contracts_won: 28,
    contracts_value: 980_000_000,
    primary_naics: ["562910", "541330", "237110"],
    strengths: [
      "45+ active C5ISR systems engineering projects",
      "Strong DoD relationships",
      "Global scale and resources",
      "15% revenue growth in federal defense IT",
    ],
    weaknesses: [
      "Complex organizational structure slows proposal response",
      "Recent spinoff of infrastructure segment creates uncertainty",
      "Higher price points than smaller competitors",
    ],
    recent_wins: [
      "Air Force STIG validation Investigation ($35M)",
      "Army DISA migration ($22M)",
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
      "Diversified across defense IT and infrastructure",
    ],
    weaknesses: [
      "Slower to adopt new technologies historically",
      "Less focused on small/medium defense IT contracts",
      "Key personnel departures in defense IT division",
    ],
    recent_wins: [
      "Army CECOM Cleanup ($65M)",
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
      "Flat revenue in defense IT services Q1 2026",
      "Staff turnover in project management",
      "Limited C5ISR systems engineering experience",
      "Reduced investment in new capabilities",
    ],
    recent_wins: [
      "Army APG Defense IT ($12M)",
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
      "Incumbent on DEVCOM C5ISR rebuild phases 1-2",
      "Design-build expertise",
    ],
    weaknesses: [
      "Limited defense IT services expertise",
      "Primarily a construction firm — defense IT is secondary",
      "Small defense IT staff relative to scope",
    ],
    recent_wins: [
      "DEVCOM C5ISR Phase 2 ($38M)",
      "NAVFAC Pacific Construction ($27M)",
    ],
    watch_status: "monitoring",
    last_updated: "2026-05-08T22:00:00Z",
  },
];
