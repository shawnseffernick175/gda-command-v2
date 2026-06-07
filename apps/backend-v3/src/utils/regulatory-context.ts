/**
 * Regulatory Context — F-620
 *
 * Queries vault_regulatory_catalog for relevant FAR/DFARS/NDAA/EO entries
 * and formats them as a structured block to append to AI system prompts.
 * Graceful fallback: never breaks AI calls if the catalog is empty or query fails.
 */

import { pool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export interface RegulatoryEntry {
  citation: string;
  title: string;
  category: string;
  summary: string | null;
  url: string | null;
}

export interface RegulatoryContextOptions {
  naics?: string | null;
  keywords?: string[];
  categories?: string[];
  acquisitionType?: string;
  limit?: number;
}

export async function buildRegulatoryContext(opts: RegulatoryContextOptions = {}): Promise<string> {
  try {
    const { naics, keywords = [], categories = [], limit = 12 } = opts;

    const allKeywords = [...keywords];
    if (naics) allKeywords.push(naics);

    let whereClause = "WHERE is_active = true";
    const params: unknown[] = [];
    let paramIdx = 1;

    if (categories.length > 0) {
      whereClause += ` AND category = ANY($${paramIdx})`;
      params.push(categories);
      paramIdx++;
    }

    let orderClause = "ORDER BY citation";
    if (allKeywords.length > 0) {
      const kwQuery = allKeywords.join(" OR ");
      whereClause += ` AND (to_tsvector('english', title || ' ' || COALESCE(summary,'')) @@ websearch_to_tsquery('english', $${paramIdx}))`;
      params.push(kwQuery);
      paramIdx++;
      orderClause = `ORDER BY ts_rank(to_tsvector('english', title || ' ' || COALESCE(summary,'')), websearch_to_tsquery('english', $${paramIdx - 1})) DESC`;
    }

    params.push(limit);
    const query = `
      SELECT citation, title, category, summary, url
      FROM vault_regulatory_catalog
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIdx}
    `;

    const result = await pool.query(query, params);
    const rows: RegulatoryEntry[] = result.rows;

    if (rows.length === 0) return "";

    const lines = [
      "",
      "---",
      "APPLICABLE REGULATORY CONTEXT",
      "The following federal regulations, policies, and decisions are relevant to this analysis.",
      "Reference them where applicable. Cite specific clause numbers when making compliance observations.",
      "",
    ];

    for (const row of rows) {
      lines.push(`[${row.citation}] ${row.title} (${row.category})`);
      if (row.summary) lines.push(`  Summary: ${row.summary.substring(0, 400)}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");

    return lines.join("\n");
  } catch (err) {
    logger.warn({ err }, "[regulatory-context] Failed to build regulatory context");
    return "";
  }
}
