/**
 * Batch Contact Enrichment service.
 *
 * Runs the existing `contact_enrich` LLM task over many contacts at once,
 * writing the structured AI profile into govtribe_contacts.ai_profile + ai_ran_at.
 * Wraps existing machinery -- does NOT invent a new LLM task.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { ContactEnrichInput } from '../../lib/llm-router.types.js';

interface EnrichBatchOpts {
  categories?: string[];
  limit?: number;
  only_unenriched?: boolean;
}

interface EnrichBatchResult {
  contacts_considered: number;
  contacts_enriched: number;
  contacts_failed: number;
}

interface ContactRow {
  id: number;
  name: string;
  title: string | null;
  agency: string | null;
  company: string | null;
  contact_category: string;
  email: string | null;
  linkedin_url: string | null;
  notes: string | null;
}

export async function enrichContactsBatch(
  opts?: EnrichBatchOpts,
): Promise<EnrichBatchResult> {
  const categories = opts?.categories ?? ['competitor', 'teaming_partner'];
  const limit = opts?.limit ?? 200;
  const onlyUnenriched = opts?.only_unenriched ?? true;

  const { rows: contacts } = await pool.query<ContactRow>(
    `SELECT id, name, title, agency, company, contact_category, email, linkedin_url, notes
     FROM govtribe_contacts
     WHERE contact_category = ANY($1)
       AND ($2::boolean IS FALSE OR ai_profile IS NULL)
     ORDER BY id ASC
     LIMIT $3`,
    [categories, onlyUnenriched, limit],
  );

  let contactsEnriched = 0;
  let contactsFailed = 0;

  const { llmRouter } = await import('../../lib/llm-router.js');

  for (const c of contacts) {
    try {
      const input: ContactEnrichInput = {
        name: c.name,
        title: c.title,
        agency_or_company: c.agency ?? c.company,
        category: c.contact_category,
        email: c.email,
        linkedin: c.linkedin_url,
        notes: c.notes,
      };

      const result = await llmRouter.route({
        task: 'contact_enrich',
        input,
      });

      if (result.ok) {
        await pool.query(
          'UPDATE govtribe_contacts SET ai_profile = $1, ai_ran_at = NOW() WHERE id = $2',
          [JSON.stringify(result.output), c.id],
        );
        contactsEnriched++;
      } else {
        logger.warn(
          { contactId: c.id, error: result.error_message },
          'contact_enrich_batch_llm_error',
        );
        contactsFailed++;
      }
    } catch (err) {
      logger.error(
        {
          contactId: c.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'contact_enrich_batch_error',
      );
      contactsFailed++;
    }
  }

  return {
    contacts_considered: contacts.length,
    contacts_enriched: contactsEnriched,
    contacts_failed: contactsFailed,
  };
}
