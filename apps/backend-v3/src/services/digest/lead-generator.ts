/**
 * Digest Lead Story Generator — F-629
 *
 * Pulls the latest federal_register_notices, sources_sought/pre_sol
 * opportunities, and vault_regulatory_catalog entries, then generates
 * a single lead story summarizing the most important development.
 * Cached in digest_cache for 24 hours.
 */

import type { Pool } from 'pg';
import { llmRouter } from '../../lib/llm-router.js';
import { logger } from '../../lib/logger.js';
import type { DigestLeadInput } from '../../lib/llm-router.types.js';

const ENVISION_NAICS = ['541511', '541512', '541519', '541690'];

export interface DigestLeadStory {
  headline: string;
  body: string;
  source_label: string;
  source_url: string | null;
  related_opportunity_ids: string[];
  generated_at: string;
}

export async function generateDigestLead(pool: Pool): Promise<DigestLeadStory> {
  logger.info('Generating digest lead story');

  // Gather context from the last 24 hours
  const [regNotices, recentOpps, regCatalog] = await Promise.all([
    pool.query<{ title: string; abstract: string | null; html_url: string | null; publication_date: string | null }>(
      `SELECT title, abstract, html_url, publication_date::text
       FROM regulatory_notices
       WHERE publication_date >= NOW() - INTERVAL '48 hours'
       ORDER BY publication_date DESC
       LIMIT 10`,
    ),
    pool.query<{ id: string; title: string; agency: string | null; naics: string | null; source_uri: string | null }>(
      `SELECT id::text, title, agency, naics, source_uri
       FROM opportunities
       WHERE naics = ANY($1)
         AND posted_at >= NOW() - INTERVAL '48 hours'
         AND deleted_at IS NULL
       ORDER BY posted_at DESC
       LIMIT 10`,
      [ENVISION_NAICS],
    ),
    pool.query<{ title: string; source_url: string | null; effective_date: string | null }>(
      `SELECT title, source_url, effective_date::text
       FROM vault_regulatory_catalog
       WHERE is_active = true AND created_at >= NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC
       LIMIT 5`,
    ),
  ]);

  const contextPayload: DigestLeadInput = {
    federal_register_notices: regNotices.rows.map((r) => ({
      title: r.title,
      abstract: r.abstract?.slice(0, 300) ?? null,
      url: r.html_url,
      date: r.publication_date,
    })),
    recent_opportunities: recentOpps.rows.map((r) => ({
      id: r.id,
      title: r.title,
      agency: r.agency,
      naics: r.naics,
      url: r.source_uri,
    })),
    regulatory_catalog: regCatalog.rows.map((r) => ({
      title: r.title,
      url: r.source_url,
      effective_date: r.effective_date,
    })),
  };

  const hasContent =
    contextPayload.federal_register_notices.length > 0 ||
    contextPayload.recent_opportunities.length > 0 ||
    contextPayload.regulatory_catalog.length > 0;

  let headline: string;
  let body: string;
  let source_label = '';
  let source_url: string | null = null;
  let related_opportunity_ids: string[] = [];

  if (!hasContent) {
    headline = 'No significant developments in the last 24 hours';
    body = 'No new federal register notices, solicitations, or regulatory changes affecting Envision\u2019s NAICS space were published in the last 24 hours. Check back tomorrow.';
  } else {
    const result = await llmRouter.route({
      task: 'digest_lead' as const,
      input: contextPayload,
      opts: { object_ref: `digest:lead:${new Date().toISOString().slice(0, 10)}` },
    });

    if (!result.ok) {
      throw new Error(`Digest lead generation failed: ${result.error_message}`);
    }

    headline = result.output.headline;
    body = result.output.body;
    source_label = result.output.source_label ?? '';
    source_url = result.output.source_url ?? null;
    related_opportunity_ids = result.output.related_opportunity_ids ?? [];
  }

  const generated_at = new Date().toISOString();

  // Cache the result for 24 hours
  await pool.query(
    `INSERT INTO digest_cache (cache_key, content, generated_at, expires_at)
     VALUES ('lead_story', $1, NOW(), NOW() + INTERVAL '24 hours')
     ON CONFLICT (cache_key) DO UPDATE SET
       content = EXCLUDED.content,
       generated_at = EXCLUDED.generated_at,
       expires_at = EXCLUDED.expires_at`,
    [JSON.stringify({ headline, body, source_label, source_url, related_opportunity_ids })],
  );

  logger.info({ headline }, 'Digest lead story generated and cached');

  return { headline, body, source_label, source_url, related_opportunity_ids, generated_at };
}
