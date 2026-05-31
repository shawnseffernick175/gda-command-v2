/**
 * FPDS -> awards mapper.
 * Converts FPDSAwardRaw records to award DB rows + per-field source citations.
 * Follows R1: every data point has a searchable source.
 */

import type { FPDSAwardRaw } from './parser.js';

export interface AwardRow {
  piid: string;
  agency_id: string | null;
  agency_name: string | null;
  contracting_office: string | null;
  awardee_name: string | null;
  awardee_uei: string | null;
  awardee_duns: string | null;
  value_obligated: number | null;
  value_base_and_all_options: number | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  place_of_performance_state: string | null;
  place_of_performance_country: string | null;
  award_date: string | null;
  last_mod_date: string | null;
  contract_type: string | null;
  parent_award_id: string | null;
  sam_notice_id: string | null;
  data_source: string;
  fpds_url: string | null;
}

export interface AwardSourceCitation {
  field: string;
  source_url: string;
}

export interface MappedAward {
  award: AwardRow;
  citations: AwardSourceCitation[];
}

function buildFPDSUrl(piid: string): string {
  return `https://www.fpds.gov/ezsearch/search.do?q=PIID%3A%22${encodeURIComponent(piid)}%22&s=FPDS`;
}

export function mapFPDSAward(raw: FPDSAwardRaw): MappedAward {
  const sourceUrl = raw.fpdsUrl || buildFPDSUrl(raw.piid);

  const award: AwardRow = {
    piid: raw.piid,
    agency_id: raw.agencyId,
    agency_name: raw.agencyName,
    contracting_office: raw.contractingOffice,
    awardee_name: raw.awardeeName,
    awardee_uei: raw.awardeeUEI,
    awardee_duns: raw.awardeeDUNS,
    value_obligated: raw.obligatedAmount,
    value_base_and_all_options: raw.baseAndAllOptionsValue,
    naics: raw.naicsCode,
    psc: raw.pscCode,
    set_aside: raw.setAside,
    place_of_performance_state: raw.placeOfPerformanceState,
    place_of_performance_country: raw.placeOfPerformanceCountry,
    award_date: raw.signedDate,
    last_mod_date: raw.lastModDate,
    contract_type: raw.contractType,
    parent_award_id: raw.parentAwardId,
    sam_notice_id: raw.solicitationId,
    data_source: 'fpds.gov',
    fpds_url: sourceUrl,
  };

  const citations: AwardSourceCitation[] = [];

  if (award.awardee_name) {
    citations.push({ field: 'awardee', source_url: sourceUrl });
  }
  if (award.value_obligated !== null || award.value_base_and_all_options !== null) {
    citations.push({ field: 'value', source_url: sourceUrl });
  }
  if (award.naics) {
    citations.push({ field: 'naics', source_url: sourceUrl });
  }
  if (award.award_date) {
    citations.push({ field: 'award_date', source_url: sourceUrl });
  }
  if (award.agency_name || award.agency_id) {
    citations.push({ field: 'agency', source_url: sourceUrl });
  }

  return { award, citations };
}
