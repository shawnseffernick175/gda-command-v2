import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the DSIP SBIR client — verifies search request construction,
 * pagination, detail enrichment, retry on 429/5xx, and HTTP error propagation.
 */

const { mockRequest } = vi.hoisted(() => {
  const mockRequest = vi.fn();
  return { mockRequest };
});

vi.mock('undici', () => ({ request: mockRequest }));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { fetchDSIPTopics, fetchDSIPTopicDetail } from '../../src/ingest/sbir/client.js';
import type { DSIPTopicListItem, DSIPTopicDetail } from '../../src/ingest/sbir/types.js';

function makeTopic(id: string): DSIPTopicListItem {
  return {
    topicId: id,
    topicCode: `ARM-${id}`,
    topicTitle: `Topic ${id}`,
    topicStatus: 'Open',
    program: 'SBIR',
    component: 'ARMY',
    command: null,
    solicitationNumber: '26.BX',
    solicitationTitle: 'DoW SBIR 2026 CSO',
    phaseHierarchy: null,
    topicStartDate: 1778068800000,
    topicEndDate: 1780502400000,
    topicPreReleaseStartDate: null,
    topicPreReleaseEndDate: null,
    cycleName: 'DOD_SBIR_2026_P1_CBX',
    cmmcLevel: 'Level 1',
    releaseNumber: 1,
  };
}

function makeSearchResponse(topics: DSIPTopicListItem[], total?: number) {
  return {
    statusCode: 200,
    body: {
      json: async () => ({ total: total ?? topics.length, data: topics }),
      text: async () => '',
    },
  };
}

function makeDetailResponse(detail: DSIPTopicDetail) {
  return {
    statusCode: 200,
    body: {
      json: async () => detail,
      text: async () => '',
    },
  };
}

function makeErrorResponse(statusCode: number) {
  return {
    statusCode,
    body: {
      json: async () => ({}),
      text: async () => `Error ${statusCode}`,
    },
  };
}

describe('fetchDSIPTopics', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('sends request to dodsbirsttr.mil with searchParam including openTopics filter', async () => {
    mockRequest.mockResolvedValueOnce(makeSearchResponse([makeTopic('001')]));

    await fetchDSIPTopics(10);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const url: string = mockRequest.mock.calls[0][0];
    expect(url).toContain('dodsbirsttr.mil');
    expect(url).toContain('topics/search');
    expect(url).toContain('openTopics');
    expect(url).toContain('591');
    expect(url).toContain('592');
  });

  it('paginates until fewer than page size rows return', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => makeTopic(`P1-${i}`));
    const page2 = Array.from({ length: 5 }, (_, i) => makeTopic(`P2-${i}`));

    mockRequest
      .mockResolvedValueOnce(makeSearchResponse(page1, 55))
      .mockResolvedValueOnce(makeSearchResponse(page2, 55));

    const result = await fetchDSIPTopics(100);

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(55);
  });

  it('stops at configured limit', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => makeTopic(`L-${i}`));

    mockRequest.mockResolvedValueOnce(makeSearchResponse(page1, 100));

    const result = await fetchDSIPTopics(10);

    expect(result).toHaveLength(10);
  });

  it('returns empty array when data is empty', async () => {
    mockRequest.mockResolvedValueOnce(makeSearchResponse([], 0));

    const result = await fetchDSIPTopics();

    expect(result).toEqual([]);
  });

  it('throws on HTTP 4xx error (non-429)', async () => {
    mockRequest.mockResolvedValueOnce(makeErrorResponse(403));

    await expect(fetchDSIPTopics()).rejects.toThrow('DSIP API 403');
  });

  it('retries on 429 and eventually succeeds', async () => {
    mockRequest
      .mockResolvedValueOnce(makeErrorResponse(429))
      .mockResolvedValueOnce(makeSearchResponse([makeTopic('R1')], 1));

    const result = await fetchDSIPTopics(10);

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it('retries on 500 and eventually succeeds', async () => {
    mockRequest
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeSearchResponse([makeTopic('S1')], 1));

    const result = await fetchDSIPTopics(10);

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });
});

describe('fetchDSIPTopicDetail', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('fetches detail for a topic by ID', async () => {
    const detail: DSIPTopicDetail = {
      topicId: 'abc123',
      description: '<p>Test description</p>',
      objective: '<p>Test objective</p>',
      focusAreas: ['AI'],
      technologyAreas: ['Materials'],
      keywords: 'AI; ML',
      itar: false,
      cmmcLevel: 'Level 1',
      phase1Description: null,
      phase2Description: null,
      phase3Description: null,
      referenceDocuments: [],
    };

    mockRequest.mockResolvedValueOnce(makeDetailResponse(detail));

    const result = await fetchDSIPTopicDetail('abc123');

    expect(result).not.toBeNull();
    expect(result!.topicId).toBe('abc123');
    expect(result!.description).toBe('<p>Test description</p>');

    const url: string = mockRequest.mock.calls[0][0];
    expect(url).toContain('abc123');
    expect(url).toContain('details');
  });

  it('returns null on error without throwing', async () => {
    mockRequest.mockRejectedValue(new Error('Network error'));

    const result = await fetchDSIPTopicDetail('fail123');

    expect(result).toBeNull();
  });
});
