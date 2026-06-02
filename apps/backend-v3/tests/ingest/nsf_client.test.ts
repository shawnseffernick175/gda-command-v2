import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the NSF awards client — verifies request URL construction,
 * pagination, empty/missing response handling, and HTTP error propagation.
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

import { fetchNSFAwards, NSF_KEYWORDS } from '../../src/ingest/nsf/client.js';
import type { NSFAwardRaw } from '../../src/ingest/nsf/types.js';

function makeApiResponse(awards: NSFAwardRaw[]) {
  return {
    statusCode: 200,
    body: {
      json: async () => ({ response: { award: awards } }),
      text: async () => '',
    },
  };
}

function makeEmptyResponse() {
  return {
    statusCode: 200,
    body: {
      json: async () => ({ response: {} }),
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

function makeAward(id: string): NSFAwardRaw {
  return {
    id,
    title: `Award ${id}`,
    agency: 'National Science Foundation',
    estimatedTotalAmt: '500000',
    startDate: '01/15/2026',
  };
}

describe('fetchNSFAwards', () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it('sends request with correct host, path, printFields, rpp, and date params', async () => {
    mockRequest.mockResolvedValueOnce(makeApiResponse([makeAward('001')]));

    const since = new Date('2026-05-01T00:00:00Z');
    const until = new Date('2026-05-08T00:00:00Z');
    await fetchNSFAwards({ since, until });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const url: string = mockRequest.mock.calls[0][0];

    expect(url).toContain('api.nsf.gov');
    expect(url).toContain('awards.json');
    expect(url).toContain('printFields=');
    expect(url).toContain('id');
    expect(url).toContain('title');
    expect(url).toContain('abstractText');
    expect(url).toContain('rpp=25');
    // Dates in MM/DD/YYYY format
    expect(url).toContain('startDateStart=05%2F01%2F2026');
    expect(url).toContain('startDateEnd=05%2F08%2F2026');
  });

  it('uses default keywords when none provided', async () => {
    mockRequest.mockResolvedValueOnce(makeApiResponse([]));

    const since = new Date('2026-05-01T00:00:00Z');
    const until = new Date('2026-05-08T00:00:00Z');
    await fetchNSFAwards({ since, until });

    const url: string = mockRequest.mock.calls[0][0];
    // Verify at least one keyword is in the URL
    expect(url).toContain('keyword=');
    for (const kw of NSF_KEYWORDS) {
      expect(url).toContain(encodeURIComponent(kw).replace(/%20/g, '+'));
    }
  });

  it('paginates until fewer than rpp rows return', async () => {
    // Page 1: 25 records (full page) -> page 2: 5 records (less than rpp, stop)
    const page1 = Array.from({ length: 25 }, (_, i) => makeAward(`P1-${i}`));
    const page2 = Array.from({ length: 5 }, (_, i) => makeAward(`P2-${i}`));

    mockRequest
      .mockResolvedValueOnce(makeApiResponse(page1))
      .mockResolvedValueOnce(makeApiResponse(page2));

    const since = new Date('2026-05-01T00:00:00Z');
    const until = new Date('2026-05-08T00:00:00Z');
    const result = await fetchNSFAwards({ since, until });

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(30);
  });

  it('stops at configured limit', async () => {
    const page1 = Array.from({ length: 25 }, (_, i) => makeAward(`L-${i}`));

    mockRequest.mockResolvedValueOnce(makeApiResponse(page1));

    const since = new Date('2026-05-01T00:00:00Z');
    const until = new Date('2026-05-08T00:00:00Z');
    const result = await fetchNSFAwards({ since, until, limit: 10 });

    expect(result).toHaveLength(10);
  });

  it('returns empty array when response.award is missing', async () => {
    mockRequest.mockResolvedValueOnce(makeEmptyResponse());

    const since = new Date('2026-05-01T00:00:00Z');
    const until = new Date('2026-05-08T00:00:00Z');
    const result = await fetchNSFAwards({ since, until });

    expect(result).toEqual([]);
  });

  it('returns empty array when response.award is empty', async () => {
    mockRequest.mockResolvedValueOnce(makeApiResponse([]));

    const since = new Date('2026-05-01T00:00:00Z');
    const until = new Date('2026-05-08T00:00:00Z');
    const result = await fetchNSFAwards({ since, until });

    expect(result).toEqual([]);
  });

  it('throws on HTTP 4xx error (non-429)', async () => {
    mockRequest.mockResolvedValueOnce(makeErrorResponse(403));

    const since = new Date('2026-05-01T00:00:00Z');
    const until = new Date('2026-05-08T00:00:00Z');

    await expect(fetchNSFAwards({ since, until })).rejects.toThrow('NSF API 403');
  });
});
