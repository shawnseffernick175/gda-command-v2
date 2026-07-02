import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['JWT_SECRET'] = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env['GDA_WEBHOOK_KEY'] = 'test-webhook-key';
process.env['DATABASE_URL'] ??= 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';
process.env['NODE_ENV'] = 'test';
process.env['ANALYSIS_VERSION'] ??= 'v0.0.1-test';

vi.mock('../src/lib/db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../src/lib/queue.js', () => ({
  requireBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('job-1'),
  })),
  QUEUE_NAMES: {
    INGEST_POSTPROCESS: 'ingest-postprocess',
  },
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { pool } = await import('../src/lib/db.js');
const {
  buildStubDraftText,
  buildDraftSources,
  lifecycleStatus,
  toDraftApiShape,
} = await import('../src/services/drafts/index.js');

import type { ActionItemRow } from '../src/services/action-items/index.js';
import type { DraftRow } from '../src/services/drafts/index.js';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

function makeActionItem(overrides: Partial<ActionItemRow> = {}): ActionItemRow {
  return {
    id: 'ai-1',
    opportunity_id: 'opp-1',
    source_id: 1,
    title: 'Follow up with CO on J&A request',
    detail: 'Need J&A justification from CO for sole-source procurement',
    status: 'open',
    priority: 'HIGH',
    due_date: '2026-07-10',
    doctrine_source: 'capture_review_killitem',
    assignee_email: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
    draft_text: null,
    draft_evidence_ids: null,
    draft_generated_at: null,
    draft_status: 'pending',
    ...overrides,
  } as ActionItemRow;
}

function makeDraftRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: 1,
    action_item_id: 1,
    kind: 'reply',
    content: 'Draft reply for: Follow up with CO on J&A request',
    model_used: null,
    approved_by: null,
    approved_at: null,
    source_id: 1,
    status: 'pending',
    evidence_ids: ['src-001', 'src-002'],
    rejection_reason: null,
    edit_diff: null,
    original_content: null,
    created_at: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// Draft generation tests
// ────────────────────────────────────────────────────────────

describe('F-310: Draft generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildStubDraftText generates non-empty drafts for all kinds', () => {
    const item = makeActionItem();
    const kinds = ['reply', 'research', 'milestone'] as const;

    for (const kind of kinds) {
      const text = buildStubDraftText(kind, item);
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain(item.title);
    }
  });

  it('buildStubDraftText includes item detail context when present', () => {
    const item = makeActionItem({ detail: 'Sole-source procurement context' });
    const text = buildStubDraftText('reply', item);
    expect(text).toContain('Sole-source procurement context');
  });

  it('buildStubDraftText handles missing detail gracefully', () => {
    const item = makeActionItem({ detail: null });
    const text = buildStubDraftText('reply', item);
    expect(text).toContain('Please advise on next steps');
    expect(text).not.toContain('null');
  });

  it('buildStubDraftText includes due date for research kind', () => {
    const item = makeActionItem({ due_date: '2026-08-01' });
    const text = buildStubDraftText('research', item);
    expect(text).toContain('2026-08-01');
  });

  it('buildStubDraftText handles missing due date', () => {
    const item = makeActionItem({ due_date: null });
    const text = buildStubDraftText('research', item);
    expect(text).toContain('No due date set');
  });
});

// ────────────────────────────────────────────────────────────
// Citation tests (R1)
// ────────────────────────────────────────────────────────────

describe('F-310: Citation verification', () => {
  it('buildDraftSources returns at least one evidence source per kind', () => {
    const kinds = ['reply', 'research', 'milestone'] as const;
    for (const kind of kinds) {
      const sources = buildDraftSources(kind);
      expect(sources.length).toBeGreaterThan(0);
    }
  });

  it('each source has required R1 fields: kind, title, url, retrieved_at', () => {
    const sources = buildDraftSources('reply');
    for (const source of sources) {
      const s = source as Record<string, unknown>;
      expect(s).toHaveProperty('kind');
      expect(s).toHaveProperty('title');
      expect(s).toHaveProperty('url');
      expect(s).toHaveProperty('retrieved_at');
      expect(typeof s.title).toBe('string');
      expect(typeof s.url).toBe('string');
      expect((s.title as string).length).toBeGreaterThan(0);
      expect((s.url as string).length).toBeGreaterThan(0);
    }
  });

  it('retrieved_at is a valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const sources = buildDraftSources('reply');
    const after = new Date().toISOString();

    for (const source of sources) {
      const s = source as Record<string, unknown>;
      const ts = s.retrieved_at as string;
      expect(ts >= before).toBe(true);
      expect(ts <= after).toBe(true);
    }
  });

  it('toDraftApiShape includes evidence_ids array in output', () => {
    const row = makeDraftRow({ evidence_ids: ['ev-1', 'ev-2', 'ev-3'] });
    const api = toDraftApiShape(row) as Record<string, unknown>;
    expect(api.evidence_ids).toEqual(['ev-1', 'ev-2', 'ev-3']);
  });

  it('toDraftApiShape defaults evidence_ids to empty array when null', () => {
    const row = makeDraftRow({ evidence_ids: null });
    const api = toDraftApiShape(row) as Record<string, unknown>;
    expect(api.evidence_ids).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// No-context handling
// ────────────────────────────────────────────────────────────

describe('F-310: No-context handling', () => {
  it('action item with no detail produces a draft with advisory text', () => {
    const item = makeActionItem({ detail: null, title: 'Generic task' });
    const text = buildStubDraftText('reply', item);
    expect(text).toContain('Please advise on next steps');
  });

  it('lifecycleStatus returns "generating" for pending draft with no content', () => {
    const row = makeDraftRow({ status: 'pending', content: '' });
    expect(lifecycleStatus(row)).toBe('generating');
  });

  it('lifecycleStatus returns "done" when content is present', () => {
    const row = makeDraftRow({ status: 'pending', content: 'Some draft text' });
    expect(lifecycleStatus(row)).toBe('done');
  });

  it('lifecycleStatus returns "failed" when rejected', () => {
    const row = makeDraftRow({ status: 'rejected', content: 'Some draft' });
    expect(lifecycleStatus(row)).toBe('failed');
  });
});

// ────────────────────────────────────────────────────────────
// Draft API shape
// ────────────────────────────────────────────────────────────

describe('F-310: Draft API shape', () => {
  it('toDraftApiShape includes rejection_reason and edit_diff', () => {
    const row = makeDraftRow({
      rejection_reason: 'Voice mismatch',
      edit_diff: '- old line\n+ new line',
      original_content: 'original text',
    });
    const api = toDraftApiShape(row) as Record<string, unknown>;
    expect(api.rejection_reason).toBe('Voice mismatch');
    expect(api.edit_diff).toBe('- old line\n+ new line');
    expect(api.original_content).toBe('original text');
  });

  it('toDraftApiShape nulls optional fields when absent', () => {
    const row = makeDraftRow({
      rejection_reason: null,
      edit_diff: null,
      original_content: null,
    });
    const api = toDraftApiShape(row) as Record<string, unknown>;
    expect(api.rejection_reason).toBeNull();
    expect(api.edit_diff).toBeNull();
    expect(api.original_content).toBeNull();
  });
});
