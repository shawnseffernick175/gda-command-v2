import { describe, expect, it, vi } from 'vitest';

// tech_sync imports the pg pool + logger at module load; stub them so the pure
// relevance function can be unit-tested without a DB connection.
vi.mock('../../src/lib/db.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { assessTechRelevance } from '../../src/ingest/fastrac/tech_sync.js';

describe('assessTechRelevance — FasTrac tech-pipeline relevance filter', () => {
  it('mirrors a defense-relevant arXiv paper and tags the lane', () => {
    const tags = assessTechRelevance({
      title: 'Autonomous UAV swarm coordination in GPS-denied environments',
      description: 'A reinforcement-learning approach for contested ISR missions.',
      tags: [],
      data_source: 'arxiv',
      published_at: null,
      source_url: 'https://arxiv.org/abs/2601.00001',
    });
    expect(tags).toContain('autonomous systems');
    expect(tags.length).toBeGreaterThan(0);
  });

  it('rejects a generic (non-defense) arXiv paper even if it hits a dual-use lane', () => {
    const tags = assessTechRelevance({
      title: 'A deep learning model for retail product recommendation',
      description: 'Improving e-commerce conversion with neural networks.',
      tags: [],
      data_source: 'arxiv',
      published_at: null,
      source_url: 'https://arxiv.org/abs/2601.00002',
    });
    // AI/ML lane hit, but no defense context → arXiv gate excludes it.
    expect(tags).toEqual([]);
  });

  it('mirrors an NSF award on a lane hit alone (feed is already scoped)', () => {
    const tags = assessTechRelevance({
      title: 'Cybersecurity for critical infrastructure control systems',
      description: 'Zero-trust intrusion detection research.',
      tags: [],
      data_source: 'nsf',
      published_at: null,
      source_url: 'https://nsf.gov/awardsearch/x',
    });
    expect(tags).toContain('cyber');
  });

  it('rejects a row that hits no lane', () => {
    const tags = assessTechRelevance({
      title: 'Genome sequencing of freshwater algae',
      description: 'A study of chloroplast evolution.',
      tags: [],
      data_source: 'nih',
      published_at: null,
      source_url: 'https://reporter.nih.gov/x',
    });
    expect(tags).toEqual([]);
  });
});
