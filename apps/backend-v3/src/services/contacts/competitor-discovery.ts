/**
 * Competitor Contact Discovery service.
 *
 * Discovers real people at top competitor companies via web search
 * (Perplexity sonar-pro) and upserts them into contacts
 * with contact_category='competitor'.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type {
  CompetitorContactDiscoveryInput,
  CompetitorContactDiscoveryOutput,
  DiscoveredContact,
} from '../../lib/llm-router.types.js';

interface DiscoverOpts {
  limit?: number;
  max_contacts?: number;
  competitors?: string[];
}

interface DiscoverResult {
  companies_processed: number;
  contacts_written: number;
  companies_skipped_no_results: number;
}

interface CompetitorRow {
  company: string;
  agencies: string[] | null;
  naics: string[] | null;
}

export async function discoverCompetitorContacts(
  opts?: DiscoverOpts,
): Promise<DiscoverResult> {
  const limit = opts?.limit ?? 25;
  const maxContacts = opts?.max_contacts ?? 5;

  let competitors: CompetitorRow[];

  if (opts?.competitors && opts.competitors.length > 0) {
    const { rows } = await pool.query<CompetitorRow>(
      `SELECT awardee_name AS company,
              array_agg(DISTINCT agency_name) FILTER (WHERE agency_name IS NOT NULL) AS agencies,
              array_agg(DISTINCT naics) FILTER (WHERE naics IS NOT NULL) AS naics
       FROM awards
       WHERE awardee_name = ANY($1)
       GROUP BY awardee_name
       ORDER BY sum(COALESCE(value_obligated,0)) DESC`,
      [opts.competitors],
    );
    competitors = rows;
  } else {
    const { rows } = await pool.query<CompetitorRow>(
      `SELECT awardee_name AS company,
              array_agg(DISTINCT agency_name) FILTER (WHERE agency_name IS NOT NULL) AS agencies,
              array_agg(DISTINCT naics) FILTER (WHERE naics IS NOT NULL) AS naics
       FROM awards
       WHERE awardee_name IS NOT NULL AND awardee_name <> ''
       GROUP BY awardee_name
       ORDER BY sum(COALESCE(value_obligated,0)) DESC
       LIMIT $1`,
      [limit],
    );
    competitors = rows;
  }

  let companiesProcessed = 0;
  let contactsWritten = 0;
  let companiesSkipped = 0;

  const { llmRouter } = await import('../../lib/llm-router.js');

  for (const comp of competitors) {
    companiesProcessed++;
    try {
      const input: CompetitorContactDiscoveryInput = {
        competitor_name: comp.company,
        agencies: comp.agencies ?? [],
        naics: (comp.naics ?? []).slice(0, 8),
        max_contacts: maxContacts,
      };

      const result = await llmRouter.route({
        task: 'competitor_contact_discovery',
        input,
      });

      if (!result.ok) {
        logger.warn(
          { company: comp.company, error: result.error_message },
          'competitor_contact_discovery_llm_error',
        );
        companiesSkipped++;
        continue;
      }

      const output = result.output as CompetitorContactDiscoveryOutput;
      const contacts = output.contacts ?? [];

      if (contacts.length === 0) {
        companiesSkipped++;
        continue;
      }

      for (const contact of contacts) {
        if (!contact.name || !contact.source_url) {
          continue;
        }

        try {
          await upsertCompetitorContact(contact, comp.company);
          contactsWritten++;
        } catch (err) {
          logger.error(
            {
              company: comp.company,
              contactName: contact.name,
              error: err instanceof Error ? err.message : String(err),
            },
            'competitor_contact_upsert_error',
          );
        }
      }
    } catch (err) {
      logger.error(
        {
          company: comp.company,
          error: err instanceof Error ? err.message : String(err),
        },
        'competitor_contact_discovery_error',
      );
      companiesSkipped++;
    }
  }

  return {
    companies_processed: companiesProcessed,
    contacts_written: contactsWritten,
    companies_skipped_no_results: companiesSkipped,
  };
}

async function upsertCompetitorContact(
  contact: DiscoveredContact,
  companyName: string,
): Promise<void> {
  const company = companyName || contact.company;
  let existingId: number | null = null;

  if (contact.email) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM contacts
       WHERE contact_category = 'competitor'
         AND lower(company) = lower($1)
         AND email IS NOT NULL AND lower(email) = lower($2)
       LIMIT 1`,
      [company, contact.email],
    );
    existingId = rows[0]?.id ?? null;
  }

  if (!existingId) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM contacts
       WHERE contact_category = 'competitor'
         AND lower(name) = lower($1)
         AND lower(company) = lower($2)
       LIMIT 1`,
      [contact.name, company],
    );
    existingId = rows[0]?.id ?? null;
  }

  const rawJson = JSON.stringify(contact);

  if (existingId) {
    await pool.query(
      `UPDATE contacts SET
         title = COALESCE($1, title),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         linkedin_url = COALESCE($4, linkedin_url),
         source_url = COALESCE($5, source_url),
         raw_json = $6,
         last_seen_at = NOW()
       WHERE id = $7`,
      [
        contact.title,
        contact.email,
        contact.phone,
        contact.linkedin_url,
        contact.source_url,
        rawJson,
        existingId,
      ],
    );
  } else {
    await pool.query(
      `INSERT INTO contacts (
         contact_category, source_label, added_by, is_manual,
         contact_type, name, title, company, email, phone, linkedin_url,
         source_url, raw_json, agency, last_seen_at
       ) VALUES (
         'competitor', 'internet', 'system', false,
         'competitor_poc', $1, $2, $3, $4, $5, $6,
         $7, $8, NULL, NOW()
       )`,
      [
        contact.name,
        contact.title,
        company,
        contact.email,
        contact.phone,
        contact.linkedin_url,
        contact.source_url,
        rawJson,
      ],
    );
  }
}
