/**
 * SBIR.gov award record → sbir_awards DB row + per-field source citations.
 * R1 compliant: every mapped data point has a source URL.
 */

import type { SBIRAwardRaw } from './client.js';

export interface SBIRAwardRow {
  award_number: string;
  program: string;
  phase: string;
  award_year: number;
  agency: string;
  branch: string | null;
  awardee_name: string;
  awardee_uei: string | null;
  awardee_duns: string | null;
  awardee_city: string | null;
  awardee_state: string | null;
  awardee_zip: string | null;
  pi_name: string | null;
  research_institution: string | null;
  title: string;
  abstract: string | null;
  award_amount: number | null;
  contract_number: string | null;
  proposal_number: string | null;
  topic_code: string | null;
  solicitation_number: string | null;
  award_start_date: string | null;
  award_end_date: string | null;
  sbir_url: string | null;
}

export interface SBIRAwardCitation {
  field: string;
  source_url: string;
}

export interface MappedSBIRAward {
  award: SBIRAwardRow;
  citations: SBIRAwardCitation[];
}

function trimOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function numOrNull(val: number | string | null | undefined): number | null {
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

function normalizePhase(raw: string | null | undefined): string {
  if (!raw) return 'Phase I';
  const s = String(raw).trim().toLowerCase();
  if (s.includes('iii') || s.includes('3')) return 'Phase III';
  if (s.includes('ii') || s.includes('2')) return 'Phase II';
  return 'Phase I';
}

function normalizeProgram(raw: string | null | undefined): string {
  if (!raw) return 'SBIR';
  const s = String(raw).trim().toUpperCase();
  return s.includes('STTR') ? 'STTR' : 'SBIR';
}

/**
 * Parse branch from agency sub-component text.
 * Handles: "Army", "Navy", "Air Force", "DARPA", "AFWERX", "DHA", etc.
 */
function parseBranch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const lower = s.toLowerCase();
  if (lower.includes('army')) return 'Army';
  if (lower.includes('navy') || lower.includes('naval') || lower.includes('navair') || lower.includes('navsea') || lower.includes('navwar')) return 'Navy';
  if (lower.includes('air force') || lower.includes('afrl') || lower.includes('afosr') || lower.includes('afwerx')) return 'Air Force';
  if (lower.includes('darpa')) return 'DARPA';
  if (lower.includes('marine') || lower.includes('usmc')) return 'Marine Corps';
  if (lower.includes('space force') || lower.includes('ussf') || lower.includes('space systems')) return 'Space Force';
  if (lower.includes('dha') || lower.includes('health')) return 'DHA';
  if (lower.includes('diu')) return 'DIU';
  if (lower.includes('dtra')) return 'DTRA';
  if (lower.includes('socom') || lower.includes('special operations') || lower.includes('sofwerx')) return 'SOCOM';
  if (lower.includes('missile defense') || lower.includes('mda')) return 'MDA';
  if (lower.includes('disa')) return 'DISA';
  if (lower.includes('cbd') || lower.includes('chemical') || lower.includes('biological')) return 'CBD';
  if (lower.includes('dla')) return 'DLA';
  if (lower.includes('osd') || lower.includes('office of the secretary')) return 'OSD';

  return s;
}

export function mapSBIRAward(raw: SBIRAwardRaw): MappedSBIRAward | null {
  const awardNumber = trimOrNull(raw.award_number);
  if (!awardNumber) return null;

  const firm = trimOrNull(raw.firm);
  if (!firm) return null;

  const title = trimOrNull(raw.award_title);
  if (!title) return null;

  const awardYear = raw.award_year != null ? Number(raw.award_year) : NaN;
  if (isNaN(awardYear)) return null;

  const sbirUrl = trimOrNull(raw.sbir_url) ?? `https://www.sbir.gov/node/${awardNumber}`;
  const branch = parseBranch(trimOrNull(raw.branch));

  const award: SBIRAwardRow = {
    award_number: awardNumber,
    program: normalizeProgram(raw.program),
    phase: normalizePhase(raw.phase),
    award_year: awardYear,
    agency: 'DOD',
    branch,
    awardee_name: firm,
    awardee_uei: trimOrNull(raw.uei),
    awardee_duns: trimOrNull(raw.duns),
    awardee_city: trimOrNull(raw.city),
    awardee_state: trimOrNull(raw.state),
    awardee_zip: trimOrNull(raw.zip),
    pi_name: trimOrNull(raw.pi),
    research_institution: trimOrNull(raw.ri),
    title,
    abstract: trimOrNull(raw.award_abstract),
    award_amount: numOrNull(raw.award_amount),
    contract_number: trimOrNull(raw.contract),
    proposal_number: trimOrNull(raw.proposal_number),
    topic_code: trimOrNull(raw.topic_code),
    solicitation_number: trimOrNull(raw.solicitation_number),
    award_start_date: parseDateOrNull(raw.award_start_date),
    award_end_date: parseDateOrNull(raw.award_end_date),
    sbir_url: sbirUrl,
  };

  const citations: SBIRAwardCitation[] = [];

  if (award.awardee_name) {
    citations.push({ field: 'awardee', source_url: sbirUrl });
  }
  if (award.award_amount !== null) {
    citations.push({ field: 'amount', source_url: sbirUrl });
  }
  if (award.topic_code) {
    citations.push({ field: 'topic', source_url: sbirUrl });
  }

  return { award, citations };
}
