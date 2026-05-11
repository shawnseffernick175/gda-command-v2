// ---------------------------------------------------------------------------
// Fast Track v1 — Mock match_candidate data
// ---------------------------------------------------------------------------

export interface FastTrackSource {
  source_id: string;
  type: string;
  title: string;
  url: string | null;
  publisher: string;
  published_at: string;
  retrieved_at: string;
  claim_support: string;
}

export interface FastTrackMatch {
  id: string;
  status: "new" | "reviewing" | "watching" | "promoted" | "discarded";
  signal_type: string;
  signal_summary: string;
  technology: string;
  company_name: string;
  company_role: "internal" | "partner" | "target" | "competitor" | "unknown";
  candidate_agency: string | null;
  candidate_requirement: string | null;
  contract_path_hypothesis: string;
  match_score: number;
  recommended_next_action: string;
  safety_lane: "read-only" | "dry-run";
  data_source: string | null;
  sources: FastTrackSource[];
  created_at: string;
  updated_at: string;
  // Optional fields
  technology_tags: string[];
  company_url: string | null;
  incumbent_or_competitor_context: string | null;
  buyer_problem: string | null;
  next_review_at: string | null;
  promotion_target: string | null;
  // Detail-only fields
  analysis?: {
    executive_summary: string;
    why_it_matters: string;
    risks_or_gaps: string[];
  };
  ooda?: {
    observe: string[];
    orient: string[];
    decide: string;
    act: string;
  };
  learning?: {
    notes: string[];
    reserved: boolean;
  };
}

export const MOCK_FAST_TRACK_MATCHES: FastTrackMatch[] = [
  {
    id: "FT-001",
    status: "new",
    signal_type: "innovation_factory",
    signal_summary: "ERDC announces AI-driven PFAS remediation research initiative with $12M in new funding, seeking industry partners for pilot deployments at 3 Army installations.",
    technology: "AI-Driven PFAS Remediation",
    company_name: "Arcadis",
    company_role: "competitor",
    candidate_agency: "USACE",
    candidate_requirement: "Environmental remediation services — PFAS treatment technology integration at military installations",
    contract_path_hypothesis: "ERDC's research outputs feed into USACE FUDS IDIQ task orders. Arcadis has PFAS treatment capabilities but limited AI integration experience. Golden Dome could partner on the AI modeling component or compete directly with our USACE past performance advantage.",
    match_score: 87,
    recommended_next_action: "Review ERDC BAA for partnership eligibility and assess Arcadis collaboration vs. competition strategy",
    safety_lane: "read-only",
    data_source: "sam.gov",
    sources: [
      {
        source_id: "src-001a",
        type: "government_announcement",
        title: "ERDC PFAS AI Research Initiative — Industry Day Notice",
        url: "https://sam.gov/opp/erdc-pfas-ai-2026",
        publisher: "SAM.gov",
        published_at: "2026-04-28T00:00:00Z",
        retrieved_at: "2026-05-09T14:22:00Z",
        claim_support: "Confirms $12M funding and 3-installation pilot scope",
      },
      {
        source_id: "src-001b",
        type: "trade_publication",
        title: "Arcadis Expands PFAS Treatment Portfolio with New AI Modeling Capability",
        url: "https://www.environmentalleader.com/arcadis-pfas-ai",
        publisher: "Environmental Leader",
        published_at: "2026-04-15T00:00:00Z",
        retrieved_at: "2026-05-09T14:25:00Z",
        claim_support: "Confirms Arcadis investment in PFAS + AI integration",
      },
    ],
    created_at: "2026-05-09T14:30:00Z",
    updated_at: "2026-05-09T14:30:00Z",
    technology_tags: ["PFAS", "AI/ML", "remediation", "environmental"],
    company_url: "https://www.arcadis.com",
    incumbent_or_competitor_context: "Arcadis holds 2 active USACE environmental remediation IDIQs. They are a direct competitor on FUDS work but a potential teaming partner on AI-specific tasks where we have stronger capabilities.",
    buyer_problem: "DoD has 700+ installations with PFAS contamination requiring treatment. Current methods are slow and expensive. AI-driven modeling could reduce remediation timelines by 40%.",
    next_review_at: null,
    promotion_target: null,
    analysis: {
      executive_summary: "ERDC's $12M PFAS AI initiative creates a near-term opportunity to either partner with or compete against Arcadis on AI-enhanced remediation technology. Golden Dome's USACE past performance and AI capabilities position us well for this work.",
      why_it_matters: "PFAS is the largest environmental remediation challenge DoD faces in the next decade. Early positioning on AI-driven treatment methods creates a durable competitive advantage across hundreds of future task orders.",
      risks_or_gaps: [
        "Arcadis may have exclusive ERDC research access through existing cooperative agreements",
        "Our PFAS-specific past performance is limited to site characterization, not treatment",
        "AI remediation modeling requires specialized environmental data scientists we may need to hire or team for",
      ],
    },
    ooda: {
      observe: [
        "ERDC announced $12M PFAS AI initiative seeking industry partners (SAM.gov, Apr 28 2026)",
        "Arcadis published expansion of PFAS AI modeling capabilities (Environmental Leader, Apr 15 2026)",
        "3 Army installations identified for pilot deployment",
        "Golden Dome holds active USACE FUDS IDIQ with environmental remediation past performance",
      ],
      orient: [
        "ERDC research outputs directly feed into USACE FUDS task orders — our primary vehicle",
        "Arcadis has treatment capabilities but their AI integration is nascent",
        "Our AI/ML team has experience with environmental sensor data modeling from the Oak Ridge project",
        "The combination of our USACE relationships and AI capabilities creates a differentiated offering",
      ],
      decide: "Pursue partnership track with ERDC through our existing FUDS IDIQ relationship. Assess Arcadis as a potential teaming partner for treatment technology, with Golden Dome providing the AI modeling layer.",
      act: "1) Request ERDC BAA documents through USACE contracting POC. 2) Schedule internal capability assessment with AI team. 3) Reach out to Arcadis BD lead to explore teaming.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
  {
    id: "FT-002",
    status: "reviewing",
    signal_type: "pre_rfi",
    signal_summary: "Air Force Research Laboratory (AFRL) published RFI for autonomous drone swarm C2 systems, requesting capability statements by June 15. Mentions interest in AI decision-making under contested environments.",
    technology: "Autonomous Drone Swarm C2",
    company_name: "Shield AI",
    company_role: "target",
    candidate_agency: "USAF",
    candidate_requirement: "Autonomous systems command and control for multi-domain operations",
    contract_path_hypothesis: "AFRL RFIs typically precede BAAs or OTAs by 6-9 months. Shield AI's V-BAT autonomy platform is the leading commercial solution. Golden Dome could position as systems integrator combining Shield AI's platform with our DoD integration experience.",
    match_score: 78,
    recommended_next_action: "Submit capability statement responding to RFI with focus on AI C2 integration experience, and initiate teaming discussion with Shield AI",
    safety_lane: "read-only",
    data_source: "govwin",
    sources: [
      {
        source_id: "src-002a",
        type: "government_rfi",
        title: "AFRL RFI: Autonomous Multi-Domain C2 Systems",
        url: "https://sam.gov/opp/afrl-autonomous-c2-rfi",
        publisher: "SAM.gov",
        published_at: "2026-05-01T00:00:00Z",
        retrieved_at: "2026-05-08T09:15:00Z",
        claim_support: "Confirms AFRL interest in autonomous drone swarm C2 with AI decision-making",
      },
      {
        source_id: "src-002b",
        type: "company_press_release",
        title: "Shield AI Secures $200M Series F for V-BAT Autonomous Systems",
        url: "https://shield.ai/press/series-f",
        publisher: "Shield AI",
        published_at: "2026-03-20T00:00:00Z",
        retrieved_at: "2026-05-08T09:20:00Z",
        claim_support: "Confirms Shield AI's investment trajectory and V-BAT platform maturity",
      },
    ],
    created_at: "2026-05-08T09:30:00Z",
    updated_at: "2026-05-10T11:00:00Z",
    technology_tags: ["autonomous systems", "drone swarm", "C2", "AI", "multi-domain"],
    company_url: "https://shield.ai",
    incumbent_or_competitor_context: "Shield AI is not a competitor — they are a technology company seeking DoD integration partners. Their V-BAT platform needs experienced defense contractors to navigate procurement and provide systems integration.",
    buyer_problem: "USAF needs autonomous C2 capability that can operate in GPS-denied, communications-contested environments. Current manual C2 systems cannot scale to swarm-level operations.",
    next_review_at: "2026-05-15T00:00:00Z",
    promotion_target: null,
    analysis: {
      executive_summary: "AFRL's RFI for autonomous drone swarm C2 is an early signal for a future acquisition in a high-growth technology area. Shield AI is the leading commercial capability provider. Positioning as their DoD integration partner could create a significant capture opportunity.",
      why_it_matters: "Autonomous systems C2 is a top DoD modernization priority under the Replicator initiative. Early engagement on AFRL's requirements shapes future solicitations and establishes teaming relationships before competition intensifies.",
      risks_or_gaps: [
        "Shield AI may already have preferred integration partners (e.g., Northrop Grumman)",
        "Our autonomous systems past performance is limited — primarily from surveillance platform support",
        "AFRL often uses OTAs that favor non-traditional defense contractors, which may exclude us unless teamed with Shield AI",
      ],
    },
    ooda: {
      observe: [
        "AFRL published RFI for autonomous multi-domain C2 systems (SAM.gov, May 1 2026)",
        "Shield AI raised $200M Series F specifically for V-BAT scaling (Mar 2026)",
        "Capability statement deadline is June 15, 2026 — 36 days away",
        "DoD Replicator initiative emphasizes autonomous attritable systems",
      ],
      orient: [
        "RFI-to-BAA cycle at AFRL is typically 6-9 months — this suggests a Q1 2027 procurement",
        "Shield AI needs DoD integration partners who understand AFRL procurement patterns",
        "Our Tyndall AFB past performance provides an Air Force relationship entry point",
        "Combining Shield AI's autonomy platform with our systems integration creates a compelling teaming arrangement",
      ],
      decide: "Submit capability statement emphasizing AI integration experience and DoD systems integration track record. Simultaneously initiate Shield AI teaming discussion.",
      act: "1) Draft capability statement by June 1. 2) Contact Shield AI partnerships team. 3) Brief capture team on AFRL autonomous systems requirements landscape.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
  {
    id: "FT-003",
    status: "new",
    signal_type: "sbir",
    signal_summary: "DARPA SBIR Phase III transition opportunity for quantum-resistant encryption in tactical communications. ManTech completed Phase II with successful prototype demonstration.",
    technology: "Post-Quantum Cryptography (PQC)",
    company_name: "ManTech International",
    company_role: "competitor",
    candidate_agency: "DARPA",
    candidate_requirement: "Quantum-resistant encryption integration for tactical radio systems",
    contract_path_hypothesis: "SBIR Phase III transitions are sole-source eligible to the Phase II awardee (ManTech), but require integration partners for operational deployment. Golden Dome could pursue the system integration role for fielding PQC across Army tactical networks.",
    match_score: 65,
    recommended_next_action: "Monitor SBIR Phase III transition announcement and assess subcontracting opportunity under ManTech prime",
    safety_lane: "read-only",
    data_source: "sam.gov",
    sources: [
      {
        source_id: "src-003a",
        type: "sbir_database",
        title: "DARPA SBIR Phase II Award — Quantum-Resistant Tactical Comms",
        url: "https://www.sbir.gov/node/darpa-pqc-2025",
        publisher: "SBIR.gov",
        published_at: "2025-11-15T00:00:00Z",
        retrieved_at: "2026-05-07T16:00:00Z",
        claim_support: "Confirms ManTech Phase II completion and successful prototype demonstration",
      },
    ],
    created_at: "2026-05-07T16:30:00Z",
    updated_at: "2026-05-07T16:30:00Z",
    technology_tags: ["quantum computing", "cryptography", "PQC", "tactical comms", "SBIR"],
    company_url: "https://www.mantech.com",
    incumbent_or_competitor_context: "ManTech holds the SBIR Phase II award and has sole-source rights for Phase III. They are not a direct competitor for the integration work — they need partners for operational deployment at scale.",
    buyer_problem: "Quantum computing threatens current military encryption. DoD must transition tactical communications to quantum-resistant algorithms before adversary quantum capabilities mature (estimated 2030-2035 window).",
    next_review_at: null,
    promotion_target: null,
    analysis: {
      executive_summary: "ManTech's DARPA SBIR Phase III transition for quantum-resistant encryption creates a potential subcontracting opportunity for system integration and fielding support. The PQC technology area is high-priority DoD-wide.",
      why_it_matters: "Post-quantum cryptography transition is a DoD-wide mandate (NSA CNSA 2.0). Early involvement in DARPA's PQC tactical comms program positions us for the broader $2B+ PQC migration across all services.",
      risks_or_gaps: [
        "ManTech may handle integration internally with existing staff",
        "Our PQC-specific experience is limited to awareness-level only",
        "Phase III transitions can take 12-18 months — long timeline before revenue",
      ],
    },
    ooda: {
      observe: [
        "ManTech completed DARPA SBIR Phase II for quantum-resistant tactical comms (SBIR.gov, Nov 2025)",
        "NSA CNSA 2.0 mandates PQC transition by 2035 for all national security systems",
        "Phase III transition announcement expected Q3 2026",
      ],
      orient: [
        "SBIR Phase III is sole-source to ManTech — our path is as subcontractor for integration",
        "ManTech is strong in R&D but typically needs help with large-scale fielding",
        "Our tactical network integration experience (from Army C5ISR work) is directly applicable",
      ],
      decide: "Monitor for Phase III announcement. Prepare capability brief focused on tactical network integration for ManTech business development team.",
      act: "1) Set alert for DARPA PQC Phase III transition notice. 2) Prepare 2-page capability brief on tactical comms integration. 3) Identify ManTech BD POC through industry events.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
  {
    id: "FT-004",
    status: "watching",
    signal_type: "academia",
    signal_summary: "MIT Lincoln Laboratory published breakthrough results in edge AI inference for satellite imagery processing. Processing speed improved 10x over current operational systems with 95% accuracy retention.",
    technology: "Edge AI Satellite Image Processing",
    company_name: "MIT Lincoln Laboratory",
    company_role: "unknown",
    candidate_agency: "NRO",
    candidate_requirement: "Next-gen satellite imagery analysis capability for intelligence applications",
    contract_path_hypothesis: "MIT LL research feeds into NRO and NGA acquisition programs through technology transition agreements. This capability would likely be competed under NRO's commercial GEOINT initiative or NGA's JEDI program successor.",
    match_score: 58,
    recommended_next_action: "Track MIT LL publication trail and monitor NRO/NGA commercial GEOINT solicitations for edge AI requirements",
    safety_lane: "read-only",
    data_source: "manual",
    sources: [
      {
        source_id: "src-004a",
        type: "academic_publication",
        title: "Real-Time Edge Inference for Multi-Spectral Satellite Imagery Using Compressed Transformer Models",
        url: "https://arxiv.org/abs/2604.12345",
        publisher: "arXiv (MIT Lincoln Laboratory)",
        published_at: "2026-04-20T00:00:00Z",
        retrieved_at: "2026-05-06T10:00:00Z",
        claim_support: "Confirms 10x processing speed improvement with 95% accuracy on operational datasets",
      },
    ],
    created_at: "2026-05-06T10:15:00Z",
    updated_at: "2026-05-08T14:00:00Z",
    technology_tags: ["edge AI", "satellite imagery", "computer vision", "GEOINT", "space"],
    company_url: "https://www.ll.mit.edu",
    incumbent_or_competitor_context: null,
    buyer_problem: "Current satellite imagery analysis is cloud-dependent with 30-60 minute latency. Edge AI processing enables near-real-time analysis, critical for time-sensitive intelligence targets.",
    next_review_at: "2026-06-15T00:00:00Z",
    promotion_target: null,
    analysis: {
      executive_summary: "MIT Lincoln Lab's edge AI breakthrough for satellite imagery could reshape NRO/NGA acquisition priorities. The technology is 12-18 months from operational transition. Early positioning through research partnership or commercial GEOINT channels creates future capture advantages.",
      why_it_matters: "Space-based intelligence is a top IC priority. Edge AI processing eliminates the cloud dependency that currently limits tactical utility of satellite imagery. This technology will drive new requirements across NRO, NGA, and potentially Army INSCOM programs.",
      risks_or_gaps: [
        "NRO/NGA programs are highly classified — our current clearance holdings may be insufficient",
        "MIT LL typically transitions technology to large primes (Raytheon, L3Harris), not mid-tier contractors",
        "Edge AI for satellite platforms requires hardware integration expertise we don't currently have",
      ],
    },
    ooda: {
      observe: [
        "MIT LL published breakthrough edge AI satellite imagery results — 10x speed, 95% accuracy (arXiv, Apr 2026)",
        "NRO commercial GEOINT initiative is actively seeking new capabilities",
        "Technology transition from MIT LL to operational programs typically takes 12-18 months",
      ],
      orient: [
        "This is an early-stage signal — no procurement action yet",
        "Our value would be in AI/ML expertise applied to defense applications, not satellite hardware",
        "Monitoring posture appropriate until procurement signals emerge",
      ],
      decide: "Watch. No action needed until NRO/NGA issues procurement signals. Continue monitoring MIT LL publication trail and NRO commercial GEOINT announcements.",
      act: "1) Subscribe to MIT LL publication alerts for edge AI/GEOINT topics. 2) Add NRO commercial GEOINT to opportunity scan watchlist.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
  {
    id: "FT-005",
    status: "new",
    signal_type: "post_rfi",
    signal_summary: "DHS CISA released draft Performance Work Statement for Continuous Diagnostics and Mitigation (CDM) DEFEND contract recompete. Current incumbent is GDIT. Estimated value $850M over 5 years.",
    technology: "Zero Trust Architecture / CDM",
    company_name: "GDIT",
    company_role: "competitor",
    candidate_agency: "DHS CISA",
    candidate_requirement: "CDM DEFEND — continuous monitoring, endpoint protection, network security across civilian agencies",
    contract_path_hypothesis: "CDM DEFEND is one of DHS CISA's largest cybersecurity contracts. The recompete opens the door for challengers with zero trust architecture capabilities. Golden Dome's NIST 800-207 implementation experience could be a discriminator against GDIT's incumbent advantage.",
    match_score: 82,
    recommended_next_action: "Attend Industry Day (June 10), submit draft PWS comments, begin teaming outreach to CrowdStrike for endpoint protection",
    safety_lane: "read-only",
    data_source: "sam.gov",
    sources: [
      {
        source_id: "src-005a",
        type: "government_draft_solicitation",
        title: "DHS CISA CDM DEFEND Recompete — Draft PWS",
        url: "https://sam.gov/opp/cisa-cdm-defend-recompete",
        publisher: "SAM.gov",
        published_at: "2026-05-03T00:00:00Z",
        retrieved_at: "2026-05-05T08:30:00Z",
        claim_support: "Confirms CDM DEFEND recompete with $850M estimated value and zero trust emphasis",
      },
      {
        source_id: "src-005b",
        type: "trade_publication",
        title: "GDIT's CDM DEFEND Performance Under Scrutiny After GAO Report",
        url: "https://www.nextgov.com/gdit-cdm-gao-2026",
        publisher: "Nextgov/FCW",
        published_at: "2026-04-22T00:00:00Z",
        retrieved_at: "2026-05-05T08:35:00Z",
        claim_support: "Confirms performance concerns with GDIT's current CDM DEFEND delivery",
      },
    ],
    created_at: "2026-05-05T09:00:00Z",
    updated_at: "2026-05-05T09:00:00Z",
    technology_tags: ["cybersecurity", "zero trust", "CDM", "endpoint protection", "CISA"],
    company_url: "https://www.gdit.com",
    incumbent_or_competitor_context: "GDIT is the current CDM DEFEND incumbent but faces GAO performance scrutiny. Their recompete advantage may be weakened, creating opportunity for challengers with strong zero trust credentials.",
    buyer_problem: "Civilian agencies need continuous cybersecurity monitoring that aligns with OMB zero trust mandates (M-22-09). Current CDM infrastructure is aging and needs modernization.",
    next_review_at: null,
    promotion_target: "ops-tracker",
    analysis: {
      executive_summary: "The CDM DEFEND recompete ($850M/5yr) is a rare opening in DHS CISA's cybersecurity portfolio. GDIT's performance concerns level the playing field. With strong zero trust capabilities and strategic teaming, this could be a top-tier capture opportunity.",
      why_it_matters: "CDM DEFEND touches 100+ civilian agencies. Winning this contract establishes GDA as a tier-1 cybersecurity provider and creates a base for adjacent DHS work worth an additional $500M+ over the contract lifecycle.",
      risks_or_gaps: [
        "This is a full-and-open competition — expect 4-6 strong competitors (Booz Allen, Leidos, ManTech, Peraton)",
        "Our DHS past performance is limited — need strong teaming to cover agency relationship gaps",
        "CDM requires FedRAMP High authorized tools — CrowdStrike partnership essential for compliance",
        "Industry Day is June 10 — only 31 days to prepare",
      ],
    },
    ooda: {
      observe: [
        "DHS CISA released draft PWS for CDM DEFEND recompete — $850M/5yr (SAM.gov, May 3 2026)",
        "GDIT incumbent performance flagged in GAO report (Nextgov, Apr 22 2026)",
        "Industry Day scheduled June 10, 2026",
        "OMB M-22-09 zero trust mandate applies to all civilian agencies",
      ],
      orient: [
        "GDIT's performance issues create an opening that rarely exists in recompetes",
        "Zero trust is the key discriminator — agencies are behind on M-22-09 compliance",
        "We need CrowdStrike or equivalent for endpoint protection coverage",
        "Our NIST 800-207 implementation work at DCSA is directly relevant past performance",
      ],
      decide: "Pursue aggressively. This is a high-value opportunity with a weakened incumbent. Begin capture planning immediately.",
      act: "1) Register for Industry Day (June 10). 2) Submit draft PWS comments. 3) Initiate CrowdStrike teaming discussion. 4) Brief capture team on CDM DEFEND requirements.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
  {
    id: "FT-006",
    status: "reviewing",
    signal_type: "funding_event",
    signal_summary: "Congress appropriated $450M in FY2026 supplemental for Army C5ISR modernization, with $80M earmarked for electronic warfare capability development. Signals new contract vehicles expected Q4 2026.",
    technology: "Electronic Warfare / Spectrum Management",
    company_name: "L3Harris Technologies",
    company_role: "competitor",
    candidate_agency: "Army PEO IEW&S",
    candidate_requirement: "EW capability development, spectrum management tools, and SIGINT modernization",
    contract_path_hypothesis: "Supplemental funding typically flows through existing IDIQs first (Army ITES-3S, SOSSEC consortium OTA). New contract vehicles expected for capabilities beyond current IDIQ scope. L3Harris is the dominant EW prime but needs software-defined spectrum management subcontractors.",
    match_score: 72,
    recommended_next_action: "Contact Army PEO IEW&S program office for upcoming acquisition forecast briefing. Assess L3Harris teaming opportunity for spectrum management software.",
    safety_lane: "read-only",
    data_source: "sam.gov",
    sources: [
      {
        source_id: "src-006a",
        type: "congressional_record",
        title: "FY2026 Supplemental Appropriations — Army C5ISR Modernization",
        url: "https://www.congress.gov/bill/119th-congress/fy2026-supplemental",
        publisher: "Congress.gov",
        published_at: "2026-04-30T00:00:00Z",
        retrieved_at: "2026-05-04T11:00:00Z",
        claim_support: "Confirms $450M supplemental with $80M EW earmark",
      },
      {
        source_id: "src-006b",
        type: "trade_publication",
        title: "L3Harris Wins $340M Army EW Integration Contract Extension",
        url: "https://www.defensenews.com/l3harris-ew-extension",
        publisher: "Defense News",
        published_at: "2026-04-25T00:00:00Z",
        retrieved_at: "2026-05-04T11:05:00Z",
        claim_support: "Confirms L3Harris position as primary Army EW integrator",
      },
    ],
    created_at: "2026-05-04T11:30:00Z",
    updated_at: "2026-05-09T16:00:00Z",
    technology_tags: ["electronic warfare", "EW", "spectrum management", "SIGINT", "C5ISR"],
    company_url: "https://www.l3harris.com",
    incumbent_or_competitor_context: "L3Harris is the dominant Army EW prime. They hold the primary integration contracts but routinely subcontract for specialized software components. Our spectrum management software past performance makes us a natural sub.",
    buyer_problem: "Army's EW capabilities lag near-peer adversaries. The supplemental funding addresses an urgent modernization gap identified in Pacific-focused wargames.",
    next_review_at: "2026-05-20T00:00:00Z",
    promotion_target: null,
    analysis: {
      executive_summary: "The $80M EW supplemental funding creates new work within Army PEO IEW&S. L3Harris will capture the integration prime, but their need for spectrum management software partners creates a subcontracting path for Golden Dome.",
      why_it_matters: "EW modernization is a multi-year, multi-billion dollar Army priority. Establishing our position now in the software/spectrum management niche creates a recurring revenue stream across multiple EW program increments.",
      risks_or_gaps: [
        "L3Harris may have existing spectrum management subcontractors they prefer",
        "Our Army C5ISR past performance is in ISR analytics, not EW specifically",
        "Supplemental funding timelines are compressed — contracts may be sole-sourced to existing vehicles",
      ],
    },
    ooda: {
      observe: [
        "Congress appropriated $80M for Army EW modernization in FY2026 supplemental (Apr 30 2026)",
        "L3Harris holds primary Army EW integration position with recent $340M extension",
        "New contract vehicles expected Q4 2026 for capabilities beyond current IDIQ scope",
      ],
      orient: [
        "L3Harris is the prime to work with, not against, in Army EW",
        "Our value is in software-defined spectrum management — a niche L3Harris doesn't cover internally",
        "Supplemental funding moves fast — need to position within 3-4 months",
      ],
      decide: "Pursue subcontracting position under L3Harris for spectrum management software. Attend PEO IEW&S acquisition forecast briefing.",
      act: "1) Contact L3Harris EW division BD team. 2) Register for PEO IEW&S industry briefing. 3) Prepare capability brief on spectrum management software.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
  {
    id: "FT-007",
    status: "watching",
    signal_type: "competitor_move",
    signal_summary: "Booz Allen Hamilton acquired CyberVista's AI training division, signaling expansion into AI-powered cybersecurity workforce development. This positions them for the CISA Cybersecurity Training contract recompete.",
    technology: "AI-Powered Cyber Training",
    company_name: "Booz Allen Hamilton",
    company_role: "competitor",
    candidate_agency: "DHS CISA",
    candidate_requirement: "National cybersecurity workforce training and exercise program",
    contract_path_hypothesis: "Booz Allen's CyberVista acquisition gives them a combined cyber training + AI platform offering. The CISA cyber training contract ($120M) recompetes in Q2 2027. This acquisition signals Booz Allen's competitive strategy 12 months early.",
    match_score: 52,
    recommended_next_action: "Monitor. Assess whether to compete directly or pursue subcontracting. Track CISA training contract recompete timeline.",
    safety_lane: "read-only",
    data_source: "govwin",
    sources: [
      {
        source_id: "src-007a",
        type: "company_press_release",
        title: "Booz Allen Hamilton Acquires CyberVista AI Training Division",
        url: "https://www.boozallen.com/press/cybervista-acquisition",
        publisher: "Booz Allen Hamilton",
        published_at: "2026-05-02T00:00:00Z",
        retrieved_at: "2026-05-03T09:00:00Z",
        claim_support: "Confirms acquisition and stated intent to expand AI-powered cyber training",
      },
    ],
    created_at: "2026-05-03T09:15:00Z",
    updated_at: "2026-05-07T14:00:00Z",
    technology_tags: ["cybersecurity", "AI training", "workforce development", "cyber exercises"],
    company_url: "https://www.boozallen.com",
    incumbent_or_competitor_context: "Booz Allen is a top-5 defense IT contractor with deep CISA relationships. Their CyberVista acquisition specifically targets the $120M CISA training contract recompete. They will be the strongest competitor.",
    buyer_problem: "CISA faces a 500,000-person cybersecurity workforce gap nationally. Current training programs are manual and don't scale. AI-powered training could reach 10x more participants at lower cost.",
    next_review_at: "2026-08-01T00:00:00Z",
    promotion_target: null,
    analysis: {
      executive_summary: "Booz Allen's acquisition is a competitive intelligence signal, not a near-term capture opportunity. Monitor the CISA training recompete timeline and assess competitive positioning in Q4 2026.",
      why_it_matters: "Understanding competitor acquisition strategy 12+ months before a recompete allows time to develop counter-positioning. Booz Allen's move reveals the evaluation criteria they expect CISA to prioritize (AI-powered training platforms).",
      risks_or_gaps: [
        "This is a watch item, not an action item — no near-term revenue impact",
        "We don't have a cyber training platform or AI training capability",
        "Competing against Booz Allen on a CISA contract where they have a purpose-built acquisition would be costly",
      ],
    },
    ooda: {
      observe: [
        "Booz Allen acquired CyberVista's AI training division (May 2 2026)",
        "CISA cyber training contract ($120M) recompetes Q2 2027",
        "Booz Allen stated acquisition was to 'strengthen AI-powered workforce solutions'",
      ],
      orient: [
        "This is a competitive intelligence signal, not a business development action",
        "Booz Allen is building a purpose-specific offering for this recompete",
        "Competing head-to-head would require major investment we may not want to make",
      ],
      decide: "Watch. Reassess in Q4 2026 when CISA releases draft solicitation. Consider sub role if competition looks favorable.",
      act: "1) Add CISA training recompete to Q2 2027 watchlist. 2) Track Booz Allen CyberVista integration progress.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
  {
    id: "FT-008",
    status: "promoted",
    signal_type: "post_rfi",
    signal_summary: "Navy NAVWAR published Sources Sought for Consolidated Afloat Networks and Enterprise Services (CANES) Next-Gen cybersecurity modernization. Specifically calls for zero trust micro-segmentation.",
    technology: "Zero Trust Micro-Segmentation",
    company_name: "Illumio",
    company_role: "target",
    candidate_agency: "Navy NAVWAR",
    candidate_requirement: "CANES cybersecurity modernization — zero trust micro-segmentation for shipboard networks",
    contract_path_hypothesis: "NAVWAR sources sought typically precede full-and-open RFP by 4-6 months. Illumio's micro-segmentation platform is the commercial leader. Golden Dome has Navy IT past performance and could serve as prime integrator with Illumio as technology subcontractor.",
    match_score: 91,
    recommended_next_action: "PROMOTED to Ops Tracker. Submit Sources Sought response and formalize Illumio teaming agreement.",
    safety_lane: "read-only",
    data_source: "fpds",
    sources: [
      {
        source_id: "src-008a",
        type: "government_sources_sought",
        title: "NAVWAR Sources Sought: CANES Next-Gen Cybersecurity",
        url: "https://sam.gov/opp/navwar-canes-nextgen-cyber",
        publisher: "SAM.gov",
        published_at: "2026-04-18T00:00:00Z",
        retrieved_at: "2026-04-20T07:45:00Z",
        claim_support: "Confirms NAVWAR interest in zero trust micro-segmentation for CANES shipboard networks",
      },
      {
        source_id: "src-008b",
        type: "trade_publication",
        title: "Illumio Achieves FedRAMP High Authorization for Zero Trust Platform",
        url: "https://www.illumio.com/press/fedramp-high",
        publisher: "Illumio",
        published_at: "2026-03-10T00:00:00Z",
        retrieved_at: "2026-04-20T07:50:00Z",
        claim_support: "Confirms Illumio platform meets FedRAMP High requirements needed for Navy deployment",
      },
    ],
    created_at: "2026-04-20T08:00:00Z",
    updated_at: "2026-05-08T10:00:00Z",
    technology_tags: ["zero trust", "micro-segmentation", "Navy", "CANES", "cybersecurity"],
    company_url: "https://www.illumio.com",
    incumbent_or_competitor_context: "Illumio is a technology partner, not a competitor. They need a defense prime/integrator to deliver their platform into Navy environments. Their FedRAMP High authorization removes a major barrier.",
    buyer_problem: "CANES shipboard networks are flat and vulnerable to lateral movement attacks. Zero trust micro-segmentation prevents adversary movement between network segments — critical for ships that operate disconnected from shore infrastructure.",
    next_review_at: null,
    promotion_target: "ops-tracker",
    analysis: {
      executive_summary: "NAVWAR's CANES Next-Gen cybersecurity sources sought is a high-confidence match. Illumio's FedRAMP-authorized zero trust platform combined with our Navy IT past performance creates a strong competitive position. This has been promoted to Ops Tracker for formal capture planning.",
      why_it_matters: "CANES is the Navy's primary afloat IT infrastructure. Winning the cybersecurity modernization component establishes us as a Navy cyber integrator and opens access to the broader CANES ecosystem.",
      risks_or_gaps: [
        "Leidos holds the current CANES prime — they may extend existing contract scope to cover cybersecurity",
        "Shipboard deployment requires unique ruggedization and TEMPEST certification knowledge",
      ],
    },
    ooda: {
      observe: [
        "NAVWAR published Sources Sought for CANES cybersecurity modernization (SAM.gov, Apr 18 2026)",
        "Illumio achieved FedRAMP High for zero trust micro-segmentation platform (Mar 2026)",
        "Sources Sought responses due May 15, 2026 (already submitted)",
      ],
      orient: [
        "This is the most concrete procurement signal among all current Fast Track candidates",
        "Illumio partnership gives us a FedRAMP-ready, Navy-suitable technology platform",
        "Our Navy IT past performance (from ISW support) provides relevant agency experience",
      ],
      decide: "PROMOTED to Ops Tracker. Full capture effort initiated. Sources Sought response submitted, Illumio teaming agreement in progress.",
      act: "1) Sources Sought response submitted (completed). 2) Illumio teaming agreement under review by legal. 3) Capture plan initiated in Capture Planner.",
    },
    learning: {
      notes: ["Promoted to Ops Tracker on 2026-05-08 based on high match score and concrete procurement signal"],
      reserved: true,
    },
  },
  {
    id: "FT-009",
    status: "discarded",
    signal_type: "innovation_factory",
    signal_summary: "AFWERX Challenge for low-cost satellite communications terminal design. Open to commercial companies with existing prototypes. Prize award up to $500K.",
    technology: "Low-Cost SATCOM Terminals",
    company_name: "Kymeta Corporation",
    company_role: "unknown",
    candidate_agency: "USAF",
    candidate_requirement: "Lightweight, low-cost satellite communications for deployed forces",
    contract_path_hypothesis: "AFWERX challenges award small prizes ($250K-$500K) with potential follow-on SBIR Phase II or OTA contracts. However, this is hardware-focused and outside Golden Dome's core competency in software and systems integration.",
    match_score: 28,
    recommended_next_action: "DISCARDED — hardware-only challenge outside our capability profile",
    safety_lane: "read-only",
    data_source: "sam.gov",
    sources: [
      {
        source_id: "src-009a",
        type: "government_challenge",
        title: "AFWERX Challenge: Next-Gen Low-Cost SATCOM Terminal",
        url: "https://afwerx.com/challenges/satcom-terminal-2026",
        publisher: "AFWERX",
        published_at: "2026-04-10T00:00:00Z",
        retrieved_at: "2026-05-01T13:00:00Z",
        claim_support: "Confirms AFWERX SATCOM terminal challenge — hardware prototype required",
      },
    ],
    created_at: "2026-05-01T13:15:00Z",
    updated_at: "2026-05-02T09:00:00Z",
    technology_tags: ["SATCOM", "satellite", "communications", "hardware"],
    company_url: "https://www.kymetacorp.com",
    incumbent_or_competitor_context: null,
    buyer_problem: "Current military SATCOM terminals cost $50K-$200K each. USAF wants 10x cost reduction for widespread deployment.",
    next_review_at: null,
    promotion_target: null,
    analysis: {
      executive_summary: "AFWERX SATCOM terminal challenge is outside our core competency. This is a hardware design challenge requiring physical prototype demonstration — not a software or integration opportunity.",
      why_it_matters: "While SATCOM modernization is strategically important to DoD, the specific challenge format (hardware prototype) doesn't match our capability profile. Discarded to maintain focus on higher-probability matches.",
      risks_or_gaps: [
        "Challenge requires physical hardware prototype — not in our capability set",
        "Prize value ($500K) is too small to justify building hardware capability",
      ],
    },
    ooda: {
      observe: [
        "AFWERX challenge for low-cost SATCOM terminal design (AFWERX, Apr 10 2026)",
        "Requires working hardware prototype for evaluation",
      ],
      orient: [
        "This is a hardware challenge — our strength is in software and integration",
        "No realistic path to compete without major capability investment",
      ],
      decide: "Discard. Outside capability profile. No further action.",
      act: "No action. Archived for awareness.",
    },
    learning: {
      notes: ["Discarded on 2026-05-02 — hardware challenge outside core competency"],
      reserved: true,
    },
  },
  {
    id: "FT-010",
    status: "new",
    signal_type: "funding_event",
    signal_summary: "DOE announced $200M for AI-powered grid resilience programs across 15 national laboratories. Requesting industry partnerships for predictive maintenance and anomaly detection in critical infrastructure.",
    technology: "AI Grid Resilience / Predictive Maintenance",
    company_name: "Siemens Energy",
    company_role: "target",
    candidate_agency: "DOE",
    candidate_requirement: "AI-powered predictive maintenance and anomaly detection for national laboratory energy infrastructure",
    contract_path_hypothesis: "DOE national laboratory contracts flow through management and operating (M&O) contractors. The $200M spans multiple labs, creating task-order-style opportunities under existing M&O vehicles. Siemens Energy has the grid technology; we bring the AI/ML analytics layer.",
    match_score: 74,
    recommended_next_action: "Attend DOE Grid Resilience Industry Day and assess teaming with Siemens Energy for AI analytics integration",
    safety_lane: "read-only",
    data_source: "manual",
    sources: [
      {
        source_id: "src-010a",
        type: "government_announcement",
        title: "DOE Announces $200M AI Grid Resilience Initiative",
        url: "https://www.energy.gov/ai-grid-resilience-2026",
        publisher: "Department of Energy",
        published_at: "2026-05-06T00:00:00Z",
        retrieved_at: "2026-05-07T08:00:00Z",
        claim_support: "Confirms $200M funding, 15 national laboratories, and industry partnership focus",
      },
      {
        source_id: "src-010b",
        type: "company_press_release",
        title: "Siemens Energy Launches AI-Powered Grid Analytics Platform",
        url: "https://www.siemens-energy.com/press/ai-grid-analytics",
        publisher: "Siemens Energy",
        published_at: "2026-04-28T00:00:00Z",
        retrieved_at: "2026-05-07T08:05:00Z",
        claim_support: "Confirms Siemens Energy's investment in AI grid analytics capabilities",
      },
    ],
    created_at: "2026-05-07T08:30:00Z",
    updated_at: "2026-05-07T08:30:00Z",
    technology_tags: ["AI/ML", "grid resilience", "predictive maintenance", "anomaly detection", "energy"],
    company_url: "https://www.siemens-energy.com",
    incumbent_or_competitor_context: "Siemens Energy is a technology partner opportunity, not a competitor. They have grid hardware and operational technology but limited DoD/DOE integration experience and ML analytics capabilities.",
    buyer_problem: "National laboratory energy infrastructure is aging. Unplanned outages cost millions and can delay critical research programs. AI-powered predictive maintenance could reduce outages by 40%.",
    next_review_at: null,
    promotion_target: null,
    analysis: {
      executive_summary: "DOE's $200M AI grid resilience initiative creates a large, multi-lab opportunity set. Siemens Energy has the operational technology platform; Golden Dome brings AI/ML analytics and federal contracting experience. Teaming could position us for multiple lab-specific task orders.",
      why_it_matters: "DOE national laboratory work provides stable, long-term revenue streams. Establishing AI predictive maintenance capabilities in the energy sector diversifies our portfolio beyond defense and creates transferable capabilities.",
      risks_or_gaps: [
        "DOE contracting is different from DoD — different FAR supplements, different acquisition culture",
        "National laboratory M&O contracts are held by large contractors (Battelle, NNSA entities) who may have preferred subcontractors",
        "Our energy sector past performance is limited — DOE experience would be new",
      ],
    },
    ooda: {
      observe: [
        "DOE announced $200M AI grid resilience initiative for 15 national laboratories (May 6 2026)",
        "Siemens Energy launched AI-powered grid analytics platform (Apr 28 2026)",
        "Industry Day expected June-July 2026",
      ],
      orient: [
        "DOE represents a new agency for us — diversification opportunity",
        "AI/ML analytics for predictive maintenance leverages our core capabilities",
        "Siemens Energy partnership could provide the domain expertise we lack",
      ],
      decide: "Pursue. Attend DOE Industry Day and assess Siemens Energy teaming. This represents a strategic diversification into non-DoD federal work.",
      act: "1) Register for DOE Grid Resilience Industry Day. 2) Research Siemens Energy partnerships team. 3) Prepare capability brief on AI predictive maintenance from our defense analytics work.",
    },
    learning: {
      notes: [],
      reserved: true,
    },
  },
];
