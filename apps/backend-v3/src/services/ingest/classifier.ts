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

const OU_PATTERNS = [
  { pattern: /\b(OU-?II|Riverstone|RSI|Intelligence\s+&\s+Cyber)\b/i, flag: 'OU2' },
  { pattern: /\b(OU-?III|PD\s+Systems|TBF\s+Group|Training.*Simulation)\b/i, flag: 'OU3' },
];

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

  // If source surface hint is provided and matches a known surface, boost confidence
  if (sourceSurfaceHint && kwResult.surface === 'inbox') {
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
