import type {
  OpportunityAnalysis,
  OodaBlock,
  OpportunitySource,
  OpportunityLearning,
  OpportunityDetailData,
  Opportunity,
} from "@gda/shared";
import { getMockOpportunityById } from "./opportunities-mock";

// ---------------------------------------------------------------------------
// Per-opportunity mock analysis, OODA, sources, and learning
// ---------------------------------------------------------------------------

interface DetailSeed {
  analysis: OpportunityAnalysis;
  ooda: OodaBlock;
  sources: OpportunitySource[];
  learning: OpportunityLearning;
}

const detailSeeds: Record<string, DetailSeed> = {
  "opp-001": {
    analysis: {
      executive_summary:
        "USACE Environmental Remediation Services for the OU3 Site Cleanup at Fort Bragg represents a strong mid-tier opportunity ($24.5M) in Envision's core remediation practice. The solicitation is full and open with AECOM as the likely incumbent. Envision has relevant past performance on similar USACE remediation task orders and a competitive Pwin of 72%.",
      strengths: [
        "Direct alignment with Envision's environmental remediation core capability",
        "Prior USACE work under FUDS program demonstrates relevant past performance",
        "Fort Bragg location is within Envision's operational footprint",
        "Score of 87.5 indicates strong quantitative alignment",
      ],
      risks: [
        "AECOM is the incumbent with established site knowledge",
        "Full and Open competition increases field size",
        "OU3 sites may have complex contaminant profiles requiring specialized subcontractors",
      ],
      competitive_landscape:
        "AECOM is the primary competitive threat as incumbent. Other likely bidders include Tetra Tech, Arcadis, and Parsons given the contract value and USACE customer. Small business teaming may be required for competitive scoring.",
      relevance_rationale:
        "This opportunity scores 87.5 due to direct NAICS 562910 alignment, prior USACE remediation experience, geographic proximity, and contract value within Envision's sweet spot ($10M–$50M).",
      recommended_action:
        "Pursue aggressively. Begin capture plan development, identify Fort Bragg site-specific SMEs, and schedule a pre-proposal meeting with the USACE contracting officer.",
      confidence: 0.82,
      last_analyzed_at: "2026-05-08T16:20:00Z",
      analyst_feedback: null,
      analysis_version: "gda-analysis-v2.1",
    },
    ooda: {
      observe: {
        summary:
          "Key facts gathered from SAM.gov posting, USACE procurement history, and incumbent contract data.",
        items: [
          { label: "Solicitation Number", value: "W912DY-26-R-0045", source_ids: ["src-001-a"] },
          { label: "Contract Value", value: "$24.5M estimated", source_ids: ["src-001-a"] },
          { label: "Incumbent", value: "AECOM — current OU3 remediation contractor", source_ids: ["src-001-b"] },
          { label: "Set-Aside", value: "Full and Open Competition", source_ids: ["src-001-a"] },
          { label: "NAICS", value: "562910 — Remediation Services", source_ids: ["src-001-a"] },
        ],
      },
      orient: {
        summary:
          "Envision is well-positioned but faces incumbent advantage. Key differentiator is FUDS past performance.",
        items: [
          { label: "Incumbent Advantage", value: "AECOM has 5+ years of site-specific knowledge at OU3", source_ids: ["src-001-b"], type: "risk" },
          { label: "Past Performance Match", value: "Envision's FUDS Region 5 win demonstrates directly relevant experience", source_ids: ["src-001-c"], type: "strength" },
          { label: "Price Competition", value: "Full and Open means price will be a significant evaluation factor", source_ids: ["src-001-a"], type: "inference" },
          { label: "Geographic Proximity", value: "Fort Bragg is within Envision's Southeast operational footprint", source_ids: [], type: "strength" },
        ],
      },
      decide: {
        summary: "Three strategic options evaluated. Aggressive pursuit recommended.",
        options: [
          { label: "Pursue as Prime", rationale: "Leverage FUDS past performance and competitive pricing to unseat AECOM. Higher risk but highest potential return.", recommended: true },
          { label: "Pursue as Sub to SB", rationale: "Partner with a small business prime to improve scoring on socioeconomic factors. Reduces risk but limits fee.", recommended: false },
          { label: "No-bid", rationale: "Strong incumbent and full competition may not justify capture investment. Not recommended given score and alignment.", recommended: false },
        ],
      },
      act: {
        summary: "Immediate actions to initiate capture sequence.",
        next_steps: [
          { action: "Draft capture plan and assign capture manager", owner: "BD Lead", due_date: "2026-05-15", priority: "high" },
          { action: "Schedule introductory meeting with USACE contracting officer", owner: "Capture Manager", due_date: "2026-05-20", priority: "high" },
          { action: "Identify Fort Bragg site-specific SMEs and subcontractors", owner: "Technical Lead", due_date: "2026-05-25", priority: "medium" },
          { action: "Begin competitive price analysis", owner: "Pricing Team", due_date: "2026-05-30", priority: "medium" },
        ],
      },
    },
    sources: [
      { id: "src-001-a", title: "SAM.gov Opportunity Listing — W912DY-26-R-0045", type: "sam_gov", url: "https://sam.gov/opp/example-001", publisher: "SAM.gov", published_at: "2026-04-15", retrieved_at: "2026-05-08T16:00:00Z", snippet: "Environmental Remediation Services for Operable Unit 3 at Fort Bragg, NC. Full and Open competition.", relevance_reason: "Primary solicitation source for opportunity details and requirements." },
      { id: "src-001-b", title: "AECOM USACE Environmental Contract Award History", type: "contract_award", url: null, publisher: "FPDS.gov", published_at: "2024-09-15", retrieved_at: "2026-05-08T16:05:00Z", snippet: "AECOM awarded $18.2M for OU3 environmental remediation services at Fort Bragg under previous contract cycle.", relevance_reason: "Identifies incumbent and prior contract value for competitive analysis." },
      { id: "src-001-c", title: "Envision FUDS Region 5 Task Order Award", type: "contract_award", url: null, publisher: "USACE", published_at: "2026-03-20", retrieved_at: "2026-05-08T16:10:00Z", snippet: "Envision Environmental awarded FUDS Region 5 task order for $18.5M covering multiple Midwest FUDS sites.", relevance_reason: "Demonstrates Envision's recent relevant past performance with USACE remediation programs." },
    ],
    learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 3, coverage_gaps: ["No direct intel on AECOM's re-bid strategy", "Missing subcontractor availability data for Fort Bragg area"], next_review_at: "2026-05-20T00:00:00Z" },
  },

  "opp-004": {
    analysis: {
      executive_summary:
        "The Air Force Tyndall AFB Rebuild is a major construction opportunity ($42M) following Hurricane Michael recovery. Jacobs Engineering is the incumbent. This is Envision's highest-scoring pipeline opportunity at 91.3 with an 81% Pwin, driven by strong alignment with the company's civil engineering and environmental restoration capabilities.",
      strengths: [
        "Highest pipeline score (91.3) indicates exceptional alignment",
        "Pwin of 81% reflects strong competitive position",
        "Tyndall rebuild aligns with Envision's disaster recovery experience",
        "Largest pipeline opportunity at $42M",
      ],
      risks: [
        "Jacobs Engineering has deep embedded presence at Tyndall",
        "Construction-heavy scope may require significant subcontracting",
        "Hurricane recovery projects have complex regulatory requirements",
      ],
      competitive_landscape:
        "Jacobs Engineering is the primary competitor as incumbent. KBR and Fluor are also likely bidders given the contract scale. The rebuild program has been ongoing since 2019, giving established contractors significant institutional knowledge.",
      relevance_rationale:
        "Score of 91.3 driven by NAICS 237990 alignment, prior disaster recovery experience, DoD construction past performance, and contract value within Envision's capability range.",
      recommended_action:
        "Pursue with dedicated capture team. Tyndall is a priority pursuit given the score, value, and strategic importance of establishing Air Force construction presence.",
      confidence: 0.88,
      last_analyzed_at: "2026-05-06T11:30:00Z",
      analyst_feedback: null,
      analysis_version: "gda-analysis-v2.1",
    },
    ooda: {
      observe: {
        summary: "Key facts from SAM.gov posting and Air Force civil engineering program data.",
        items: [
          { label: "Solicitation Number", value: "FA4819-26-R-0003", source_ids: ["src-004-a"] },
          { label: "Contract Value", value: "$42M estimated", source_ids: ["src-004-a"] },
          { label: "Incumbent", value: "Jacobs Engineering — current Tyndall rebuild contractor", source_ids: ["src-004-b"] },
          { label: "NAICS", value: "237990 — Other Heavy & Civil Engineering Construction", source_ids: ["src-004-a"] },
        ],
      },
      orient: {
        summary: "High-value opportunity with strong alignment but significant incumbent barrier.",
        items: [
          { label: "Rebuild Complexity", value: "Tyndall rebuild is a multi-year, multi-billion dollar program with complex phasing", source_ids: ["src-004-b"], type: "fact" },
          { label: "Incumbent Depth", value: "Jacobs has been embedded at Tyndall since 2019 post-hurricane", source_ids: ["src-004-b"], type: "risk" },
          { label: "Environmental Overlay", value: "Environmental monitoring and compliance requirements create an entry point for Envision's core expertise", source_ids: ["src-004-a"], type: "strength" },
        ],
      },
      decide: {
        summary: "Recommended: pursue as prime with environmental differentiation strategy.",
        options: [
          { label: "Pursue as Prime — Environmental Differentiation", rationale: "Lead with environmental expertise as differentiator against construction-focused competitors. Highest margin potential.", recommended: true },
          { label: "Pursue as Sub to Construction Prime", rationale: "Team with a construction firm to handle civil engineering scope while Envision leads environmental. Lower risk, lower return.", recommended: false },
        ],
      },
      act: {
        summary: "Priority actions for Tyndall capture.",
        next_steps: [
          { action: "Assign dedicated capture manager for Tyndall pursuit", owner: "VP Business Development", due_date: "2026-05-12", priority: "high" },
          { action: "Conduct site visit to Tyndall AFB", owner: "Capture Manager", due_date: "2026-05-20", priority: "high" },
          { action: "Develop environmental differentiation strategy", owner: "Technical Director", due_date: "2026-05-18", priority: "high" },
        ],
      },
    },
    sources: [
      { id: "src-004-a", title: "SAM.gov — FA4819-26-R-0003 Tyndall AFB Civil Engineering", type: "sam_gov", url: "https://sam.gov/opp/example-004", publisher: "SAM.gov", published_at: "2026-03-28", retrieved_at: "2026-05-06T11:00:00Z", snippet: "Civil Engineering Support for Tyndall Air Force Base rebuild and restoration program.", relevance_reason: "Primary solicitation listing for the Tyndall rebuild opportunity." },
      { id: "src-004-b", title: "Tyndall AFB Rebuild Program Overview — Air Force Civil Engineer Center", type: "report", url: null, publisher: "AFCEC", published_at: "2025-12-01", retrieved_at: "2026-05-06T11:15:00Z", snippet: "The Tyndall rebuild program has invested $4.9B since Hurricane Michael. Current phase focuses on environmental restoration and infrastructure modernization.", relevance_reason: "Provides context on program scale, phasing, and incumbent contractor involvement." },
    ],
    learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 2, coverage_gaps: ["No direct pricing intelligence from previous Tyndall task orders"], next_review_at: "2026-05-15T00:00:00Z" },
  },

  "opp-010": {
    analysis: {
      executive_summary:
        "NASA Kennedy Space Center Environmental Monitoring & Compliance is a $12.8M opportunity in Envision's environmental monitoring practice. Leidos is the incumbent. The opportunity has a solid Pwin of 68% and score of 82.7, with NASA's commitment to environmental compliance creating a stable long-term revenue base.",
      strengths: [
        "Environmental monitoring is a core Envision capability",
        "NASA facilities have stringent compliance requirements favoring experienced firms",
        "Full and Open competition allows direct prime bidding",
        "KSC location in Florida aligns with Envision's Southeast presence",
      ],
      risks: [
        "Leidos has established NASA relationships and security clearances",
        "NASA procurement cycles can be lengthy and unpredictable",
        "Lower value ($12.8M) relative to other pipeline opportunities",
      ],
      competitive_landscape:
        "Leidos is the primary competitor as incumbent. Jacobs, AECOM, and Tetra Tech are also likely bidders. NASA's preference for firms with existing Kennedy Space Center access may create a barrier.",
      relevance_rationale:
        "Score of 82.7 based on NAICS 541620 alignment, environmental monitoring expertise, and Florida operational presence. Slightly lower than other pipeline opportunities due to incumbent strength.",
      recommended_action:
        "Pursue with targeted capture plan. Focus on demonstrating superior environmental monitoring technology and cost efficiency versus incumbent.",
      confidence: 0.75,
      last_analyzed_at: "2026-05-07T16:45:00Z",
      analyst_feedback: null,
      analysis_version: "gda-analysis-v2.1",
    },
    ooda: {
      observe: {
        summary: "Key facts from SAM.gov and NASA procurement history.",
        items: [
          { label: "Solicitation Number", value: "80KSC024R0015", source_ids: ["src-010-a"] },
          { label: "Contract Value", value: "$12.8M estimated", source_ids: ["src-010-a"] },
          { label: "Incumbent", value: "Leidos — current KSC environmental monitoring contractor", source_ids: ["src-010-b"] },
          { label: "Set-Aside", value: "Full and Open Competition", source_ids: ["src-010-a"] },
        ],
      },
      orient: {
        summary: "Solid opportunity with manageable incumbent risk and strong capability alignment.",
        items: [
          { label: "NASA Compliance Standards", value: "KSC has some of the most stringent environmental monitoring requirements in the federal space", source_ids: ["src-010-a"], type: "fact" },
          { label: "Incumbent Position", value: "Leidos has held the monitoring contract for 3 years with generally positive CPARs", source_ids: ["src-010-b"], type: "risk" },
          { label: "Technology Advantage", value: "Envision's real-time monitoring platform could offer performance improvements over legacy systems", source_ids: [], type: "strength" },
        ],
      },
      decide: {
        summary: "Recommended: pursue as prime with technology differentiation.",
        options: [
          { label: "Pursue as Prime", rationale: "Lead with advanced monitoring technology and cost-competitive pricing. Best path to win.", recommended: true },
          { label: "No-bid", rationale: "Lower value and strong incumbent make ROI uncertain. Not recommended given good alignment score.", recommended: false },
        ],
      },
      act: {
        summary: "Standard capture actions for NASA KSC pursuit.",
        next_steps: [
          { action: "Develop technology differentiation brief for NASA evaluation team", owner: "Technical Lead", due_date: "2026-05-20", priority: "high" },
          { action: "Request NASA KSC site access for pre-proposal research", owner: "Capture Manager", due_date: "2026-05-25", priority: "medium" },
          { action: "Prepare competitive pricing model", owner: "Pricing Team", due_date: "2026-06-01", priority: "medium" },
        ],
      },
    },
    sources: [
      { id: "src-010-a", title: "SAM.gov — 80KSC024R0015 KSC Environmental Monitoring", type: "sam_gov", url: "https://sam.gov/opp/example-010", publisher: "SAM.gov", published_at: "2026-04-01", retrieved_at: "2026-05-07T16:00:00Z", snippet: "Environmental Monitoring and Compliance Services for NASA Kennedy Space Center, FL.", relevance_reason: "Primary solicitation source for KSC environmental monitoring opportunity." },
      { id: "src-010-b", title: "Leidos NASA Environmental Services Contract Award", type: "contract_award", url: null, publisher: "FPDS.gov", published_at: "2023-06-15", retrieved_at: "2026-05-07T16:15:00Z", snippet: "Leidos awarded $11.2M contract for environmental monitoring services at Kennedy Space Center.", relevance_reason: "Identifies incumbent, prior contract value, and contract history." },
    ],
    learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 2, coverage_gaps: ["No NASA CPARS data available for incumbent evaluation"], next_review_at: "2026-05-22T00:00:00Z" },
  },
};

// ---------------------------------------------------------------------------
// Generate a generic detail seed for opportunities without specific data.
// ---------------------------------------------------------------------------
function generateGenericDetail(opp: Opportunity): DetailSeed {
  const valueFmt = opp.value_estimated
    ? `$${(opp.value_estimated / 1e6).toFixed(1)}M`
    : "undisclosed value";
  const pwinPct = opp.probability_of_win
    ? `${Math.round(opp.probability_of_win * 100)}%`
    : "unknown";

  return {
    analysis: {
      executive_summary: `${opp.title} is a ${valueFmt} opportunity with ${opp.department ?? "a federal agency"}. Current status is ${opp.status} with a score of ${opp.score} and Pwin of ${pwinPct}. ${opp.incumbent ? `${opp.incumbent} is the known incumbent.` : "No incumbent has been identified."} Further analysis is recommended to develop a comprehensive capture strategy.`,
      strengths: [
        `Score of ${opp.score} indicates ${opp.score >= 80 ? "strong" : opp.score >= 60 ? "moderate" : "developing"} alignment`,
        opp.naics ? `NAICS ${opp.naics} aligns with Envision capabilities` : "Broad capability alignment identified",
      ],
      risks: [
        opp.incumbent ? `${opp.incumbent} is the established incumbent` : "Unknown incumbent creates uncertainty",
        `${opp.status} status — additional qualification work may be needed`,
      ],
      competitive_landscape: opp.incumbent
        ? `${opp.incumbent} is the primary competitive threat as incumbent. Additional competitive intelligence is needed.`
        : "No competitive intelligence available for this opportunity.",
      relevance_rationale: `Score of ${opp.score} based on NAICS alignment, agency relationship potential, and estimated contract value.`,
      recommended_action: `Continue ${opp.status === "discovery" ? "qualification research" : "capture development"} and gather additional competitive intelligence.`,
      confidence: null,
      last_analyzed_at: opp.updated_at,
      analyst_feedback: null,
      analysis_version: "gda-analysis-v2.1",
    },
    ooda: {
      observe: {
        summary: `Key facts gathered for ${opp.title}.`,
        items: [
          { label: "Contract Value", value: valueFmt, source_ids: opp.raw_source_url ? ["src-generic-sam"] : [] },
          ...(opp.solicitation_number ? [{ label: "Solicitation", value: opp.solicitation_number, source_ids: opp.raw_source_url ? ["src-generic-sam"] : [] as string[] }] : []),
          ...(opp.incumbent ? [{ label: "Incumbent", value: opp.incumbent, source_ids: [] as string[] }] : []),
        ],
      },
      orient: {
        summary: "Initial assessment based on available data.",
        items: [
          { label: "Alignment", value: `Score ${opp.score} indicates ${opp.score >= 80 ? "strong" : "moderate"} fit`, source_ids: [] as string[], type: "inference" as const },
          ...(opp.incumbent ? [{ label: "Incumbent Risk", value: `${opp.incumbent} has established presence`, source_ids: [] as string[], type: "risk" as const }] : []),
        ],
      },
      decide: {
        summary: "Decision pending additional analysis.",
        options: [
          { label: "Continue Research", rationale: "Gather additional intelligence before committing capture resources.", recommended: true },
          { label: "No-bid", rationale: "Insufficient data to justify pursuit. Not recommended until more analysis is complete.", recommended: false },
        ],
      },
      act: {
        summary: "Standard research and qualification actions.",
        next_steps: [
          { action: "Gather additional competitive intelligence", owner: null, due_date: null, priority: "medium" as const },
          { action: "Review past performance relevance", owner: null, due_date: null, priority: "medium" as const },
        ],
      },
    },
    sources: opp.raw_source_url
      ? [
          {
            id: "src-generic-sam",
            title: `SAM.gov Listing — ${opp.solicitation_number ?? opp.id}`,
            type: "sam_gov" as const,
            url: opp.raw_source_url,
            publisher: "SAM.gov",
            published_at: opp.created_at.split("T")[0],
            retrieved_at: opp.updated_at,
            snippet: `${opp.title}. Posted on SAM.gov.`,
            relevance_reason: "Primary solicitation source for this opportunity.",
          },
        ]
      : [],
    learning: {
      learning_notes: null,
      feedback_submitted: false,
      feedback_at: null,
      source_count: opp.raw_source_url ? 1 : 0,
      coverage_gaps: ["Full competitive analysis not yet completed", "No incumbent pricing intelligence available"],
      next_review_at: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getMockOpportunityDetail(id: string): OpportunityDetailData | null {
  const opp = getMockOpportunityById(id);
  if (!opp) return null;

  const seed = detailSeeds[id] ?? generateGenericDetail(opp);

  return {
    opportunity: opp,
    analysis: seed.analysis,
    ooda: seed.ooda,
    sources: seed.sources,
    learning: seed.learning,
  };
}
