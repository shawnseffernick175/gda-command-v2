/* ------------------------------------------------------------------ *
 *  Mock prompt data for the Prompt Architect module.                  *
 *  Represents a versioned, tagged prompt library used across          *
 *  capture, compliance, proposal, research, and analysis workflows.   *
 * ------------------------------------------------------------------ */

export interface PromptVersion {
  version: number;
  body: string;
  changedBy: string;
  changedAt: string;
  changeNote: string;
}

export interface PromptUsage {
  id: string;
  promptId: string;
  usedBy: string;
  usedAt: string;
  context: string;
  outcome: "success" | "partial" | "failed" | null;
  notes: string | null;
}

export interface Prompt {
  id: string;
  title: string;
  category: "capture" | "compliance" | "proposal" | "research" | "analysis" | "general";
  description: string;
  body: string;
  tags: string[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt: string | null;
  starred: boolean;
  status: "active" | "draft" | "archived";
}

const NOW = "2025-05-09T14:30:00Z";

export const MOCK_PROMPTS: Prompt[] = [
  {
    id: "prompt-001",
    title: "Capture Plan First Draft",
    category: "capture",
    description: "Generates a structured first-draft capture plan from an opportunity summary, past performance, and teaming strategy.",
    body: `You are a senior BD capture manager for a mid-tier defense contractor. Given the following opportunity summary, generate a structured capture plan.

## Inputs
- Opportunity Title: {{title}}
- Agency: {{agency}}
- Estimated Value: {{value}}
- NAICS: {{naics}}
- Solicitation Number: {{solicitation}}
- Key Requirements: {{requirements}}

## Output Structure
1. **Executive Summary** — 2-3 sentence overview of the opportunity and our approach
2. **Win Themes** — 3-5 differentiators that position us to win
3. **Teaming Strategy** — Recommended partners and their roles
4. **Discriminators** — What separates us from competitors
5. **Risks & Mitigations** — Top 3 risks with mitigation plans
6. **Key Milestones** — Timeline from RFI through proposal submission
7. **Competitive Assessment** — Known competitors and their strengths/weaknesses

Keep language precise and specific to government contracting. Reference FAR/DFARS where applicable.`,
    tags: ["capture", "first-draft", "automated", "bd"],
    version: 3,
    createdBy: "Shawn",
    createdAt: "2025-02-15T09:00:00Z",
    updatedAt: "2025-04-20T11:30:00Z",
    usageCount: 24,
    lastUsedAt: "2025-05-08T16:45:00Z",
    starred: true,
    status: "active",
  },
  {
    id: "prompt-002",
    title: "Compliance Matrix Analyzer",
    category: "compliance",
    description: "Parses a solicitation document and extracts compliance requirements into a structured matrix with cross-references.",
    body: `Analyze the following solicitation excerpt and produce a compliance matrix.

## Instructions
1. Identify every SHALL/MUST requirement
2. Categorize each as: Technical, Management, Past Performance, Cost/Price, or Administrative
3. Assign a compliance difficulty: Easy, Moderate, Complex
4. Suggest the proposal section where each requirement should be addressed
5. Flag any requirements that conflict with each other

## Input
{{solicitation_text}}

## Output Format
| # | Requirement | Category | Difficulty | Proposal Section | Notes |
|---|---|---|---|---|---|

After the matrix, provide:
- Total requirements count by category
- Complexity distribution
- Any flagged conflicts or ambiguities`,
    tags: ["compliance", "solicitation", "matrix", "parsing"],
    version: 2,
    createdBy: "Shawn",
    createdAt: "2025-03-01T10:00:00Z",
    updatedAt: "2025-04-15T14:00:00Z",
    usageCount: 18,
    lastUsedAt: "2025-05-07T09:30:00Z",
    starred: true,
    status: "active",
  },
  {
    id: "prompt-003",
    title: "Proposal Executive Summary Writer",
    category: "proposal",
    description: "Writes a compelling executive summary for a government proposal, incorporating win themes, past performance, and value proposition.",
    body: `Write a proposal executive summary for a government contract response.

## Context
- Company: {{company_name}}
- Opportunity: {{opportunity_title}}
- Agency: {{agency}}
- Contract Type: {{contract_type}}
- Our Win Themes: {{win_themes}}
- Key Past Performance: {{past_performance}}

## Guidelines
- Lead with the agency's mission, not our capabilities
- Connect each win theme to a specific agency pain point
- Reference past performance with specific metrics (cost savings %, schedule adherence, etc.)
- Keep under 500 words
- Use active voice, avoid jargon
- End with a forward-looking commitment statement

## Tone
Professional but confident. Show understanding of the agency's challenges before presenting our solution. Demonstrate domain expertise through specificity, not superlatives.`,
    tags: ["proposal", "executive-summary", "writing", "bd"],
    version: 4,
    createdBy: "Shawn",
    createdAt: "2025-01-20T08:00:00Z",
    updatedAt: "2025-05-01T10:15:00Z",
    usageCount: 31,
    lastUsedAt: "2025-05-09T11:00:00Z",
    starred: true,
    status: "active",
  },
  {
    id: "prompt-004",
    title: "Competitor Intelligence Brief",
    category: "research",
    description: "Generates a structured competitive intelligence brief for a specific competitor based on available data points.",
    body: `Generate a competitive intelligence brief for the following competitor.

## Target Competitor
- Company: {{competitor_name}}
- Focus Area: {{focus_area}}
- Recent Award(s): {{recent_awards}}

## Required Sections
1. **Company Overview** — Size, HQ, key leadership, NAICS codes, set-aside status
2. **Capabilities Assessment** — Core competencies, certifications, clearances
3. **Win/Loss Pattern** — What types of work they win, where they lose
4. **Pricing Strategy** — Known pricing approach (LPTA, best value, etc.)
5. **Teaming Relationships** — Known partners and JV arrangements
6. **Vulnerability Analysis** — Where they're weakest, where we can differentiate
7. **Recommended Counter-Strategy** — How to position against them

Base analysis on publicly available information (USAspending, SAM.gov, FPDS, press releases).`,
    tags: ["research", "competitor", "intelligence", "analysis"],
    version: 2,
    createdBy: "Shawn",
    createdAt: "2025-02-28T13:00:00Z",
    updatedAt: "2025-04-10T09:45:00Z",
    usageCount: 12,
    lastUsedAt: "2025-05-05T14:20:00Z",
    starred: false,
    status: "active",
  },
  {
    id: "prompt-005",
    title: "OODA Loop Analysis",
    category: "analysis",
    description: "Applies OODA loop (Observe-Orient-Decide-Act) framework to a business development opportunity for strategic analysis.",
    body: `Apply the OODA Loop framework to analyze the following opportunity.

## Opportunity
- Title: {{title}}
- Agency: {{agency}}
- Value: {{value}}
- Current Status: {{status}}
- Known Competitors: {{competitors}}

## OODA Framework

### OBSERVE
What do we know? List all available facts, signals, and data points about this opportunity. Include market context, agency budget trends, and procurement history.

### ORIENT
What does it mean? Synthesize observations into strategic context. How does this opportunity fit our portfolio? What's the competitive landscape? What are the implicit evaluation criteria beyond the written RFP?

### DECIDE
What should we do? Based on orientation, recommend a specific course of action. Include bid/no-bid recommendation with rationale, teaming strategy, and positioning approach.

### ACT
What are the immediate next steps? Provide 5-7 specific, time-bound action items with owners and deadlines.

Be specific and actionable. Avoid generic statements.`,
    tags: ["analysis", "ooda", "strategy", "decision-framework"],
    version: 1,
    createdBy: "Shawn",
    createdAt: "2025-04-01T11:00:00Z",
    updatedAt: "2025-04-01T11:00:00Z",
    usageCount: 8,
    lastUsedAt: "2025-05-03T10:00:00Z",
    starred: false,
    status: "active",
  },
  {
    id: "prompt-006",
    title: "Past Performance Write-Up",
    category: "proposal",
    description: "Structures a past performance citation for a government proposal, emphasizing relevance and measurable outcomes.",
    body: `Write a past performance citation for a government proposal.

## Contract Details
- Contract Name: {{contract_name}}
- Contract Number: {{contract_number}}
- Agency: {{agency}}
- Period of Performance: {{pop}}
- Contract Value: {{value}}
- Contract Type: {{type}}

## Performance Data
- Key Deliverables: {{deliverables}}
- Measurable Outcomes: {{outcomes}}
- Challenges Overcome: {{challenges}}

## Requirements
1. Start with contract relevance to the current opportunity
2. Describe scope and complexity in concrete terms
3. Highlight measurable results (%, $, time saved, etc.)
4. Include at least one challenge-and-resolution narrative
5. Reference CPARS rating if available
6. Keep under 300 words
7. Match the proposal's evaluation criteria language`,
    tags: ["proposal", "past-performance", "writing"],
    version: 2,
    createdBy: "Shawn",
    createdAt: "2025-03-10T09:30:00Z",
    updatedAt: "2025-04-25T16:00:00Z",
    usageCount: 15,
    lastUsedAt: "2025-05-06T13:15:00Z",
    starred: false,
    status: "active",
  },
  {
    id: "prompt-007",
    title: "Red Team Review Checklist",
    category: "proposal",
    description: "Generates a structured red team review for a proposal section, identifying weaknesses and recommending improvements.",
    body: `Conduct a red team review of the following proposal section.

## Evaluation Criteria
- Solicitation Section: {{section_reference}}
- Evaluation Factor: {{eval_factor}}
- Rating Scale: {{rating_scale}}

## Proposal Section
{{proposal_text}}

## Review Instructions
1. **Compliance Check** — Does this section address every requirement in the solicitation? List any gaps.
2. **Strength Assessment** — Identify specific strengths that would earn discriminating credit. Quote the exact language.
3. **Weakness Assessment** — Identify weaknesses, deficiencies, and risks. For each, explain why an evaluator would score it down.
4. **Competitor Lens** — How would a competitor's proposal likely differ in this area?
5. **Specific Recommendations** — For each weakness, provide a concrete rewrite suggestion.
6. **Overall Rating** — Rate this section: Outstanding / Good / Acceptable / Marginal / Unacceptable

Be direct. The goal is to find problems before the government does.`,
    tags: ["proposal", "red-team", "review", "quality"],
    version: 3,
    createdBy: "Shawn",
    createdAt: "2025-01-15T14:00:00Z",
    updatedAt: "2025-05-02T08:30:00Z",
    usageCount: 22,
    lastUsedAt: "2025-05-08T09:45:00Z",
    starred: true,
    status: "active",
  },
  {
    id: "prompt-008",
    title: "SAM.gov Opportunity Screener",
    category: "research",
    description: "Evaluates a SAM.gov opportunity against company capabilities and go/no-go criteria for initial screening.",
    body: `Screen the following SAM.gov opportunity for fit with our capabilities.

## Opportunity Data
- Notice ID: {{notice_id}}
- Title: {{title}}
- Agency: {{agency}}
- NAICS: {{naics}}
- Set-Aside: {{set_aside}}
- Place of Performance: {{pop_location}}
- Response Date: {{response_date}}
- Description: {{description}}

## Our Profile
- NAICS Codes: 541330, 541620, 562910, 541380
- Set-Aside Status: Small Business, SDVOSB
- Core Capabilities: Defense IT systems engineering, cyber IA services, cybersecurity operations, compliance consulting
- Geographic Presence: CONUS-wide, strong in Southeast and Mid-Atlantic

## Screening Criteria
1. **NAICS Match** — Do our codes align?
2. **Set-Aside Eligibility** — Can we compete?
3. **Capability Fit** — Score 1-10 on technical alignment
4. **Geographic Fit** — Do we have presence near POP?
5. **Timeline Feasibility** — Can we respond in time?
6. **Competitive Advantage** — Do we have a differentiated position?
7. **Strategic Value** — Does this advance our market position?

## Output
- GO / NO-GO / WATCH recommendation
- Overall fit score (1-100)
- Top 3 reasons for the recommendation
- If GO: immediate next steps`,
    tags: ["research", "screening", "sam-gov", "go-no-go"],
    version: 1,
    createdBy: "Shawn",
    createdAt: "2025-04-15T10:00:00Z",
    updatedAt: "2025-04-15T10:00:00Z",
    usageCount: 6,
    lastUsedAt: "2025-05-04T11:30:00Z",
    starred: false,
    status: "active",
  },
  {
    id: "prompt-009",
    title: "Doctrine Sprint Summary",
    category: "general",
    description: "Generates a sprint summary document for doctrine publication from completed work items and decisions.",
    body: `Generate a sprint doctrine summary for the following completed sprint.

## Sprint Info
- Sprint: {{sprint_id}}
- Dates: {{start_date}} to {{end_date}}
- Team: {{team}}

## Completed Items
{{completed_items}}

## Decisions Made
{{decisions}}

## Output Requirements
1. **Sprint Overview** — 2-3 sentence summary of what was accomplished
2. **Key Deliverables** — Bulleted list of what shipped
3. **Architecture Decisions** — Any significant technical choices and rationale
4. **Known Issues** — Outstanding bugs or tech debt created
5. **Metrics** — Velocity, story points completed, any quality metrics
6. **Doctrine Updates** — What should be updated in the Book of Truths based on this sprint
7. **Next Sprint Implications** — What this sprint means for the next one

Write for a technical audience that will reference this document months later.`,
    tags: ["doctrine", "sprint", "summary", "documentation"],
    version: 1,
    createdBy: "Shawn",
    createdAt: "2025-04-20T09:00:00Z",
    updatedAt: "2025-04-20T09:00:00Z",
    usageCount: 4,
    lastUsedAt: "2025-05-01T15:00:00Z",
    starred: false,
    status: "active",
  },
  {
    id: "prompt-010",
    title: "Email Drafter — Agency Follow-Up",
    category: "general",
    description: "Drafts a professional follow-up email to a government agency contact regarding an opportunity or ongoing engagement.",
    body: `Draft a professional follow-up email to a government agency contact.

## Context
- Recipient: {{recipient_name}}, {{recipient_title}}
- Agency: {{agency}}
- Regarding: {{subject}}
- Previous Interaction: {{last_interaction}}
- Our Objective: {{objective}}

## Constraints
- Government-appropriate tone (professional, respectful of procurement rules)
- No proprietary or competitive information
- Reference specific dates and previous conversations
- Clear ask or next step
- Keep under 200 words
- Do NOT discuss pricing, evaluation criteria, or procurement-sensitive information unless in response to a formal RFI

## Format
Subject: [concise subject line]
Body: [email text]
Suggested follow-up date: [when to follow up if no response]`,
    tags: ["general", "email", "follow-up", "communication"],
    version: 2,
    createdBy: "Shawn",
    createdAt: "2025-03-05T11:00:00Z",
    updatedAt: "2025-04-18T14:30:00Z",
    usageCount: 19,
    lastUsedAt: "2025-05-09T08:15:00Z",
    starred: false,
    status: "active",
  },
  {
    id: "prompt-011",
    title: "Technical Volume Section Writer",
    category: "proposal",
    description: "Writes a technical volume section following government proposal conventions with features-benefits-proofs structure.",
    body: `Write a technical volume section for a government proposal.

## Section Requirements
- Section: {{section_title}}
- Evaluation Factor: {{eval_factor}}
- Page Limit: {{page_limit}}
- Key Requirements from SOW: {{requirements}}

## Company Capabilities
- Relevant Experience: {{experience}}
- Technical Approach: {{approach}}
- Key Personnel: {{key_personnel}}

## Writing Guidelines
1. Use Feature-Benefit-Proof structure for each capability claim
2. Every claim must have a supporting proof point (past performance, certification, metric)
3. Mirror the solicitation language — use their terms, not ours
4. Include a compliance matrix reference for each requirement addressed
5. Bold key terms and discriminators
6. Use action headers that state the benefit, not just the topic
7. Include callout boxes for key metrics and differentiators
8. End each major section with a "So What?" summary connecting back to mission impact`,
    tags: ["proposal", "technical-volume", "writing", "structure"],
    version: 2,
    createdBy: "Shawn",
    createdAt: "2025-02-01T10:00:00Z",
    updatedAt: "2025-04-28T16:00:00Z",
    usageCount: 14,
    lastUsedAt: "2025-05-07T14:00:00Z",
    starred: false,
    status: "draft",
  },
  {
    id: "prompt-012",
    title: "Teaming Partner Assessment",
    category: "capture",
    description: "Evaluates a potential teaming partner for a specific opportunity, assessing capabilities, risks, and strategic fit.",
    body: `Evaluate the following company as a potential teaming partner.

## Partner Candidate
- Company: {{partner_name}}
- Size: {{size_standard}}
- NAICS Codes: {{naics}}
- Capabilities: {{capabilities}}
- Past Work Together: {{history}}

## Opportunity Context
- Target Opportunity: {{opportunity}}
- Our Role: {{our_role}} (Prime / Sub)
- Their Proposed Role: {{their_role}}
- Gap They Fill: {{gap}}

## Assessment Areas
1. **Capability Fit** (1-10) — Do they bring what we need?
2. **Past Performance** (1-10) — Track record on similar work
3. **Reliability** (1-10) — History of delivering on commitments
4. **Competitive Impact** (1-10) — Do they strengthen our position?
5. **Risk Profile** (1-10) — Financial stability, OCI concerns, security clearances
6. **Cultural Fit** (1-10) — Work style compatibility

## Output
- Overall recommendation: PURSUE / CONSIDER / PASS
- Composite score (average of 6 areas)
- Top 3 strengths as a partner
- Top 3 risks/concerns
- Recommended teaming agreement terms`,
    tags: ["capture", "teaming", "partner-assessment", "evaluation"],
    version: 1,
    createdBy: "Shawn",
    createdAt: "2025-04-05T10:00:00Z",
    updatedAt: "2025-04-05T10:00:00Z",
    usageCount: 7,
    lastUsedAt: "2025-05-02T11:30:00Z",
    starred: false,
    status: "active",
  },
];

const MOCK_VERSION_HISTORY: Record<string, PromptVersion[]> = {
  "prompt-001": [
    {
      version: 3,
      body: MOCK_PROMPTS[0].body,
      changedBy: "Shawn",
      changedAt: "2025-04-20T11:30:00Z",
      changeNote: "Added FAR/DFARS reference guidance and competitive assessment section",
    },
    {
      version: 2,
      body: "... (previous version with 5 sections instead of 7)",
      changedBy: "Shawn",
      changedAt: "2025-03-15T14:00:00Z",
      changeNote: "Added teaming strategy and discriminators sections",
    },
    {
      version: 1,
      body: "... (initial version with basic structure)",
      changedBy: "Shawn",
      changedAt: "2025-02-15T09:00:00Z",
      changeNote: "Initial capture plan prompt",
    },
  ],
  "prompt-003": [
    {
      version: 4,
      body: MOCK_PROMPTS[2].body,
      changedBy: "Shawn",
      changedAt: "2025-05-01T10:15:00Z",
      changeNote: "Refined tone guidance — added 'show understanding before presenting solution'",
    },
    {
      version: 3,
      body: "... (v3 with 400-word limit)",
      changedBy: "Shawn",
      changedAt: "2025-04-10T09:00:00Z",
      changeNote: "Increased word limit from 400 to 500, added commitment statement requirement",
    },
    {
      version: 2,
      body: "... (v2 with basic structure)",
      changedBy: "Shawn",
      changedAt: "2025-03-05T16:00:00Z",
      changeNote: "Added metrics requirement for past performance references",
    },
    {
      version: 1,
      body: "... (initial exec summary prompt)",
      changedBy: "Shawn",
      changedAt: "2025-01-20T08:00:00Z",
      changeNote: "Initial executive summary writer",
    },
  ],
  "prompt-007": [
    {
      version: 3,
      body: MOCK_PROMPTS[6].body,
      changedBy: "Shawn",
      changedAt: "2025-05-02T08:30:00Z",
      changeNote: "Added competitor lens perspective and specific rewrite suggestions",
    },
    {
      version: 2,
      body: "... (v2 without competitor analysis)",
      changedBy: "Shawn",
      changedAt: "2025-03-20T11:00:00Z",
      changeNote: "Added strength assessment section and rating scale",
    },
    {
      version: 1,
      body: "... (basic red team checklist)",
      changedBy: "Shawn",
      changedAt: "2025-01-15T14:00:00Z",
      changeNote: "Initial red team review prompt",
    },
  ],
};

const MOCK_USAGE: PromptUsage[] = [
  {
    id: "usage-001",
    promptId: "prompt-003",
    usedBy: "Shawn",
    usedAt: "2025-05-09T11:00:00Z",
    context: "PEO IEW&S SETA IDIQ proposal executive summary",
    outcome: "success",
    notes: "Generated strong opening tied to USACE defense IT mission",
  },
  {
    id: "usage-002",
    promptId: "prompt-001",
    usedBy: "Shawn",
    usedAt: "2025-05-08T16:45:00Z",
    context: "DISA SETA Task Order capture plan",
    outcome: "success",
    notes: "Identified 4 win themes and 2 teaming gaps we hadn't considered",
  },
  {
    id: "usage-003",
    promptId: "prompt-007",
    usedBy: "Shawn",
    usedAt: "2025-05-08T09:45:00Z",
    context: "Red team review of DEVCOM C5ISR technical volume Section 3",
    outcome: "partial",
    notes: "Found 3 compliance gaps but missed a key evaluation factor",
  },
  {
    id: "usage-004",
    promptId: "prompt-002",
    usedBy: "Shawn",
    usedAt: "2025-05-07T09:30:00Z",
    context: "Army CECOM solicitation compliance matrix extraction",
    outcome: "success",
    notes: "Extracted 47 requirements, identified 2 conflicts between sections",
  },
  {
    id: "usage-005",
    promptId: "prompt-010",
    usedBy: "Shawn",
    usedAt: "2025-05-09T08:15:00Z",
    context: "Follow-up to USACE contracting officer re: SETA IDIQ Q&A",
    outcome: "success",
    notes: null,
  },
  {
    id: "usage-006",
    promptId: "prompt-005",
    usedBy: "Shawn",
    usedAt: "2025-05-03T10:00:00Z",
    context: "OODA analysis for Hanscom AFB opportunity bid/no-bid",
    outcome: "success",
    notes: "Recommended NO-BID — low Pwin (35%), unfavorable competitive landscape",
  },
  {
    id: "usage-007",
    promptId: "prompt-004",
    usedBy: "Shawn",
    usedAt: "2025-05-05T14:20:00Z",
    context: "Leidos competitive brief for USACE defense IT program",
    outcome: "success",
    notes: "Identified vulnerability in their C5ISR systems engineering track record",
  },
  {
    id: "usage-008",
    promptId: "prompt-008",
    usedBy: "Shawn",
    usedAt: "2025-05-04T11:30:00Z",
    context: "SAM.gov screening of Navy NAVFAC defense IT services RFP",
    outcome: "success",
    notes: "Scored 78/100 — recommended WATCH pending teaming analysis",
  },
];

export function getMockPrompts(): Prompt[] {
  return MOCK_PROMPTS;
}

export function getMockPromptById(id: string): Prompt | null {
  return MOCK_PROMPTS.find((p) => p.id === id) ?? null;
}

export function getMockPromptVersions(id: string): PromptVersion[] {
  return MOCK_VERSION_HISTORY[id] ?? [{
    version: MOCK_PROMPTS.find((p) => p.id === id)?.version ?? 1,
    body: MOCK_PROMPTS.find((p) => p.id === id)?.body ?? "",
    changedBy: "Shawn",
    changedAt: MOCK_PROMPTS.find((p) => p.id === id)?.createdAt ?? NOW,
    changeNote: "Initial version",
  }];
}

export function getMockPromptUsage(id: string): PromptUsage[] {
  return MOCK_USAGE.filter((u) => u.promptId === id);
}

export function getMockRecentUsage(): PromptUsage[] {
  return [...MOCK_USAGE].sort((a, b) => b.usedAt.localeCompare(a.usedAt));
}
