/**
 * Routing table coverage — every Task has exactly one RoutingTableEntry.
 */

import { describe, it, expect } from 'vitest';
import { ROUTING_TABLE, getTableEntry } from '../../src/lib/llm-router.table.js';
import type { Task } from '../../src/lib/llm-router.types.js';

const ALL_TASKS: Task[] = [
  'fast_track_triage',
  'opportunity_analysis',
  'capture_plan',
  'daily_briefing',
  'sentinel_summary',
  'doctrine_score',
  'semantic_embed',
  'source_research',
];

describe('[Routing Table] Coverage', () => {
  it('has exactly 8 entries', () => {
    expect(ROUTING_TABLE).toHaveLength(8);
  });

  it('has exactly one entry per Task', () => {
    const tasks = ROUTING_TABLE.map((e) => e.task).sort();
    expect(tasks).toEqual([...ALL_TASKS].sort());
  });

  it('has no duplicate tasks', () => {
    const tasks = ROUTING_TABLE.map((e) => e.task);
    expect(new Set(tasks).size).toBe(tasks.length);
  });

  ALL_TASKS.forEach((task) => {
    it(`getTableEntry('${task}') returns valid entry`, () => {
      const entry = getTableEntry(task);
      expect(entry.task).toBe(task);
      expect(entry.provider).toBeTruthy();
      expect(entry.model).toBeTruthy();
      expect(entry.timeout_ms).toBeGreaterThan(0);
    });
  });

  it('opportunity_analysis has 10s timeout per R2', () => {
    const entry = getTableEntry('opportunity_analysis');
    expect(entry.timeout_ms).toBe(10_000);
  });

  it('opportunity_analysis has fallback configured', () => {
    const entry = getTableEntry('opportunity_analysis');
    expect(entry.fallback).not.toBeNull();
    expect(entry.fallback!.model).toBe('claude-haiku-4-5');
  });

  it('fast_track_triage has no fallback', () => {
    const entry = getTableEntry('fast_track_triage');
    expect(entry.fallback).toBeNull();
  });

  it('sentinel_summary has no fallback', () => {
    const entry = getTableEntry('sentinel_summary');
    expect(entry.fallback).toBeNull();
  });

  it('semantic_embed uses openai provider', () => {
    const entry = getTableEntry('semantic_embed');
    expect(entry.provider).toBe('openai');
  });

  it('source_research uses perplexity provider', () => {
    const entry = getTableEntry('source_research');
    expect(entry.provider).toBe('perplexity');
  });
});
