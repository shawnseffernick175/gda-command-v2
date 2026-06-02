import { describe, it, expect } from 'vitest';
import { mapDSIPTopic } from '../../src/ingest/sbir/mapper.js';
import type { DSIPEnrichedTopic, DSIPTopicListItem, DSIPTopicDetail } from '../../src/ingest/sbir/types.js';

function makeListItem(overrides: Partial<DSIPTopicListItem> = {}): DSIPTopicListItem {
  return {
    topicId: '70a161bc0a1842808a5d24ecce84ad31_86381',
    topicCode: 'ARM26BX01-NV001',
    topicTitle: 'In Transit Visibility Blockchain',
    topicStatus: 'Open',
    program: 'SBIR',
    component: 'ARMY',
    command: 'ASA(ALT)',
    solicitationNumber: '26.BX',
    solicitationTitle: 'DoW SBIR 2026 CSO',
    phaseHierarchy: null,
    topicStartDate: 1778068800000,
    topicEndDate: 1780502400000,
    topicPreReleaseStartDate: 1776117600000,
    topicPreReleaseEndDate: 1778068800000,
    cycleName: 'DOD_SBIR_2026_P1_CBX',
    cmmcLevel: 'Level 1',
    releaseNumber: 1,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<DSIPTopicDetail> = {}): DSIPTopicDetail {
  return {
    topicId: '70a161bc0a1842808a5d24ecce84ad31_86381',
    description: '<p>Military logistics systems offer significant potential.</p>',
    objective: '<p>This topic seeks to develop a real-time ITV system.</p>',
    focusAreas: ['Advanced Computing and Software', 'Trusted AI and Autonomy'],
    technologyAreas: ['Materials'],
    keywords: 'Distributed-ledger; tokenization; blockchain; encryption',
    itar: false,
    cmmcLevel: 'Level 1',
    phase1Description: '<p>Phase I info</p>',
    phase2Description: '<p>Phase II info</p>',
    phase3Description: '<p>Phase III info</p>',
    referenceDocuments: [],
    ...overrides,
  };
}

function makeEnriched(
  listOverrides: Partial<DSIPTopicListItem> = {},
  detailOverrides: Partial<DSIPTopicDetail> = {},
): DSIPEnrichedTopic {
  return {
    list: makeListItem(listOverrides),
    detail: makeDetail(detailOverrides),
  };
}

describe('mapDSIPTopic', () => {
  it('maps all core fields from enriched DSIP topic', () => {
    const result = mapDSIPTopic(makeEnriched());
    expect(result).not.toBeNull();
    const { opportunity } = result!;

    expect(opportunity.external_id).toBe('70a161bc0a1842808a5d24ecce84ad31_86381');
    expect(opportunity.title).toBe('In Transit Visibility Blockchain');
    expect(opportunity.agency).toBe('Department of Defense');
    expect(opportunity.sub_agency).toBe('Army');
    expect(opportunity.department).toBe('Department of Defense');
    expect(opportunity.data_source).toBe('sbir');
    expect(opportunity.status).toBe('signal');
    expect(opportunity.opportunity_type).toBe('sbir_topic');
    expect(opportunity.solicitation_number).toBe('26.BX');
    expect(opportunity.part_number).toBe('ARM26BX01-NV001');
    expect(opportunity.agency_subtype).toBe('SBIR');
  });

  it('sets data_source to sbir (canonical PrimarySource)', () => {
    const result = mapDSIPTopic(makeEnriched());
    expect(result!.opportunity.data_source).toBe('sbir');
  });

  it('uses topicId as external_id', () => {
    const result = mapDSIPTopic(makeEnriched());
    expect(result!.opportunity.external_id).toBe('70a161bc0a1842808a5d24ecce84ad31_86381');
  });

  it('converts epoch-millis topicEndDate to ISO response_due_at', () => {
    const result = mapDSIPTopic(makeEnriched({ topicEndDate: 1780502400000 }));
    const dueAt = result!.opportunity.response_due_at;
    expect(dueAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(dueAt!).getTime()).toBe(
      new Date(new Date(1780502400000).toISOString().split('T')[0]).getTime(),
    );
  });

  it('converts epoch-millis topicStartDate to ISO posted_at', () => {
    const result = mapDSIPTopic(makeEnriched({ topicStartDate: 1778068800000 }));
    expect(result!.opportunity.posted_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles null dates gracefully', () => {
    const result = mapDSIPTopic(makeEnriched({
      topicEndDate: null,
      topicStartDate: null,
    }));
    expect(result!.opportunity.response_due_at).toBeNull();
    expect(result!.opportunity.posted_at).toBeNull();
  });

  it('strips HTML from description and objective', () => {
    const result = mapDSIPTopic(makeEnriched());
    const desc = result!.opportunity.description!;
    expect(desc).not.toContain('<p>');
    expect(desc).not.toContain('</p>');
    expect(desc).toContain('real-time ITV system');
    expect(desc).toContain('logistics systems');
  });

  it('builds source_url from topicId', () => {
    const result = mapDSIPTopic(makeEnriched());
    const citations = result!.citations;
    const titleCitation = citations.find((c) => c.field === 'title');
    expect(titleCitation?.source_url).toContain('dodsbirsttr.mil');
    expect(titleCitation?.source_url).toContain('70a161bc0a1842808a5d24ecce84ad31_86381');
  });

  it('generates per-field source citations (R1)', () => {
    const result = mapDSIPTopic(makeEnriched());
    const { citations } = result!;
    const fields = citations.map((c) => c.field);

    expect(fields).toContain('title');
    expect(fields).toContain('agency');
    expect(fields).toContain('response_due_at');
    expect(fields).toContain('posted_at');

    for (const citation of citations) {
      expect(citation.source_url).toContain('dodsbirsttr.mil');
    }
  });

  it('omits response_due_at citation when topicEndDate is null', () => {
    const result = mapDSIPTopic(makeEnriched({ topicEndDate: null }));
    const fields = result!.citations.map((c) => c.field);
    expect(fields).not.toContain('response_due_at');
  });

  it('returns null when topicId is missing', () => {
    const topic = makeEnriched({ topicId: '' });
    expect(mapDSIPTopic(topic)).toBeNull();
  });

  it('returns null when topicTitle is missing', () => {
    const topic = makeEnriched({ topicTitle: '' });
    expect(mapDSIPTopic(topic)).toBeNull();
  });

  it('includes fast_track, sbir, dod tags', () => {
    const result = mapDSIPTopic(makeEnriched());
    const tags = result!.opportunity.tags;
    expect(tags).toContain('fast_track');
    expect(tags).toContain('sbir');
    expect(tags).toContain('dod');
  });

  it('includes component tag', () => {
    const result = mapDSIPTopic(makeEnriched({ component: 'NAVY' }));
    expect(result!.opportunity.tags).toContain('navy');
  });

  it('includes technology area and focus area tags from detail', () => {
    const result = mapDSIPTopic(makeEnriched());
    const tags = result!.opportunity.tags;
    expect(tags).toContain('materials');
    expect(tags).toContain('advanced_computing_and_software');
    expect(tags).toContain('trusted_ai_and_autonomy');
  });

  it('handles null detail gracefully', () => {
    const topic: DSIPEnrichedTopic = {
      list: makeListItem(),
      detail: null,
    };
    const result = mapDSIPTopic(topic);
    expect(result).not.toBeNull();
    expect(result!.opportunity.description).toBeNull();
    expect(result!.opportunity.tags).toContain('fast_track');
  });

  it('maps STTR program correctly', () => {
    const result = mapDSIPTopic(makeEnriched({ program: 'STTR' }));
    expect(result!.opportunity.agency_subtype).toBe('STTR');
    expect(result!.opportunity.tags).toContain('sttr');
  });

  it('normalizes component to human-readable label', () => {
    const result = mapDSIPTopic(makeEnriched({ component: 'AF' }));
    expect(result!.opportunity.sub_agency).toBe('Air Force');
  });

  it('matches defense keywords in description and tags them', () => {
    const result = mapDSIPTopic(makeEnriched(
      {},
      { description: '<p>Advanced artificial intelligence for cybersecurity</p>' },
    ));
    const tags = result!.opportunity.tags;
    expect(tags).toContain('kw:artificial_intelligence');
    expect(tags).toContain('kw:cybersecurity');
  });
});
