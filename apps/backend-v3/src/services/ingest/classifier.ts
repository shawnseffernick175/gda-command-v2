/**
 * Document classifier — F-304.
 *
 * Classifies ingested text into surface + entity_type using keyword heuristics
 * with optional LLM upgrade for ambiguous cases.
 * Consults RAG (F-301) for similar past docs when confidence is low.
 * Doctrine-routed: docs flagged as OU1/OU2 are tagged read-only "teaming context".
 */

import { llmRouter } from '../../lib/llm-router.js';
import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';

export interface ClassificationResult {
  surface: string;
  entity_type: string;
  confidence: number;
  rationale: string;
  doctrine_flag: string | null;
  evidence_grade: string | null;
  owner: string;
}

interface KeywordRule {
  surface: string;
  entity_type: string;
  keywords: RegExp[];
  weight: number;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    surface: 'opportunities',
    entity_type: 'opportunity',
    keywords: [
      /\b(RFP|RFI|RFQ|solicitation|notice\s+id|SAM\.gov|sources?\s+sought)\b/i,
      /\b(synopsis|presolicitation|combined\s+synopsis|amendment\s+of\s+solicitation)\b/i,
      /\b(NAICS\s*\d{6}|NAICS\s+code|set-aside|full\s+and\s+open)\b/i,
      /\b(proposal\s+due|response\s+deadline|closing\s+date|proposals?\s+due)\b/i,
    ],
    weight: 0.90,
  },
  {
    surface: 'capture',
    entity_type: 'capture_doc',
    keywords: [
      /\b(capture\s+plan|win\s+theme|discriminator|bid\s+price|cost\s+volume|technical\s+volume)\b/i,
      /\b(compliance\s+matrix|section\s+[LMKBCDE]|evaluation\s+criteria|bid.no.bid)\b/i,
      /\b(orals|past\s+performance\s+volume|management\s+volume|proposal\s+outline)\b/i,
      /\b(pricing\s+model|labor\s+rates?|wrap\s+rate|BOE|basis\s+of\s+estimate)\b/i,
    ],
    weight: 0.88,
  },
  {
    surface: 'partner_intel',
    entity_type: 'partner_doc',
    keywords: [
      /\b(teaming\s+agreement|teaming\s+arrangement|subcontract(?:or)?|mentor.?protege)\b/i,
      /\b(Riverstone|PD\s+Systems|HUBZone|WOSB|joint\s+venture)\b/i,
      /\b(SDB|Small\s+Disadvantaged|teaming\s+partner|capability\s+statement)\b/i,
    ],
    weight: 0.85,
  },
  {
    surface: 'action_items',
    entity_type: 'action_item',
    keywords: [
      /\b(action\s+items?|task\s*:|to-?do|deadline|assigned\s+to|due\s+date)\b/i,
      /\b(follow\s*-?\s*up|action\s+required|pending\s+action)\b/i,
    ],
    weight: 0.82,
  },
  {
    surface: 'regulatory',
    entity_type: 'regulatory_notice',
    keywords: [
      /\b(FAR\s+\d|FAR\s+52|DFARS\s+\d|DFARS\s+252)\b/i,
      /\b(NDAA|executive\s+order|EO\s+\d{4,5})\b/i,
      /\b(NIST\s+SP|CMMC|CFR\s+Title|USC\s+§)\b/i,
      /\b(Federal\s+Register|final\s+rule|interim\s+rule|proposed\s+rule)\b/i,
    ],
    weight: 0.88,
  },
  {
    surface: 'digest',
    entity_type: 'news_item',
    keywords: [
      /\b(news|press\s+release|announcement|briefing|article|report)\b/i,
      /\b(published|released|breaking|update|advisory)\b/i,
    ],
    weight: 0.65,
  },
  {
    surface: 'financials',
    entity_type: 'financial_doc',
    keywords: [
      /\b(P&L|income\s+statement|balance\s+sheet|budget|forecast|revenue)\b/i,
      /\b(cost\s+detail|SIE|accounts\s+payable|accounts\s+receivable|AP\s+aging)\b/i,
      /\b(trial\s+balance|general\s+ledger|GL\s+detail|financial\s+statement)\b/i,
      /\b(EBITDA|gross\s+margin|operating\s+expenses?|indirect\s+cost)\b/i,
    ],
    weight: 0.90,
  },
  {
    surface: 'vault',
    entity_type: 'cpar',
    keywords: [
      /\b(CPAR|contractor\s+performance|past\s+performance\s+assessment)\b/i,
      /\b(CPARS|performance\s+evaluation|quality\s+rating)\b/i,
    ],
    weight: 0.80,
  },
  {
    surface: 'vehicles',
    entity_type: 'vehicle_doc',
    keywords: [
      /\b(IDIQ|BPA|GWAC|task\s+order|vehicle|GSA\s+schedule|GSA\s+MAS|OASIS)\b/i,
      /\b(SeaPort|RS3|CIO-SP|ceiling|contract\s+number)\b/i,
    ],
    weight: 0.75,
  },
  {
    surface: 'vault',
    entity_type: 'doctrine_doc',
    keywords: [
      /\b(doctrine|principle|strategic\s+plan|operating\s+plan|governance)\b/i,
      /\b(mission|vision|values|organizational\s+structure)\b/i,
    ],
    weight: 0.60,
  },
];

const VALID_SURFACES = new Set([
  'opportunities', 'pipeline', 'capture', 'partner_intel', 'action_items',
  'daily_news', 'sentinel', 'vault', 'financials', 'regulatory',
  'fastrac', 'vehicles', 'digest', 'inbox',
]);

const OU_PATTERNS = [
  { pattern: /\b(OU-?II|Riverstone|RSI|Intelligence\s+&\s+Cyber)\b/i, flag: 'OU2' },
  { pattern: /\b(OU-?III|PD\s+Systems|TBF\s+Group|Training.*Simulation)\b/i, flag: 'OU3' },
];

// Operational receivables/payables reports are financial DATA but NOT part of
// the Financial Bible (P&L). They are ingested into ap/ar tables by the
// financial reingest path, but must never be routed to the financials surface,
// so they are matched by filename here and steered away from the Bible.
const OPERATIONAL_FINANCE_PATTERNS: RegExp[] = [
  /\baged\s*a\/?r\b/i,
  /\bopen\s*a\/?p\b/i,
  /\ba\/?r\s+(report|aging)\b/i,
  /\ba\/?p\s+(report|aging)\b/i,
  /accounts?\s+(receivable|payable)\s+(aging|report)/i,
];

// Financial statement signatures that belong in the Financial Bible. Matched on
// the filename (fast, unambiguous) or, failing that, on a peek of the extracted
// text. Kept high-confidence so a single-keyword match never falls through to
// the LLM upgrade, which previously mis-routed June statements to Inbox.
const FINANCIAL_STATEMENT_NAME_PATTERNS: RegExp[] = [
  /\bgl\s+detail\b/i,
  /\bgeneral\s+ledger\b/i,
  /\btrended?\s+income\s+statement\b/i,
  /\bincome\s+statement\b/i,
  /\btrial\s+balance\b/i,
  /\bbalance\s+sheet\b/i,
  /\brevenue\s+summary\b/i,
  /\bcost\s+pool\b/i,
  /\btrend\s+sie\b/i,
  /\bsie\b/i,
  /\bp&l\b/i,
  /\bprofit\s+and\s+loss\b/i,
  /\bstatement\s+of\s+(income|operations|indirect)\b/i,
];

const FINANCIAL_STATEMENT_CONTENT_PATTERNS: RegExp[] = [
  /DataSetLandTbl/i,
  /\bGrand\s+Total\b/i,
  /\bDirect\s+Labor\b/i,
  /\bSubcontractor\b/i,
  /\bODC\b/,
  /\bcost\s+pool\b/i,
];

/** True when the filename names an operational A/R or A/P report (not the Bible). */
function isOperationalFinance(filename: string): boolean {
  return OPERATIONAL_FINANCE_PATTERNS.some((p) => p.test(filename));
}

/**
 * Explainable, CONTENT-FIRST financial classifier (Pillar 1).
 *
 * WHY THIS EXISTS: routing financial docs by filename alone is fragile — a
 * renamed income statement, or an operational A/R export saved under a generic
 * name, would land in the wrong place (or the Financial Bible). This classifier
 * reads the extracted text's structural fingerprints and decides a `doc_kind`,
 * recording every signal it matched so the verdict is auditable. The filename is
 * only a WEAK tiebreaker applied after content, never the primary signal.
 *
 * `entity_type` is the coarse surface bucket:
 *   - 'operational_finance' → Aged A/R or Open A/P. Financial DATA, but NEVER the
 *     Bible; it has its own surface.
 *   - 'financial_statement' → belongs in the Financial Bible (P&L / IS / BS / TB
 *     / GL / cost-pool revenue).
 *   - 'not_financial' → e.g. a supplier list that merely mentions dollars.
 */
export type FinancialDocKind =
  | 'gl_detail'
  | 'trended_income_statement'
  | 'income_statement'
  | 'l1_l2_pnl'
  | 'trial_balance'
  | 'trended_balance_sheet'
  | 'balance_sheet'
  | 'revenue_summary_cost_pool'
  | 'aged_ar'
  | 'open_ap'
  | 'unknown_financial'
  | 'not_financial';

export interface FinancialContentClass {
  entity_type: 'financial_statement' | 'operational_finance' | 'not_financial';
  doc_kind: FinancialDocKind;
  confidence: number;
  rationale: string;
  signals: string[];
}

export function classifyFinancialContent(filename: string, text: string): FinancialContentClass {
  const fn = filename || '';
  const head = (text || '').slice(0, 8000);
  const norm = head
    .toLowerCase()
    .replace(/_x000d_/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const signals: string[] = [];
  const sig = (label: string, hit: boolean): boolean => {
    if (hit) signals.push(label);
    return hit;
  };

  const hasMonthGrid = sig(
    'month-grid(jan..mar)',
    /account name.*\bjan\b.*\bfeb\b.*\bmar\b/.test(norm) ||
      /\bjan\b.{0,6}\bfeb\b.{0,6}\bmar\b.{0,6}\bapr\b/.test(norm),
  );
  const hasIsTotals = sig(
    'is-totals(direct-costs/cost-of-ops)',
    /total direct costs/.test(norm) || /total cost of operations/.test(norm),
  );
  const hasBsTotals = sig(
    'bs-totals(current-assets+liabilities|liab&equity)',
    (/total current assets/.test(norm) && /total current liabilities/.test(norm)) ||
      /liabilities & equity/.test(norm) ||
      /trended balance sheet/.test(norm),
  );
  const hasArCols = sig(
    'ar-cols(customer+invoice+aging)',
    /customer/.test(norm) &&
      /invoice/.test(norm) &&
      /(due date|31 to 60|61 to 90|over 90|1 to 30|current)/.test(norm),
  );
  const hasApCols = sig(
    'ap-cols(vendor+voucher/invoice)',
    (/vendor/.test(norm) && (/voucher/.test(norm) || /invoice/.test(norm))) ||
      /accounts payable aging|open a\/?p/.test(norm),
  );
  const hasTbCols = sig(
    'tb-cols(beginning+ending-balance)',
    /beginning balance/.test(norm) && /ending balance/.test(norm),
  );
  // GL Detail transaction ledger — detected by its column signature, not the
  // filename. The export carries FY + PD + Proj Classification + Account Name +
  // Amount columns; that structure identifies it even when the file is renamed.
  const hasGlColumns = sig(
    'gl-columns(fy+pd+proj-classification+account-name+amount)',
    /\bfy\b/.test(norm) &&
      /\bpd\b/.test(norm) &&
      /proj(ect)? classification/.test(norm) &&
      /account name/.test(norm) &&
      /\bamount\b/.test(norm),
  );
  const hasGlDetail = sig(
    'gl-detail-signature',
    /\bgl detail\b|general ledger|journal entr/.test(norm) || hasGlColumns,
  );
  const hasCostPoolRev = sig(
    'cost-pool-revenue',
    /revenue/.test(norm) && /cost pool/.test(norm),
  );
  const hasDataSet = sig('DataSetLandTbl', /datasetlandtbl/.test(norm));
  // Weak filename tiebreakers (applied only after content is inconclusive).
  const fnAr = /aged\s*a\/?r|accounts?\s*receivable/i.test(fn);
  const fnAp = /open\s*a\/?p|accounts?\s*payable/i.test(fn);
  const fnL = /\bl[12]\b[\s-]*(actual|target)/i.test(fn);
  if (fnAr) signals.push('fn:aged-ar');
  if (fnAp) signals.push('fn:open-ap');
  if (fnL) signals.push('fn:L1/L2');

  // Operational A/R and A/P first — they must NEVER reach the Bible.
  if (hasArCols || (fnAr && !hasIsTotals && !hasBsTotals)) {
    return {
      entity_type: 'operational_finance',
      doc_kind: 'aged_ar',
      confidence: hasArCols ? 0.92 : 0.7,
      rationale: 'Aged A/R report (operational receivables) — routed to operational surface, not the Financial Bible.',
      signals,
    };
  }
  if (hasApCols || (fnAp && !hasIsTotals && !hasBsTotals)) {
    return {
      entity_type: 'operational_finance',
      doc_kind: 'open_ap',
      confidence: hasApCols ? 0.92 : 0.7,
      rationale: 'Open A/P report (operational payables) — routed to operational surface, not the Financial Bible.',
      signals,
    };
  }

  // Financial-statement kinds (Financial Bible).
  if (hasMonthGrid && hasBsTotals) {
    return { entity_type: 'financial_statement', doc_kind: 'trended_balance_sheet', confidence: 0.95, rationale: 'Trended Balance Sheet: month grid + balance-sheet subtotals.', signals };
  }
  if (hasMonthGrid && hasIsTotals) {
    return { entity_type: 'financial_statement', doc_kind: 'trended_income_statement', confidence: 0.95, rationale: 'Trended Income Statement: month grid + Total Direct Costs / Total Cost of Operations.', signals };
  }
  if (hasTbCols) {
    return { entity_type: 'financial_statement', doc_kind: 'trial_balance', confidence: 0.9, rationale: 'Trial Balance: Beginning/Ending Balance columns.', signals };
  }
  if (hasBsTotals) {
    return { entity_type: 'financial_statement', doc_kind: 'balance_sheet', confidence: 0.85, rationale: 'Balance Sheet subtotals present.', signals };
  }
  if (hasIsTotals) {
    return { entity_type: 'financial_statement', doc_kind: 'income_statement', confidence: 0.85, rationale: 'Income Statement subtotals present.', signals };
  }
  if (hasCostPoolRev) {
    return { entity_type: 'financial_statement', doc_kind: 'revenue_summary_cost_pool', confidence: 0.8, rationale: 'Revenue Summary by cost pool.', signals };
  }
  if (hasDataSet || fnL) {
    return { entity_type: 'financial_statement', doc_kind: 'l1_l2_pnl', confidence: fnL ? 0.85 : 0.75, rationale: 'L1/L2 company P&L (DataSetLandTbl / L-level filename).', signals };
  }
  if (hasGlDetail) {
    return { entity_type: 'financial_statement', doc_kind: 'gl_detail', confidence: 0.8, rationale: 'GL Detail signature.', signals };
  }

  // Filename-only financial statement (weak) or nothing → not financial.
  if (FINANCIAL_STATEMENT_NAME_PATTERNS.some((p) => p.test(fn))) {
    return { entity_type: 'financial_statement', doc_kind: 'unknown_financial', confidence: 0.55, rationale: 'Financial-statement filename token but no strong content signal — needs review.', signals };
  }
  return { entity_type: 'not_financial', doc_kind: 'not_financial', confidence: 0.4, rationale: 'No financial-statement content or operational A/R-A/P signals detected.', signals };
}

/**
 * True when the doc is a financial STATEMENT bound for the Financial Bible.
 * Operational A/R and A/P reports are excluded up front so they never sweep in.
 */
function isFinancialStatement(filename: string, text: string): boolean {
  if (isOperationalFinance(filename)) return false;
  if (FINANCIAL_STATEMENT_NAME_PATTERNS.some((p) => p.test(filename))) return true;
  const head = text.slice(0, 5000);
  return FINANCIAL_STATEMENT_CONTENT_PATTERNS.some((p) => p.test(head));
}

function keywordClassify(text: string, filename: string): { surface: string; entity_type: string; confidence: number; rationale: string } {
  const input = `${filename} ${text.slice(0, 5000)}`;
  let bestMatch = { surface: 'inbox', entity_type: 'other', confidence: 0, rationale: 'No keyword matches found' };

  for (const rule of KEYWORD_RULES) {
    let matchCount = 0;
    const matchedTerms: string[] = [];

    for (const kw of rule.keywords) {
      const matches = input.match(kw);
      if (matches) {
        matchCount++;
        matchedTerms.push(matches[0]);
      }
    }

    if (matchCount > 0) {
      // Base confidence from first match + bonus for additional matches
      const baseScore = rule.weight * 0.7;
      const bonusPerMatch = rule.weight * 0.3 / rule.keywords.length;
      const confidence = Math.min(baseScore + matchCount * bonusPerMatch, 0.99);
      if (confidence > bestMatch.confidence) {
        bestMatch = {
          surface: rule.surface,
          entity_type: rule.entity_type,
          confidence: Math.round(confidence * 1000) / 1000,
          rationale: `Keyword match: ${matchedTerms.join(', ')}`,
        };
      }
    }
  }

  return bestMatch;
}

function detectDoctrine(text: string): string | null {
  const preview = text.slice(0, 3000);
  for (const { pattern, flag } of OU_PATTERNS) {
    if (pattern.test(preview)) return flag;
  }
  return null;
}

export async function classifyDocument(
  text: string,
  filename: string,
  sourceSurfaceHint: string | null,
): Promise<ClassificationResult> {
  // Step 1: keyword-based classification
  const kwResult = keywordClassify(text, filename);

  // Content-first financial classification (Pillar 1). Reads structural
  // fingerprints of the extracted text and decides a doc_kind + signals, with
  // the filename as a weak tiebreaker only. Both branches below key off the
  // returned entity_type so a renamed statement still reaches the Bible and an
  // operational A/R-A/P export never does.
  const finContent = classifyFinancialContent(filename, text);

  // Operational A/R and A/P reports are financial data but not statements. They
  // live on the financials surface like every other financial doc, but the
  // "never the Bible" guarantee is enforced downstream: classifyFinancialDoc
  // routes them to the ap_actuals / ar_actuals OPERATIONAL tables, never the
  // reconcilable statement tables. Grade tracks confidence like the rest.
  if (finContent.entity_type === 'operational_finance' || isOperationalFinance(filename)) {
    const conf = finContent.entity_type === 'operational_finance' ? finContent.confidence : 0.6;
    const surface = finContent.doc_kind === 'open_ap' ? 'A/P' : 'A/R';
    return {
      surface: 'financials',
      entity_type: 'financial_doc',
      confidence: conf,
      rationale: `Operational finance (${finContent.doc_kind}) — ingested to the ${surface} operational tables, NOT the Financial Bible statements. [signals: ${finContent.signals.join(', ') || 'filename'}]`,
      doctrine_flag: detectDoctrine(text),
      evidence_grade: conf >= 0.8 ? 'A' : conf >= 0.6 ? 'B' : 'C',
      owner: 'system',
    };
  }

  // Financial statements (GL detail, income statement, trial balance, balance
  // sheet, revenue summary, SIE, P&L) route to the Financial Bible with high
  // confidence so a single-keyword match never falls through to the LLM upgrade
  // that previously mis-routed June statements to Inbox.
  if (finContent.entity_type === 'financial_statement' || isFinancialStatement(filename, text)) {
    return {
      surface: 'financials',
      entity_type: 'financial_doc',
      confidence: Math.max(finContent.confidence, 0.9),
      rationale: `Financial statement (${finContent.doc_kind}) — routed to Financial Bible. [signals: ${finContent.signals.join(', ') || 'filename'}]`,
      doctrine_flag: detectDoctrine(text),
      evidence_grade: 'A',
      owner: 'system',
    };
  }

  // If source surface hint is provided and is a valid enum value, use it as fallback
  if (sourceSurfaceHint && kwResult.surface === 'inbox' && VALID_SURFACES.has(sourceSurfaceHint)) {
    kwResult.surface = sourceSurfaceHint;
    kwResult.confidence = 0.6;
    kwResult.rationale = `Routed to upload source surface: ${sourceSurfaceHint}`;
  }

  // Step 2: Doctrine check
  const doctrineFlag = detectDoctrine(text);

  // Step 3: Evidence grade
  const evidenceGrade = kwResult.confidence >= 0.8 ? 'A' : kwResult.confidence >= 0.6 ? 'B' : 'C';

  // Step 4: If low confidence, try LLM classifier
  if (kwResult.confidence < 0.7) {
    try {
      const llmResult = await llmRouter.route({
        task: 'vault_smart_route' as const,
        input: {
          filename,
          ai_summary: '',
          extracted_text_preview: text.slice(0, 2000),
          matching_opportunities: [],
          matching_captures: [],
          regulatory_citations: [],
        },
      });

      if (llmResult.ok && llmResult.output) {
        const out = llmResult.output as {
          doc_type?: string;
          doc_category?: string;
          routing_rationale?: string;
        };

        const llmSurface = mapDocTypeToSurface(out.doc_type ?? 'other');
        const llmEntityType = mapDocTypeToEntity(out.doc_type ?? 'other');

        return {
          surface: llmSurface,
          entity_type: llmEntityType,
          confidence: 0.75,
          rationale: out.routing_rationale ?? 'LLM classification',
          doctrine_flag: doctrineFlag,
          evidence_grade: 'B',
          owner: 'system',
        };
      }
    } catch (err) {
      logger.warn({ err }, 'LLM classification failed, using keyword result');
    }
  }

  // If still very low confidence, route to inbox/triage
  if (kwResult.confidence < 0.5) {
    return {
      surface: 'inbox',
      entity_type: 'other',
      confidence: kwResult.confidence,
      rationale: `Low confidence (${kwResult.confidence}). ${kwResult.rationale}. Needs manual triage.`,
      doctrine_flag: doctrineFlag,
      evidence_grade: 'C',
      owner: 'system',
    };
  }

  return {
    surface: kwResult.surface,
    entity_type: kwResult.entity_type,
    confidence: kwResult.confidence,
    rationale: kwResult.rationale,
    doctrine_flag: doctrineFlag,
    evidence_grade: evidenceGrade,
    owner: 'system',
  };
}

function mapDocTypeToSurface(docType: string): string {
  const map: Record<string, string> = {
    rfp: 'opportunities',
    proposal: 'capture',
    financial: 'financials',
    contract: 'vehicles',
    subcontract_teaming: 'partner_intel',
    past_performance: 'vault',
    certificate: 'vault',
    policy_regulatory: 'regulatory',
    market_research: 'opportunities',
    correspondence: 'action_items',
    bid_protest: 'vault',
    capability_statement: 'vault',
    color_review: 'capture',
    personnel: 'vault',
    technical_artifact: 'vault',
    training_material: 'vault',
    other: 'inbox',
  };
  return map[docType] ?? 'inbox';
}

function mapDocTypeToEntity(docType: string): string {
  const map: Record<string, string> = {
    rfp: 'opportunity',
    proposal: 'capture_doc',
    financial: 'financial_doc',
    contract: 'vehicle_doc',
    subcontract_teaming: 'partner_doc',
    past_performance: 'cpar',
    certificate: 'doctrine_doc',
    policy_regulatory: 'regulatory_notice',
    market_research: 'opportunity',
    correspondence: 'action_item',
    bid_protest: 'other',
    capability_statement: 'other',
    color_review: 'capture_doc',
    personnel: 'other',
    technical_artifact: 'other',
    training_material: 'other',
    other: 'other',
  };
  return map[docType] ?? 'other';
}
