/**
 * FPDS ATOM XML parser — converts raw ATOM feed XML into typed
 * FPDSAwardRaw records using fast-xml-parser.
 *
 * FPDS uses a complex namespace structure:
 *   ns1:award > ns1:awardID, ns1:relevantContractDates, ns1:dollarValues,
 *   ns1:vendor, ns1:contractData, ns1:competition, ns1:placeOfPerformance, etc.
 */

import { XMLParser } from 'fast-xml-parser';
import { logger } from '../../lib/logger.js';

export interface FPDSAwardRaw {
  piid: string;
  agencyId: string | null;
  agencyName: string | null;
  contractingOffice: string | null;
  awardeeName: string | null;
  awardeeUEI: string | null;
  awardeeDUNS: string | null;
  obligatedAmount: number | null;
  baseAndAllOptionsValue: number | null;
  naicsCode: string | null;
  pscCode: string | null;
  setAside: string | null;
  placeOfPerformanceState: string | null;
  placeOfPerformanceCountry: string | null;
  signedDate: string | null;
  lastModDate: string | null;
  contractType: string | null;
  parentAwardId: string | null;
  solicitationId: string | null;
  fpdsUrl: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => name === 'entry',
});

function text(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'object' && val !== null && '#text' in val) {
    return String((val as Record<string, unknown>)['#text']).trim() || null;
  }
  const s = String(val).trim();
  return s === '' ? null : s;
}

function num(val: unknown): number | null {
  const t = text(val);
  if (t === null) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function attrDesc(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'object' && val !== null && '@_description' in val) {
    return String((val as Record<string, unknown>)['@_description']).trim() || null;
  }
  return text(val);
}

function extractAward(content: Record<string, unknown>): FPDSAwardRaw | null {
  const award = (content['award'] ?? content['IDV']) as Record<string, unknown> | undefined;
  if (!award) return null;

  const awardId = award['awardID'] as Record<string, unknown> | undefined;
  const awardContractId = awardId?.['awardContractID'] as Record<string, unknown> | undefined;
  const referencedIdvId = awardId?.['referencedIDVID'] as Record<string, unknown> | undefined;

  const piid = text(awardContractId?.['PIID']);
  if (!piid) return null;

  const contractingAgency = award['contractingOfficeAgencyID'] as Record<string, unknown> | undefined;
  const contractingOffice = award['contractingOfficeID'] as Record<string, unknown> | undefined;

  const dates = award['relevantContractDates'] as Record<string, unknown> | undefined;
  const dollars = award['dollarValues'] as Record<string, unknown> | undefined;

  const vendor = award['vendor'] as Record<string, unknown> | undefined;
  const vendorHeader = vendor?.['vendorHeader'] as Record<string, unknown> | undefined;
  const vendorSiteDetails = vendor?.['vendorSiteDetails'] as Record<string, unknown> | undefined;

  const contractData = award['contractData'] as Record<string, unknown> | undefined;
  const competition = award['competition'] as Record<string, unknown> | undefined;

  const pop = award['placeOfPerformance'] as Record<string, unknown> | undefined;
  const popAddress = pop?.['principalPlaceOfPerformance'] as Record<string, unknown> | undefined;

  const productOrServiceInfo = award['productOrServiceInformation'] as Record<string, unknown> | undefined;

  return {
    piid,
    agencyId: text(contractingAgency?.['@_agencyID']),
    agencyName: text(contractingAgency?.['@_name']) ?? attrDesc(contractingAgency),
    contractingOffice: text(contractingOffice?.['@_name']) ?? attrDesc(contractingOffice),
    awardeeName: text(vendorHeader?.['vendorName']),
    awardeeUEI: text(vendorSiteDetails?.['uniqueEntityIdSam'] ?? vendorSiteDetails?.['UEI']),
    awardeeDUNS: text(vendorSiteDetails?.['DUNSNumber']),
    obligatedAmount: num(dollars?.['obligatedAmount']),
    baseAndAllOptionsValue: num(dollars?.['baseAndAllOptionsValue']),
    naicsCode: text(contractData?.['NAICS'] ?? (contractData?.['NAICSCode'] as Record<string, unknown> | undefined)?.['@_code']),
    pscCode: text(productOrServiceInfo?.['productOrServiceCode'] ?? (productOrServiceInfo?.['productOrServiceCode'] as Record<string, unknown> | undefined)?.['@_code']),
    setAside: attrDesc(competition?.['typeOfSetAside']),
    placeOfPerformanceState: text(popAddress?.['stateCode'] ?? (popAddress?.['stateCode'] as Record<string, unknown> | undefined)?.['@_name']),
    placeOfPerformanceCountry: text(popAddress?.['countryCode'] ?? (popAddress?.['countryCode'] as Record<string, unknown> | undefined)?.['@_name']),
    signedDate: text(dates?.['signedDate']),
    lastModDate: null,
    contractType: attrDesc(contractData?.['typeOfContractPricing']),
    parentAwardId: text(referencedIdvId?.['PIID']),
    solicitationId: text(contractData?.['solicitationID']),
    fpdsUrl: null,
  };
}

/**
 * Parse a single FPDS ATOM XML page into typed records.
 * Skips entries that fail to parse (logs warning, does not throw).
 */
export function parseFPDSPage(xml: string): FPDSAwardRaw[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const feed = parsed['feed'] as Record<string, unknown> | undefined;
  if (!feed) return [];

  const entries = feed['entry'];
  if (!entries) return [];

  const entryList = Array.isArray(entries) ? entries : [entries];
  const results: FPDSAwardRaw[] = [];

  for (const entry of entryList) {
    try {
      const entryObj = entry as Record<string, unknown>;
      const content = entryObj['content'] as Record<string, unknown> | undefined;
      if (!content) continue;

      // Extract link for fpds_url
      const link = entryObj['link'] as Record<string, unknown> | undefined;
      const linkHref = text(link?.['@_href']);

      const record = extractAward(content);
      if (!record) continue;

      record.fpdsUrl = linkHref;
      // ATOM entry modification date is the canonical last-mod timestamp
      const lastMod = text(entryObj['modified'] ?? entryObj['updated']);
      if (lastMod) {
        record.lastModDate = lastMod.slice(0, 10);
      }

      results.push(record);
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'fpds_parse_entry_skipped',
      );
    }
  }

  return results;
}
