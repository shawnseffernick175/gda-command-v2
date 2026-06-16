/**
 * SAM.gov TO Source Adapter — polls SAM.gov contract opportunities API
 * for task orders on RS3, SHIELD, EAGLE, TSS-E, TRAYSYS, MAPS vehicles.
 */

import { logger } from '../../../lib/logger.js';
import { config } from '../../../config/index.js';
import type { RawTOPosting, TaskOrderAnnouncement } from './gsaEbuySource.js';

const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';

/**
 * Poll SAM.gov for task orders matching a specific IDIQ vehicle.
 */
export async function pollSamGovTO(
  vehicleId: number,
  sourceConfig: Record<string, unknown>,
): Promise<RawTOPosting[]> {
  const apiKey = config.samApiKey;
  if (!apiKey) {
    logger.warn('[sam-gov-to] SAM_API_KEY not configured — skipping poll');
    return [];
  }

  const vehicleFilter = (sourceConfig.vehicle_filter as string) ?? '';
  const contractNumber = (sourceConfig.contract_number as string) ?? '';
  const agency = (sourceConfig.agency as string) ?? '';

  // Build filters — for IDIQ TOs, search by parent contract or vehicle keywords
  const keywords = [vehicleFilter, contractNumber].filter(Boolean).join(' OR ');

  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: getDateDaysAgo(60),
    postedTo: getTodayDate(),
    limit: '100',
    offset: '0',
    ptype: 'o',
  });

  if (keywords) {
    params.set('keyword', keywords);
  }

  // Filter by agency hierarchy if known
  if (agency) {
    params.set('deptname', agency);
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
        '[sam-gov-to] SAM.gov API error',
      );
      return [];
    }

    const data = await response.json() as {
      opportunitiesData?: Array<Record<string, unknown>>;
    };

    const opportunities = data.opportunitiesData ?? [];
    return opportunities.map((opp) => mapToRaw(opp));
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), vehicleFilter },
      '[sam-gov-to] poll failed',
    );
    return [];
  }
}

/**
 * Parse a SAM.gov raw posting into canonical TO format.
 */
export function parseSamGovTO(raw: RawTOPosting, vehicleShortName: string): TaskOrderAnnouncement {
  const isOpen = !raw.responseDeadLine || new Date(raw.responseDeadLine) > new Date();
  const hasAward = raw.award?.awardee != null;

  let status: TaskOrderAnnouncement['status'] = 'open';
  if (hasAward) status = 'awarded';
  else if (!isOpen) status = 'closed';

  return {
    external_id: raw.noticeId,
    title: raw.title,
    agency: raw.agency,
    sub_agency: raw.subAgency ?? null,
    pool_or_lane: null,
    set_aside: mapSetAside(raw.setAside),
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

function mapSetAside(raw: string | undefined): string | null {
  if (!raw) return null;
  const mapping: Record<string, string> = {
    SBA: 'SB',
    'Total Small Business': 'SB',
    '8(a)': '8(a)',
    'Service-Disabled Veteran-Owned Small Business': 'SDVOSB',
    HUBZone: 'HUBZone',
    'Women-Owned Small Business': 'WOSB',
    'Partial Small Business': 'SB',
  };
  return mapping[raw] ?? raw;
}

function mapToRaw(opp: Record<string, unknown>): RawTOPosting {
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
