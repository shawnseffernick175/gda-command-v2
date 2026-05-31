/**
 * SBIR.gov topic record → sbir_topics DB row + per-field source citations.
 * R1 compliant: every mapped data point has a source URL.
 */

import type { SBIRTopicRaw } from './client.js';

export interface SBIRTopicRow {
  topic_code: string;
  solicitation_number: string;
  program: string;
  phase: string;
  agency: string;
  branch: string | null;
  title: string;
  description: string | null;
  technology_areas: string[];
  open_date: string | null;
  close_date: string | null;
  pre_release_date: string | null;
  topic_url: string;
  status: string | null;
}

export interface SBIRTopicCitation {
  field: string;
  source_url: string;
}

export interface MappedSBIRTopic {
  topic: SBIRTopicRow;
  citations: SBIRTopicCitation[];
}

function trimOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
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

function normalizeStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.includes('open')) return 'Open';
  if (s.includes('close')) return 'Closed';
  if (s.includes('pre') || s.includes('release')) return 'Pre-Release';
  if (s.includes('future')) return 'Future';
  return String(raw).trim();
}

/**
 * Parse branch from agency sub-component text.
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

export function mapSBIRTopic(raw: SBIRTopicRaw): MappedSBIRTopic | null {
  const topicCode = trimOrNull(raw.topic_number);
  if (!topicCode) return null;

  const solNumber = trimOrNull(raw.solicitation_number);
  if (!solNumber) return null;

  const title = trimOrNull(raw.topic_title);
  if (!title) return null;

  const topicUrl = trimOrNull(raw.url) ?? `https://www.sbir.gov/node/${topicCode}`;
  const branch = parseBranch(trimOrNull(raw.branch));

  const techAreas: string[] = [];
  if (Array.isArray(raw.technology_areas)) {
    for (const area of raw.technology_areas) {
      const trimmed = trimOrNull(area as string);
      if (trimmed) techAreas.push(trimmed);
    }
  }

  const topic: SBIRTopicRow = {
    topic_code: topicCode,
    solicitation_number: solNumber,
    program: normalizeProgram(raw.program),
    phase: normalizePhase(raw.phase),
    agency: 'DOD',
    branch,
    title,
    description: trimOrNull(raw.description),
    technology_areas: techAreas,
    open_date: parseDateOrNull(raw.open_date),
    close_date: parseDateOrNull(raw.close_date),
    pre_release_date: parseDateOrNull(raw.pre_release_date),
    topic_url: topicUrl,
    status: normalizeStatus(raw.status),
  };

  const citations: SBIRTopicCitation[] = [];

  if (topic.title) {
    citations.push({ field: 'title', source_url: topicUrl });
  }
  if (topic.close_date) {
    citations.push({ field: 'close_date', source_url: topicUrl });
  }

  return { topic, citations };
}
