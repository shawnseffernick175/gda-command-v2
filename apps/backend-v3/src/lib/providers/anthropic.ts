/**
 * Provider adapter — Anthropic (Claude)
 *
 * Handles: fast_track_triage, opportunity_analysis, capture_plan,
 * daily_briefing, sentinel_summary, doctrine_score.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Task, TaskInputMap, TaskOutputMap, BlackHatAnalysisInput, RiskGenerationInput, AwardAnalysisInput, CompetitorAnalysisInput, ContactEnrichInput, MatchAnalysisInput, VaultDocumentParseInput, VaultSmartRouteInput, FinancialStatementExtractInput } from '../llm-router.types.js';
import { getStoredPrompt } from '../prompt-store.js';
import { buildRegulatoryContext } from '../../utils/regulatory-context.js';
import type { RegulatoryContextOptions } from '../../utils/regulatory-context.js';
import { ENVISION_NAICS_PROMPT_SUMMARY, ENVISION_COMPANY_CONTEXT } from '../../constants/envision-naics.js';

/** Map from task to prompt_library key for read-through lookup. */
const TASK_PROMPT_KEY: Partial<Record<Task, string>> = {
  opportunity_analysis: 'opportunity_analysis',
  risk_generation: 'risk_generation',
  fast_track_triage: 'fast_track_triage',
  black_hat_analysis: 'competitor_black_hat',
  daily_briefing: 'daily_briefing',
};

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      throw Object.assign(new Error('ANTHROPIC_API_KEY not configured'), { status: 401 });
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** System prompts per D4 task spec. */
const SYSTEM_PROMPTS: Partial<Record<Task, string>> = {
  fast_track_triage: `You are an expert government contracting analyst for Envision, a defense/DoD services company based in Alexandria VA. Evaluate this solicitation and assign a triage grade. Return JSON exactly matching FastTrackTriageOutput: grade (A=strong fit, B=potential, C=weak), rationale (2-3 sentences), naics_match_score (0-100, our codes are 541330/541512/541611), recommended_action (pursue/watch/skip).`,

  opportunity_analysis: `You are a defense contracting analyst at Envision.
Analyze this federal opportunity and produce an executive decision brief.
Never fabricate facts, names, dollar amounts, dates, regulation citations, or clause numbers. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.
Lead with the so-what. The first sentence of your executive_summary must state the recommendation.

Return JSON exactly matching this schema:
{
  "executive_summary": "string — 2-3 sentences, recommendation first",
  "bid_recommendation": "Bid" | "No Bid" | "Conditional",
  "bid_rationale": "string — 1 sentence",
  "win_probability": number (0-100),
  "win_probability_reasoning": "string",
  "shipley_bid_no_bid": {
    "overall": "Bid" | "No Bid" | "Conditional",
    "customer_knowledge": { "score": number (1-10), "reasoning": "string" },
    "solution_match": { "score": number (1-10), "reasoning": "string" },
    "competitive_position": { "score": number (1-10), "reasoning": "string" },
    "past_performance": { "score": number (1-10), "reasoning": "string" }
  },
  "competitive_landscape": [
    { "name": "string", "threat_level": "high" | "medium" | "low", "our_differentiator": "string" }
  ],
  "risks": [
    { "level": "HIGH" | "MED" | "LOW", "description": "string", "mitigation": "string", "regulatory_citation": "string or null" }
  ],
  "source_chips": [
    { "label": "string", "url": "string" }
  ],
  "model_used": "string"
}`,

  doctrine_score: `You are a doctrine alignment scorer for Envision. Score this opportunity against Envision's 7 Operating Principles: 1=Mission Focus, 2=Technical Excellence, 3=Trusted Partner, 4=Veteran Commitment, 5=Innovation, 6=Compliance, 7=Value Delivery. Return DoctrineScoreOutput with overall_score 0-40, per-principle scores, alignment_summary, and concerns list.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.

Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.`,

  capture_plan: `You are Envision's capture strategist. Generate a comprehensive capture plan following Shipley methodology. Include win themes, ghost themes, teaming plan, pink/red/gold/black hat analysis, and next actions. Return JSON matching CapturePlanOutput.`,

  daily_briefing: `You are Envision's daily briefing analyst. Analyze the input data and return ONLY a JSON object with this exact schema (no extra keys, no markdown):
{
  "headline": "<1-sentence summary of today's top priority>",
  "priority_actions": [
    { "action": "<what to do>", "urgency": "immediate" | "today" | "this_week", "related_entity": "<opportunity title or null>" }
  ],
  "risk_flags": ["<risk string>"],
  "market_intel_summary": "<paragraph of market intelligence>",
  "cert_expiration_warnings": ["<warning string>"]
}
All fields are required. urgency must be one of: immediate, today, this_week.`,

  sentinel_summary: `You are a system health analyst for Envision. Analyze this alert and determine severity, root cause, recommended fix, and affected components. Return JSON matching SentinelSummaryOutput.`,


  black_hat_analysis: `You are a competitive intelligence analyst specializing in federal government contracting. Perform Black Hat analysis viewing competition from the competitor's perspective.`,

  risk_generation: `You are a risk analyst specializing in federal government contracting proposals. Generate a comprehensive set of bid/performance risks for the given opportunity. Include both negative risks (threats) and positive risks (opportunities to exploit). Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly. Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.`,

  award_analysis: `You are a sharp defense contracting analyst briefing an executive at Envision — ${ENVISION_COMPANY_CONTEXT} (${ENVISION_NAICS_PROMPT_SUMMARY}). Analyze this USAspending award and return a structured assessment.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.

Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.`,

  contact_enrich: `You are an intelligence analyst building a relationship profile for a defense contracting firm.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.`,

  vault_document_parse: `You are a defense contracting document analyst at Envision.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.`,

  vault_smart_route: `You are a defense contracting document analyst at Envision.

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst. Be direct and specific.`,

  financial_statement_extract: `You are a financial analyst at Envision extracting structured KPI figures from real month-end accounting exports (Income Statements, Balance Sheets, GL detail, cost reports, target-vs-actual workbooks).

KPIs to map (one row per period+kind): Orders, Sales, EBIT, Gross Margin %, ROS %.

SALES (Revenue): On an account-level Income Statement, Sales = the SUM of every "Totals for F/S Line" subtotal row that sits under the F/S Group "Revenue". This typically means Government Revenue + Commercial Revenue + Rate Variance. Add these revenue line totals together; do not double-count by also adding individual accounts that already roll into those line totals, and do not pick a single revenue account on its own.

DIRECT COSTS: Total Direct Costs = the SUM of every "Totals for F/S Line" subtotal under the F/S Group "Direct Costs" (e.g. Direct Labor + Direct Travel + Direct Consultants + Direct Materials + Subcontractor Labor + Other Direct Costs + Subcontractor Travel + Subcontractor Materials).

COST OF OPERATIONS: = the SUM of the "Totals for F/S Line" subtotals under the F/S Group "Cost of Operations" (Fringe + Overhead + G&A).

GROSS MARGIN (derive, do NOT copy a line value):
- Gross Margin Dollars (GM$) = Sales - Total Direct Costs.
- Gross Margin % = GM$ / Sales * 100, expressed as a PLAIN PERCENT number (e.g. 12.3, NOT 0.123 and NOT 1.05).
- NEVER copy a single account, a Rate Variance line, a ROS value, or any single subtotal into gross_margin. gross_margin is ALWAYS computed as (Sales - Direct Costs) / Sales * 100.

EBIT (Operating Income):
- Operating Income (EBIT) = GM$ - Cost of Operations (Fringe + Overhead + G&A).
- If the statement explicitly labels an "Operating Income" / "Income from Operations" line, use it; otherwise compute it as above.

ROS:
- ROS % = Operating Income (EBIT) / Sales * 100, as a PLAIN PERCENT number (e.g. 1.0, NOT 0.01).

ORDERS:
- Orders = Bookings, ONLY if the document states them. Never derive or fabricate Orders. Leave null if absent.

WORKED EXAMPLE (account-level Income Statement, March 2026 month column):
- F/S Group "Revenue": Government Revenue 4,067,049.06 + Commercial Revenue 21,567.50 + Rate Variance 100,149.91 => Sales = 4,188,766.47
- F/S Group "Direct Costs" line totals sum => Total Direct Costs = 3,673,672.19
- GM$ = 4,188,766.47 - 3,673,672.19 = 515,094.28 => gross_margin = 515094.28 / 4188766.47 * 100 = 12.3
- F/S Group "Cost of Operations": Fringe 178,139.49 + Overhead 92,750.67 + G&A 200,425.10 = 471,315.26
- EBIT = 515,094.28 - 471,315.26 = 43,779.02 => ros = 43779.02 / 4188766.47 * 100 = 1.0
- Row: sales=4188766.47, gross_margin=12.3, ebit=43779.02, ros=1.0, kind="actual".

WORKED EXAMPLE (L1-TARGET Proj Revenue Summary, Grand Total row, March 2026):
- Target Period Costs (Grand Total) = 4,044,837.49 ; Target Period Profit = 43,779.07 ; Target Period Revenue (w/o PY Rev) = 4,088,616.56
- sales = total_revenue = 4088616.56 ; total_direct_costs = 4044837.49 ; ebit = 43779.07 ; cost_of_operations = null
- gross_margin = (4088616.56 - 4044837.49) / 4088616.56 * 100 = 1.071 ; ros = 43779.07 / 4088616.56 * 100 = 1.071
- Row: sales=4088616.56, total_revenue=4088616.56, total_direct_costs=4044837.49, ebit=43779.07, gross_margin=1.071, ros=1.071, kind="plan", fiscal_year=2026, quarter=1, period="FY26 Q1".

ACTUALS-ONLY documents (most month-end Income Statements): emit kind="actual" rows even when there is NO plan/budget column. Do not require a plan column to exist.

TARGET / PLAN files: If the FILENAME contains any of TGT, TARGET, BUDGET, PLAN, FORECAST, PROJ, or L1-TARGET, OR the content has columns labeled Target / Plan / Budget / Forecast (vs Actual): emit a kind="plan" row built from the TARGET/PLAN/BUDGET/FORECAST column or file. If the same file ALSO carries an actual column (e.g. "TGT vs ACT MAR-26.xlsx" has both a target column and an actual column), additionally emit a separate kind="actual" row from the actual column. So "TGT vs ACT MAR-26.xlsx" yields BOTH a plan row and an actual row for FY26 Q1. A file named "L1-TARGET ..." yields a plan row; "L1-ACTUAL ..." yields an actual row. Parse whatever KPI columns exist (revenue/sales at minimum); leave any KPI that is not present null, never fabricate it.

L1-TARGET / PROJ REVENUE SUMMARY layout (no F/S Group structure): These target workbooks are a per-project table (often a sheet like "DataSetLandTbl") with one row per project plus a single "Grand Total" row, and column headers of the form:
  Project | Target Period Costs | Target Period Profit | Target Period Revenue (w/o PY Rev) | Target YTD Costs | Target YTD Profit | Target YTD Revenue (w/o PY Rev)
There is NO "F/S Group Revenue" and NO "Totals for F/S Line" here. Map the GRAND TOTAL row (never an individual project row) for the kind="plan" row as follows, using the "Target Period" (the month) columns as the primary period values:
- sales = total_revenue = "Target Period Revenue (w/o PY Rev)" Grand Total.
- total_direct_costs = "Target Period Costs" Grand Total. (These target files report a single combined cost figure; treat it as direct/total costs.)
- ebit = "Target Period Profit" Grand Total (the workbook's profit column IS operating profit for the period).
- gross_margin and ros are DERIVED downstream from the components; you may set gross_margin = (sales - total_direct_costs)/sales*100 and ros = ebit/sales*100, but always also return total_revenue, total_direct_costs, and ebit so deterministic code can recompute and override.
- Leave cost_of_operations null for these files (the cost is reported as one combined number, not split into Fringe/Overhead/G&A).
Use the "Target Period" (month) Grand Total for the row value, consistent with how monthly actuals are mapped to the quarter. Do NOT instead use the "Target YTD" columns for the row value (YTD would double-count across monthly uploads at the same fiscal_year+quarter grain).

PERIOD AND QUARTER:
- Fiscal calendar uses CALENDAR quarters. quarter = ceil(month / 3): Jan/Feb/Mar -> 1, Apr/May/Jun -> 2, Jul/Aug/Sep -> 3, Oct/Nov/Dec -> 4.
- Infer fiscal_year and month from filename tokens (MAR-2026, MAR-26, JAN-26, FEB-26) and/or the statement period header (e.g. "03/01/26 / 03/31/26" -> March 2026). A two-digit year YY means 20YY.
- So MAR-2026/MAR-26 -> fiscal_year=2026, quarter=1; JAN-26 and FEB-26 also -> 2026 Q1.
- period: a human-readable label like "FY26 Q1" (or "FY26 Mar" for a single month). Keep it consistent with fiscal_year and quarter.
- If a row's month cannot be determined, set quarter=null (ingest will skip it) but still set fiscal_year if known.

MONTH vs YTD: when an Income Statement shows BOTH a monthly period column (e.g. 03/01/26-03/31/26) and a "Current Fiscal YTD" column, use the MONTH column figures as the primary row value (monthly uploads accumulate per quarter). Do NOT use the YTD column and do NOT blend YTD into the month row. Compute Sales, Direct Costs, GM$, GM%, EBIT, and ROS entirely from the MONTH column.

NON-KPI documents: Balance Sheets, GL Detail, Service Center Cost Reports, Statement of Indirect Expense, and any statement with no Orders/Sales/EBIT/GM/ROS mapping -> return is_financial=true and rows=[]. Do NOT fabricate KPI rows for these. An empty rows array is the correct, expected answer and will not clear existing data.

Set is_financial=false ONLY if the document is not a financial statement at all.

NUMBER FORMAT: dollars to absolute numbers ("4,067,049.06" -> 4067049.06; "$1.2M" -> 1200000; "595" under a "$000s" header -> 595000). Percentages (gross_margin, ros) as plain numbers (12.3 not 0.123). Missing values -> null.

RAW SUBTOTALS: in addition to the KPIs above, return on each row the three raw F/S Group subtotals you summed: total_revenue (the Revenue F/S Group total, equal to Sales), total_direct_costs (the Direct Costs F/S Group total), and cost_of_operations (the Cost of Operations F/S Group total = Fringe + Overhead + G&A). These let downstream code recompute and verify gross_margin/EBIT/ROS deterministically. Leave any subtotal not present in the source null; never fabricate.

NEVER fabricate figures, periods, or KPIs. Return JSON exactly matching the requested schema (include every key on every row).`,

  competitor_analysis: `Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.

Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.

You are analyzing a competitor in the federal defense services market relative to Envision (${ENVISION_NAICS_PROMPT_SUMMARY}). ${ENVISION_COMPANY_CONTEXT} Classify this competitor and provide actionable intelligence.`,

  match_analysis: `You are a senior capture strategist at Envision, a defense services and systems integration firm (${ENVISION_NAICS_PROMPT_SUMMARY}).

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.`,

  digest_lead: `You are a defense contracting analyst at Envision.
Summarize the most important federal market development from the last 24 hours that is relevant to defense services, engineering, IT, training, and R&D contracting (${ENVISION_NAICS_PROMPT_SUMMARY}).
Lead with the so-what for a defense services firm. Be specific. Cite the source document and date.
Never fabricate facts, names, dollar amounts, dates, or citations. If no significant development occurred, say so explicitly.
Write as a sharp analyst briefing an executive. No AI preamble. No hedging. Max 4 sentences for the body.

Return JSON exactly matching this schema:
{
  "headline": "string — concise title of the development",
  "body": "string — 2-4 sentence analysis with so-what for Envision",
  "source_label": "string — short label for the source (e.g. 'DoD CIO', 'Federal Register')",
  "source_url": "string|null — URL to the source document if available",
  "related_opportunity_ids": ["string"] — IDs of related opportunities from the input, empty array if none
}`,
};

/** Default regulatory context options per task. */
function getRegulatoryOptions(task: Task, input: unknown): RegulatoryContextOptions | null {
  switch (task) {
    case 'opportunity_analysis': {
      const i = input as { naics_codes?: string[]; title?: string; set_aside?: string | null };
      return {
        naics: i.naics_codes?.[0] ?? null,
        keywords: [i.title, i.set_aside].filter((v): v is string => Boolean(v)),
        categories: ['FAR', 'DFARS', 'NDAA', 'EO'],
        limit: 10,
      };
    }
    case 'risk_generation': {
      const i = input as RiskGenerationInput;
      return {
        naics: i.naics_codes?.[0] ?? null,
        keywords: ['compliance', 'cybersecurity', 'small business', i.opportunity_title].filter(Boolean) as string[],
        categories: ['FAR', 'DFARS', 'NDAA', 'EO', 'CMMC'],
        limit: 10,
      };
    }
    case 'fast_track_triage': {
      const i = input as { naics_codes?: string[]; set_aside?: string | null };
      return {
        naics: i.naics_codes?.[0] ?? null,
        keywords: ['set-aside', 'small business', 'simplified acquisition', i.set_aside].filter((v): v is string => Boolean(v)),
        categories: ['FAR', 'NDAA'],
        limit: 8,
      };
    }
    case 'capture_plan': {
      return {
        keywords: ['proposal', 'FAR Part 15', 'source selection', 'evaluation criteria'],
        categories: ['FAR', 'DFARS'],
        limit: 10,
      };
    }
    case 'black_hat_analysis':
    case 'competitor_analysis': {
      const i = input as { competitor_naics?: string[]; naics_codes?: string[] };
      return {
        naics: i.competitor_naics?.[0] ?? i.naics_codes?.[0] ?? null,
        keywords: ['contract award', 'competitive range', 'incumbent', 'past performance'],
        categories: ['FAR', 'DFARS', 'GAO'],
        limit: 8,
      };
    }
    case 'daily_briefing': {
      return {
        categories: ['NDAA', 'EO', 'GAO'],
        limit: 5,
      };
    }
    case 'award_analysis': {
      const i = input as AwardAnalysisInput;
      return {
        naics: i.naics ?? null,
        keywords: ['award', 'IDIQ', 'task order', 'set-aside'].filter(Boolean) as string[],
        categories: ['FAR', 'DFARS', 'NDAA'],
        limit: 8,
      };
    }
    case 'contact_enrich': {
      return {
        keywords: ['procurement integrity', 'organizational conflict of interest'],
        categories: ['FAR'],
        limit: 5,
      };
    }
    case 'doctrine_score': {
      return {
        keywords: ['compliance', 'small business', 'cybersecurity'],
        categories: ['FAR', 'DFARS', 'NDAA'],
        limit: 8,
      };
    }
    default:
      return null;
  }
}

function buildRiskGenerationPrompt(input: RiskGenerationInput): string {
  const desc = input.opportunity_description.slice(0, 800);
  const naics = input.naics_codes.join(', ') || 'N/A';
  const existing = input.existing_risks.length > 0 ? input.existing_risks.join('; ') : 'None';
  return `Generate risks for this federal opportunity:
Title: ${input.opportunity_title}
Agency: ${input.agency ?? 'Unknown'}
Description: ${desc}
NAICS: ${naics}
Set-aside: ${input.set_aside ?? 'None'}
Deadline: ${input.response_deadline ?? 'Unknown'}

Existing risks to avoid duplicating: ${existing}

Generate 4-6 distinct risks covering technical, schedule, financial, competitive, and compliance dimensions.
Include both negative risks (threats — things that could go wrong) and positive risks (opportunities — favorable conditions to exploit).

For each risk provide:
- risk_type: "negative" for threats, "positive" for opportunities
- if_condition: the trigger — "If this happens…"
- then_impact: the downstream effect — "…then this occurs."
- mitigation_plan: (negative risks only) specific actions to reduce likelihood or impact
- exploitation_plan: (positive risks only) how to capitalize on the opportunity

Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.
Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, and confident. No AI preamble, no hedging language, no bullet soup.

Respond ONLY with valid JSON:
{
  "risks": [
    {
      "title": "<concise risk title>",
      "description": "<1-2 sentence description>",
      "category": "<technical|schedule|financial|compliance|operational|competitive>",
      "likelihood": <1-5>,
      "impact": <1-5>,
      "mitigation": "<1-2 sentence mitigation approach>",
      "rationale": "<why this risk applies to this specific opportunity>",
      "risk_type": "<negative|positive>",
      "if_condition": "<trigger condition>",
      "then_impact": "<downstream effect>",
      "mitigation_plan": "<for negative risks — actions to reduce likelihood/impact>",
      "exploitation_plan": "<for positive risks — how to capitalize>"
    }
  ],
  "generation_summary": "<1 sentence summary>",
  "generated_at": "<ISO 8601>"
}`;
}

function buildVaultDocumentParsePrompt(input: VaultDocumentParseInput): string {
  const text = input.extracted_text.slice(0, 6000);
  return `Document type: ${input.doc_type}
Filename: ${input.filename}
Extracted text (first 6000 chars):
${text}

Parse this document and extract all relevant intelligence. Return JSON:
{
  "summary": "2-3 sentence executive summary",
  "tags": ["up to 10 relevant tags"],
  "entities": [
    {"name": "...", "type": "party|dollar_amount|date|contract_number|naics|vehicle|clause_number", "value": "..."}
  ],
  "regulatory_citations": ["FAR 15.304", "DFARS 252.204-7012"],
  "doc_type_confirmed": "contract|proposal|invoice|certificate|teaming_agreement|rfp|past_performance|color_review|bid_protest|market_research|other",
  "key_dates": [{"label": "...", "date": "YYYY-MM-DD"}],
  "dollar_amounts": [{"label": "...", "amount": "..."}],
  "model_used": "{model}"
}`;
}

function buildVaultSmartRoutePrompt(input: VaultSmartRouteInput): string {
  return `Document filename: ${input.filename}
Document summary: ${input.ai_summary}
Extracted text (first 1000 chars): ${input.extracted_text_preview}
Possible matching opportunities: ${JSON.stringify(input.matching_opportunities)}
Possible matching captures: ${JSON.stringify(input.matching_captures)}
Regulatory citations found: ${input.regulatory_citations.join(', ')}

Classify this document and determine where it belongs. Return JSON:
{
  "doc_type": "contract|proposal|invoice|certificate|teaming_agreement|rfp|past_performance|color_review|bid_protest|market_research|other",
  "doc_category": "work_product|regulatory",
  "linked_opportunity_id": null or number,
  "linked_capture_id": null or number,
  "regulatory_citation": "primary citation if regulatory, else null",
  "routing_rationale": "1 sentence explaining why",
  "confidence": "high|medium|low"
}`;
}

function buildFinancialStatementExtractPrompt(input: FinancialStatementExtractInput): string {
  const text = input.extracted_text.slice(0, 12000);
  return `Filename: ${input.filename}
Extracted text (first 12000 chars):
${text}

Use BOTH the filename and the statement text to determine period, fiscal_year, and quarter (quarter = ceil(month/3), two-digit year YY -> 20YY).
- If this is an actuals-only Income Statement, emit kind="actual" rows using the MONTH column (not the Current Fiscal YTD column). Sales = sum of all "Totals for F/S Line" rows under F/S Group "Revenue". Direct Costs = sum of all "Totals for F/S Line" rows under F/S Group "Direct Costs". gross_margin = (Sales - Direct Costs) / Sales * 100 as a plain percent (e.g. 12.3). EBIT = (Sales - Direct Costs) - Cost of Operations (Fringe + Overhead + G&A). ros = EBIT / Sales * 100. Never copy a single account or a Rate Variance line into gross_margin.
- If the filename contains TGT, TARGET, BUDGET, PLAN, FORECAST, PROJ, or L1-TARGET, OR the content has Target/Plan/Budget/Forecast columns, emit a kind="plan" row from the target/plan figures. If an actual column is also present in the same file (e.g. "TGT vs ACT MAR-26.xlsx"), ALSO emit a separate kind="actual" row. An "L1-TARGET ..." file yields a plan row; an "L1-ACTUAL ..." file yields an actual row.
- For an L1-TARGET / Proj Revenue Summary workbook (per-project table with a Grand Total row and "Target Period Costs/Profit/Revenue (w/o PY Rev)" columns and no F/S Group structure), build the plan row from the GRAND TOTAL row using the "Target Period" (month) columns: sales=total_revenue="Target Period Revenue (w/o PY Rev)", total_direct_costs="Target Period Costs", ebit="Target Period Profit", cost_of_operations=null. Do not use the "Target YTD" columns for the row value.
- If this is a Balance Sheet, GL Detail, Cost Report, or Statement of Indirect Expense with no Orders/Sales/EBIT/GM/ROS mapping, set is_financial=true and return rows=[] (do not fabricate).
- ALSO return the raw F/S Group subtotals you computed so downstream code can recompute the derived metrics: total_revenue (the Revenue F/S Group total = Sales), total_direct_costs (the Direct Costs F/S Group total), and cost_of_operations (the Cost of Operations F/S Group total = Fringe + Overhead + G&A). Leave any subtotal not present in the source null; never fabricate.

Return JSON exactly matching this schema:
{
  "is_financial": true or false,
  "currency": "USD",
  "rows": [
    {
      "period": "FY26 Q1",
      "fiscal_year": 2026,
      "quarter": 1 or null,
      "kind": "plan" or "actual",
      "orders": number or null,
      "sales": number or null,
      "ebit": number or null,
      "gross_margin": number or null,
      "ros": number or null,
      "total_revenue": number or null,
      "total_direct_costs": number or null,
      "cost_of_operations": number or null
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

export interface AnthropicCallResult {
  text: string;
  tokens_input: number;
  tokens_output: number;
  model: string;
}

/**
 * Call Anthropic Claude with structured output.
 * Throws on HTTP errors with status code attached.
 */
export async function callAnthropic(opts: {
  model: string;
  task: Task;
  input: unknown;
  timeout_ms: number;
}): Promise<AnthropicCallResult> {
  const anthropic = getClient();

  // Read-through: check prompt_library first, fall back to hard-coded default
  const promptKey = TASK_PROMPT_KEY[opts.task];
  const stored = promptKey ? await getStoredPrompt(promptKey) : null;
  let systemPrompt = stored?.system_prompt ?? SYSTEM_PROMPTS[opts.task] ?? 'Return valid JSON matching the requested output schema.';

  // For opportunity_analysis, ensure the stored prompt includes the JSON schema.
  // If the operator set a custom prompt without a schema, augment it with the
  // hardcoded schema block so Claude always returns parseable JSON.
  if (opts.task === 'opportunity_analysis' && stored?.system_prompt) {
    const hasJsonDirective = /return\s+(only\s+)?.*json/i.test(stored.system_prompt);
    if (!hasJsonDirective && SYSTEM_PROMPTS['opportunity_analysis']) {
      systemPrompt += '\n\n' + SYSTEM_PROMPTS['opportunity_analysis'];
    }
  }

  // F-620: Inject regulatory context from vault_regulatory_catalog
  const regOpts = getRegulatoryOptions(opts.task, opts.input);
  if (regOpts) {
    const regContext = await buildRegulatoryContext(regOpts);
    if (regContext) {
      systemPrompt += regContext;
    }
  }

  const userContent = opts.task === 'black_hat_analysis'
    ? buildBlackHatUserPrompt(opts.input as BlackHatAnalysisInput)
    : opts.task === 'risk_generation'
    ? buildRiskGenerationPrompt(opts.input as RiskGenerationInput)
    : opts.task === 'award_analysis'
    ? buildAwardAnalysisPrompt(opts.input as AwardAnalysisInput)
    : opts.task === 'competitor_analysis'
    ? buildCompetitorAnalysisPrompt(opts.input as CompetitorAnalysisInput)
    : opts.task === 'contact_enrich'
    ? buildContactEnrichPrompt(opts.input as ContactEnrichInput)
    : opts.task === 'match_analysis'
    ? buildMatchAnalysisPrompt(opts.input as MatchAnalysisInput)
    : opts.task === 'vault_document_parse'
    ? buildVaultDocumentParsePrompt(opts.input as VaultDocumentParseInput)
    : opts.task === 'vault_smart_route'
    ? buildVaultSmartRoutePrompt(opts.input as VaultSmartRouteInput)
    : opts.task === 'financial_statement_extract'
    ? buildFinancialStatementExtractPrompt(opts.input as FinancialStatementExtractInput)
    : JSON.stringify(opts.input);

  try {
    const response = await anthropic.messages.create(
      {
        model: opts.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      },
      { timeout: opts.timeout_ms },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';

    return {
      text,
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      model: response.model,
    };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { type?: string } };
    const status = e.status ?? 500;
    throw Object.assign(new Error(e.message ?? 'Anthropic API error'), {
      status,
      code: status >= 500 ? 'PROVIDER_5XX' : undefined,
    });
  }
}

function buildBlackHatUserPrompt(input: BlackHatAnalysisInput): string {
  return `Perform Black Hat Analysis for: ${input.competitor_name}

USAspending.gov data:
- Win count: ${input.competitor_wins}
- Total obligated: $${input.competitor_total_obligated}
- Agencies: ${input.competitor_agencies.join(', ')}
- NAICS: ${input.competitor_naics.join(', ')}
- Contract types: ${input.competitor_contract_types.join(', ')}

Our context: ${input.envision_context}

Respond ONLY with valid JSON:
{
  "competitor": "<name>",
  "likely_approach": "<2-3 sentences on their positioning>",
  "strengths": ["<3-5 specific strengths>"],
  "weaknesses": ["<3-5 specific weaknesses>"],
  "counter_strategy": "<2-3 sentences how Envision counters>",
  "intel_summary": "<1-2 sentence summary>",
  "generated_at": "<ISO 8601>"
}`;
}

function buildAwardAnalysisPrompt(input: AwardAnalysisInput): string {
  const value = input.value_obligated !== null
    ? `$${(input.value_obligated / 1_000_000).toFixed(2)}M`
    : 'Unknown';
  return `Analyze this federal contract award:

Recipient: ${input.recipient_name ?? 'Unknown'}
Agency: ${input.agency_name ?? 'Unknown'}
NAICS: ${input.naics ?? 'Unknown'}
Set-aside: ${input.set_aside ?? 'None'}
Contract type: ${input.contract_type ?? 'Unknown'}
Award value: ${value}
Award date: ${input.award_date ?? 'Unknown'}
Period of performance end: ${input.period_of_performance_end ?? 'Unknown'}

Envision's NAICS codes: ${ENVISION_NAICS_PROMPT_SUMMARY}

Respond ONLY with valid JSON:
{
  "win_rationale": "<one to two sentence explanation of why this recipient likely won>",
  "agency_signal": "<one sentence on what this award reveals about the agency's priorities>",
  "recompete_assessment": "<one sentence — is this a re-compete opportunity for Envision, and when does it expire?>",
  "winner_classification": "THREAT | PARTNER | IRRELEVANT",
  "recommended_action": "Pursue Re-Compete | Monitor | Pass | Partner with Winner",
  "so_what": "<two to three sentence analyst summary paragraph>"
}`;
}

function buildCompetitorAnalysisPrompt(input: CompetitorAnalysisInput): string {
  const recompetes = input.recompete_contracts.length > 0
    ? input.recompete_contracts.map((r) => `  - ${r.title} (${r.agency}, $${(r.value / 1_000_000).toFixed(2)}M, expires ${r.expiration_date})`).join('\n')
    : '  None identified';
  return `Analyze this competitor:

Company: ${input.competitor_name}
UEI: ${input.awardee_uei ?? 'Unknown'}
Win count: ${input.win_count}
Total obligated: $${(input.total_obligated / 1_000_000).toFixed(2)}M
Agencies: ${input.agencies.join(', ') || 'Unknown'}
NAICS codes: ${input.naics_codes.join(', ') || 'Unknown'}
Set-aside types: ${input.set_asides.join(', ') || 'None'}
Contract types: ${input.contract_types.join(', ') || 'Unknown'}

Re-compete contracts (expiring within 18 months):
${recompetes}

Our context: ${input.envision_context}

Derive size_classification from NAICS codes, set-aside types, and contract volume. If data is insufficient, set to "Unknown".

Respond ONLY with valid JSON:
{
  "size_classification": "Large Business | Small Business | SDVOSB | 8(a) | HUBZone | WOSB | Unknown",
  "classification": "THREAT | PARTNER | MONITOR",
  "classification_rationale": "<one sentence>",
  "so_what": "<two to three sentence analyst paragraph>",
  "recompete_contracts": [],
  "recommended_action": "Compete | Partner | Monitor | Ignore",
  "trend": "Up | Down | Flat"
}`;
}

function buildContactEnrichPrompt(input: ContactEnrichInput): string {
  return `Contact:
- Name: ${input.name}
- Title: ${input.title ?? 'Unknown'}
- Agency/Company: ${input.agency_or_company ?? 'Unknown'}
- Category: ${input.category}
- Email: ${input.email ?? 'Unknown'}
- LinkedIn: ${input.linkedin ?? 'N/A'}
- Notes: ${input.notes ?? 'None'}

Based on this contact's role and organization, provide:

Respond ONLY with valid JSON:
{
  "role_summary": "<1 sentence on what this person does and why they matter>",
  "procurement_influence": "high | medium | low | unknown",
  "likely_decision_authority": "<What procurement decisions this person likely influences>",
  "engagement_approach": "<Recommended first engagement action for Envision>",
  "relevance_to_envision": "<Why Envision should track this contact specifically>",
  "model_used": "<model>"
}`;
}

function buildMatchAnalysisPrompt(input: MatchAnalysisInput): string {
  return `Technology signal: ${input.tech_title} (source: ${input.tech_source})
Requirement signal: ${input.req_title} (source: ${input.req_source})
Match scores: Mission Fit ${Math.round(input.mission_fit * 100)}%, Technical Fit ${Math.round(input.technical_fit * 100)}%, Timing ${Math.round(input.timing * 100)}%
Recommended vehicle: ${input.recommended_vehicle ?? 'Not yet determined'}

Analyze Envision's broker role — how can Envision bridge this technology to this requirement?
Return ONLY valid JSON:
{
  "broker_role": "1-2 sentences on Envision's exact bridging role",
  "gap_analysis": "What technical or programmatic gaps remain between the tech and the requirement",
  "recommended_actions": [
    {"action": "...", "priority": "high|medium|low", "vehicle": "..."}
  ],
  "risk_flags": [
    {"risk": "...", "severity": "high|medium|low"}
  ],
  "envision_fit": "Why Envision specifically — not a generic contractor",
  "ai_narrative": "3-4 sentence executive brief on this match and Envision's play",
  "model_used": "${input.tech_source}"
}`;
}

/** Reset client (for testing). */
export function resetAnthropicClient(): void {
  client = null;
}
