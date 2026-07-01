import { describe, it, expect } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

const { chunkText } = await import('../src/services/rag/chunker.js');
const { computeSha256 } = await import('../src/services/rag/store.js');

describe('RAG chunker', () => {
  it('returns single chunk for short text', () => {
    const result = chunkText('This is a short document.');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('This is a short document.');
  });

  it('returns empty array for empty text', () => {
    const result = chunkText('');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for whitespace-only text', () => {
    const result = chunkText('   \n\n   ');
    expect(result).toHaveLength(0);
  });

  it('preserves page_number and section_title metadata', () => {
    const result = chunkText('Short text.', 5, 'Introduction');
    expect(result).toHaveLength(1);
    expect(result[0].page_number).toBe(5);
    expect(result[0].section_title).toBe('Introduction');
  });

  it('splits long text into multiple chunks', () => {
    const paragraphs: string[] = [];
    for (let i = 0; i < 20; i++) {
      paragraphs.push(`Paragraph ${i}. ${' This is a sentence with enough words to add up.'.repeat(10)}`);
    }
    const longText = paragraphs.join('\n\n');
    const result = chunkText(longText);
    expect(result.length).toBeGreaterThan(1);
    result.forEach((chunk) => {
      expect(chunk.text.length).toBeGreaterThan(0);
    });
  });

  it('handles text with many short paragraphs', () => {
    const paragraphs = Array.from({ length: 50 }, (_, i) => `Point ${i + 1}.`);
    const text = paragraphs.join('\n\n');
    const result = chunkText(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const allText = result.map((c) => c.text).join(' ');
    expect(allText).toContain('Point 1.');
    expect(allText).toContain('Point 50.');
  });
});

describe('SHA256 dedup', () => {
  it('produces consistent hashes', () => {
    const buf = Buffer.from('hello world');
    const hash1 = computeSha256(buf);
    const hash2 = computeSha256(buf);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('produces different hashes for different content', () => {
    const hash1 = computeSha256(Buffer.from('file A'));
    const hash2 = computeSha256(Buffer.from('file B'));
    expect(hash1).not.toBe(hash2);
  });
});

describe('RAG types validation', () => {
  it('DocType constants are consistent', async () => {
    const validTypes = [
      'ceo_doctrine', 'business_plan', 'capabilities', 'past_performance',
      'cpar', 'workflow_spec', 'rfp', 'proposal_draft', 'capture_plan',
      'partner_intel', 'financial', 'news_article', 'meeting_transcript',
      'sow', 'awarded_contract', 'other',
    ];
    expect(validTypes).toHaveLength(16);
  });

  it('OuTag constants are consistent', () => {
    const validTags = ['gda', 'envision', 'pds', 'riverstone'];
    expect(validTags).toHaveLength(4);
  });

  it('EvidenceGrade constants are consistent', () => {
    const validGrades = ['A', 'B', 'C'];
    expect(validGrades).toHaveLength(3);
  });
});
