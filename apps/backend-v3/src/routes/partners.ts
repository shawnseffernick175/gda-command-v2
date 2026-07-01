import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import type { JwtPayload } from '../middleware/auth.js';

/* ── Types ──────────────────────────────────────────────────────── */

interface CapabilitySummaryItem {
  area: string;
  detail: string;
  evidence_doc_id: string | null;
}

interface PastPerformanceItem {
  agency: string;
  contract_id: string | null;
  value: number | null;
  period: string;
  evidence_doc_id: string | null;
}

interface KeyPersonnelItem {
  name: string;
  clearance: string;
  certifications: string[];
}

interface PartnerProfileRow {
  ou: string;
  name: string;
  owner: string;
  overview: string;
  agencies_of_strength: string[];
  naics_codes: string[];
  capabilities_summary: CapabilitySummaryItem[];
  past_performance_summary: PastPerformanceItem[];
  key_personnel: KeyPersonnelItem[];
  certifications: string[];
  active: boolean;
  last_reviewed_at: string;
}

interface TeamingFitResult {
  ou: string;
  partner_name: string;
  fit_score: number;
  reasons: string[];
  cited_evidence: Array<{
    kind: string;
    detail: string;
    source: string;
  }>;
}

const VALID_OUS = new Set(['riverstone', 'pd_systems']);

/* ── OU-owner UUIDs (OU1 = Tom Rogers, OU2 = Derrick Elliot) ──── */
const OU_OWNERS: Record<string, string> = {
  pd_systems: '00000000-0000-0000-0000-000000000001',
  riverstone: '00000000-0000-0000-0000-000000000002',
};

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
    const items = rows.map((r) => ({
      ou: r.ou,
      name: r.name,
      overview: r.overview,
      capabilities_summary: r.capabilities_summary,
      certifications: r.certifications,
      agencies_of_strength: r.agencies_of_strength,
      naics_codes: r.naics_codes,
      last_reviewed_at: r.last_reviewed_at,
      is_stale: isStale(r.last_reviewed_at),
    }));
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
    if (!VALID_OUS.has(ou)) {
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
    return reply.status(200).send(successEnvelope({
      ...profile,
      is_stale: isStale(profile.last_reviewed_at),
    }, req.requestId));
  });

  /* ── PATCH /v3/partners/:ou — restricted to OU owner ───────── */
  app.patch<{ Params: { ou: string } }>('/v3/partners/:ou', async (req, reply) => {
    const { ou } = req.params;
    if (!VALID_OUS.has(ou)) {
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
    const ownerUuid = OU_OWNERS[ou];
    if (user.sub !== ownerUuid) {
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
    if (!VALID_OUS.has(ou)) {
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

/* ── Helpers ─────────────────────────────────────────────────────── */

function isStale(lastReviewedAt: string): boolean {
  const reviewed = new Date(lastReviewedAt);
  const now = new Date();
  const diffDays = (now.getTime() - reviewed.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
}

async function computeTeamingFit(opportunityId: string, ou: string): Promise<TeamingFitResult> {
  // Fetch partner profile
  const { rows: partnerRows } = await pool.query<PartnerProfileRow>(
    `SELECT * FROM partner_profiles WHERE ou = $1 AND active = true`,
    [ou]
  );
  if (partnerRows.length === 0) {
    return { ou, partner_name: ou, fit_score: 0, reasons: ['Partner profile not found or inactive'], cited_evidence: [] };
  }
  const partner = partnerRows[0]!;

  // Fetch opportunity
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
       FROM unified_opportunities
      WHERE id = $1`,
    [opportunityId]
  );
  if (oppRows.length === 0) {
    return { ou, partner_name: partner.name, fit_score: 0, reasons: ['Opportunity not found'], cited_evidence: [] };
  }
  const opp = oppRows[0]!;

  const reasons: string[] = [];
  const cited_evidence: TeamingFitResult['cited_evidence'] = [];
  let score = 0;

  // 1. Agency match — partner agencies of strength vs opportunity agency
  if (opp.agency) {
    const agencyUpper = opp.agency.toUpperCase();
    const matchedAgency = partner.agencies_of_strength.find(
      (a) => agencyUpper.includes(a.toUpperCase()) || a.toUpperCase().includes(agencyUpper)
    );
    if (matchedAgency) {
      score += 30;
      reasons.push(`${partner.name} has strength at ${matchedAgency} — matches opportunity agency`);
      cited_evidence.push({ kind: 'agency_match', detail: `Agency of strength: ${matchedAgency}`, source: 'partner_profile' });
    }
  }

  // 2. NAICS code match
  if (opp.naics) {
    const oppNaics = opp.naics.replace(/[^0-9]/g, '').slice(0, 6);
    const matchedNaics = partner.naics_codes.find((n) => n.startsWith(oppNaics.slice(0, 4)) || oppNaics.startsWith(n.slice(0, 4)));
    if (matchedNaics) {
      score += 20;
      reasons.push(`NAICS ${matchedNaics} aligns with opportunity NAICS ${opp.naics}`);
      cited_evidence.push({ kind: 'naics_match', detail: `Partner NAICS: ${matchedNaics}, Opp NAICS: ${opp.naics}`, source: 'partner_profile' });
    }
  }

  // 3. Set-aside / certification unlock
  if (opp.set_aside) {
    const setAsideUpper = opp.set_aside.toUpperCase();
    const matchedCert = partner.certifications.find((c) => setAsideUpper.includes(c.toUpperCase()));
    if (matchedCert) {
      score += 25;
      reasons.push(`${partner.name} (${matchedCert} certified) unlocks ${opp.set_aside} set-aside`);
      cited_evidence.push({ kind: 'cert_unlock', detail: `Certification: ${matchedCert} matches set-aside: ${opp.set_aside}`, source: 'partner_profile' });
    }
  }

  // 4. Capability overlap (keyword match from description)
  if (opp.description || opp.title) {
    const text = `${opp.title ?? ''} ${opp.description ?? ''}`.toLowerCase();
    const capabilities = partner.capabilities_summary as CapabilitySummaryItem[];
    for (const cap of capabilities) {
      const keywords = cap.area.toLowerCase().split(/[\s/]+/);
      const matched = keywords.some((kw) => kw.length > 3 && text.includes(kw));
      if (matched) {
        score += 10;
        reasons.push(`Scope overlap: ${cap.area} — ${cap.detail}`);
        cited_evidence.push({ kind: 'capability_match', detail: cap.area, source: 'partner_profile' });
      }
    }
  }

  // 5. Past performance at the same agency
  const ppSummary = partner.past_performance_summary as PastPerformanceItem[];
  if (opp.agency) {
    const agencyUp = opp.agency.toUpperCase();
    const ppMatch = ppSummary.find((pp) => agencyUp.includes(pp.agency.toUpperCase()));
    if (ppMatch) {
      score += 15;
      reasons.push(`Past performance at ${ppMatch.agency}${ppMatch.contract_id ? ` (${ppMatch.contract_id})` : ''}`);
      cited_evidence.push({
        kind: 'past_performance',
        detail: `${ppMatch.agency} ${ppMatch.period}${ppMatch.contract_id ? ` — ${ppMatch.contract_id}` : ''}`,
        source: 'partner_profile',
      });
    }
  }

  // Cap at 100
  const fitScore = Math.min(score, 100);

  if (reasons.length === 0) {
    reasons.push('No significant alignment found between this opportunity and partner capabilities');
  }

  return {
    ou,
    partner_name: partner.name,
    fit_score: fitScore,
    reasons,
    cited_evidence,
  };
}
