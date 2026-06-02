/**
 * DSIP enriched topic → ExternalOpportunityRow mapper.
 * Converts DSIP list + detail records to opportunity DB rows + per-field
 * source citations. Follows R1: every data point has a searchable source.
 *
 * data_source = 'sbir' (canonical PrimarySource enum value).
 * status = 'discovery' (DB CHECK constraint); 'signal' preserved in tags.
 */

import type { DSIPEnrichedTopic } from './types.js';
import type { ExternalOpportunityRow, SourceCitation } from '../framework/source_writer.js';
import { SBIR_KEYWORDS } from './client.js';

function trimOrNull(val: string | null | undefined): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

/**
 * Strip HTML tags from a string.
 */
function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

/**
 * Convert epoch-millis to ISO date string (YYYY-MM-DD).
 */
function epochToISO(epochMs: number | null | undefined): string | null {
  if (epochMs === null || epochMs === undefined || epochMs === 0) return null;
  try {
    return new Date(epochMs).toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * Build the public DSIP topic URL.
 */
function buildTopicUrl(topicId: string): string {
  return `https://www.dodsbirsttr.mil/topics-app/topics/${encodeURIComponent(topicId)}`;
}

/**
 * Map DoD component code to a human-readable label.
 */
function normalizeComponent(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const MAP: Record<string, string> = {
    ARMY: 'Army',
    NAVY: 'Navy',
    AF: 'Air Force',
    DARPA: 'DARPA',
    MDA: 'MDA',
    DISA: 'DISA',
    DTRA: 'DTRA',
    DHA: 'DHA',
    DIU: 'DIU',
    SOCOM: 'SOCOM',
    DLA: 'DLA',
    OSD: 'OSD',
    CBD: 'CBD',
    NGA: 'NGA',
    NRO: 'NRO',
    SPACEFORCE: 'Space Force',
    USSF: 'Space Force',
  };
  return MAP[s] ?? String(raw).trim();
}

/**
 * Build tags array from topic metadata + keyword matching.
 */
function buildTags(
  topic: DSIPEnrichedTopic,
): string[] {
  const tags: string[] = ['fast_track', 'signal', 'sbir', 'dod'];

  const { list, detail } = topic;

  const program = list.program?.toUpperCase();
  if (program === 'STTR') tags.push('sttr');
  else tags.push('sbir_program');

  const comp = normalizeComponent(list.component);
  if (comp) tags.push(comp.toLowerCase().replace(/\s+/g, '_'));

  if (detail?.technologyAreas) {
    for (const area of detail.technologyAreas) {
      const t = trimOrNull(area);
      if (t) tags.push(t.toLowerCase().replace(/\s+/g, '_'));
    }
  }

  if (detail?.focusAreas) {
    for (const area of detail.focusAreas) {
      const t = trimOrNull(area);
      if (t) tags.push(t.toLowerCase().replace(/\s+/g, '_'));
    }
  }

  const searchable = [
    list.topicTitle,
    detail?.description,
    detail?.objective,
    detail?.keywords,
  ].filter(Boolean).join(' ').toLowerCase();

  for (const kw of SBIR_KEYWORDS) {
    if (searchable.includes(kw)) {
      tags.push(`kw:${kw.replace(/\s+/g, '_')}`);
    }
  }

  return [...new Set(tags)];
}

export function mapDSIPTopic(
  topic: DSIPEnrichedTopic,
): { opportunity: ExternalOpportunityRow; citations: SourceCitation[] } | null {
  const { list, detail } = topic;

  const topicId = trimOrNull(list.topicId);
  if (!topicId) return null;

  const title = trimOrNull(list.topicTitle);
  if (!title) return null;

  const sourceUrl = buildTopicUrl(topicId);

  const descParts: string[] = [];
  const objText = stripHtml(detail?.objective);
  const descText = stripHtml(detail?.description);
  if (objText) descParts.push(objText);
  if (descText && descText !== objText) descParts.push(descText);
  const description = descParts.length > 0 ? descParts.join('\n\n') : null;

  const comp = normalizeComponent(list.component);

  const opportunity: ExternalOpportunityRow = {
    external_id: topicId,
    title,
    agency: 'Department of Defense',
    sub_agency: comp,
    department: 'Department of Defense',
    solicitation_number: trimOrNull(list.solicitationNumber),
    status: 'discovery',
    value_min: null,
    value_max: null,
    naics: null,
    psc: null,
    set_aside: null,
    place_of_performance: null,
    response_due_at: epochToISO(list.topicEndDate),
    posted_at: epochToISO(list.topicStartDate),
    description,
    data_source: 'sbir',
    tags: buildTags(topic),
    agency_subtype: trimOrNull(list.program),
    opportunity_type: 'sbir_topic',
    part_number: trimOrNull(list.topicCode),
    quantity: null,
  };

  const citations: SourceCitation[] = [];

  if (opportunity.title) {
    citations.push({ field: 'title', source_url: sourceUrl });
  }
  if (opportunity.agency) {
    citations.push({ field: 'agency', source_url: sourceUrl });
  }
  if (opportunity.response_due_at) {
    citations.push({ field: 'response_due_at', source_url: sourceUrl });
  }
  if (opportunity.posted_at) {
    citations.push({ field: 'posted_at', source_url: sourceUrl });
  }

  return { opportunity, citations };
}
