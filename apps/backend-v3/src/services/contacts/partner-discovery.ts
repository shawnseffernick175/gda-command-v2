/**
 * Teaming-Partner Contact Discovery service.
 *
 * Discovers real people at candidate teaming-partner companies via web search
 * (Perplexity sonar-pro) and upserts them into contacts
 * with contact_category='teaming_partner'.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type {
  PartnerContactDiscoveryInput,
  PartnerContactDiscoveryOutput,
  DiscoveredContact,
} from '../../lib/llm-router.types.js';

interface DiscoverOpts {
  limit?: number;
  max_contacts?: number;
  partners?: string[];
}

interface DiscoverResult {
  companies_processed: number;
  contacts_written: number;
  companies_skipped_no_results: number;
}

interface PartnerRow {
  company: string;
  agencies: string[] | null;
  naics: string[] | null;
  set_asides: string[] | null;
}

export async function discoverPartnerContacts(
  opts?: DiscoverOpts,
): Promise<DiscoverResult> {
  const limit = opts?.limit ?? 25;
  const maxContacts = opts?.max_contacts ?? 5;

  let partners: PartnerRow[];

  if (opts?.partners && opts.partners.length > 0) {
    const { rows } = await pool.query<PartnerRow>(
      `SELECT a.awardee_name AS company,
              array_agg(DISTINCT a.agency_name) FILTER (WHERE a.agency_name IS NOT NULL) AS agencies,
              array_agg(DISTINCT a.naics)       FILTER (WHERE a.naics IS NOT NULL)       AS naics,
              array_agg(DISTINCT a.set_aside)   FILTER (WHERE a.set_aside IS NOT NULL)   AS set_asides
       FROM awards a
       WHERE a.awardee_name = ANY($1)
       GROUP BY a.awardee_name
       ORDER BY sum(COALESCE(a.value_obligated,0)) DESC`,
      [opts.partners],
    );
    partners = rows;
  } else {
    // Primary query: rank small-business / set-aside awardees by total obligated value
    const { rows: primaryRows } = await pool.query<PartnerRow>(
      `SELECT a.awardee_name AS company,
              array_agg(DISTINCT a.agency_name) FILTER (WHERE a.agency_name IS NOT NULL) AS agencies,
              array_agg(DISTINCT a.naics)       FILTER (WHERE a.naics IS NOT NULL)       AS naics,
              array_agg(DISTINCT a.set_aside)   FILTER (WHERE a.set_aside IS NOT NULL)   AS set_asides
       FROM awards a
       WHERE a.awardee_name IS NOT NULL AND a.awardee_name <> ''
         AND a.set_aside IS NOT NULL AND a.set_aside <> ''
         AND a.set_aside NOT ILIKE '%No Set%aside%'
         AND a.set_aside NOT ILIKE '%No Set-Aside%'
       GROUP BY a.awardee_name
       ORDER BY sum(COALESCE(a.value_obligated,0)) DESC
       LIMIT $1`,
      [limit],
    );

    partners = primaryRows;

    // FALLBACK: if primary query returned fewer than `limit` rows (awards.set_aside may be
    // sparse), backfill with small-dollar awardees (sum < $50M) not already selected and not
    // in the top-50 mega-prime competitor list, ranked by value.
    if (partners.length < limit) {
      const remaining = limit - partners.length;
      const alreadySelected = partners.map((p) => p.company);

      const { rows: fallbackRows } = await pool.query<PartnerRow>(
        `SELECT sub.company,
                sub.agencies,
                sub.naics,
                sub.set_asides
         FROM (
           SELECT a.awardee_name AS company,
                  array_agg(DISTINCT a.agency_name) FILTER (WHERE a.agency_name IS NOT NULL) AS agencies,
                  array_agg(DISTINCT a.naics)       FILTER (WHERE a.naics IS NOT NULL)       AS naics,
                  array_agg(DISTINCT a.set_aside)   FILTER (WHERE a.set_aside IS NOT NULL)   AS set_asides,
                  sum(COALESCE(a.value_obligated,0)) AS total_value
           FROM awards a
           WHERE a.awardee_name IS NOT NULL AND a.awardee_name <> ''
             AND a.awardee_name <> ALL($1)
             AND a.awardee_name NOT IN (
               SELECT top.awardee_name FROM (
                 SELECT awardee_name
                 FROM awards
                 WHERE awardee_name IS NOT NULL AND awardee_name <> ''
                 GROUP BY awardee_name
                 ORDER BY sum(COALESCE(value_obligated,0)) DESC
                 LIMIT 50
               ) top
             )
           GROUP BY a.awardee_name
           HAVING sum(COALESCE(a.value_obligated,0)) < 50000000
         ) sub
         ORDER BY sub.total_value DESC
         LIMIT $2`,
        [alreadySelected, remaining],
      );

      partners = [...partners, ...fallbackRows];
    }
  }

  let companiesProcessed = 0;
  let contactsWritten = 0;
  let companiesSkipped = 0;

  const { llmRouter } = await import('../../lib/llm-router.js');

  for (const comp of partners) {
    companiesProcessed++;
    try {
      const input: PartnerContactDiscoveryInput = {
        partner_name: comp.company,
        agencies: comp.agencies ?? [],
        naics: (comp.naics ?? []).slice(0, 8),
        set_asides: (comp.set_asides ?? []).slice(0, 6),
        max_contacts: maxContacts,
      };

      const result = await llmRouter.route({
        task: 'partner_contact_discovery',
        input,
      });

      if (!result.ok) {
        logger.warn(
          { company: comp.company, error: result.error_message },
          'partner_contact_discovery_llm_error',
        );
        companiesSkipped++;
        continue;
      }

      const output = result.output as PartnerContactDiscoveryOutput;
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
          await upsertPartnerContact(contact, comp.company);
          contactsWritten++;
        } catch (err) {
          logger.error(
            {
              company: comp.company,
              contactName: contact.name,
              error: err instanceof Error ? err.message : String(err),
            },
            'partner_contact_upsert_error',
          );
        }
      }
    } catch (err) {
      logger.error(
        {
          company: comp.company,
          error: err instanceof Error ? err.message : String(err),
        },
        'partner_contact_discovery_error',
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

async function upsertPartnerContact(
  contact: DiscoveredContact,
  companyName: string,
): Promise<void> {
  const company = companyName || contact.company;
  let existingId: number | null = null;

  if (contact.email) {
    const { rows } = await pool.query<{ id: number }>(
      `SELECT id FROM contacts
       WHERE contact_category = 'teaming_partner'
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
       WHERE contact_category = 'teaming_partner'
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
         'teaming_partner', 'internet', 'system', false,
         'partner_poc', $1, $2, $3, $4, $5, $6,
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
