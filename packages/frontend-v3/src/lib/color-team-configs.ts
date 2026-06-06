export interface ColorTeamConfig {
  color: string;
  role: string;
  description: string;
  tools: string[];
  outputSchema: string;
}

export const COLOR_TEAM_CONFIGS: ColorTeamConfig[] = [
  {
    color: "pink",
    role: "Storyboard / Outline Reviewer",
    description:
      "Review the uploaded document for compliance matrix alignment against the RFP, " +
      "win-theme placement, ghost-competitor positioning, and structural gaps. " +
      "Check that the document outline follows Shipley best practices.",
    tools: ["rag_search", "win_theme_library", "capture_plan_lookup"],
    outputSchema: "severity, section_ref, finding, recommended_fix, citations[]",
  },
  {
    color: "red",
    role: "Draft Proposal Evaluator",
    description:
      "Score each section as a government evaluator would using Section L/M criteria. " +
      "Identify weak claims, scoring risk, evidence gaps, and unsupported assertions. " +
      "Apply the LPTA or best-value rubric as appropriate.",
    tools: ["rag_search", "cpar_lookup", "scoring_rubric"],
    outputSchema: "severity, section_ref, finding, recommended_fix, citations[]",
  },
  {
    color: "black",
    role: "Adversarial Competitor Simulator",
    description:
      "For each named competitor, project what they will bid, price, themes, attack " +
      "angles, and discriminator counters. Use GovWin, GovTribe, and USAspending data " +
      "to ground competitor intelligence.",
    tools: ["govwin_search", "govtribe_search", "usaspending_search", "rag_search"],
    outputSchema: "severity, section_ref, finding, recommended_fix, citations[]",
  },
  {
    color: "blue",
    role: "Customer Perspective Reviewer",
    description:
      "Read the document as the CO / COR / PM would. Assess whether pain points are " +
      "addressed, risk tolerance matched, and past-performance relevance established " +
      "for this specific customer.",
    tools: ["rag_search", "agency_history", "cpar_lookup"],
    outputSchema: "severity, section_ref, finding, recommended_fix, citations[]",
  },
  {
    color: "white",
    role: "Compliance Sweep Reviewer",
    description:
      "Perform a Section L/M crosswalk, verify FAR clause compliance, check page/font/" +
      "format limits, and confirm all mandatory submittals are present.",
    tools: ["rag_search", "far_ref_store"],
    outputSchema: "severity, section_ref, finding, recommended_fix, citations[]",
  },
  {
    color: "green",
    role: "Executive / Final Pass Reviewer",
    description:
      "Pricing review (labor mix, margin vs. competitor history, USAspending pricing " +
      "data, FFP risk). Enforce 8% margin floor. Run exclusion check. Generate full " +
      "doctrine alignment scorecard using the 8 GDA doctrine principles. " +
      "Produce signature-ready verdict. Green absorbs what would have been Gold.",
    tools: ["doctrine_check", "pricing_lookup", "usaspending_search", "rag_search", "exclusion_check"],
    outputSchema:
      "severity, section_ref, finding, recommended_fix, citations[], " +
      "doctrine_score[], exclusion_hits[], margin_check{}",
  },
];

export function colorBadgeClasses(color: string): string {
  switch (color) {
    case "pink":
      return "border-pink-400/30 bg-pink-400/10 text-pink-400";
    case "red":
      return "border-gda-red/30 bg-gda-red/10 text-gda-red";
    case "black":
      return "border-zinc-400/30 bg-zinc-400/10 text-zinc-400";
    case "blue":
      return "border-blue-400/30 bg-blue-400/10 text-blue-400";
    case "white":
      return "border-gray-300/30 bg-gray-300/10 text-gray-300";
    case "green":
      return "border-gda-green/30 bg-gda-green/10 text-gda-green";
    default:
      return "border-border bg-gda-panel text-muted-foreground";
  }
}
