/**
 * Digest Refresh Cron — F-629
 *
 * Runs daily at 11:00 UTC (6:00 AM ET) to regenerate the digest lead story.
 * Pulls latest federal_register_notices, recent solicitations, and
 * vault_regulatory_catalog entries, generates an AI lead story, and
 * caches it in digest_cache for 24h.
 */

import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { generateDigestLead } from '../services/digest/lead-generator.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 2,
});

export async function runDigestRefresh(): Promise<void> {
  logger.info('[cron] digest-refresh starting');
  try {
    const lead = await generateDigestLead(pool);
    logger.info({ headline: lead.headline }, '[cron] digest-refresh completed');
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'cron_digest_refresh_error',
    );
  }
}
