import type { FastifyInstance, FastifyRequest } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { pool } from '../lib/db.js';
import type { JwtPayload } from '../middleware/auth.js';

/* ── Types ───────────────────────────────────────────────────────── */

interface PartnerProfileRow {
  ou: string;
  name: string;
  owner: string;
  overview: string;
  agencies_of_strength: string[];
  naics_codes: string[];
  capabilities_summary: unknown[];
  past_performance_summary: unknown[];
  key_personnel: unknown[];
  certifications: string[];
  active: boolean;
  last_reviewed_at: string;
}

interface TeamingFitResult {
  ou: string;
  partner_name: string;
  fit_score: number;
  reasons: string[];
  cited_evidence: Array<{ field: string; value: string }>;
}

/* ── OU owner UUIDs (Tom Rogers = OU1/PD Systems, Derrick Elliot = OU2/Riverstone) ── */
const OU_OWNERS: Record<string, string> = {
  riverstone: '00000000-0000-0000-0000-000000000002',
  pd_systems: '00000000-0000-0000-0000-000000000003',
};

const VALID_OUS = new Set(['riverstone', 'pd_systems']);

/* ── Stale threshold (90 days) ───────────────────────────────────── */
const STALE_THRESHOLD_DAYS = 90;

function isStale(lastReviewedAt: string): boolean {
  const reviewedDate = new Date(lastReviewedAt);
  const now = new Date();
  const diffMs = now.getTime() - reviewedDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > STALE_THRESHOLD_DAYS;
}

/* ── In-memory fallback data (used when DB table doesn't exist yet) ── */

interface SourceCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

interface Certification {
  name: string;
  status: 'active' | 'expired' | 'pending';
  expiration_date: string | null;
}

interface Vehicle {
  name: string;
  contract: string;
  ceiling_remaining: number | null;
}

interface LegacyPartnerProfile {
  id: string;
  display_name: string;
  anchor_company: string;
  anchor_company_sources: SourceCitation[];
  uei: string | null;
  uei_sources: SourceCitation[];
  cage: string | null;
  cage_sources: SourceCitation[];
  primary_naics: string | null;
  primary_naics_sources: SourceCitation[];
  capabilities: string[];
  capabilities_sources: SourceCitation[];
  certifications: Certification[];
  certifications_sources: SourceCitation[];
  vehicles: Vehicle[];
  vehicles_sources: SourceCitation[];
  past_performance_summary: string;
  past_performance_summary_sources: SourceCitation[];
  recent_awards: unknown[];
  recent_awards_sources: SourceCitation[];
  teaming_history: unknown[];
  teaming_history_sources: SourceCitation[];
}

const SAM_SOURCE: SourceCitation = {
  kind: 'sam_gov',
  title: 'SAM.gov Entity Registry',
  url: 'https://sam.gov',
  retrieved_at: '2026-05-29T06:00:00.000Z',
};

const LEGACY_PARTNERS: Record<string, LegacyPartnerProfile> = {
  riverstone: {
    id: 'riverstone',
    display_name: 'Riverstone Solutions',
    anchor_company: 'Riverstone Solutions (RSI)',
    anchor_company_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/TECGLUBFP6N6', title: 'SAM.gov Riverstone Entity' }],
    uei: 'TECGLUBFP6N6',
    uei_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/TECGLUBFP6N6', title: 'SAM.gov Riverstone Entity' }],
    cage: '71WX3',
    cage_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/TECGLUBFP6N6', title: 'SAM.gov Riverstone Entity' }],
    primary_naics: '541512',
    primary_naics_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/TECGLUBFP6N6', title: 'SAM.gov Riverstone Entity' }],
    capabilities: ['TechSIGINT', 'Cyber Operations', 'IC Clearance', 'Classified DevSecOps', 'SecurScale'],
    capabilities_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/TECGLUBFP6N6', title: 'SAM.gov Riverstone Capabilities' }],
    certifications: [
      { name: 'HUBZone', status: 'active', expiration_date: null },
      { name: 'WOSB', status: 'active', expiration_date: null },
      { name: 'SDB', status: 'active', expiration_date: null },
    ],
    certifications_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/TECGLUBFP6N6', title: 'SAM.gov Certifications' }],
    vehicles: [
      { name: 'MDA SHIELD IDIQ', contract: 'HQ085926DF469', ceiling_remaining: null },
    ],
    vehicles_sources: [{ kind: 'fpds', title: 'FPDS SHIELD Award', url: 'https://www.fpds.gov/ezsearch/search.do?q=HQ085926DF469', retrieved_at: '2026-05-29T06:00:00.000Z' }],
    past_performance_summary: 'IC-focused cyber and TechSIGINT provider with MDA SHIELD prime contract. HUBZone certified — unlocks set-aside bids for Envision teaming.',
    past_performance_summary_sources: [{ kind: 'fpds', title: 'FPDS Riverstone Past Performance', url: 'https://www.fpds.gov/ezsearch/search.do?q=Riverstone+Solutions', retrieved_at: '2026-05-29T06:00:00.000Z' }],
    recent_awards: [],
    recent_awards_sources: [],
    teaming_history: [],
    teaming_history_sources: [],
  },
  pd_systems: {
    id: 'pd_systems',
    display_name: 'PD Systems',
    anchor_company: 'PD Systems Inc.',
    anchor_company_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/pd-systems', title: 'SAM.gov PD Systems Entity' }],
    uei: null,
    uei_sources: [],
    cage: null,
    cage_sources: [],
    primary_naics: '611430',
    primary_naics_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/pd-systems', title: 'SAM.gov PD Systems Entity' }],
    capabilities: ['XR/AR/VR Training', 'Digital Twin Platforms', 'LVC Integration', 'Simulation', 'Immersive Training'],
    capabilities_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/pd-systems', title: 'SAM.gov PD Systems Capabilities' }],
    certifications: [
      { name: 'V3 Veteran', status: 'active', expiration_date: null },
      { name: 'SDB', status: 'active', expiration_date: null },
    ],
    certifications_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/pd-systems', title: 'SAM.gov Certifications' }],
    vehicles: [],
    vehicles_sources: [],
    past_performance_summary: 'Training-focused integrator with 300+ headcount. V3 Veteran certified — strengthens bids requiring veteran preference. XR/AR/VR depth fills immersive training gaps.',
    past_performance_summary_sources: [{ ...SAM_SOURCE, url: 'https://sam.gov/entity/pd-systems', title: 'SAM.gov PD Systems Past Performance' }],
    recent_awards: [],
    recent_awards_sources: [],
    teaming_history: [],
    teaming_history_sources: [],
  },
};

/* ── Helper: try DB fetch, fall back to in-memory ─────────────────── */

async function getProfileFromDb(ou: string): Promise<PartnerProfileRow | null> {
  try {
    const result = await pool.query<PartnerProfileRow>(
      'SELECT * FROM partner_profiles WHERE ou = $1',
      [ou],
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

async function getAllProfilesFromDb(): Promise<PartnerProfileRow[]> {
  try {
    const result = await pool.query<PartnerProfileRow>(
      'SELECT * FROM partner_profiles ORDER BY ou',
    );
    return result.rows;
  } catch {
    return [];
  }
}

/* ── Routes ──────────────────────────────────────────────────────── */

export async function partnerRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/partners — list all partner profiles
  app.get('/v3/partners', async (req, reply) => {
    const dbProfiles = await getAllProfilesFromDb();

    if (dbProfiles.length > 0) {
      const items = dbProfiles.map((p) => ({
        ou: p.ou,
        name: p.name,
        overview: p.overview,
        agencies_of_strength: p.agencies_of_strength,
        certifications: p.certifications,
        active: p.active,
        stale: isStale(p.last_reviewed_at),
        last_reviewed_at: p.last_reviewed_at,
      }));
      return reply.status(200).send(successEnvelope({ items }, req.requestId));
    }

    // Fallback to legacy in-memory data
    const items = Object.values(LEGACY_PARTNERS).map((p) => ({
      id: p.id,
      display_name: p.display_name,
      anchor_company: p.anchor_company,
      capabilities: p.capabilities,
      certifications: p.certifications,
    }));
    return reply.status(200).send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/partners/:id — full profile for one partner
  app.get<{ Params: { id: string } }>('/v3/partners/:id', async (req, reply) => {
    const { id } = req.params;

    // Normalize route param: pd-systems → pd_systems
    const ou = id.replace(/-/g, '_');

    if (!VALID_OUS.has(ou)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner not found. Valid IDs: riverstone, pd_systems`, req.requestId),
      );
    }

    const dbProfile = await getProfileFromDb(ou);
    if (dbProfile) {
      return reply.status(200).send(successEnvelope({
        ...dbProfile,
        stale: isStale(dbProfile.last_reviewed_at),
      }, req.requestId));
    }

    // Fallback to legacy
    const partner = LEGACY_PARTNERS[ou] ?? LEGACY_PARTNERS[id];
    if (!partner) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner not found. Valid IDs: riverstone, pd_systems`, req.requestId),
      );
    }
    return reply.status(200).send(successEnvelope(partner, req.requestId));
  });

  // PATCH /v3/partners/:id — restricted to OU owner; Envision context → 403
  app.patch<{ Params: { id: string } }>('/v3/partners/:id', async (req, reply) => {
    const { id } = req.params;
    const ou = id.replace(/-/g, '_');

    if (!VALID_OUS.has(ou)) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner not found. Valid IDs: riverstone, pd_systems`, req.requestId),
      );
    }

    // Check if the requesting user is the OU owner
    const user = (req as FastifyRequest & { user?: JwtPayload }).user;
    const ownerId = OU_OWNERS[ou];

    // From Envision context (any logged-in user that is NOT the OU owner) → 403
    if (!user || user.sub !== ownerId) {
      return reply.status(403).send(
        errorEnvelope(
          'UNAUTHORIZED',
          'Partner profiles are read-only from Envision context. Only the OU lead can edit.',
          req.requestId,
        ),
      );
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || Object.keys(body).length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'Request body is empty', req.requestId),
      );
    }

    // Allowed fields for update
    const allowedFields = new Set([
      'overview',
      'agencies_of_strength',
      'naics_codes',
      'capabilities_summary',
      'past_performance_summary',
      'key_personnel',
      'certifications',
      'active',
    ]);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(body)) {
      if (!allowedFields.has(key)) continue;
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    if (updates.length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No valid fields to update', req.requestId),
      );
    }

    // Always update last_reviewed_at on edit
    updates.push(`last_reviewed_at = NOW()`);
    values.push(ou);

    try {
      const result = await pool.query<PartnerProfileRow>(
        `UPDATE partner_profiles SET ${updates.join(', ')} WHERE ou = $${paramIndex} RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', 'Partner profile not found in database', req.requestId),
        );
      }

      return reply.status(200).send(successEnvelope(result.rows[0], req.requestId));
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'partner_profile_patch_error');
      return reply.status(500).send(
        errorEnvelope('INTERNAL_ERROR', 'Failed to update partner profile', req.requestId),
      );
    }
  });

  // POST /v3/partners/teaming-fit — compute teaming fit for an opportunity
  app.post<{ Body: { opportunity_id: string; ou?: string } }>(
    '/v3/partners/teaming-fit',
    async (req, reply) => {
      const body = req.body as { opportunity_id?: string; ou?: string } | null;
      if (!body?.opportunity_id) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'opportunity_id is required', req.requestId),
        );
      }

      const { opportunity_id, ou: targetOu } = body;

      try {
        // Fetch opportunity data
        const oppResult = await pool.query<{
          id: string;
          title: string;
          naics: string | null;
          set_aside_code: string | null;
          set_aside_description: string | null;
          description: string | null;
          agency: string | null;
          department: string | null;
        }>(
          `SELECT id, title, naics, set_aside_code, set_aside_description, description, agency, department
           FROM opportunities WHERE id = $1`,
          [opportunity_id],
        );

        if (oppResult.rows.length === 0) {
          return reply.status(404).send(
            errorEnvelope('NOT_FOUND', 'Opportunity not found', req.requestId),
          );
        }

        const opp = oppResult.rows[0];

        // Fetch partner profiles to evaluate
        const ousToCheck = targetOu ? [targetOu] : ['riverstone', 'pd_systems'];
        const results: TeamingFitResult[] = [];

        for (const partnerOu of ousToCheck) {
          const profile = await getProfileFromDb(partnerOu);
          if (!profile || !profile.active) continue;

          const { score, reasons, evidence } = computeTeamingFit(opp, profile);
          if (score > 0) {
            results.push({
              ou: partnerOu,
              partner_name: profile.name,
              fit_score: score,
              reasons,
              cited_evidence: evidence,
            });
          }
        }

        // Sort by score descending
        results.sort((a, b) => b.fit_score - a.fit_score);

        return reply.status(200).send(successEnvelope({ fits: results }, req.requestId));
      } catch (err) {
        logger.error({ error: err instanceof Error ? err.message : String(err) }, 'teaming_fit_error');
        return reply.status(500).send(
          errorEnvelope('INTERNAL_ERROR', 'Teaming fit computation failed', req.requestId),
        );
      }
    },
  );

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

/* ── Teaming Fit Computation ─────────────────────────────────────── */

function computeTeamingFit(
  opp: {
    title: string;
    naics: string | null;
    set_aside_code: string | null;
    set_aside_description: string | null;
    description: string | null;
    agency: string | null;
    department: string | null;
  },
  profile: PartnerProfileRow,
): { score: number; reasons: string[]; evidence: Array<{ field: string; value: string }> } {
  let score = 0;
  const reasons: string[] = [];
  const evidence: Array<{ field: string; value: string }> = [];

  // 1. Set-aside cert match (strongest signal)
  const setAside = (opp.set_aside_code ?? opp.set_aside_description ?? '').toLowerCase();
  if (setAside) {
    const certMap: Record<string, string[]> = {
      hubzone: ['HUBZone'],
      wosb: ['WOSB'],
      sdvosb: ['V3 Veteran', 'SDVOSB'],
      sdb: ['SDB'],
      '8a': ['8(a)', 'SDB'],
      vosb: ['V3 Veteran', 'VOSB'],
    };

    for (const [keyword, certs] of Object.entries(certMap)) {
      if (setAside.includes(keyword)) {
        const matchedCert = profile.certifications.find((c) =>
          certs.some((target) => c.toLowerCase().includes(target.toLowerCase())),
        );
        if (matchedCert) {
          score += 40;
          reasons.push(`${profile.name} holds ${matchedCert} — unlocks ${keyword.toUpperCase()} set-aside`);
          evidence.push({ field: 'certifications', value: matchedCert });
        }
      }
    }
  }

  // 2. Agency alignment
  const oppAgency = (opp.agency ?? opp.department ?? '').toUpperCase();
  if (oppAgency) {
    const matchedAgency = profile.agencies_of_strength.find((a) =>
      oppAgency.includes(a.toUpperCase()),
    );
    if (matchedAgency) {
      score += 25;
      reasons.push(`${profile.name} has depth at ${matchedAgency}`);
      evidence.push({ field: 'agencies_of_strength', value: matchedAgency });
    }
  }

  // 3. NAICS overlap
  if (opp.naics && profile.naics_codes.includes(opp.naics)) {
    score += 15;
    reasons.push(`NAICS ${opp.naics} is in ${profile.name} core codes`);
    evidence.push({ field: 'naics_codes', value: opp.naics });
  }

  // 4. Capability keyword match from opp description/title
  const searchText = `${opp.title ?? ''} ${opp.description ?? ''}`.toLowerCase();
  const capabilities = profile.capabilities_summary as Array<{ area: string; description: string }>;
  for (const cap of capabilities) {
    const areaLower = cap.area.toLowerCase();
    const keywords = areaLower.split(/[\s/]+/);
    const matched = keywords.some((kw) => kw.length > 3 && searchText.includes(kw));
    if (matched) {
      score += 10;
      reasons.push(`Scope aligns with ${profile.name} capability: ${cap.area}`);
      evidence.push({ field: 'capabilities_summary', value: cap.area });
      break; // one capability match is enough
    }
  }

  // Cap score at 100
  score = Math.min(score, 100);

  return { score, reasons, evidence };
}
