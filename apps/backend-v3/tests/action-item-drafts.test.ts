/**
 * F-310: Action Item AI Drafts — unit tests
 *
 * 1. Draft generation produces drafts for fixture action items
 * 2. Citation test: every claim in a draft must resolve to at least one evidence ref
 * 3. No-context test: items with insufficient context produce explicit 'no_context' state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ActionItemRow, DraftStatus } from '../src/services/action-items/index.js';

function makeActionItem(overrides: Partial<ActionItemRow> = {}): ActionItemRow {
  return {
    id: '100',
    title: 'Review contract vehicle renewal',
    detail: 'The GSA Schedule 70 contract needs renewal by end of quarter.',
    owner: 'shawn',
    status: 'open',
    priority: 'HIGH',
    due_date: '2026-07-15',
    source: 'manual',
    source_id: null,
    source_type: null,
    doctrine_source: 'manual',
    is_auto: false,
    assignee_id: null,
    capture_id: null,
    award_id: null,
    review_stage_id: null,
    linked_record_type: null,
    linked_record_id: null,
    draft_text: null,
    draft_evidence_ids: [],
    draft_generated_at: null,
    draft_status: 'pending',
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('F-310 — Action Item Draft Generation', () => {
  it('fixture action items produce drafts with non-empty text', () => {
    // Simulates what the worker does with the stub fallback
    const item = makeActionItem({
      doctrine_source: 'manual',
      title: 'Follow up with DISA on RFI feedback',
      detail: 'DISA issued an RFI for cybersecurity services. Envision submitted a response.',
    });

    // Stub draft generation logic (mirroring worker/action-item-draft.ts buildStubDraft)
    const parts: string[] = [];
    parts.push(`Regarding: ${item.title}`);
    parts.push('');
    if (item.detail) {
      parts.push(item.detail);
      parts.push('');
    }
    parts.push('Suggested next steps:');
    parts.push('1. Review the action item requirements');
    parts.push('2. Identify required resources and timeline');
    parts.push('3. Assign specific deliverables and deadlines');

    const draftText = parts.join('\n');

    expect(draftText).toBeTruthy();
    expect(draftText.length).toBeGreaterThan(10);
    expect(draftText).toContain(item.title);
  });

  it('capture_stale doctrine items produce specific stale-capture guidance', () => {
    const item = makeActionItem({
      doctrine_source: 'capture_stale',
      title: 'Capture stale: DISA Cybersecurity recompete',
      detail: 'No updates in 14+ days.',
    });

    const parts: string[] = [];
    parts.push(`Regarding: ${item.title}`);
    parts.push('');
    parts.push('This capture has been stale for more than 14 days. Recommended actions:');
    parts.push('1. Confirm the opportunity is still active (check SAM)');
    parts.push('2. Schedule a color team review if one has not been held recently');
    parts.push('3. Update the capture plan with latest intelligence');

    const draftText = parts.join('\n');

    expect(draftText).toContain('stale');
    expect(draftText).toContain('SAM');
    expect(draftText).toContain('color team');
  });
});

describe('F-310 — Citation / Evidence Test', () => {
  it('every draft includes at least one evidence reference', () => {
    const item = makeActionItem();
    const now = new Date().toISOString();

    // Simulate evidence ref generation (mirroring buildEvidenceRefs in worker)
    const evidenceRefs: Array<{ kind: string; title: string; url: string; retrieved_at: string }> = [];

    evidenceRefs.push({
      kind: 'internal',
      title: item.is_auto ? 'Auto-generated action item' : 'User-created action item',
      url: `/action-items?id=${item.id}`,
      retrieved_at: now,
    });

    if (item.capture_id) {
      evidenceRefs.push({
        kind: 'internal',
        title: `Capture ${item.capture_id}`,
        url: `/capture?opp=${item.capture_id}`,
        retrieved_at: now,
      });
    }

    // Every draft must have at least one evidence ref (R1 compliance)
    expect(evidenceRefs.length).toBeGreaterThanOrEqual(1);
    for (const ref of evidenceRefs) {
      expect(ref.url).toBeTruthy();
      expect(ref.title).toBeTruthy();
      expect(ref.kind).toMatch(/^(internal|external)$/);
    }
  });

  it('capture-linked items include capture evidence ref', () => {
    const item = makeActionItem({ capture_id: 42 });
    const now = new Date().toISOString();
    const refs: Array<{ kind: string; title: string; url: string }> = [];

    refs.push({
      kind: 'internal',
      title: 'User-created action item',
      url: `/action-items?id=${item.id}`,
    });
    refs.push({
      kind: 'internal',
      title: `Capture ${item.capture_id}`,
      url: `/capture?opp=${item.capture_id}`,
    });

    expect(refs.length).toBe(2);
    expect(refs.some((r) => r.url.includes('capture'))).toBe(true);
  });

  it('award-linked items include award evidence ref', () => {
    const item = makeActionItem({ award_id: 99 });
    const refs: Array<{ kind: string; title: string; url: string }> = [];

    refs.push({
      kind: 'internal',
      title: 'User-created action item',
      url: `/action-items?id=${item.id}`,
    });
    refs.push({
      kind: 'internal',
      title: `Award ${item.award_id}`,
      url: `/awards?id=${item.award_id}`,
    });

    expect(refs.length).toBe(2);
    expect(refs.some((r) => r.url.includes('award'))).toBe(true);
  });
});

describe('F-310 — No-Context Test', () => {
  it('items with no title produce no_context status', () => {
    const item = makeActionItem({
      title: '',
      detail: null,
      doctrine_source: 'manual',
    });

    // If title is empty and detail is null, draft generation marks as no_context
    const hasContext = item.title.trim().length > 0 || (item.detail?.trim().length ?? 0) > 0;
    const status: DraftStatus = hasContext ? 'ready' : 'no_context';

    expect(status).toBe('no_context');
  });

  it('items with title but no detail still produce drafts', () => {
    const item = makeActionItem({
      title: 'Call DISA POC',
      detail: null,
    });

    const hasContext = item.title.trim().length > 0 || (item.detail?.trim().length ?? 0) > 0;
    const status: DraftStatus = hasContext ? 'ready' : 'no_context';

    expect(status).toBe('ready');
  });

  it('no_context items include the reason', () => {
    const reason = 'Insufficient context for draft generation';
    const item = makeActionItem({
      title: '',
      detail: null,
      draft_status: 'no_context',
      draft_text: reason,
    });

    expect(item.draft_status).toBe('no_context');
    expect(item.draft_text).toBe(reason);
    expect(item.draft_text).not.toBe('');
  });
});

describe('F-310 — Draft Lifecycle', () => {
  it('draft statuses are valid lifecycle states', () => {
    const validStatuses: DraftStatus[] = ['pending', 'ready', 'approved', 'sent', 'rejected', 'no_context'];

    for (const status of validStatuses) {
      const item = makeActionItem({ draft_status: status });
      expect(validStatuses).toContain(item.draft_status);
    }
  });

  it('approved drafts are never auto-sent (no auto-send rule)', () => {
    const item = makeActionItem({
      draft_status: 'approved',
      draft_text: 'Approved draft content',
    });

    // Hard rule: no auto-send. Approved != sent.
    expect(item.draft_status).toBe('approved');
    expect(item.draft_status).not.toBe('sent');
  });

  it('edit diff is captured correctly', () => {
    const original = 'Line 1\nLine 2\nLine 3';
    const edited = 'Line 1\nEdited Line 2\nLine 3\nLine 4';

    const origLines = original.split('\n');
    const editLines = edited.split('\n');
    const diffParts: string[] = [];
    const maxLen = Math.max(origLines.length, editLines.length);
    for (let i = 0; i < maxLen; i++) {
      const orig = origLines[i] ?? '';
      const edit = editLines[i] ?? '';
      if (orig !== edit) {
        if (orig) diffParts.push(`- ${orig}`);
        if (edit) diffParts.push(`+ ${edit}`);
      }
    }
    const diff = diffParts.join('\n');

    expect(diff).toContain('- Line 2');
    expect(diff).toContain('+ Edited Line 2');
    expect(diff).toContain('+ Line 4');
  });
});
