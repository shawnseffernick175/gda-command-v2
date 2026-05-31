/**
 * USAspending -> awards mapper.
 * Converts USASpendingAwardRaw records to award DB rows + per-field source
 * citations. Follows R1: every data point has a searchable source.
 */

import type { USASpendingAwardRaw } from './client.js';

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
  place_of_performance_state: string | null;
  place_of_performance_country: string | null;
  award_date: string | null;
  last_mod_date: string | null;
  contract_type: string | null;
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

function buildUSASpendingUrl(internalId: string): string {
  return `https://www.usaspending.gov/award/${internalId}`;
}

function trimOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function numOrNull(val: number | null | undefined): number | null {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseDateOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s === '') return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(s);
  return match ? match[0] : null;
}

export function mapUSASpendingAward(raw: USASpendingAwardRaw): MappedAward | null {
  const piid = trimOrNull(raw['Award ID']);
  if (!piid) return null;

  const internalId = trimOrNull(raw['generated_internal_id']);
  const sourceUrl = internalId
    ? buildUSASpendingUrl(internalId)
    : `https://www.usaspending.gov`;

  const award: AwardRow = {
    piid,
    agency_id: trimOrNull(raw['Awarding Sub Agency']),
    agency_name: trimOrNull(raw['Awarding Agency']),
    contracting_office: trimOrNull(raw['Awarding Office']),
    awardee_name: trimOrNull(raw['Recipient Name']),
    awardee_uei: trimOrNull(raw['Recipient UEI']),
    awardee_duns: trimOrNull(raw['Recipient DUNS']),
    value_obligated: numOrNull(raw['Award Amount']),
    value_base_and_all_options: numOrNull(raw['Total Outlays']),
    naics: trimOrNull(raw['NAICS Code']),
    psc: trimOrNull(raw['PSC Code']),
    place_of_performance_state: trimOrNull(raw['Place of Performance State Code']),
    place_of_performance_country: trimOrNull(raw['Place of Performance Country Code']),
    award_date: parseDateOrNull(raw['Start Date']),
    last_mod_date: parseDateOrNull(raw['Last Modified Date']),
    contract_type: trimOrNull(raw['Contract Award Type']),
    sam_notice_id: null,
    data_source: 'usaspending',
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
