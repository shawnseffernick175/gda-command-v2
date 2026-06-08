import type { FastifyInstance } from 'fastify';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';

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

interface SourceCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

interface PartnerProfile {
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

const PARTNERS: Record<string, PartnerProfile> = {
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

const PARTNER_LIST = Object.values(PARTNERS).map((p) => ({
  id: p.id,
  display_name: p.display_name,
  anchor_company: p.anchor_company,
  capabilities: p.capabilities,
  certifications: p.certifications,
}));

export async function partnerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v3/partners', async (req, reply) => {
    return reply.status(200).send(successEnvelope({ items: PARTNER_LIST }, req.requestId));
  });

  app.get<{ Params: { id: string } }>('/v3/partners/:id', async (req, reply) => {
    const { id } = req.params;
    const partner = PARTNERS[id];
    if (!partner) {
      return reply.status(404).send(
        errorEnvelope('NOT_FOUND', `Partner not found. Valid IDs: ${Object.keys(PARTNERS).join(', ')}`, req.requestId)
      );
    }
    return reply.status(200).send(successEnvelope(partner, req.requestId));
  });

  // POST /v3/partners/discover-contacts \u2014 discover teaming-partner contacts via web search
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
