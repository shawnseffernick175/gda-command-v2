/**
 * Provider adapter — Anthropic (Claude)
 *
 * Handles: fast_track_triage, opportunity_analysis, capture_plan,
 * daily_briefing, sentinel_summary, doctrine_score.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Task, TaskInputMap, TaskOutputMap, BlackHatAnalysisInput, RiskGenerationInput, AwardAnalysisInput, CompetitorAnalysisInput, ContactEnrichInput, MatchAnalysisInput, VaultDocumentParseInput, VaultSmartRouteInput, VaultVehicleExtractInput, FinancialStatementExtractInput, BalanceSheetExtractInput, CostDetailExtractInput, SieExtractInput, ApExtractInput, ArExtractInput, TrialBalanceExtractInput, ProjectRevenueExtractInput, FinancialAnalyzeInput, SitrepDocumentAnalyzeInput, LaunchpadSitrepInput, ColorTeamReviewInput } from '../llm-router.types.js';
import { getStoredPrompt } from '../prompt-store.js';
import { buildRegulatoryContext } from '../../utils/regulatory-context.js';
import type { RegulatoryContextOptions } from '../../utils/regulatory-context.js';
import { ENVISION_NAICS_PROMPT_SUMMARY, ENVISION_COMPANY_CONTEXT } from '../../constants/envision-naics.js';

/**
 * Map from task to prompt_library key for read-through lookup.
 *
 * Any task listed here reads its system prompt from the editable
 * prompt_library table first (falling back to the hard-coded SYSTEM_PROMPTS
 * default if the row is missing or inactive). Editing these in the Prompts tab
 * retunes live AI behavior without a redeploy.
 *
 * Deliberately EXCLUDED (system-locked): the strict JSON extractors
 * (balance_sheet_extract, financial_statement_extract, cost_detail_extract,
 * sie_extract, vault_document_parse, vault_vehicle_extract). Their prompts
 * carry parsing-critical schema directives; exposing them for free-text edits
 * risks corrupting ingestion. doctrine_score is managed via the Doctrine tab.
 */
const TASK_PROMPT_KEY: Partial<Record<Task, string>> = {
  // Originally wired
  opportunity_analysis: 'opportunity_analysis',
  risk_generation: 'risk_generation',
  fast_track_triage: 'fast_track_triage',
  black_hat_analysis: 'competitor_black_hat',
  // Newly wired judgment/analysis tasks
  award_analysis: 'award_analysis',
  capture_plan: 'capture_plan',
  competitor_analysis: 'competitor_analysis',
  match_analysis: 'match_analysis',
  sentinel_summary: 'sentinel_summary',
  digest_lead: 'digest_lead',
  contact_enrich: 'contact_enrich',
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

  sitrep_document_analyze: `You are an executive briefing analyst at Envision, a defense contracting firm. You read documents and produce concise SITREP (Situation Report) entries for weekly leadership reviews.

Never fabricate facts, names, dollar amounts, dates, or action items. If a field cannot be determined from the document, leave it as an empty string. Only extract what is explicitly stated in the document.

Return valid JSON matching the requested output schema.`,

  launchpad_sitrep: `You are an executive briefing analyst at Envision, a defense contracting firm. You produce a daily SITREP (Situation Report) for the operator's Launchpad — a short, scannable numbered list summarizing the state of the business that day.

Write concise, one-line bullets in plain English. No jargon, no preamble, no hedging. Each bullet is a single situation-report point (e.g. "3 action items due today, 1 overdue"). Never fabricate facts, names, dollar amounts, or dates — only summarize what the provided context and documents state.

When a new document is supplied, fold its salient content into the list as additional bullets, merging with the existing bullets rather than duplicating them. Keep the list tight (aim for 3-6 bullets). Return valid JSON matching the requested output schema.`,

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
- Row: sales=4188766.47, gross_margin=12.3, ebit=43779.02, ros=1.0, kind="actual", source="income_statement", fiscal_year=2026, quarter=1, period="FY26 Mar".

WORKED EXAMPLE (L1-TARGET Proj Revenue Summary, Grand Total row, March 2026):
- Target Period Costs (Grand Total) = 4,044,837.49 ; Target Period Profit = 43,779.07 ; Target Period Revenue (w/o PY Rev) = 4,088,616.56
- sales = total_revenue = 4088616.56 ; total_direct_costs = 4044837.49 ; ebit = 43779.07 ; cost_of_operations = null
- gross_margin = (4088616.56 - 4044837.49) / 4088616.56 * 100 = 1.071 ; ros = 43779.07 / 4088616.56 * 100 = 1.071
- Row: sales=4088616.56, total_revenue=4088616.56, total_direct_costs=4044837.49, ebit=43779.07, gross_margin=1.071, ros=1.071, kind="plan", source="l1_target", fiscal_year=2026, quarter=1, period="FY26 Mar".

ACTUALS-ONLY documents (most month-end Income Statements): emit kind="actual" rows even when there is NO plan/budget column. Do not require a plan column to exist.

TARGET / PLAN files: If the FILENAME contains any of TGT, TARGET, BUDGET, PLAN, FORECAST, PROJ, or L1-TARGET, OR the content has columns labeled Target / Plan / Budget / Forecast (vs Actual): emit a kind="plan" row built from the TARGET/PLAN/BUDGET/FORECAST column or file, PROVIDED a genuine revenue/sales figure exists. If the same file ALSO carries an actual revenue/sales column, additionally emit a separate kind="actual" row from the actual column. A file named "L1-TARGET ..." yields a plan row; "L1-ACTUAL ..." yields an actual row. Parse whatever KPI columns exist (revenue/sales at minimum); leave any KPI that is not present null, never fabricate it. IMPORTANT EXCEPTION: a "TGT vs ACT" workbook that is a pure cost/rate build-up (only TGT/ACT/VAR cost columns, no revenue/sales line) has NO sales figure -- see "COST / RATE BUILD-UP files" below -- and must return rows=[]; do NOT manufacture plan/actual rows by copying a cost subtotal into sales.

L1-TARGET / PROJ REVENUE SUMMARY layout (no F/S Group structure): These target workbooks are a per-project table (often a sheet like "DataSetLandTbl") with one row per project plus a single "Grand Total" row, and column headers of the form:
  Project | Target Period Costs | Target Period Profit | Target Period Revenue (w/o PY Rev) | Target YTD Costs | Target YTD Profit | Target YTD Revenue (w/o PY Rev)
There is NO "F/S Group Revenue" and NO "Totals for F/S Line" here. Map the GRAND TOTAL row (never an individual project row) for the kind="plan" row as follows, using the "Target Period" (the month) columns as the primary period values:
- sales = total_revenue = "Target Period Revenue (w/o PY Rev)" Grand Total.
- total_direct_costs = "Target Period Costs" Grand Total. (These target files report a single combined cost figure; treat it as direct/total costs.)
- ebit = "Target Period Profit" Grand Total (the workbook's profit column IS operating profit for the period).
- gross_margin and ros are DERIVED downstream from the components; you may set gross_margin = (sales - total_direct_costs)/sales*100 and ros = ebit/sales*100, but always also return total_revenue, total_direct_costs, and ebit so deterministic code can recompute and override.
- Leave cost_of_operations null for these files (the cost is reported as one combined number, not split into Fringe/Overhead/G&A).
Use the "Target Period" (month) Grand Total for the row value, consistent with how monthly actuals are mapped to the quarter. Do NOT instead use the "Target YTD" columns for the row value (YTD would double-count across monthly uploads at the same fiscal_year+quarter grain).

L1-ACTUAL / PROJ REVENUE SUMMARY layout (no F/S Group structure): These actual workbooks have the SAME per-project table layout as L1-TARGET (often a sheet like "DataSetLandTbl") with one row per project plus a single "Grand Total" row, but column headers use "Actual" instead of "Target":
  Project | Actual Period Costs | Actual Period Profit | Actual Period Revenue (w/o PY Rev) | Actual Year To Date Costs | Actual Year To Date Profit | Actual YTD Revenue (w/o PY Rev)
Headers may contain embedded newlines or extra whitespace (multi-line Excel headers); normalize whitespace when matching column names. Map the GRAND TOTAL row (never an individual project row) for the kind="actual" row as follows, using the "Actual Period" (the month) columns as the primary period values:
- sales = total_revenue = "Actual Period Revenue (w/o PY Rev)" Grand Total.
- total_direct_costs = "Actual Period Costs" Grand Total. (These actual files report a single combined cost figure; treat it as direct/total costs.)
- ebit = "Actual Period Profit" Grand Total (the workbook's profit column IS operating profit for the period).
- gross_margin and ros are DERIVED downstream from the components; you may set gross_margin = (sales - total_direct_costs)/sales*100 and ros = ebit/sales*100, but always also return total_revenue, total_direct_costs, and ebit so deterministic code can recompute and override.
- Leave cost_of_operations null for these files (the cost is reported as one combined number, not split into Fringe/Overhead/G&A).
Use the "Actual Period" (month) Grand Total for the row value, consistent with how monthly actuals are mapped to the quarter. Do NOT instead use the "Actual Year To Date" / "Actual YTD" columns for the row value (YTD would double-count across monthly uploads at the same fiscal_year+quarter grain).

WORKED EXAMPLE (L1-ACTUAL Proj Revenue Summary, Grand Total row, May 2026):
- Actual Period Costs (Grand Total) = 2,011,004.79 ; Actual Period Profit = -24,299.75 ; Actual Period Revenue (w/o PY Rev) = 1,986,705.04
- sales = total_revenue = 1986705.04 ; total_direct_costs = 2011004.79 ; ebit = -24299.75 ; cost_of_operations = null
- gross_margin = (1986705.04 - 2011004.79) / 1986705.04 * 100 = -1.223 ; ros = -24299.75 / 1986705.04 * 100 = -1.223
- Row: sales=1986705.04, total_revenue=1986705.04, total_direct_costs=2011004.79, ebit=-24299.75, gross_margin=-1.223, ros=-1.223, kind="actual", source="l1_actual", fiscal_year=2026, quarter=2, period="FY26 May".

PERIOD AND QUARTER:
- Fiscal calendar uses CALENDAR quarters. quarter = ceil(month / 3): Jan/Feb/Mar -> 1, Apr/May/Jun -> 2, Jul/Aug/Sep -> 3, Oct/Nov/Dec -> 4.
- Infer fiscal_year and month from filename tokens (MAR-2026, MAR-26, JAN-26, FEB-26) and/or the statement period header (e.g. "03/01/26 / 03/31/26" -> March 2026). A two-digit year YY means 20YY.
- So MAR-2026/MAR-26 -> fiscal_year=2026, quarter=1; JAN-26 and FEB-26 also -> 2026 Q1.
- period: ALWAYS the MONTH label, never the quarter. Use "FY<YY> <Mon>" with a three-letter month: "FY26 Jan", "FY26 Feb", "FY26 Mar", etc. Each monthly statement and EACH month in a Trend Income Stmt is its own row with its own month period. Do NOT stamp "FY26 Q1" on a monthly row -- the quarter total is derived downstream by summing the months; you only ever emit MONTH rows.
- quarter is still set on every row (ceil(month/3)) so downstream code can group months into the right quarter, but the period label stays the month.
- If a row's month cannot be determined, set quarter=null (ingest will skip it) but still set fiscal_year if known.

SOURCE (series discriminator, orthogonal to kind -- set on EVERY row):
- "income_statement": an official month-end Income Statement / P&L with F/S Group structure (Revenue / Direct Costs / Cost of Operations). Also use this for the monthly rows of a "Trend Income Stmt" (the trend IS a sequence of monthly income-statement actuals). kind="actual".
- "l1_actual": an L1-ACTUAL project-revenue ledger / Proj Revenue Summary reporting ACTUAL project revenue and cost. kind="actual".
- "l1_target": an L1-TARGET / Proj Revenue Summary plan (the "Target Period" columns). kind="plan".
- Derive source from the FILENAME first (L1-ACTUAL -> l1_actual; L1-TARGET -> l1_target; Income Statement / Trend Income Stmt -> income_statement), falling back to content structure. If genuinely ambiguous, set source = "income_statement" for kind=actual and "l1_target" for kind=plan.
- TREND INCOME STMT: a sheet/section listing several months side by side (e.g. Jan, Feb, Mar columns) each with its own Sales/GM/EBIT. Emit ONE row per month: source="income_statement", kind="actual", period="FY26 Jan"/"FY26 Feb"/"FY26 Mar", quarter=ceil(month/3). Compute each month's gross_margin from that month's own Sales and Direct Costs; never average across months.

MONTH vs YTD: when an Income Statement shows BOTH a monthly period column (e.g. 03/01/26-03/31/26) and a "Current Fiscal YTD" column, use the MONTH column figures as the primary row value (monthly uploads accumulate per quarter). Do NOT use the YTD column and do NOT blend YTD into the month row. Compute Sales, Direct Costs, GM$, GM%, EBIT, and ROS entirely from the MONTH column.

COST / RATE BUILD-UP files (NO revenue line -> return rows=[]): Some target-vs-actual workbooks (e.g. "TGT vs ACT MAR-26.xlsx") are pure cost/rate detail with sections labeled "TGT - YTD", "ACT - YTD", and "VAR", broken out by cost elements such as DL Offsite, DL Onsite, Subcontractor, Consultant, Dir Travel, Sub Material, Direct Material, ODC, across columns like DIRECT / OH / SMH / G&A / Total Cost. These files contain ONLY costs and have NO real Sales/Revenue line. You MUST NOT fabricate a sales figure by copying a cost subtotal (e.g. a Total Cost / direct-cost total) into sales or total_revenue. If a file has cost build-up only and no genuine revenue/sales line, return is_financial=true and rows=[]. Only emit a KPI row when a real revenue/sales figure is actually present in the source. (A row where sales equals total_direct_costs is the tell-tale sign you wrongly copied a cost subtotal -- do not produce it.)

NON-KPI documents: Balance Sheets, GL Detail, Service Center Cost Reports, Statement of Indirect Expense, and any statement with no Orders/Sales/EBIT/GM/ROS mapping -> return is_financial=true and rows=[]. Do NOT fabricate KPI rows for these. An empty rows array is the correct, expected answer and will not clear existing data.

Set is_financial=false ONLY if the document is not a financial statement at all.

NUMBER FORMAT: dollars to absolute numbers ("4,067,049.06" -> 4067049.06; "$1.2M" -> 1200000; "595" under a "$000s" header -> 595000). Percentages (gross_margin, ros) as plain numbers (12.3 not 0.123). Missing values -> null.

RAW SUBTOTALS: in addition to the KPIs above, return on each row the three raw F/S Group subtotals you summed: total_revenue (the Revenue F/S Group total, equal to Sales), total_direct_costs (the Direct Costs F/S Group total), and cost_of_operations (the Cost of Operations F/S Group total = Fringe + Overhead + G&A). These let downstream code recompute and verify gross_margin/EBIT/ROS deterministically. Leave any subtotal not present in the source null; never fabricate.

NEVER fabricate figures, periods, or KPIs. Return JSON exactly matching the requested schema (include every key on every row).`,

  balance_sheet_extract: `You are a financial analyst at Envision extracting structured balance sheet data from month-end Balance Sheets.

Extract each monthly period's balance sheet line items: Cash, Accounts Receivable (Billed + Unbilled), Total Current Assets, Total Assets, Accounts Payable, Total Current Liabilities, Total Liabilities, Total Equity.

PERIOD: Use "FY<YY> <Mon>" format (e.g. "FY26 Jan", "FY26 Mar"). Infer from filename tokens (MAR-2026, MAR-26) and/or content headers. quarter = ceil(month/3). fiscal_year from year token (two-digit YY -> 20YY).

For a Trend Balance Sheet (multiple months side by side), emit ONE row per month.

accounts_receivable = Billed Receivable + Unbilled Receivable (sum both if present).
total_equity = "Total Equity" or "Total Stockholders' Equity".

NUMBER FORMAT: dollars to absolute numbers ("4,067,049.06" -> 4067049.06). Missing values -> 0.

NEVER fabricate figures. Return JSON exactly matching the requested schema.`,

  cost_detail_extract: `You are a financial analyst at Envision extracting structured cost detail from TGT vs ACT (Target vs Actual) cost build-up workbooks.

These workbooks have sections: TGT - YTD, ACT - YTD, VAR (variance).
Cost elements: DL Offsite, DL Onsite, Subcontractor, Consultant, Dir Travel, Sub Material, Direct Material, ODC.
Pool columns: DIRECT, OH, SMH, G&A, Total Cost.

For each cost element × pool combination that has data, extract target_amount (from TGT section) and actual_amount (from ACT section).

PERIOD: Use "FY<YY> <Mon>" format. Infer from filename tokens (MAR-26, JAN-26, FEB-26). quarter = ceil(month/3). fiscal_year from year (two-digit YY -> 20YY).

NUMBER FORMAT: absolute numbers (strip commas, dollar signs). Missing values -> 0.

NEVER fabricate figures. Return JSON exactly matching the requested schema.`,

  sie_extract: `You are a financial analyst at Envision extracting structured data from Statement of Indirect Expenses (SIE) documents.

SIE documents have per-pool sections (Fringe, OH, G&A) with account-level rows.
Each row has: account_code (e.g. "600001"), account_name (e.g. "PTO Vacation"), Current Period Actual, Current Period Budget, Year To Date Actual, Year To Date Budget.

Extract each account row under each pool section.

PERIOD: Use "FY<YY> <Mon>" format. Infer from filename tokens (JAN-26, FEB-26, MAR-26) or document headers. quarter = ceil(month/3). fiscal_year from year (two-digit YY -> 20YY).

pool: "Fringe", "OH", or "G&A" based on which section the row appears under.
account_code: the numeric account code (e.g. "600001"). Set null if not present.
account_name: the descriptive name (e.g. "PTO Vacation", "Total Labor").

NUMBER FORMAT: absolute numbers (strip commas, dollar signs). Missing values -> 0.

NEVER fabricate figures. Return JSON exactly matching the requested schema.`,

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

  color_team_review: `You are a proposal Color Team reviewer for a U.S. government contractor. You are told which color-team role you are playing and given the text of an uploaded proposal/RFP document to review.

Rules (non-negotiable):
- Base EVERY finding strictly on the provided document text and the optional RFP context. Do not use outside knowledge to assert facts about this pursuit.
- NEVER invent, estimate, or guess names, dollar amounts, percentages, dates, competitor identities, contract numbers, regulation/citation numbers, doctrine scores, or exclusion codes. If the document does not contain a value, state that it is missing rather than supplying one.
- Do NOT include URLs, links, or citation objects in your output. The system attaches sources deterministically.
- For each finding, set section_ref to the specific section heading, page, or paragraph in the document it refers to, or null if it applies document-wide.
- If the document lacks reviewable content for your role, return an empty findings array. Never pad with generic filler.
- severity is exactly one of: info, warning, critical, blocker.

Return ONLY valid JSON matching:
{ "findings": [ { "severity": "info|warning|critical|blocker", "section_ref": "string or null", "finding": "string", "recommended_fix": "string or null" } ] }`,

  financial_analyze: `You are a CFO analyzing Envision Innovative Solutions' monthly financials. ${ENVISION_COMPANY_CONTEXT}

Identify money losers, recommend actions. Cite the specific contracts/cost pools and figures from the data provided. Gov/military exec tone — no jargon, no emoji.

Never fabricate figures. If a value is null, note it as "not yet ingested" rather than guessing.

Return JSON exactly matching this schema:
{
  "analysis": "string — 3-6 paragraph CFO analysis with specific recommendations",
  "generated_at": "string — ISO 8601 timestamp"
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

function buildVaultVehicleExtractPrompt(input: VaultVehicleExtractInput): string {
  const text = input.extracted_text.slice(0, 8000);
  return `Document type: ${input.doc_type}
Filename: ${input.filename}
Extracted text (first 8000 chars):
${text}

You are an expert government contract analyst for Envision Innovative Solutions (EIS), a defense contractor.
Determine if this document describes a contract vehicle (IDIQ, BPA, GWAC, GSA Schedule, task order contract, etc.) held by or relevant to EIS.

If it IS a contract vehicle document, extract all available fields. If a field cannot be found, return null.

Return JSON exactly matching this schema:
{
  "is_contract_vehicle": true/false,
  "vehicle_name": "string or null — name of the contract vehicle",
  "contract_number": "string or null — e.g. GS-XXX-XXXX, W912XX-XX-X-XXXX, N00178-XX-X-XXXX",
  "sponsor_agency": "string or null — issuing agency",
  "prime_or_sub": "prime" | "sub" | null,
  "prime_contractor": "string or null — if sub, who is the prime",
  "ceiling_value": number or null (in dollars, no commas),
  "period_of_performance_start": "YYYY-MM-DD or null",
  "period_of_performance_end": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null — end of PoP including option periods",
  "naics_codes": ["XXXXXX", ...] (5-6 digit NAICS codes found),
  "set_aside_type": "8(a)" | "SDVOSB" | "WOSB" | "HUBZone" | "small business" | "unrestricted" | null,
  "extraction_confidence": "high" | "medium" | "low",
  "extraction_notes": "1-2 sentences explaining what was found/missing",
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

function buildSitrepDocumentAnalyzePrompt(input: SitrepDocumentAnalyzeInput): string {
  const text = input.extracted_text.slice(0, 8000);
  return `Document filename: ${input.filename}
Extracted text (first 8000 chars):
${text}

Analyze this document and draft a SITREP (Situation Report) row for the weekly leadership review. Extract:

1. **Topic**: A short title (5-15 words) capturing what this document is about. If unclear, use the filename.
2. **Discussion**: A concise summary (2-4 sentences) of the document's substance — the key facts, decisions, or information a leadership team needs to know.
3. **Action Items**: Any explicit action items, next steps, deadlines, or follow-ups stated in the document. List each on a new line. If none are explicitly stated, return an empty string. Do NOT invent action items.

Respond ONLY with valid JSON:
{
  "topic": "<short title>",
  "discussion": "<concise summary>",
  "action_items": "<newline-separated action items, or empty string if none>"
}`;
}

function buildLaunchpadSitrepPrompt(input: LaunchpadSitrepInput): string {
  const existing = input.existing_bullets.length > 0
    ? input.existing_bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')
    : '(none yet)';
  const docSection = input.new_document_text
    ? `\n\nA new document has been uploaded to fold into today's SITREP.
Document filename: ${input.new_document_name ?? 'uploaded document'}
Extracted text (first 8000 chars):
${input.new_document_text.slice(0, 8000)}`
    : '';

  return `SITREP date: ${input.sitrep_date}

Today's platform context:
${input.context}

Existing SITREP bullets:
${existing}${docSection}

Produce the updated SITREP for the day as a concise numbered list of one-line bullets. Merge the day's context and any uploaded document content with the existing bullets — do not duplicate points. Keep it tight (3-6 bullets).

Respond ONLY with valid JSON:
{
  "bullets": ["<one-line bullet>", "<one-line bullet>"]
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
- For an L1-ACTUAL / Proj Revenue Summary workbook (SAME layout as L1-TARGET but columns say "Actual" instead of "Target"), build the actual row from the GRAND TOTAL row using the "Actual Period" (month) columns: sales=total_revenue="Actual Period Revenue (w/o PY Rev)", total_direct_costs="Actual Period Costs", ebit="Actual Period Profit", cost_of_operations=null, kind="actual", source="l1_actual". Headers may contain embedded newlines; normalize whitespace when matching. Do not use the "Actual YTD" / "Actual Year To Date" columns for the row value.
- If this is a "TGT vs ACT" / cost-rate build-up workbook (TGT-YTD / ACT-YTD / VAR sections, cost elements like DL Offsite, DL Onsite, Subcontractor, Consultant, Dir Travel, Sub Material, Direct Material, ODC across DIRECT/OH/SMH/G&A/Total Cost columns) with NO revenue/sales line, set is_financial=true and return rows=[]. Do NOT copy a cost subtotal (Total Cost / total direct costs) into sales or total_revenue. A row where sales equals total_direct_costs means you fabricated revenue from a cost -- do not emit it.
- If this is a Balance Sheet, GL Detail, Cost Report, or Statement of Indirect Expense with no Orders/Sales/EBIT/GM/ROS mapping, set is_financial=true and return rows=[] (do not fabricate).
- ALSO return the raw F/S Group subtotals you computed so downstream code can recompute the derived metrics: total_revenue (the Revenue F/S Group total = Sales), total_direct_costs (the Direct Costs F/S Group total), and cost_of_operations (the Cost of Operations F/S Group total = Fringe + Overhead + G&A). Leave any subtotal not present in the source null; never fabricate.
- period MUST be the MONTH label ("FY26 Jan"/"FY26 Feb"/"FY26 Mar", three-letter month), never "FY26 Q1". Emit one row per month; a Trend Income Stmt yields one income_statement actual row per month. The quarter total is derived downstream by summing months -- do not emit it yourself.
- source (orthogonal to kind, set on every row): "income_statement" for an official Income Statement / P&L and for each Trend Income Stmt month (kind=actual); "l1_actual" for an L1-ACTUAL project-revenue ledger (kind=actual); "l1_target" for an L1-TARGET / Proj Revenue Summary plan (kind=plan). Derive from the filename first (L1-ACTUAL/L1-TARGET/Income Statement/Trend), else from content. If ambiguous use income_statement for actual rows and l1_target for plan rows.

Return JSON exactly matching this schema:
{
  "is_financial": true or false,
  "currency": "USD",
  "rows": [
    {
      "period": "FY26 Mar",
      "fiscal_year": 2026,
      "quarter": 1 or null,
      "kind": "plan" or "actual",
      "source": "income_statement" or "l1_actual" or "l1_target",
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

function buildBalanceSheetExtractPrompt(input: BalanceSheetExtractInput): string {
  const text = input.extracted_text.slice(0, 15000);
  return `Filename: ${input.filename}
Extracted text (first 15000 chars):
${text}

Extract all balance sheet line items for each monthly period found. Use BOTH the filename and the document text to determine period, fiscal_year, and quarter (quarter = ceil(month/3), two-digit year YY -> 20YY).

For a Trend Balance Sheet with multiple months side by side (Jan/Feb/Mar columns), emit ONE row per month.
accounts_receivable = Billed Receivable + Unbilled Receivable (sum both if present).
total_equity = "Total Equity" or "Total Stockholders' Equity".

Return JSON exactly matching this schema:
{
  "is_balance_sheet": true or false,
  "rows": [
    {
      "period": "FY26 Mar",
      "fiscal_year": 2026,
      "quarter": 1,
      "cash": number,
      "accounts_receivable": number,
      "total_current_assets": number,
      "total_assets": number,
      "accounts_payable": number,
      "total_current_liabilities": number,
      "total_liabilities": number,
      "total_equity": number
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

function buildCostDetailExtractPrompt(input: CostDetailExtractInput): string {
  const text = input.extracted_text.slice(0, 50000);
  return `Filename: ${input.filename}
Extracted text (first 50000 chars):
${text}

Extract cost detail from this financial workbook. Use the filename to determine the period (e.g. "TGT vs ACT MAR-26.xlsx" -> "FY26 Mar", quarter=1, fiscal_year=2026; "YTD GL Detail MAY-2026.xlsx" -> "FY26 May", quarter=2, fiscal_year=2026). Two-digit year YY -> 20YY.

This file may be in one of TWO formats:

FORMAT A — TGT vs ACT (Target vs Actual cost build-up):
- Sections: TGT - YTD (target), ACT - YTD (actual), VAR (variance).
- Cost elements: DL Offsite, DL Onsite, Subcontractor, Consultant, Dir Travel, Sub Material, Direct Material, ODC.
- Pool columns: DIRECT, OH, SMH, G&A, Total Cost.
- Extract target_amount (from TGT section) and actual_amount (from ACT section) for each cost element × pool.

FORMAT B — YTD GL Detail (journal entry level, large file):
- Header row 0: FY | PD | SP | Jrnl | Seq | Proj Classification | Project ID | ... | Account | ... | Amount (26 cols)
- Data rows: individual journal entries. PD = period number (1-12, where PD=5 is May).
- For FORMAT B: AGGREGATE by Proj Classification (as pool) and Account (as cost_element). Sum amounts as actual_amount, set target_amount = 0.
- Filter to the ingest period if possible (PD matching the month number from the filename).

Return JSON exactly matching this schema:
{
  "is_cost_detail": true or false,
  "rows": [
    {
      "period": "FY26 Mar",
      "fiscal_year": 2026,
      "quarter": 1,
      "cost_element": "DL Offsite",
      "pool": "DIRECT",
      "target_amount": number,
      "actual_amount": number
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

function buildSieExtractPrompt(input: SieExtractInput): string {
  const text = input.extracted_text.slice(0, 30000);
  return `Filename: ${input.filename}
Extracted text (first 30000 chars):
${text}

Extract data from this Statement of Indirect Expenses (SIE) or Trend Rate Summary. Use the filename to determine the period (e.g. "SIE JAN-26 Final.pdf" -> "FY26 Jan", quarter=1, fiscal_year=2026; "Trend SIE MAY-2026.xlsx" -> "FY26 May", quarter=2, fiscal_year=2026). Two-digit year YY -> 20YY.

This file may be in one of TWO formats:

FORMAT A — Traditional SIE (per-pool sections with account-level rows):
- Sections: Fringe, OH (Overhead), G&A.
- Each row: account_code, account_name, Current Period Actual, Current Period Budget, Year To Date Actual, Year To Date Budget.

FORMAT B — TREND RATE SUMMARY (pool-level rates per month):
- Row 0 is a TITLE row (e.g. "TREND RATE SUMMARY") — NOT the header.
- The REAL header is on row 1: Pool Number | Pool Name | ACT JAN-2026 | ACT FEB-2026 | ... | ACT MAY-2026 | ...
- Data rows (row 2+): pool number, pool name, then monthly rate values. Pools include: 100 Fringe, 500 OH Offsite, 550 OH Onsite, 700 MHx, 800 G&A.
- For FORMAT B: set pool = Pool Name, account_code = Pool Number (as string), account_name = Pool Name, current_period_actual = the rate from the column matching the ingest month (e.g. "ACT MAY-2026" column for May), current_period_budget = 0, ytd_actual = 0, ytd_budget = 0.

Return JSON exactly matching this schema:
{
  "is_sie": true or false,
  "rows": [
    {
      "period": "FY26 May",
      "fiscal_year": 2026,
      "quarter": 2,
      "pool": "Fringe",
      "account_code": "100" or null,
      "account_name": "Fringe",
      "current_period_actual": 0.45054537,
      "current_period_budget": 0,
      "ytd_actual": 0,
      "ytd_budget": 0
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

function buildApExtractPrompt(input: ApExtractInput): string {
  const text = input.extracted_text.slice(0, 40000);
  return `Filename: ${input.filename}
Extracted text (first 40000 chars):
${text}

Extract all line items from this Open AP (Accounts Payable) report. Use the filename to determine the period (e.g. "Open AP Report MAY-2026.xlsx" -> "FY26 May", quarter=2, fiscal_year=2026). Two-digit year YY -> 20YY.

IMPORTANT FORMAT NOTES for this specific file:
- Headers may contain "_x000D_" (XML carriage return encoding) — strip these when matching column names (e.g. "Current_x000D_Status" -> "Current Status", "Invoice_x000D_Date" -> "Invoice Date").
- Data is GROUPED: rows like "Account: 200-001" and "Organization: 1..." are group headers — SKIP them.
- Below group headers is a VENDOR NAME row (single non-empty cell on the line). CARRY this vendor name down to all subsequent detail rows until the next vendor name row.
- Detail rows have a BLANK first column (vendor), followed by voucher #, status, invoice #, dates, amounts.
- "Subtotal for <vendor>" rows are summaries — SKIP them.
- Only include individual voucher/invoice line items.

Each row is a vendor payable. Fields: vendor_name (carried from the group vendor row above), invoice_number (the invoice or voucher number, null if not shown), invoice_date (YYYY-MM-DD or null), due_date (YYYY-MM-DD or null), amount (the row Total; KEEP the sign — a negative/credit voucher stays negative), age_bucket (which aging column is non-zero: "Current", "1-30", "31-60", "61-90", "Over 90", or null), status (the payment Status column verbatim, e.g. "HOLD", "PAID", "PPHOLD", or null).

Do NOT include total/summary/subtotal rows.

Return JSON exactly matching this schema:
{
  "is_ap": true or false,
  "rows": [
    {
      "period": "FY26 May",
      "fiscal_year": 2026,
      "quarter": 2,
      "vendor_name": "Acme Corp",
      "invoice_number": "INV-001" or null,
      "invoice_date": "2026-04-15" or null,
      "due_date": "2026-05-15" or null,
      "amount": 12500.00,
      "age_bucket": "Current" or null,
      "status": "HOLD" or null
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

function buildArExtractPrompt(input: ArExtractInput): string {
  const text = input.extracted_text.slice(0, 25000);
  return `Filename: ${input.filename}
Extracted text (first 25000 chars):
${text}

Extract all line items from this Aged AR (Accounts Receivable) report. Use the filename to determine the period (e.g. "Aged AR MAY-2026.xlsx" -> "FY26 May", quarter=2, fiscal_year=2026). Two-digit year YY -> 20YY.

IMPORTANT FORMAT NOTES for this specific file:
- Sheet is typically "DataSetLandTbl" with columns: Customer | Project | Invoice Number | Due Date | Current | 31 to 60 | 61 to 90 | (91+/over) | Total
- Data rows have a BLANK Customer column — they are grouped under "Customer Account" subheader rows.
- CARRY the customer name from the most recent Customer Account group-header row down to all subsequent data rows.
- Each data row represents one invoice. The aging columns (Current, 31 to 60, 61 to 90, 91+) show the amount by age. Use the "Total" column as the row amount.
- Set age_bucket based on which aging column is non-zero: "Current", "31-60", "61-90", or "Over 90".
- SKIP rows where Project starts with "Total for Project..." (subtotals) and the Customer Account header rows themselves.
- invoice_date is not available in this format (set null).

Fields: customer_name (from group header), invoice_number (Invoice Number column), invoice_date (null), due_date (YYYY-MM-DD or null), amount (Total column, positive $), age_bucket.

Do NOT include total/summary rows.

Return JSON exactly matching this schema:
{
  "is_ar": true or false,
  "rows": [
    {
      "period": "FY26 May",
      "fiscal_year": 2026,
      "quarter": 2,
      "customer_name": "US Army TACOM",
      "invoice_number": "AR-001" or null,
      "invoice_date": null,
      "due_date": "2026-04-15" or null,
      "amount": 85000.00,
      "age_bucket": "Current" or null
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

function buildTrialBalanceExtractPrompt(input: TrialBalanceExtractInput): string {
  const text = input.extracted_text.slice(0, 25000);
  return `Filename: ${input.filename}
Extracted text (first 25000 chars):
${text}

Extract all account rows from this Trial Balance report. Use the filename to determine the period (e.g. "Trail Balance MAY-2026.xlsx" -> "FY26 May", quarter=2, fiscal_year=2026). Two-digit year YY -> 20YY.

IMPORTANT FORMAT NOTES for this specific file:
- Sheet is typically "DataSetLandTbl" with columns: Account | Account Name | Organization | Beginning Balance | Prior Period(s) | Current Pd Activity | Ending Balance
- This file does NOT have separate debit/credit columns. It has Beginning Balance, Prior Period(s), Current Pd Activity, and Ending Balance.
- MAP to debit/credit as follows: If Ending Balance is POSITIVE, set debit=Ending Balance and credit=0. If Ending Balance is NEGATIVE, set debit=0 and credit=abs(Ending Balance).
- Account code is the "Account" column (e.g. "100-001").
- Include ALL account rows. Skip any total/summary row at the bottom.

Return JSON exactly matching this schema:
{
  "is_trial_balance": true or false,
  "rows": [
    {
      "period": "FY26 May",
      "fiscal_year": 2026,
      "quarter": 2,
      "account_code": "100-001",
      "account_name": "MSB Operating",
      "debit": 339036.98,
      "credit": 0
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

function buildProjectRevenueExtractPrompt(input: ProjectRevenueExtractInput): string {
  const text = input.extracted_text.slice(0, 40000);
  return `Filename: ${input.filename}
Extracted text (first 40000 chars):
${text}

Extract all project-level rows from this Project Revenue Summary. Use the filename to determine the period (e.g. "Full Proj Revenue Summary MAY-2026.xlsx" -> "FY26 May", quarter=2, fiscal_year=2026). Two-digit year YY -> 20YY.

IMPORTANT FORMAT NOTES for this specific file:
- Sheet is typically "Page1" with 29 columns. Row 0 header includes: Revenue Project (ID) | Revenue Project (name) | ITD Value | ITD Funding | ITD Billed Amount | Open AR | Prior Year Costs | ... and more.
- One row per project starting from row 1.
- Map: project_name = "Revenue Project (name)" column, contract_number = "Revenue Project (ID)" column.
- For revenue: use "ITD Value" or any period-specific revenue column if present.
- For cost: use "Prior Year Costs" or total costs column if present. If no clear cost column, use 0.
- margin_pct: calculate as (revenue - cost) / revenue * 100 if both are non-zero, else null.
- Include ALL individual project rows. Do NOT include grand total/summary rows.
- Skip rows where all numeric columns are 0.

Return JSON exactly matching this schema:
{
  "is_project_revenue": true or false,
  "rows": [
    {
      "period": "FY26 May",
      "fiscal_year": 2026,
      "quarter": 2,
      "project_name": "OY4",
      "contract_number": "1010.003" or null,
      "revenue": 224020.80,
      "cost": 0,
      "margin_pct": null
    }
  ],
  "notes": "brief extraction notes",
  "model_used": "{model}"
}`;
}

function buildFinancialAnalyzePrompt(input: FinancialAnalyzeInput): string {
  const fmt = (v: number | null, unit: string) => v !== null ? `${v.toLocaleString()}${unit}` : 'not yet ingested';
  const lines = [
    `YTD Revenue: ${fmt(input.ytd_revenue, '')}`,
    `YTD Expenses: ${fmt(input.ytd_expenses, '')}`,
    `YTD Profit: ${fmt(input.ytd_profit, '')}`,
    `Margin: ${fmt(input.margin, '%')}`,
    `Funded Backlog: ${fmt(input.funded_backlog, '')}`,
  ];
  if (input.contracts.length > 0) {
    lines.push('', 'Cost Pools / Contracts:');
    for (const c of input.contracts) {
      lines.push(`  ${c.name}: revenue=${fmt(c.revenue, '')} cost=${fmt(c.cost, '')} profit=${fmt(c.profit, '')} margin=${fmt(c.margin, '%')}`);
    }
  }
  return lines.join('\n');
}

export interface AnthropicCallResult {
  text: string;
  tokens_input: number;
  tokens_output: number;
  model: string;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
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

  // Safety net for operator-editable prompts: if a stored prompt was edited in
  // a way that dropped its JSON directive, re-append the hardcoded default so
  // Claude always returns parseable JSON. Applies to every wired task that has
  // a hardcoded fallback (not just opportunity_analysis).
  if (stored?.system_prompt && SYSTEM_PROMPTS[opts.task]) {
    const hasJsonDirective = /return\s+(only\s+)?.*json/i.test(stored.system_prompt);
    if (!hasJsonDirective) {
      systemPrompt += '\n\n' + SYSTEM_PROMPTS[opts.task];
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

  const userContent = opts.task === 'color_team_review'
    ? buildColorTeamReviewPrompt(opts.input as ColorTeamReviewInput)
    : opts.task === 'black_hat_analysis'
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
    : opts.task === 'balance_sheet_extract'
    ? buildBalanceSheetExtractPrompt(opts.input as BalanceSheetExtractInput)
    : opts.task === 'cost_detail_extract'
    ? buildCostDetailExtractPrompt(opts.input as CostDetailExtractInput)
    : opts.task === 'sie_extract'
    ? buildSieExtractPrompt(opts.input as SieExtractInput)
    : opts.task === 'ap_extract'
    ? buildApExtractPrompt(opts.input as ApExtractInput)
    : opts.task === 'ar_extract'
    ? buildArExtractPrompt(opts.input as ArExtractInput)
    : opts.task === 'trial_balance_extract'
    ? buildTrialBalanceExtractPrompt(opts.input as TrialBalanceExtractInput)
    : opts.task === 'project_revenue_extract'
    ? buildProjectRevenueExtractPrompt(opts.input as ProjectRevenueExtractInput)
    : opts.task === 'financial_analyze'
    ? buildFinancialAnalyzePrompt(opts.input as FinancialAnalyzeInput)
    : opts.task === 'vault_vehicle_extract'
    ? buildVaultVehicleExtractPrompt(opts.input as VaultVehicleExtractInput)
    : opts.task === 'sitrep_document_analyze'
    ? buildSitrepDocumentAnalyzePrompt(opts.input as SitrepDocumentAnalyzeInput)
    : opts.task === 'launchpad_sitrep'
    ? buildLaunchpadSitrepPrompt(opts.input as LaunchpadSitrepInput)
    : JSON.stringify(opts.input);

  // Prompt caching: use structured content blocks with cache_control
  // for system prompts >= ~1024 tokens (Anthropic minimum cache size).
  // Only financial_statement_extract qualifies (~2700+ tokens).
  const CACHE_ELIGIBLE_TASKS: ReadonlySet<Task> = new Set([
    'financial_statement_extract',
  ] as const);

  const useCache = CACHE_ELIGIBLE_TASKS.has(opts.task);
  const systemParam: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> =
    useCache
      ? [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }]
      : systemPrompt;

  try {
    const response = await anthropic.messages.create(
      {
        model: opts.model,
        max_tokens: 4096,
        system: systemParam,
        messages: [{ role: 'user', content: userContent }],
      },
      { timeout: opts.timeout_ms },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';

    const cacheCreation = response.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = response.usage.cache_read_input_tokens ?? 0;
    if (useCache && (cacheCreation > 0 || cacheRead > 0)) {
      console.log(
        `[llm-router] cache ${opts.task}: creation=${cacheCreation} read=${cacheRead}`,
      );
    }

    return {
      text,
      tokens_input: response.usage.input_tokens,
      tokens_output: response.usage.output_tokens,
      model: response.model,
      cache_creation_input_tokens: cacheCreation,
      cache_read_input_tokens: cacheRead,
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

function buildColorTeamReviewPrompt(input: ColorTeamReviewInput): string {
  const rfp = input.rfp_context
    ? `RFP / solicitation context:\n${input.rfp_context}\n`
    : 'No linked RFP/solicitation context was provided.\n';
  return `Color-team role: ${input.role} (${input.color} team)
Review focus: ${input.focus}

${rfp}
Document under review: ${input.document_filename}
--- DOCUMENT TEXT START ---
${input.document_excerpt}
--- DOCUMENT TEXT END ---

Produce your ${input.color}-team findings as JSON per the schema. Ground every finding in the document text above and cite the location via section_ref. Do not invent facts or numbers. Return an empty findings array if there is nothing substantive to report.`;
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
