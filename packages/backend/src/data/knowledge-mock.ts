/**
 * Mock data for Phase F: RAG Knowledge Base
 * Documents, collections, search results, and chat history
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentType =
  | "past_performance"
  | "proposal"
  | "compliance"
  | "capture_plan"
  | "capability_statement"
  | "doctrine"
  | "contract"
  | "memo";

export type DocumentStatus = "indexed" | "processing" | "failed" | "pending";

export interface DocumentChunk {
  chunk_id: string;
  text: string;
  page: number | null;
  section: string | null;
  similarity_score?: number;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  file_name: string;
  file_size_bytes: number;
  pages: number | null;
  chunks_indexed: number;
  uploaded_at: string;
  indexed_at: string | null;
  last_accessed: string | null;
  access_count: number;
  collection: string;
  tags: string[];
  metadata: {
    agency?: string;
    contract_number?: string;
    naics?: string;
    period_of_performance?: string;
    solicitation_number?: string;
    author?: string;
  };
  summary: string;
}

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  document_count: number;
  total_chunks: number;
  last_updated: string;
  icon: string;
}

export interface SearchResult {
  document_id: string;
  document_title: string;
  document_type: DocumentType;
  collection: string;
  chunks: DocumentChunk[];
  relevance_score: number;
  highlight: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: Array<{
    document_id: string;
    document_title: string;
    chunk_text: string;
    page: number | null;
    relevance: number;
  }>;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  context?: string;
}

// ---------------------------------------------------------------------------
// Mock Collections
// ---------------------------------------------------------------------------

export const MOCK_COLLECTIONS: KnowledgeCollection[] = [
  {
    id: "col-past-perf",
    name: "Past Performance",
    description: "Historical contract performance records, CPARS, and past performance narratives",
    document_count: 8,
    total_chunks: 342,
    last_updated: "2025-05-08T14:30:00Z",
    icon: "🏆",
  },
  {
    id: "col-proposals",
    name: "Proposals",
    description: "Submitted proposals, technical volumes, management plans, and cost volumes",
    document_count: 6,
    total_chunks: 518,
    last_updated: "2025-05-07T09:15:00Z",
    icon: "📄",
  },
  {
    id: "col-compliance",
    name: "Compliance",
    description: "FAR/DFARS clause responses, compliance matrices, and regulatory guidance",
    document_count: 4,
    total_chunks: 186,
    last_updated: "2025-05-06T11:45:00Z",
    icon: "📋",
  },
  {
    id: "col-capture",
    name: "Capture Plans",
    description: "Capture strategies, competitive analyses, and win theme documentation",
    document_count: 5,
    total_chunks: 274,
    last_updated: "2025-05-09T08:00:00Z",
    icon: "🎯",
  },
  {
    id: "col-capabilities",
    name: "Capability Statements",
    description: "Corporate capability statements, past performance summaries, and qualifications",
    document_count: 3,
    total_chunks: 98,
    last_updated: "2025-04-28T16:20:00Z",
    icon: "📊",
  },
  {
    id: "col-contracts",
    name: "Contracts & Memos",
    description: "Active contracts, modifications, task orders, and internal memos",
    document_count: 4,
    total_chunks: 156,
    last_updated: "2025-05-05T13:10:00Z",
    icon: "📑",
  },
];

// ---------------------------------------------------------------------------
// Mock Documents
// ---------------------------------------------------------------------------

export const MOCK_DOCUMENTS: KnowledgeDocument[] = [
  // Past Performance (8)
  {
    id: "doc-001",
    title: "USACE FUDS Environmental Remediation — Past Performance Narrative",
    type: "past_performance",
    status: "indexed",
    file_name: "USACE_FUDS_PP_Narrative_2024.pdf",
    file_size_bytes: 2_450_000,
    pages: 18,
    chunks_indexed: 47,
    uploaded_at: "2025-03-15T10:00:00Z",
    indexed_at: "2025-03-15T10:12:00Z",
    last_accessed: "2025-05-08T14:30:00Z",
    access_count: 34,
    collection: "col-past-perf",
    tags: ["USACE", "environmental", "remediation", "FUDS", "outstanding"],
    metadata: {
      agency: "USACE",
      contract_number: "W912DY-20-C-0047",
      naics: "562910",
      period_of_performance: "2020-2024",
    },
    summary: "Past performance narrative for USACE FUDS environmental remediation contract. Received 'Outstanding' CPARS rating across all evaluation factors. Covers 12 FUDS sites across 4 states with $47M total value.",
  },
  {
    id: "doc-002",
    title: "NASA KSC Launch Operations Support — CPARS Summary",
    type: "past_performance",
    status: "indexed",
    file_name: "NASA_KSC_CPARS_2023.pdf",
    file_size_bytes: 1_800_000,
    pages: 12,
    chunks_indexed: 31,
    uploaded_at: "2025-02-20T08:30:00Z",
    indexed_at: "2025-02-20T08:41:00Z",
    last_accessed: "2025-05-06T09:15:00Z",
    access_count: 22,
    collection: "col-past-perf",
    tags: ["NASA", "KSC", "launch ops", "CPARS", "very good"],
    metadata: {
      agency: "NASA",
      contract_number: "80KSC020C0001",
      naics: "541715",
      period_of_performance: "2020-2025",
    },
    summary: "CPARS summary for NASA KSC launch operations support. 'Very Good' ratings in technical performance and schedule. Supported 14 launch campaigns including Artemis I ground systems.",
  },
  {
    id: "doc-003",
    title: "DHS CISA Cybersecurity Assessment — Performance Write-up",
    type: "past_performance",
    status: "indexed",
    file_name: "DHS_CISA_Cyber_PP_2024.pdf",
    file_size_bytes: 1_200_000,
    pages: 9,
    chunks_indexed: 24,
    uploaded_at: "2025-04-01T14:00:00Z",
    indexed_at: "2025-04-01T14:08:00Z",
    last_accessed: "2025-05-07T11:30:00Z",
    access_count: 18,
    collection: "col-past-perf",
    tags: ["DHS", "CISA", "cybersecurity", "CDM", "satisfactory"],
    metadata: {
      agency: "DHS/CISA",
      contract_number: "70RCSA22C0015",
      naics: "541512",
      period_of_performance: "2022-2025",
    },
    summary: "Performance write-up for DHS CISA continuous diagnostics and mitigation (CDM) DEFEND task order. Deployed sensors across 47 civilian agencies. 99.7% uptime SLA maintained.",
  },
  {
    id: "doc-004",
    title: "Army CECOM C5ISR Electronic Warfare — Past Performance",
    type: "past_performance",
    status: "indexed",
    file_name: "Army_CECOM_EW_PP_2024.pdf",
    file_size_bytes: 3_100_000,
    pages: 22,
    chunks_indexed: 56,
    uploaded_at: "2025-01-10T09:00:00Z",
    indexed_at: "2025-01-10T09:18:00Z",
    last_accessed: "2025-05-08T16:00:00Z",
    access_count: 41,
    collection: "col-past-perf",
    tags: ["Army", "CECOM", "C5ISR", "EW", "exceptional"],
    metadata: {
      agency: "US Army CECOM",
      contract_number: "W15P7T-21-C-0089",
      naics: "334511",
      period_of_performance: "2021-2025",
    },
    summary: "Past performance for Army CECOM C5ISR electronic warfare systems integration. 'Exceptional' rating for technical approach. Delivered 3 EW prototype systems ahead of schedule.",
  },
  {
    id: "doc-005",
    title: "Air Force Tyndall AFB Infrastructure — Performance Record",
    type: "past_performance",
    status: "indexed",
    file_name: "USAF_Tyndall_PP_2023.pdf",
    file_size_bytes: 1_950_000,
    pages: 14,
    chunks_indexed: 38,
    uploaded_at: "2025-03-22T11:00:00Z",
    indexed_at: "2025-03-22T11:10:00Z",
    last_accessed: "2025-05-05T08:45:00Z",
    access_count: 15,
    collection: "col-past-perf",
    tags: ["USAF", "Tyndall", "infrastructure", "reconstruction", "outstanding"],
    metadata: {
      agency: "US Air Force",
      contract_number: "FA4819-19-C-0003",
      naics: "236220",
      period_of_performance: "2019-2024",
    },
    summary: "Performance record for Tyndall AFB post-hurricane reconstruction and modernization. $180M program delivering smart infrastructure with IoT-enabled building management. Outstanding ratings.",
  },
  {
    id: "doc-006",
    title: "DCSA Personnel Vetting IT Modernization — Past Performance",
    type: "past_performance",
    status: "indexed",
    file_name: "DCSA_PV_IT_PP_2024.pdf",
    file_size_bytes: 1_400_000,
    pages: 10,
    chunks_indexed: 28,
    uploaded_at: "2025-04-15T13:30:00Z",
    indexed_at: "2025-04-15T13:38:00Z",
    last_accessed: "2025-05-04T10:00:00Z",
    access_count: 12,
    collection: "col-past-perf",
    tags: ["DCSA", "personnel vetting", "IT modernization", "very good"],
    metadata: {
      agency: "DCSA",
      contract_number: "HQ0034-22-C-0011",
      naics: "541512",
      period_of_performance: "2022-2026",
    },
    summary: "Past performance for DCSA personnel vetting IT modernization. Migrated 2.1M background investigation records to cloud-native architecture. 'Very Good' overall rating.",
  },
  {
    id: "doc-007",
    title: "NAVWAR Maritime C2 Systems — CPARS",
    type: "past_performance",
    status: "indexed",
    file_name: "NAVWAR_C2_CPARS_2024.pdf",
    file_size_bytes: 2_700_000,
    pages: 19,
    chunks_indexed: 49,
    uploaded_at: "2025-02-05T07:45:00Z",
    indexed_at: "2025-02-05T08:00:00Z",
    last_accessed: "2025-05-09T07:30:00Z",
    access_count: 28,
    collection: "col-past-perf",
    tags: ["NAVWAR", "maritime", "C2", "exceptional"],
    metadata: {
      agency: "NAVWAR",
      contract_number: "N00039-21-C-0034",
      naics: "334220",
      period_of_performance: "2021-2025",
    },
    summary: "CPARS for NAVWAR maritime command and control systems engineering. 'Exceptional' in technical and management. Delivered integrated C2 suite across 8 ship classes.",
  },
  {
    id: "doc-008",
    title: "SOCOM Special Operations — Performance Narrative",
    type: "past_performance",
    status: "indexed",
    file_name: "SOCOM_SOF_PP_2024.pdf",
    file_size_bytes: 2_100_000,
    pages: 16,
    chunks_indexed: 42,
    uploaded_at: "2025-04-20T10:30:00Z",
    indexed_at: "2025-04-20T10:42:00Z",
    last_accessed: "2025-05-07T15:00:00Z",
    access_count: 19,
    collection: "col-past-perf",
    tags: ["SOCOM", "special operations", "ISR", "very good"],
    metadata: {
      agency: "USSOCOM",
      contract_number: "H92222-22-C-0078",
      naics: "541330",
      period_of_performance: "2022-2026",
    },
    summary: "Performance narrative for SOCOM special operations ISR platform integration. Integrated 5 sensor suites with real-time data fusion. 'Very Good' across all factors.",
  },

  // Proposals (6)
  {
    id: "doc-009",
    title: "USACE FUDS IDIQ TO-3 — Technical Volume",
    type: "proposal",
    status: "indexed",
    file_name: "USACE_FUDS_TO3_TechVol.pdf",
    file_size_bytes: 8_500_000,
    pages: 85,
    chunks_indexed: 124,
    uploaded_at: "2025-04-10T09:00:00Z",
    indexed_at: "2025-04-10T09:45:00Z",
    last_accessed: "2025-05-08T11:00:00Z",
    access_count: 47,
    collection: "col-proposals",
    tags: ["USACE", "FUDS", "environmental", "technical volume", "winner"],
    metadata: {
      agency: "USACE",
      solicitation_number: "W912DY-25-R-0012",
      naics: "562910",
      author: "BD Team Alpha",
    },
    summary: "Winning technical volume for USACE FUDS IDIQ Task Order 3. Covers PFAS remediation approach, transition plan, and staffing matrix. Scored 'Outstanding' on technical evaluation.",
  },
  {
    id: "doc-010",
    title: "NASA KSC Ground Systems — Management Volume",
    type: "proposal",
    status: "indexed",
    file_name: "NASA_KSC_GS_MgmtVol.pdf",
    file_size_bytes: 5_200_000,
    pages: 52,
    chunks_indexed: 78,
    uploaded_at: "2025-03-05T14:00:00Z",
    indexed_at: "2025-03-05T14:30:00Z",
    last_accessed: "2025-05-06T16:30:00Z",
    access_count: 31,
    collection: "col-proposals",
    tags: ["NASA", "KSC", "ground systems", "management volume"],
    metadata: {
      agency: "NASA",
      solicitation_number: "80KSC025R0005",
      naics: "541715",
      author: "BD Team Bravo",
    },
    summary: "Management volume for NASA KSC ground systems support recompete. Includes org chart, risk management framework, and quality management plan with ISO 9001 compliance.",
  },
  {
    id: "doc-011",
    title: "DHS CISA CDM DEFEND — Cost Volume",
    type: "proposal",
    status: "indexed",
    file_name: "DHS_CISA_CDM_CostVol.pdf",
    file_size_bytes: 3_800_000,
    pages: 38,
    chunks_indexed: 54,
    uploaded_at: "2025-02-18T11:00:00Z",
    indexed_at: "2025-02-18T11:20:00Z",
    last_accessed: "2025-05-03T09:00:00Z",
    access_count: 14,
    collection: "col-proposals",
    tags: ["DHS", "CISA", "CDM", "cost volume", "competitive"],
    metadata: {
      agency: "DHS/CISA",
      solicitation_number: "70RCSA25R0008",
      naics: "541512",
      author: "Pricing Team",
    },
    summary: "Cost volume for DHS CISA CDM DEFEND follow-on. Includes labor categories, rates, and ODC estimates across 5-year period. Competitive pricing strategy with 15% cost savings over incumbent.",
  },
  {
    id: "doc-012",
    title: "Army C5ISR EW Systems — Past Performance Volume",
    type: "proposal",
    status: "indexed",
    file_name: "Army_C5ISR_EW_PPVol.pdf",
    file_size_bytes: 4_100_000,
    pages: 42,
    chunks_indexed: 62,
    uploaded_at: "2025-01-25T08:00:00Z",
    indexed_at: "2025-01-25T08:25:00Z",
    last_accessed: "2025-05-07T14:00:00Z",
    access_count: 25,
    collection: "col-proposals",
    tags: ["Army", "C5ISR", "EW", "past performance volume"],
    metadata: {
      agency: "US Army CECOM",
      solicitation_number: "W15P7T-25-R-0034",
      naics: "334511",
      author: "BD Team Alpha",
    },
    summary: "Past performance volume for Army C5ISR EW systems recompete. References 5 relevant contracts with exceptional/outstanding ratings. Includes customer contact information and evaluation narratives.",
  },
  {
    id: "doc-013",
    title: "NAVWAR Maritime C2 — Technical & Management",
    type: "proposal",
    status: "indexed",
    file_name: "NAVWAR_C2_TechMgmt.pdf",
    file_size_bytes: 12_400_000,
    pages: 127,
    chunks_indexed: 168,
    uploaded_at: "2025-03-30T07:00:00Z",
    indexed_at: "2025-03-30T08:15:00Z",
    last_accessed: "2025-05-09T08:00:00Z",
    access_count: 52,
    collection: "col-proposals",
    tags: ["NAVWAR", "maritime", "C2", "technical", "management", "winner"],
    metadata: {
      agency: "NAVWAR",
      solicitation_number: "N00039-25-R-0019",
      naics: "334220",
      author: "BD Team Charlie",
    },
    summary: "Combined technical and management volume for NAVWAR maritime C2 recompete. 127-page comprehensive proposal covering system architecture, integration approach, and transition plan. Won award.",
  },
  {
    id: "doc-014",
    title: "Air Force Tyndall Smart Base — Capability Statement",
    type: "proposal",
    status: "processing",
    file_name: "USAF_Tyndall_SmartBase_CapStmt.pdf",
    file_size_bytes: 6_700_000,
    pages: 67,
    chunks_indexed: 32,
    uploaded_at: "2025-05-09T16:00:00Z",
    indexed_at: null,
    last_accessed: null,
    access_count: 0,
    collection: "col-proposals",
    tags: ["USAF", "Tyndall", "smart base", "IoT"],
    metadata: {
      agency: "US Air Force",
      solicitation_number: "FA4819-25-R-0010",
      naics: "236220",
      author: "BD Team Bravo",
    },
    summary: "Capability statement for Tyndall Smart Base initiative. Currently being processed and indexed.",
  },

  // Compliance (4)
  {
    id: "doc-015",
    title: "DFARS 252.204-7012 — Compliance Response Template",
    type: "compliance",
    status: "indexed",
    file_name: "DFARS_7012_Response_Template.pdf",
    file_size_bytes: 980_000,
    pages: 8,
    chunks_indexed: 22,
    uploaded_at: "2025-01-05T10:00:00Z",
    indexed_at: "2025-01-05T10:06:00Z",
    last_accessed: "2025-05-08T13:00:00Z",
    access_count: 63,
    collection: "col-compliance",
    tags: ["DFARS", "cybersecurity", "NIST 800-171", "CUI", "template"],
    metadata: {
      naics: "541512",
      author: "Compliance Team",
    },
    summary: "Standard compliance response template for DFARS 252.204-7012 (Safeguarding Covered Defense Information). Includes NIST 800-171 control mapping, SSP references, and POA&M status for all 110 controls.",
  },
  {
    id: "doc-016",
    title: "FAR 52.219-14 — Small Business Subcontracting Plan",
    type: "compliance",
    status: "indexed",
    file_name: "FAR_52219_SB_SubPlan.pdf",
    file_size_bytes: 1_500_000,
    pages: 14,
    chunks_indexed: 36,
    uploaded_at: "2025-02-12T09:30:00Z",
    indexed_at: "2025-02-12T09:38:00Z",
    last_accessed: "2025-05-05T11:00:00Z",
    access_count: 28,
    collection: "col-compliance",
    tags: ["FAR", "small business", "subcontracting", "SDB", "WOSB", "HUBZone"],
    metadata: {
      author: "Compliance Team",
    },
    summary: "Small business subcontracting plan template addressing FAR 52.219-14. Includes goals for SDB, WOSB, HUBZone, VOSB, and SDVOSB categories with historical achievement data.",
  },
  {
    id: "doc-017",
    title: "Section 508 Accessibility — Compliance Matrix",
    type: "compliance",
    status: "indexed",
    file_name: "Section508_Compliance_Matrix.pdf",
    file_size_bytes: 750_000,
    pages: 6,
    chunks_indexed: 18,
    uploaded_at: "2025-03-08T14:00:00Z",
    indexed_at: "2025-03-08T14:05:00Z",
    last_accessed: "2025-04-29T10:30:00Z",
    access_count: 9,
    collection: "col-compliance",
    tags: ["Section 508", "accessibility", "WCAG", "VPAT"],
    metadata: {
      author: "IT Standards Team",
    },
    summary: "Section 508 accessibility compliance matrix and VPAT for GDA software deliverables. Maps WCAG 2.1 AA conformance across all UI components.",
  },
  {
    id: "doc-018",
    title: "ITAR/EAR Export Control — Compliance Procedures",
    type: "compliance",
    status: "indexed",
    file_name: "ITAR_EAR_Compliance_Procedures.pdf",
    file_size_bytes: 2_200_000,
    pages: 20,
    chunks_indexed: 48,
    uploaded_at: "2025-04-02T08:00:00Z",
    indexed_at: "2025-04-02T08:12:00Z",
    last_accessed: "2025-05-06T15:00:00Z",
    access_count: 17,
    collection: "col-compliance",
    tags: ["ITAR", "EAR", "export control", "DDTC", "BIS"],
    metadata: {
      author: "Legal/Compliance",
    },
    summary: "Export control compliance procedures covering ITAR (22 CFR 120-130) and EAR (15 CFR 730-774). Includes technology control plan templates, deemed export screening procedures, and training records.",
  },

  // Capture Plans (5)
  {
    id: "doc-019",
    title: "MAPS — Capture Strategy & Win Themes",
    type: "capture_plan",
    status: "indexed",
    file_name: "MAPS_Capture_Strategy.pdf",
    file_size_bytes: 4_600_000,
    pages: 45,
    chunks_indexed: 68,
    uploaded_at: "2025-04-25T09:00:00Z",
    indexed_at: "2025-04-25T09:30:00Z",
    last_accessed: "2025-05-09T09:00:00Z",
    access_count: 38,
    collection: "col-capture",
    tags: ["MAPS", "Army", "program management", "win themes", "$250M"],
    metadata: {
      agency: "US Army",
      solicitation_number: "W52P1J-25-R-0001",
      naics: "541611",
    },
    summary: "Capture strategy for MAPS ($250M Army program management contract). Includes 4 win themes, competitive landscape (incumbent: Booz Allen), teaming strategy (Envision Innovative Solutions), and gate review decisions.",
  },
  {
    id: "doc-020",
    title: "DARPA Smash Autonomous Systems — Capture Plan",
    type: "capture_plan",
    status: "indexed",
    file_name: "DARPA_Smash_Capture.pdf",
    file_size_bytes: 3_200_000,
    pages: 32,
    chunks_indexed: 48,
    uploaded_at: "2025-05-01T10:00:00Z",
    indexed_at: "2025-05-01T10:18:00Z",
    last_accessed: "2025-05-08T17:00:00Z",
    access_count: 22,
    collection: "col-capture",
    tags: ["DARPA", "autonomous", "AI/ML", "rapid prototyping"],
    metadata: {
      agency: "DARPA",
      solicitation_number: "HR001125S0001",
      naics: "541715",
    },
    summary: "Capture plan for DARPA Smash autonomous systems program. Focus on AI/ML sensor fusion and autonomous decision-making. Competitive analysis includes Raytheon, L3Harris, and Northrop Grumman.",
  },
  {
    id: "doc-021",
    title: "Navy ISW Maritime Domain Awareness — Competitive Analysis",
    type: "capture_plan",
    status: "indexed",
    file_name: "Navy_ISW_MDA_CompAnalysis.pdf",
    file_size_bytes: 2_800_000,
    pages: 28,
    chunks_indexed: 42,
    uploaded_at: "2025-04-18T13:00:00Z",
    indexed_at: "2025-04-18T13:15:00Z",
    last_accessed: "2025-05-07T10:00:00Z",
    access_count: 16,
    collection: "col-capture",
    tags: ["Navy", "ISW", "MDA", "competitor analysis", "Leidos"],
    metadata: {
      agency: "US Navy",
      contract_number: "N00024-25-R-0045",
      naics: "541330",
    },
    summary: "Competitive analysis for Navy ISW maritime domain awareness program. Maps 6 competitors including Leidos (incumbent), SAIC, and ManTech. Identifies 3 discriminators and 2 ghost team strategies.",
  },
  {
    id: "doc-022",
    title: "DHS CBP Border Tech — Gate Review Package",
    type: "capture_plan",
    status: "indexed",
    file_name: "DHS_CBP_BorderTech_GateReview.pdf",
    file_size_bytes: 1_900_000,
    pages: 18,
    chunks_indexed: 32,
    uploaded_at: "2025-05-03T08:00:00Z",
    indexed_at: "2025-05-03T08:10:00Z",
    last_accessed: "2025-05-08T14:30:00Z",
    access_count: 11,
    collection: "col-capture",
    tags: ["DHS", "CBP", "border technology", "gate review", "bid/no-bid"],
    metadata: {
      agency: "DHS/CBP",
      solicitation_number: "70B06C25R0003",
      naics: "334290",
    },
    summary: "Gate review package for DHS CBP border technology modernization. Includes bid/no-bid decision matrix scoring 78/100, Pwin estimate of 45%, and resource commitment of $1.2M B&P investment.",
  },
  {
    id: "doc-023",
    title: "AFWERX Agility Prime — Innovation Capture",
    type: "capture_plan",
    status: "indexed",
    file_name: "AFWERX_AgilityPrime_Capture.pdf",
    file_size_bytes: 2_400_000,
    pages: 24,
    chunks_indexed: 36,
    uploaded_at: "2025-04-28T11:00:00Z",
    indexed_at: "2025-04-28T11:12:00Z",
    last_accessed: "2025-05-06T13:00:00Z",
    access_count: 8,
    collection: "col-capture",
    tags: ["AFWERX", "Agility Prime", "eVTOL", "innovation", "SBIR Phase III"],
    metadata: {
      agency: "US Air Force / AFWERX",
      naics: "336411",
    },
    summary: "Innovation capture strategy for AFWERX Agility Prime electric vertical takeoff and landing (eVTOL) program. SBIR Phase III pathway. Partners with Joby Aviation for manufacturing.",
  },

  // Capability Statements (3)
  {
    id: "doc-024",
    title: "GDA Corporate Capability Statement — Full Spectrum",
    type: "capability_statement",
    status: "indexed",
    file_name: "GDA_Corp_CapStmt_2025.pdf",
    file_size_bytes: 5_800_000,
    pages: 24,
    chunks_indexed: 38,
    uploaded_at: "2025-01-15T09:00:00Z",
    indexed_at: "2025-01-15T09:15:00Z",
    last_accessed: "2025-05-09T07:00:00Z",
    access_count: 89,
    collection: "col-capabilities",
    tags: ["corporate", "capability statement", "NAICS", "cage code", "DUNS"],
    metadata: {
      author: "Marketing/BD",
    },
    summary: "Full spectrum corporate capability statement. Covers 12 core competencies, 8 NAICS codes, 45 active contracts, and key personnel qualifications. Updated Q1 2025.",
  },
  {
    id: "doc-025",
    title: "Cybersecurity Division — Capability Brief",
    type: "capability_statement",
    status: "indexed",
    file_name: "Cyber_Division_CapBrief.pdf",
    file_size_bytes: 3_400_000,
    pages: 18,
    chunks_indexed: 30,
    uploaded_at: "2025-02-28T10:00:00Z",
    indexed_at: "2025-02-28T10:10:00Z",
    last_accessed: "2025-05-04T16:00:00Z",
    access_count: 24,
    collection: "col-capabilities",
    tags: ["cybersecurity", "CMMC", "zero trust", "SOC", "incident response"],
    metadata: {
      author: "Cyber Division Lead",
    },
    summary: "Cybersecurity division capability brief. Covers CMMC Level 3 assessment readiness, zero trust architecture implementation, 24/7 SOC operations, and incident response team certifications.",
  },
  {
    id: "doc-026",
    title: "Environmental & Sustainability Services — Qualifications",
    type: "capability_statement",
    status: "indexed",
    file_name: "Env_Sustainability_Quals.pdf",
    file_size_bytes: 2_900_000,
    pages: 15,
    chunks_indexed: 26,
    uploaded_at: "2025-03-18T13:00:00Z",
    indexed_at: "2025-03-18T13:08:00Z",
    last_accessed: "2025-05-02T09:30:00Z",
    access_count: 11,
    collection: "col-capabilities",
    tags: ["environmental", "PFAS", "sustainability", "remediation", "CERCLA"],
    metadata: {
      author: "Environmental Division",
    },
    summary: "Environmental and sustainability services qualifications. Highlights PFAS remediation expertise, CERCLA compliance, and green infrastructure design across 200+ DoD and federal sites.",
  },

  // Contracts & Memos (4)
  {
    id: "doc-027",
    title: "USACE FUDS IDIQ — Base Contract & Modifications",
    type: "contract",
    status: "indexed",
    file_name: "USACE_FUDS_IDIQ_Contract.pdf",
    file_size_bytes: 7_200_000,
    pages: 68,
    chunks_indexed: 96,
    uploaded_at: "2025-01-20T08:00:00Z",
    indexed_at: "2025-01-20T08:40:00Z",
    last_accessed: "2025-05-07T12:00:00Z",
    access_count: 33,
    collection: "col-contracts",
    tags: ["USACE", "FUDS", "IDIQ", "contract", "modifications"],
    metadata: {
      agency: "USACE",
      contract_number: "W912DY-20-D-0047",
      naics: "562910",
      period_of_performance: "2020-2025",
    },
    summary: "Base IDIQ contract and 12 modifications for USACE FUDS environmental remediation. $95M ceiling value across 5 task orders. Includes CLIN structure, labor categories, and ceiling adjustments.",
  },
  {
    id: "doc-028",
    title: "Teaming Agreement — Envision Innovative Solutions (MAPS)",
    type: "contract",
    status: "indexed",
    file_name: "TA_Envision_MAPS.pdf",
    file_size_bytes: 1_100_000,
    pages: 12,
    chunks_indexed: 18,
    uploaded_at: "2025-04-22T14:00:00Z",
    indexed_at: "2025-04-22T14:06:00Z",
    last_accessed: "2025-05-06T10:00:00Z",
    access_count: 7,
    collection: "col-contracts",
    tags: ["teaming", "Envision", "MAPS", "mentor-protégé"],
    metadata: {
      agency: "US Army",
      contract_number: "TA-2025-MAPS-001",
    },
    summary: "Teaming agreement with Envision Innovative Solutions for MAPS pursuit. Defines work share (GDA 60% / Envision 40%), mentor-protégé arrangement, and IP rights. Exclusive agreement through award.",
  },
  {
    id: "doc-029",
    title: "BD Strategy Memo — Q2 2025 Pipeline Priorities",
    type: "memo",
    status: "indexed",
    file_name: "BD_Strategy_Q2_2025.pdf",
    file_size_bytes: 850_000,
    pages: 6,
    chunks_indexed: 14,
    uploaded_at: "2025-04-01T07:00:00Z",
    indexed_at: "2025-04-01T07:04:00Z",
    last_accessed: "2025-05-08T08:00:00Z",
    access_count: 45,
    collection: "col-contracts",
    tags: ["strategy", "BD", "Q2 2025", "pipeline", "priorities"],
    metadata: {
      author: "VP of BD",
    },
    summary: "Q2 2025 BD strategy memo identifying top 5 pipeline priorities: MAPS recompete, NAVWAR C2 follow-on, CISA CDM DEFEND, Army EW modernization, and Tyndall Smart Base. Total pipeline value: $1.8B.",
  },
  {
    id: "doc-030",
    title: "Lessons Learned — Navy ISW Debrief (Loss)",
    type: "memo",
    status: "indexed",
    file_name: "LL_Navy_ISW_Debrief.pdf",
    file_size_bytes: 1_300_000,
    pages: 10,
    chunks_indexed: 22,
    uploaded_at: "2025-05-05T15:00:00Z",
    indexed_at: "2025-05-05T15:08:00Z",
    last_accessed: "2025-05-09T11:00:00Z",
    access_count: 31,
    collection: "col-contracts",
    tags: ["lessons learned", "Navy", "ISW", "loss", "debrief"],
    metadata: {
      agency: "US Navy",
      contract_number: "N00024-25-R-0045",
      author: "Capture Manager",
    },
    summary: "Post-award debrief and lessons learned from Navy ISW loss to Leidos. Key findings: insufficient customer intimacy (scored 3/5 vs Leidos 5/5), pricing 12% above government estimate, and missing key personnel requirement.",
  },
];

// ---------------------------------------------------------------------------
// Mock Chat Sessions
// ---------------------------------------------------------------------------

export const MOCK_CHAT_SESSIONS: ChatSession[] = [
  {
    id: "chat-001",
    title: "PFAS Remediation Past Performance",
    created_at: "2025-05-09T10:00:00Z",
    context: "knowledge-base",
    messages: [
      {
        id: "msg-001",
        role: "user",
        content: "What past performance do we have for PFAS remediation work?",
        timestamp: "2025-05-09T10:00:00Z",
      },
      {
        id: "msg-002",
        role: "assistant",
        content: "Based on your knowledge base, you have strong PFAS remediation past performance:\n\n**Primary Reference:**\n- **USACE FUDS Environmental Remediation** (W912DY-20-C-0047) — 'Outstanding' CPARS rating covering 12 FUDS sites across 4 states ($47M). This contract specifically included PFAS site characterization and interim remedial actions at 3 sites.\n\n**Supporting References:**\n- **Environmental & Sustainability Services Qualifications** — Highlights PFAS remediation expertise across 200+ DoD and federal sites under CERCLA\n- **USACE FUDS IDIQ TO-3 Technical Volume** — Winning proposal that details your PFAS remediation approach including pump-and-treat, soil stabilization, and monitored natural attenuation\n\n**Quantifiable Metrics:**\n- 12 FUDS sites remediated (3 with PFAS contamination)\n- 99.2% regulatory compliance rate\n- Zero safety incidents across 47,000 field hours\n- All sites achieved preliminary closure within contract timeline",
        timestamp: "2025-05-09T10:00:15Z",
        sources: [
          {
            document_id: "doc-001",
            document_title: "USACE FUDS Environmental Remediation — Past Performance Narrative",
            chunk_text: "PFAS site characterization and interim remedial actions were performed at Fort Ord (CA), former Camp Gruber (OK), and former Chanute AFB (IL). Remediation approaches included granular activated carbon treatment, soil stabilization with Portland cement amendments, and long-term monitored natural attenuation. All three sites achieved preliminary closure milestones within the contract period of performance.",
            page: 7,
            relevance: 0.96,
          },
          {
            document_id: "doc-026",
            document_title: "Environmental & Sustainability Services — Qualifications",
            chunk_text: "PFAS remediation services include site characterization, risk assessment, feasibility studies, and implementation of treatment technologies including GAC systems, ion exchange resins, and emerging destruction technologies. Over 200 DoD and federal sites served under CERCLA authority.",
            page: 4,
            relevance: 0.91,
          },
          {
            document_id: "doc-009",
            document_title: "USACE FUDS IDIQ TO-3 — Technical Volume",
            chunk_text: "Our PFAS remediation approach integrates three complementary treatment trains: (1) pump-and-treat with GAC for groundwater, (2) in-situ soil stabilization for source zone control, and (3) monitored natural attenuation with quarterly sampling for confirmation. This approach has been validated across 3 FUDS sites under our current contract.",
            page: 23,
            relevance: 0.89,
          },
        ],
      },
    ],
  },
  {
    id: "chat-002",
    title: "Transition Plan Language",
    created_at: "2025-05-08T14:30:00Z",
    context: "knowledge-base",
    messages: [
      {
        id: "msg-003",
        role: "user",
        content: "Draft a transition plan section for a USACE environmental services contract",
        timestamp: "2025-05-08T14:30:00Z",
      },
      {
        id: "msg-004",
        role: "assistant",
        content: "Here's a draft transition plan section based on your winning USACE FUDS TO-3 proposal and past performance:\n\n---\n\n**3.2 Transition Plan**\n\n**3.2.1 Transition Approach**\nGDA will execute a 30-day transition plan leveraging our proven methodology from the FUDS IDIQ (W912DY-20-D-0047), where we achieved full operational capability 5 days ahead of schedule. Our approach minimizes disruption to ongoing field operations while ensuring continuity of environmental monitoring and regulatory compliance.\n\n**3.2.2 Phase 1 — Knowledge Transfer (Days 1-10)**\n- Conduct incumbent debriefs and document review\n- Inventory all site data, monitoring records, and regulatory correspondence\n- Map ongoing remedial actions and sampling schedules\n- Establish government POC communication cadence\n\n**3.2.3 Phase 2 — Staffing & Mobilization (Days 5-20)**\n- Deploy named key personnel (all with active clearances)\n- Mobilize field teams to priority sites\n- Activate subcontractor agreements and lab services\n- Establish project management information system (PMIS)\n\n**3.2.4 Phase 3 — Full Operations (Days 15-30)**\n- Assume responsibility for all active remedial actions\n- Validate baseline monitoring data against historical trends\n- Submit updated work plans to USACE project managers\n- Conduct 30-day transition completion review with COR\n\n*This approach has been refined through 3 successful contract transitions, averaging 27 days to full operational capability.*",
        timestamp: "2025-05-08T14:30:20Z",
        sources: [
          {
            document_id: "doc-009",
            document_title: "USACE FUDS IDIQ TO-3 — Technical Volume",
            chunk_text: "Our 30-day transition plan leverages lessons learned from 3 prior environmental contract transitions. Key success factors include early key personnel deployment (Day 1), parallel knowledge transfer and mobilization activities, and a structured 30-day review with the COR to confirm full operational capability.",
            page: 42,
            relevance: 0.94,
          },
          {
            document_id: "doc-001",
            document_title: "USACE FUDS Environmental Remediation — Past Performance Narrative",
            chunk_text: "Transition to full operational capability was achieved 5 days ahead of the 30-day requirement. All 12 FUDS sites were fully staffed and operational within 25 days of contract start. Zero disruption to ongoing monitoring and sampling schedules.",
            page: 3,
            relevance: 0.88,
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mock Search Results (pre-computed for common queries)
// ---------------------------------------------------------------------------

export function mockSemanticSearch(query: string, limit = 10): SearchResult[] {
  const q = query.toLowerCase();

  // All documents as potential search results
  const allResults: SearchResult[] = MOCK_DOCUMENTS
    .filter((d) => d.status === "indexed")
    .map((d) => {
      // Simple keyword-based relevance scoring for mock
      const titleMatch = d.title.toLowerCase().includes(q) ? 0.3 : 0;
      const summaryMatch = d.summary.toLowerCase().includes(q) ? 0.2 : 0;
      const tagMatch = d.tags.some((t) => t.toLowerCase().includes(q)) ? 0.15 : 0;
      const typeBoost = d.type === "past_performance" ? 0.05 : 0;
      const accessBoost = Math.min(d.access_count / 100, 0.1);
      const base = titleMatch + summaryMatch + tagMatch + typeBoost + accessBoost;

      return {
        document_id: d.id,
        document_title: d.title,
        document_type: d.type,
        collection: d.collection,
        relevance_score: Math.min(base + 0.3 + Math.random() * 0.15, 0.99),
        highlight: d.summary.slice(0, 200),
        chunks: [
          {
            chunk_id: `${d.id}-chunk-1`,
            text: d.summary,
            page: 1,
            section: "Summary",
            similarity_score: base + 0.4,
          },
        ],
      };
    })
    .filter((r) => r.relevance_score > 0.35)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit);

  return allResults;
}
