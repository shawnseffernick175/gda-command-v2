/**
 * GSA eBuy Source Adapter — polls GSA eBuy for RFQ/RFI postings
 * against OASIS+, OASIS legacy, GSA MAS, and POLARIS vehicles.
 *
 * Note: GSA eBuy does not have a public REST API.
 * This adapter uses SAM.gov contract opportunities API filtered by
 * the relevant GSA vehicle contract numbers and GWAC keywords.
 * Production adapter would also poll eBuy vendor notifications via email.
 */

import { pool } from '../../../lib/db.js';
import { logger } from '../../../lib/logger.js';
import { config } from '../../../config/index.js';

export interface RawTOPosting {
  noticeId: string;
  title: string;
  agency: string;
  subAgency?: string;
  postedDate: string;
  responseDeadLine?: string;
  naicsCode?: string;
  setAside?: string;
  placeOfPerformance?: string;
  description?: string;
  resourceLinks?: Array<{ url: string; name: string }>;
  pointOfContact?: Array<{ name: string; email: string }>;
  award?: { amount?: number; awardee?: string; date?: string };
  type?: string;
  classificationCode?: string;
}

export interface TaskOrderAnnouncement {
  external_id: string;
  title: string;
  agency: string;
  sub_agency: string | null;
  pool_or_lane: string | null;
  set_aside: string | null;
  naics_code: string | null;
  est_value_usd: number | null;
  posted_date: string | null;
  response_due: string | null;
  status: 'open' | 'closed' | 'awarded' | 'cancelled';
  description: string | null;
  source_url: string | null;
  attachments: Array<{ filename: string; url: string }> | null;
}

const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';

/**
 * Poll GSA eBuy-related opportunities from SAM.gov.
 * Filters by GWAC vehicle references and GSA-posted TOs.
 */
export async function pollGsaEbuy(
  vehicleId: number,
  sourceConfig: Record<string, unknown>,
): Promise<RawTOPosting[]> {
  const apiKey = config.samApiKey;
  if (!apiKey) {
    logger.warn('[gsa-ebuy] SAM_API_KEY not configured — skipping poll');
    return [];
  }

  const vehicleFilter = (sourceConfig.vehicle_filter as string) ?? '';
  const contractNumber = (sourceConfig.contract_number as string) ?? '';

  // Build search keywords from vehicle filter
  const keywords = [vehicleFilter, contractNumber].filter(Boolean).join(' OR ');

  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: getDateDaysAgo(30),
    postedTo: getTodayDate(),
    limit: '100',
    offset: '0',
    ptype: 'o', // opportunities
  });

  if (keywords) {
    params.set('keyword', keywords);
  }

  const url = `${SAM_API_BASE}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, vehicleFilter },
        '[gsa-ebuy] SAM.gov API error',
      );
      return [];
    }

    const data = await response.json() as {
      opportunitiesData?: Array<Record<string, unknown>>;
    };

    const opportunities = data.opportunitiesData ?? [];
    return opportunities.map((opp) => mapSamToRaw(opp));
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), vehicleFilter },
      '[gsa-ebuy] poll failed',
    );
    return [];
  }
}

/**
 * Parse a raw TO posting into canonical TaskOrderAnnouncement format.
 */
export function parseGsaEbuy(raw: RawTOPosting, vehicleShortName: string): TaskOrderAnnouncement {
  const isOpen = !raw.responseDeadLine || new Date(raw.responseDeadLine) > new Date();
  const hasAward = raw.award?.awardee != null;

  let status: TaskOrderAnnouncement['status'] = 'open';
  if (hasAward) status = 'awarded';
  else if (!isOpen) status = 'closed';

  // Infer pool from title/description
  let poolOrLane: string | null = null;
  const text = `${raw.title} ${raw.description ?? ''}`.toLowerCase();
  if (text.includes('pool 1')) poolOrLane = 'Pool 1';
  else if (text.includes('pool 2')) poolOrLane = 'Pool 2';
  else if (text.includes('pool 3')) poolOrLane = 'Pool 3';

  return {
    external_id: raw.noticeId,
    title: raw.title,
    agency: raw.agency,
    sub_agency: raw.subAgency ?? null,
    pool_or_lane: poolOrLane,
    set_aside: raw.setAside ?? null,
    naics_code: raw.naicsCode ?? null,
    est_value_usd: raw.award?.amount ?? null,
    posted_date: raw.postedDate ?? null,
    response_due: raw.responseDeadLine ?? null,
    status,
    description: raw.description ?? null,
    source_url: `https://sam.gov/opp/${raw.noticeId}/view`,
    attachments: raw.resourceLinks?.map((r) => ({ filename: r.name, url: r.url })) ?? null,
  };
}

function mapSamToRaw(opp: Record<string, unknown>): RawTOPosting {
  return {
    noticeId: String(opp.noticeId ?? opp.solicitationNumber ?? ''),
    title: String(opp.title ?? ''),
    agency: String(opp.fullParentPathName ?? opp.department ?? ''),
    subAgency: opp.subtierAgency ? String(opp.subtierAgency) : undefined,
    postedDate: String(opp.postedDate ?? ''),
    responseDeadLine: opp.responseDeadLine ? String(opp.responseDeadLine) : undefined,
    naicsCode: opp.naicsCode ? String(opp.naicsCode) : undefined,
    setAside: opp.typeOfSetAside ? String(opp.typeOfSetAside) : undefined,
    description: opp.description ? String(opp.description) : undefined,
    type: opp.type ? String(opp.type) : undefined,
    classificationCode: opp.classificationCode ? String(opp.classificationCode) : undefined,
    resourceLinks: Array.isArray(opp.resourceLinks)
      ? (opp.resourceLinks as Array<{ url: string; name: string }>)
      : undefined,
    award: opp.award
      ? {
          amount: (opp.award as Record<string, unknown>).amount as number | undefined,
          awardee: (opp.award as Record<string, unknown>).awardee as string | undefined,
          date: (opp.award as Record<string, unknown>).date as string | undefined,
        }
      : undefined,
  };
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}
