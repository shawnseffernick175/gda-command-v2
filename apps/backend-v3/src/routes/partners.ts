import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import type { JwtPayload } from '../middleware/auth.js';
import {
  VALID_OUS,
  OU_OWNERS,
  isValidOu,
  isOuOwner,
  toListItem,
  toDetailView,
  computeTeamingFitScore,
  type PartnerProfileRow,
  type CapabilitySummaryItem,
  type PastPerformanceItem,
  type KeyPersonnelItem,
  type TeamingFitResult,
} from '../lib/partner-profiles.js';

export async function partnerRoutes(app: FastifyInstance): Promise<void> {

  /* ── GET /v3/partners — list all partner profiles ──────────── */
  app.get('/v3/partners', async (req, reply) => {
    const { rows } = await pool.query<PartnerProfileRow>(
      `SELECT ou, name, owner, overview, agencies_of_strength, naics_codes,
              capabilities_summary, past_performance_summary, key_personnel,
              certifications, active, last_reviewed_at
         FROM partner_profiles
        WHERE active = true
        ORDER BY name`
    );
    const items = rows.map((r) => toListItem(r));
    return reply.status(200).send(successEnvelope({ items }, req.requestId));
  });

  /* ── GET /v3/partners/teaming-fit/:opportunityId — all partners ── */
  app.get<{ Params: { opportunityId: string } }>('/v3/partners/teaming-fit/:opportunityId', async (req, reply) => {
    const { opportunityId } = req.params;

    try {
      const results: TeamingFitResult[] = [];
      for (const ou of VALID_OUS) {
        const result = await computeTeamingFit(opportunityId, ou);
        results.push(result);
      }
      results.sort((a, b) => b.fit_score - a.fit_score);
      return reply.status(200).send(successEnvelope({ items: results }, req.requestId));
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), opportunityId },
        'teaming_fit_all_error'
      );
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Teaming fit computation failed', req.requestId)
      );
    }
  });

  /* ── GET /v3/partners/:ou — full profile for one OU ────────── */
  app.get<{ Params: { ou: string } }>('/v3/partners/:ou', async (req, reply) => {
    const { ou } = req.params;
    if (!isValidOu(ou)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner not found. Valid OUs: ${[...VALID_OUS].join(', ')}`, req.requestId)
      );
    }
    const { rows } = await pool.query<PartnerProfileRow>(
      `SELECT ou, name, owner, overview, agencies_of_strength, naics_codes,
              capabilities_summary, past_performance_summary, key_personnel,
              certifications, active, last_reviewed_at
         FROM partner_profiles
        WHERE ou = $1`,
      [ou]
    );
    if (rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner profile '${ou}' not found`, req.requestId)
      );
    }
    const profile = rows[0]!;
    return reply.status(200).send(successEnvelope(toDetailView(profile), req.requestId));
  });

  /* ── PATCH /v3/partners/:ou — restricted to OU owner ───────── */
  app.patch<{ Params: { ou: string } }>('/v3/partners/:ou', async (req, reply) => {
    const { ou } = req.params;
    if (!isValidOu(ou)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner not found. Valid OUs: ${[...VALID_OUS].join(', ')}`, req.requestId)
      );
    }

    const user = (req as typeof req & { user?: JwtPayload }).user;
    if (!user) {
      return reply.status(401).send(
        errorEnvelope('UNAUTHORIZED', 'Authentication required', req.requestId)
      );
    }

    // Hard-enforce: only the owning OU lead can edit their partner profile
    if (!isOuOwner(ou, user.sub)) {
      return reply.status(403).send(
        errorEnvelope('UNAUTHORIZED', 'Only the owning OU lead can edit this partner profile', req.requestId)
      );
    }

    const body = req.body as Partial<{
      overview: string;
      agencies_of_strength: string[];
      naics_codes: string[];
      capabilities_summary: CapabilitySummaryItem[];
      past_performance_summary: PastPerformanceItem[];
      key_personnel: KeyPersonnelItem[];
      certifications: string[];
    }> | null;

    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body must contain at least one field to update', req.requestId)
      );
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const allowedFields: Array<keyof NonNullable<typeof body>> = [
      'overview', 'agencies_of_strength', 'naics_codes',
      'capabilities_summary', 'past_performance_summary',
      'key_personnel', 'certifications',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        const col = field === 'capabilities_summary' || field === 'past_performance_summary' || field === 'key_personnel'
          ? `${field} = $${paramIndex}::jsonb`
          : `${field} = $${paramIndex}`;
        setClauses.push(col);
        values.push(
          field === 'capabilities_summary' || field === 'past_performance_summary' || field === 'key_personnel'
            ? JSON.stringify(body[field])
            : body[field]
        );
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No valid fields to update', req.requestId)
      );
    }

    setClauses.push(`last_reviewed_at = NOW()`);
    values.push(ou);

    const sql = `UPDATE partner_profiles SET ${setClauses.join(', ')} WHERE ou = $${paramIndex} RETURNING *`;
    const { rows } = await pool.query<PartnerProfileRow>(sql, values);

    if (rows.length === 0) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner profile '${ou}' not found`, req.requestId)
      );
    }

    logger.info({ ou, updatedBy: user.sub, fields: Object.keys(body) }, 'partner_profile_updated');
    return reply.status(200).send(successEnvelope(rows[0], req.requestId));
  });

  /* ── POST /v3/partners/:ou/teaming-fit — F-300 tool ────────── */
  app.post<{ Params: { ou: string } }>('/v3/partners/:ou/teaming-fit', async (req, reply) => {
    const { ou } = req.params;
    if (!isValidOu(ou)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner not found. Valid OUs: ${[...VALID_OUS].join(', ')}`, req.requestId)
      );
    }

    const body = req.body as { opportunity_id: string } | null;
    if (!body?.opportunity_id) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'opportunity_id is required', req.requestId)
      );
    }

    try {
      const result = await computeTeamingFit(body.opportunity_id, ou);
      return reply.status(200).send(successEnvelope(result, req.requestId));
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err), ou, opportunityId: body.opportunity_id },
        'teaming_fit_error'
      );
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Teaming fit computation failed', req.requestId)
      );
    }
  });

  // POST /v3/partners/discover-contacts — discover teaming-partner contacts via web search
  app.post('/v3/partners/discover-contacts', async (req, reply) => {
    const body = req.body as {
      limit?: number;
      max_contacts?: number;
      partners?: string[];
    } | null;

    const { discoverPartnerContacts } = await import(
      '../services/contacts/partner-discovery.js'
    );

    try {
      const result = await discoverPartnerContacts({
        limit: body?.limit ?? 25,
        max_contacts: body?.max_contacts ?? 5,
        partners: body?.partners,
      });
      return reply.send(successEnvelope(result, req.requestId));
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        'discover_partner_contacts_route_error',
      );
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Partner contact discovery failed', req.requestId),
      );
    }
  });
}

/* ── DB-dependent teaming fit (wraps pure scoring function) ──────── */

async function computeTeamingFit(opportunityId: string, ou: string): Promise<TeamingFitResult> {
  const { rows: partnerRows } = await pool.query<PartnerProfileRow>(
    `SELECT * FROM partner_profiles WHERE ou = $1 AND active = true`,
    [ou]
  );
  if (partnerRows.length === 0) {
    return { ou, partner_name: ou, fit_score: 0, reasons: ['Partner profile not found or inactive'], cited_evidence: [] };
  }
  const partner = partnerRows[0]!;

  const { rows: oppRows } = await pool.query<{
    id: string;
    title: string;
    agency: string | null;
    naics: string | null;
    set_aside: string | null;
    description: string | null;
    place_of_performance: string | null;
  }>(
    `SELECT id, title, agency, naics, set_aside, description, place_of_performance
       FROM opportunities
      WHERE id = $1`,
    [opportunityId]
  );
  if (oppRows.length === 0) {
    return { ou, partner_name: partner.name, fit_score: 0, reasons: ['Opportunity not found'], cited_evidence: [] };
  }
  const opp = oppRows[0]!;

  return computeTeamingFitScore(partner, opp);
}
