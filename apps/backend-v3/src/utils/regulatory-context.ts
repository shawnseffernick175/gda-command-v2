/**
 * Regulatory Context — F-620
 *
 * Queries vault_regulatory_catalog for relevant FAR/DFARS/NDAA/EO entries
 * and formats them as a structured block to append to AI system prompts.
 * Graceful fallback: never breaks AI calls if the catalog is empty or query fails.
 */

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

export interface RegulatoryEntry {
  ref_code: string;
  title: string;
  category: string;
  applicability_notes: string;
  source_url: string;
  full_text_excerpt: string;
}

export interface RegulatoryContextOptions {
  naics?: string | null;
  keywords?: string[];
  categories?: string[];
  acquisitionType?: string;
  limit?: number;
}

/**
 * Query vault_regulatory_catalog for relevant entries and format as a prompt block.
 * Falls back to empty string gracefully if catalog is empty or query fails.
 */
export async function buildRegulatoryContext(opts: RegulatoryContextOptions = {}): Promise<string> {
  try {
    const { naics, keywords = [], categories = [], limit = 12 } = opts;

    // Merge naics into keywords if provided (catalog has no dedicated NAICS column)
    const allKeywords = [...keywords];
    if (naics) allKeywords.push(naics);

    let whereClause = 'WHERE is_active = true';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (categories.length > 0) {
      whereClause += ` AND category = ANY($${paramIdx})`;
      params.push(categories);
      paramIdx++;
    }

    // Use websearch_to_tsquery (PG 11+) — handles multi-word phrases safely
    let orderClause = 'ORDER BY ref_code';
    if (allKeywords.length > 0) {
      const kwQuery = allKeywords.join(' OR ');
      whereClause += ` AND (to_tsvector('english', title || ' ' || COALESCE(applicability_notes,'')) @@ websearch_to_tsquery('english', $${paramIdx}))`;
      params.push(kwQuery);
      paramIdx++;
      orderClause = `ORDER BY ts_rank(to_tsvector('english', title || ' ' || COALESCE(applicability_notes,'')), websearch_to_tsquery('english', $${paramIdx - 1})) DESC`;
    }

    params.push(limit);
    const query = `
      SELECT ref_code, title, category, applicability_notes, source_url, full_text_excerpt
      FROM vault_regulatory_catalog
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIdx}
    `;

    const result = await pool.query(query, params);
    const rows: RegulatoryEntry[] = result.rows;

    if (rows.length === 0) return '';

    const lines = [
      '',
      '---',
      'APPLICABLE REGULATORY CONTEXT',
      'The following federal regulations, policies, and decisions are relevant to this analysis.',
      'Reference them where applicable. Cite specific clause numbers when making compliance observations.',
      '',
    ];

    for (const row of rows) {
      lines.push(`[${row.ref_code}] ${row.title} (${row.category})`);
      if (row.applicability_notes) lines.push(`  Applicability: ${row.applicability_notes}`);
      if (row.full_text_excerpt) lines.push(`  Key text: ${row.full_text_excerpt.substring(0, 400)}...`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');

    return lines.join('\n');
  } catch (err) {
    logger.warn({ err }, '[regulatory-context] Failed to build regulatory context');
    return '';
  }
}
