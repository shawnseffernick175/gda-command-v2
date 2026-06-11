/**
 * FPDS Atom Feed XML → JSON parser using fast-xml-parser.
 *
 * Extracts award entries from the FPDS ezsearch Atom feed response.
 */

import { XMLParser } from 'fast-xml-parser';

export interface FpdsAwardEntry {
  piid: string | null;
  recipientName: string | null;
  recipientUei: string | null;
  contractingAgency: string | null;
  naicsCode: string | null;
  dollarsObligated: number | null;
  periodOfPerformanceStart: string | null;
  periodOfPerformanceEnd: string | null;
  placeOfPerformanceState: string | null;
  solicitationId: string | null;
  description: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => name === 'entry',
});

function extractText(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === 'string') return node || null;
  if (typeof node === 'object' && node !== null) {
    const obj = node as Record<string, unknown>;
    if ('#text' in obj) return String(obj['#text']) || null;
    if ('@_value' in obj) return String(obj['@_value']) || null;
  }
  return String(node) || null;
}

function extractNumber(node: unknown): number | null {
  const text = extractText(node);
  if (text == null) return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse an FPDS Atom feed XML string into structured award entries.
 */
export function parseFpdsAtomFeed(xml: string): FpdsAwardEntry[] {
  if (!xml || xml.trim().length === 0) return [];

  const parsed = parser.parse(xml);
  const feed = parsed?.feed;
  if (!feed) return [];

  const entries: unknown[] = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

  return entries.map((entry) => {
    const e = entry as Record<string, unknown>;
    const content = e.content as Record<string, unknown> | undefined;
    const award = content?.award as Record<string, unknown> | undefined;

    // Navigate nested FPDS structure
    const awardId = award?.awardID as Record<string, unknown> | undefined;
    const awardContractId = awardId?.awardContractID as Record<string, unknown> | undefined;

    const vendor = award?.vendor as Record<string, unknown> | undefined;
    const vendorHeader = vendor?.vendorHeader as Record<string, unknown> | undefined;
    const vendorName = vendorHeader?.vendorName;
    const vendorDuns = vendor?.vendorSiteDetails as Record<string, unknown> | undefined;
    const uei = vendorDuns?.uniqueEntityIdentifier;

    const contractingOffice = award?.contractingOfficeAgencyID as Record<string, unknown> | undefined;
    const agencyName = contractingOffice?.name ?? contractingOffice?.['@_name'];

    const productOrService = award?.productOrServiceInformation as Record<string, unknown> | undefined;
    const naicsNode = productOrService?.NAICS as Record<string, unknown> | undefined;
    const naicsCode = naicsNode?.['@_code'] ?? naicsNode?.['#text'] ?? productOrService?.naicsCode;

    const dollarValues = award?.dollarValues as Record<string, unknown> | undefined;
    const obligated = dollarValues?.obligatedAmount ?? dollarValues?.totalObligatedAmount;

    const relevantDates = award?.relevantContractDates as Record<string, unknown> | undefined;
    const popStart = relevantDates?.effectiveDate;
    const popEnd = relevantDates?.ultimateCompletionDate ?? relevantDates?.currentCompletionDate;

    const placeOfPerf = award?.placeOfPerformance as Record<string, unknown> | undefined;
    const popState = placeOfPerf?.principalPlaceOfPerformance as Record<string, unknown> | undefined;
    const stateCode = popState?.stateCode ?? placeOfPerf?.stateCode;

    const solId = award?.solicitationID ?? awardContractId?.referencedIDVID;

    const descNode = award?.contractDescription ?? award?.descriptionOfContractRequirement;

    return {
      piid: extractText(awardContractId?.PIID ?? awardContractId?.piid) ?? extractText(awardId?.piid),
      recipientName: extractText(vendorName),
      recipientUei: extractText(uei),
      contractingAgency: extractText(agencyName),
      naicsCode: extractText(naicsCode),
      dollarsObligated: extractNumber(obligated),
      periodOfPerformanceStart: extractText(popStart),
      periodOfPerformanceEnd: extractText(popEnd),
      placeOfPerformanceState: extractText(stateCode),
      solicitationId: extractText(solId),
      description: extractText(descNode),
    };
  });
}
