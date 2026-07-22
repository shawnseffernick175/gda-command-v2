/**
 * SAM.gov keyword adapter — polls SAM.gov Opportunities API v2
 * with per-org keywords and normalizes results into FasTrac signals.
 *
 * Reuses the SAM API key and retry logic pattern from the existing
 * SAM ingest client (apps/backend-v3/src/ingest/sam/client.ts).
 */

import { logger } from '../../lib/logger.js';
import { envFirst } from '../../lib/env.js';
import { inferHorizon, inferSignalType, extractMissionTags } from './normalize.js';
import { isCommoditySignal } from './commodity-filter.js';
import type { FasTracSignal, SourceConfig } from './types.js';

const SAM_API_BASE = 'https://api.sam.gov/opportunities/v2/search';
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 2_000;
const REQUEST_DELAY_MS = 600;

interface SAMOpp {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  description?: string;
  postedDate?: string;
  responseDeadLine?: string;
  type?: string;
  uiLink?: string;
  organizationType?: string;
  officeAddress?: { city?: string; state?: string };
  pointOfContact?: Array<{ fullName?: string; email?: string }>;
  naicsCode?: string;
  classificationCode?: string;
  setAside?: string;
}

interface SAMResponse {
  totalRecords: number;
  opportunitiesData?: SAMOpp[];
}

function getSAMApiKey(): string {
  const key = envFirst(['SAM_GOV_API_KEY', 'SAM_API_KEY']);
  if (!key) throw new Error('SAM_GOV_API_KEY not set — FasTrac SAM adapter cannot run');
  return key;
}

function toSAMDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

async function fetchWithRetry(url: string): Promise<SAMResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** attempt));
          continue;
        }
        throw new Error(`SAM API ${resp.status}: ${text.slice(0, 200)}`);
      }
      return (await resp.json()) as SAMResponse;
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Fetch SAM.gov opportunities matching the source's keywords,
 * posted within the last 30 days. Normalizes to FasTrac signals.
 */
export async function fetchSAMSignals(source: SourceConfig): Promise<FasTracSignal[]> {
  const apiKey = getSAMApiKey();
  const signals: FasTracSignal[] = [];

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);

  for (const keyword of source.samKeywords ?? []) {
    try {
      const url = new URL(SAM_API_BASE);
      url.searchParams.set('api_key', apiKey);
      url.searchParams.set('postedFrom', toSAMDate(fromDate));
      url.searchParams.set('postedTo', toSAMDate(toDate));
      url.searchParams.set('keyword', keyword);
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', '0');

      const data = await fetchWithRetry(url.toString());
      const opps = data.opportunitiesData ?? [];

      logger.info(
        { source: source.name, keyword, count: opps.length, total: data.totalRecords },
        'fastrac_sam_keyword_fetched',
      );

      let commodityRejected = 0;
      for (const opp of opps) {
        if (!opp.title || !opp.uiLink) continue;

        const filter = isCommoditySignal(
          opp.title,
          opp.description,
          opp.classificationCode,
        );
        if (filter.rejected) {
          commodityRejected++;
          logger.debug(
            { source: source.name, title: opp.title, reason: filter.reason },
            'fastrac_commodity_rejected',
          );
          continue;
        }

        const textBlob = `${opp.title} ${opp.description ?? ''}`;

        // F-631: verify source label — only use the org name if the
        // record actually mentions it; otherwise label as SAM.gov
        const mentionsSource = source.samKeywords?.some((kw) =>
          textBlob.toLowerCase().includes(kw.toLowerCase()),
        ) ?? false;
        const effectiveSource = mentionsSource ? source.name : `SAM.gov`;

        const signal: FasTracSignal = {
          source: effectiveSource,
          source_url: opp.uiLink,
          title: opp.title,
          mission_tags: extractMissionTags(textBlob),
          horizon: inferHorizon(textBlob),
          signal_type: inferSignalType(textBlob),
          institution_type: source.institutionType,
          funding_mechanism: source.fundingMechanism,
          published_at: opp.postedDate ?? null,
          summary: opp.description?.slice(0, 500) ?? null,
        };
        signals.push(signal);
      }

      if (commodityRejected > 0) {
        logger.info(
          { source: source.name, keyword, commodityRejected },
          'fastrac_commodity_filter_applied',
        );
      }

      // Rate limit between keyword queries
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    } catch (err) {
      logger.error(
        {
          source: source.name,
          keyword,
          error: err instanceof Error ? err.message : String(err),
        },
        'fastrac_sam_keyword_error',
      );
    }
  }

  return signals;
}
