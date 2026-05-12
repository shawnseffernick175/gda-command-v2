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
        "Army PEO IEW&S SETA Support for Next-Gen ISR Systems represents a strong opportunity ($28.5M) directly aligned with Envision's C4ISR SETA core practice. Booz Allen Hamilton is the likely incumbent. Envision has extensive past performance under PEO IEW&S and a presence at APG that provides a competitive edge.",
      strengths: [
        "Direct alignment with Envision's Army C4ISR and SETA core capability",
        "Existing PEO IEW&S customer relationships and APG presence",
        "NAICS 541512 is a primary Envision code with strong past performance",
        "Score of 88.5 indicates strong quantitative alignment",
      ],
      risks: [
        "Booz Allen Hamilton is the incumbent with deep ISR domain expertise",
        "Full and Open competition increases field size",
        "Next-gen ISR may require specialized clearances and niche technical SMEs",
      ],
      competitive_landscape:
        "Booz Allen Hamilton is the primary competitive threat as incumbent. Other likely bidders include CACI, Leidos, and L3Harris given C4ISR focus. Envision's APG presence and PEO IEW&S past performance are key differentiators.",
      relevance_rationale:
        "This opportunity scores 88.5 due to direct NAICS 541512 alignment, existing PEO IEW&S relationship, APG location, and contract value within Envision's sweet spot.",
      recommended_action:
        "Begin qualification research. Identify ISR-specific SMEs, review Envision's PEO IEW&S past performance citations, and assess teaming strategy.",
      confidence: 0.78,
      last_analyzed_at: "2026-05-10T16:20:00Z",
      analyst_feedback: null,
      analysis_version: "gda-analysis-v2.1",
    },
    ooda: {
      observe: {
        summary:
          "Key facts gathered from GovWin intelligence, PEO IEW&S procurement history, and incumbent contract data.",
        items: [
          { label: "Contract Value", value: "$28.5M estimated", source_ids: ["src-001-a"] },
          { label: "Incumbent", value: "Booz Allen Hamilton — current ISR SETA provider", source_ids: ["src-001-b"] },
          { label: "Set-Aside", value: "Full and Open Competition", source_ids: ["src-001-a"] },
          { label: "NAICS", value: "541512 — Computer Systems Design Services", source_ids: ["src-001-a"] },
          { label: "Location", value: "Aberdeen Proving Ground, MD", source_ids: ["src-001-a"] },
        ],
      },
      orient: {
        summary:
          "Envision is well-positioned with APG presence and PEO IEW&S experience, but faces strong incumbent.",
        items: [
          { label: "Incumbent Advantage", value: "BAH has deep ISR domain knowledge and existing cleared staff", source_ids: ["src-001-b"], type: "risk" },
          { label: "Past Performance Match", value: "Envision's PEO IEW&S SETA work demonstrates directly relevant experience", source_ids: ["src-001-c"], type: "strength" },
          { label: "APG Presence", value: "Envision has an established office at Aberdeen Proving Ground", source_ids: [], type: "strength" },
          { label: "Competition", value: "Full and Open means price and technical volume equally weighted", source_ids: ["src-001-a"], type: "inference" },
        ],
      },
      decide: {
        summary: "Three strategic options evaluated. Pursue as prime recommended.",
        options: [
          { label: "Pursue as Prime", rationale: "Leverage APG presence and PEO IEW&S past performance to compete directly. Strong alignment justifies investment.", recommended: true },
          { label: "Team with Large Prime", rationale: "Partner with L3Harris or similar to strengthen ISR technical depth. Reduces risk but limits fee.", recommended: false },
          { label: "No-bid", rationale: "Strong incumbent may be difficult to unseat. Not recommended given high score and direct alignment.", recommended: false },
        ],
      },
      act: {
        summary: "Immediate actions to begin qualification research.",
        next_steps: [
          { action: "Research PEO IEW&S procurement timeline and requirements", owner: "BD Lead", due_date: "2026-05-20", priority: "high" },
          { action: "Identify cleared ISR SMEs for proposal team", owner: "Technical Director", due_date: "2026-05-25", priority: "high" },
          { action: "Review Envision past performance citations for relevance", owner: "Capture Manager", due_date: "2026-05-22", priority: "medium" },
          { action: "Assess teaming partners for ISR niche capabilities", owner: "BD Lead", due_date: "2026-06-01", priority: "medium" },
        ],
      },
    },
    sources: [
      { id: "src-001-a", title: "GovWin IQ — PEO IEW&S SETA Opportunity Profile", type: "govwin", url: null, publisher: "GovWin IQ", published_at: "2026-04-28", retrieved_at: "2026-05-10T16:00:00Z", snippet: "PEO IEW&S seeking SETA support for next-generation ISR systems development and integration at Aberdeen Proving Ground.", relevance_reason: "Primary intelligence source for this opportunity." },
      { id: "src-001-b", title: "FPDS — BAH PEO IEW&S SETA Contract History", type: "contract_award", url: null, publisher: "FPDS.gov", published_at: "2024-03-15", retrieved_at: "2026-05-10T16:15:00Z", snippet: "Booz Allen Hamilton awarded $24.8M SETA contract under PEO IEW&S for ISR systems support.", relevance_reason: "Identifies incumbent, prior contract value, and history." },
      { id: "src-001-c", title: "Envision PEO IEW&S Past Performance", type: "internal", url: null, publisher: "Envision BD Database", published_at: "2025-12-01", retrieved_at: "2026-05-10T16:20:00Z", snippet: "Envision has supported PEO IEW&S under PM IS&A with SETA services since 2018.", relevance_reason: "Demonstrates directly relevant past performance." },
    ],
    learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 3, coverage_gaps: ["No draft RFP or SOW available yet"], next_review_at: "2026-05-25T00:00:00Z" },
  },
  "opp-004": {
    analysis: {
      executive_summary:
        "PEO C3T Mission Command Software Engineering represents Envision's highest-priority recompete ($35M). As the incumbent, Envision has deep Mission Command knowledge, established customer relationships, and proven delivery. Maintaining this contract is critical to Envision's Army C3T practice.",
      strengths: [
        "Envision is the incumbent with proven delivery track record",
        "Deep institutional knowledge of Mission Command systems",
        "Established team of cleared engineers at APG",
        "Score of 91.0 — highest in current pipeline",
      ],
      risks: [
        "Recompete may attract aggressive pricing from competitors",
        "Government may restructure requirements in follow-on",
        "Competitor teaming could combine capabilities to challenge Envision",
      ],
      competitive_landscape:
        "As a recompete, primary threats include CACI, Leidos, and Perspecta who have Mission Command adjacent experience. Envision's incumbency and past performance provide significant competitive advantage.",
      relevance_rationale:
        "Score of 91.0 reflects incumbent status, direct NAICS alignment (541511), established APG presence, and critical revenue significance.",
      recommended_action:
        "Treat as must-win. Begin early capture planning, engage customer for feedback on current performance, and prepare competitive pricing strategy.",
      confidence: 0.88,
      last_analyzed_at: "2026-05-08T11:30:00Z",
      analyst_feedback: null,
      analysis_version: "gda-analysis-v2.1",
    },
    ooda: {
      observe: {
        summary:
          "Key facts gathered from SAM.gov pre-solicitation notice and internal contract records.",
        items: [
          { label: "Contract Value", value: "$35M estimated (recompete)", source_ids: ["src-004-a"] },
          { label: "Incumbent", value: "Envision Innovative Solutions (current contractor)", source_ids: ["src-004-b"] },
          { label: "Set-Aside", value: "Full and Open Competition", source_ids: ["src-004-a"] },
          { label: "NAICS", value: "541511 — Custom Computer Programming", source_ids: ["src-004-a"] },
          { label: "Current Period", value: "Option Year 3 — ends Q4 FY26", source_ids: ["src-004-b"] },
        ],
      },
      orient: {
        summary:
          "Strong incumbent position with excellent CPARS ratings. Key risk is competitor underbidding.",
        items: [
          { label: "Incumbent Strength", value: "Envision has Exceptional CPARS ratings on current contract", source_ids: ["src-004-b"], type: "strength" },
          { label: "Team Continuity", value: "95% of current team expected to continue under recompete", source_ids: [], type: "strength" },
          { label: "Pricing Pressure", value: "Competitors may undercut on price to unseat incumbent", source_ids: [], type: "risk" },
          { label: "Requirements Shift", value: "Government may restructure into smaller task orders", source_ids: ["src-004-a"], type: "inference" },
        ],
      },
      decide: {
        summary: "Must-win recompete. Full capture investment recommended.",
        options: [
          { label: "Full Capture Investment", rationale: "Leverage incumbency, CPARS, and team continuity. Invest in sharpened pricing and enhanced technical approach.", recommended: true },
          { label: "Strategic Teaming", rationale: "Bring in a teaming partner to strengthen specific capability gaps. Could strengthen proposal but adds complexity.", recommended: false },
          { label: "No-bid", rationale: "Not recommended — this is a must-win recompete with critical revenue implications.", recommended: false },
        ],
      },
      act: {
        summary: "Early capture actions for must-win recompete.",
        next_steps: [
          { action: "Schedule customer feedback session with PEO C3T PM", owner: "Program Manager", due_date: "2026-05-18", priority: "high" },
          { action: "Begin competitive price-to-win analysis", owner: "Pricing Team", due_date: "2026-05-25", priority: "high" },
          { action: "Document past performance citations and CPARS", owner: "Capture Manager", due_date: "2026-05-20", priority: "high" },
          { action: "Assess and lock key personnel commitments", owner: "HR / Program Manager", due_date: "2026-06-01", priority: "medium" },
        ],
      },
    },
    sources: [
      { id: "src-004-a", title: "SAM.gov — PEO C3T Mission Command Sources Sought", type: "sam_gov", url: "https://sam.gov/opp/example-004", publisher: "SAM.gov", published_at: "2026-04-15", retrieved_at: "2026-05-08T11:00:00Z", snippet: "Sources Sought for Mission Command Software Engineering Services at Aberdeen Proving Ground, MD.", relevance_reason: "Primary solicitation source for recompete opportunity." },
      { id: "src-004-b", title: "Envision Current PEO C3T Contract Records", type: "internal", url: null, publisher: "Envision Contracts Database", published_at: "2026-01-15", retrieved_at: "2026-05-08T11:15:00Z", snippet: "Envision holds current Mission Command software engineering contract, Option Year 3 performance with Exceptional CPARS.", relevance_reason: "Documents incumbent status and performance history." },
    ],
    learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 2, coverage_gaps: ["Draft SOW not yet released"], next_review_at: "2026-05-22T00:00:00Z" },
  },
  "opp-006": {
    analysis: {
      executive_summary:
        "Air Force Hanscom Enterprise IT Network Modernization is a large ($42M) opportunity aligned with Envision's enterprise IT and network engineering capabilities. SAIC is the incumbent. Envision has existing Hanscom AFB work that provides customer access, but the contract size and SAIC's incumbency present challenges.",
      strengths: [
        "Existing Hanscom AFB customer relationships",
        "NAICS 541512 alignment with enterprise IT core capability",
        "Envision's CMMI ML3 and ISO 9001:2015 certifications add credibility",
        "Network modernization aligns with Envision's infrastructure practice",
      ],
      risks: [
        "SAIC is a large, well-resourced incumbent",
        "$42M value is above Envision's typical contract range",
        "Air Force may favor large business prime for risk mitigation",
      ],
      competitive_landscape:
        "SAIC has strong incumbency with dedicated Hanscom team. Other likely bidders include Leidos, Peraton, and ManTech. Envision could compete as prime or pursue subcontract role for specific modernization scope.",
      relevance_rationale:
        "Score of 85.2 reflects Hanscom AFB presence, NAICS alignment, and network modernization capability match.",
      recommended_action:
        "Assess feasibility of prime vs. subcontractor role. Begin customer engagement to understand modernization priorities and timeline.",
      confidence: 0.65,
      last_analyzed_at: "2026-05-09T08:20:00Z",
      analyst_feedback: null,
      analysis_version: "gda-analysis-v2.1",
    },
    ooda: {
      observe: {
        summary: "Intelligence gathered from GovWin and Air Force procurement forecasts.",
        items: [
          { label: "Contract Value", value: "$42M estimated", source_ids: ["src-006-a"] },
          { label: "Incumbent", value: "SAIC — current enterprise IT provider", source_ids: ["src-006-b"] },
          { label: "Set-Aside", value: "Full and Open Competition", source_ids: ["src-006-a"] },
          { label: "Scope", value: "Network modernization including cloud migration and zero trust", source_ids: ["src-006-a"] },
        ],
      },
      orient: {
        summary: "Envision has relevant capabilities but faces a formidable incumbent in SAIC.",
        items: [
          { label: "Incumbent Scale", value: "SAIC has 200+ personnel on current Hanscom IT contract", source_ids: ["src-006-b"], type: "risk" },
          { label: "Hanscom Presence", value: "Envision has existing work at Hanscom providing customer access", source_ids: [], type: "strength" },
          { label: "Modernization Focus", value: "Zero trust and cloud migration align with Envision capabilities", source_ids: ["src-006-a"], type: "strength" },
        ],
      },
      decide: {
        summary: "Decision pending — prime vs. subcontractor strategy to be determined.",
        options: [
          { label: "Pursue as Prime", rationale: "Leverage Hanscom presence and modernization expertise. High risk given SAIC incumbency but highest potential return.", recommended: false },
          { label: "Pursue as Subcontractor", rationale: "Target specific modernization scope under alternative prime. Lower risk with guaranteed work share.", recommended: true },
          { label: "No-bid", rationale: "SAIC incumbency and contract size may exceed Envision risk tolerance.", recommended: false },
        ],
      },
      act: {
        summary: "Research and customer engagement actions.",
        next_steps: [
          { action: "Meet with Hanscom AFB customer to understand priorities", owner: "BD Lead", due_date: "2026-05-25", priority: "high" },
          { action: "Evaluate prime vs. sub strategy with leadership", owner: "VP of BD", due_date: "2026-06-01", priority: "high" },
          { action: "Identify potential prime teaming partners", owner: "BD Lead", due_date: "2026-06-05", priority: "medium" },
        ],
      },
    },
    sources: [
      { id: "src-006-a", title: "GovWin IQ — Hanscom Enterprise IT Modernization Profile", type: "govwin", url: null, publisher: "GovWin IQ", published_at: "2026-04-20", retrieved_at: "2026-05-09T08:00:00Z", snippet: "Air Force LCMC seeking enterprise IT modernization including zero trust architecture and cloud migration at Hanscom AFB.", relevance_reason: "Primary intelligence source for Hanscom IT opportunity." },
      { id: "src-006-b", title: "FPDS — SAIC Hanscom IT Contract Award", type: "contract_award", url: null, publisher: "FPDS.gov", published_at: "2023-09-01", retrieved_at: "2026-05-09T08:10:00Z", snippet: "SAIC awarded $38.5M enterprise IT support contract at Hanscom AFB.", relevance_reason: "Identifies incumbent and prior contract baseline." },
    ],
    learning: { learning_notes: null, feedback_submitted: false, feedback_at: null, source_count: 2, coverage_gaps: ["No RFI or draft SOW released yet", "SAIC staffing details unavailable"], next_review_at: "2026-06-01T00:00:00Z" },
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
      executive_summary: `${opp.title} is a ${valueFmt} opportunity with ${opp.department ?? "a federal agency"}. Current stage is Interest with a score of ${opp.score} and Pwin of ${pwinPct}. ${opp.incumbent ? `${opp.incumbent} is the known incumbent.` : "No incumbent has been identified."} Further analysis is recommended to develop a comprehensive capture strategy.`,
      strengths: [
        `Score of ${opp.score} indicates ${opp.score >= 80 ? "strong" : opp.score >= 60 ? "moderate" : "developing"} alignment`,
        opp.naics ? `NAICS ${opp.naics} aligns with Envision capabilities` : "Broad capability alignment identified",
      ],
      risks: [
        opp.incumbent ? `${opp.incumbent} is the established incumbent` : "Unknown incumbent creates uncertainty",
        "Interest stage — additional qualification research needed before committing capture resources",
      ],
      competitive_landscape: opp.incumbent
        ? `${opp.incumbent} is the primary competitive threat as incumbent. Additional competitive intelligence is needed.`
        : "No competitive intelligence available for this opportunity.",
      relevance_rationale: `Score of ${opp.score} based on NAICS alignment, agency relationship potential, and estimated contract value.`,
      recommended_action: "Continue qualification research and gather additional competitive intelligence before advancing to Qualify stage.",
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
