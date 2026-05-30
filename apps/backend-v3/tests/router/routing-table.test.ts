/**
 * Unit tests for routing table coverage.
 * CI validates that the ROUTING_TABLE has exactly one entry per Task.
 */

import { describe, it, expect } from 'vitest';
import { ROUTING_TABLE, getRoutingEntry } from '../../src/lib/llm-router.table.js';
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

describe('Routing Table', () => {
  it('has exactly 8 entries (one per task)', () => {
    expect(ROUTING_TABLE).toHaveLength(8);
  });

  it('has exactly one entry per Task union member', () => {
    const tasks = ROUTING_TABLE.map((e) => e.task);
    for (const task of ALL_TASKS) {
      expect(tasks.filter((t) => t === task)).toHaveLength(1);
    }
  });

  it('has no duplicate tasks', () => {
    const tasks = ROUTING_TABLE.map((e) => e.task);
    expect(new Set(tasks).size).toBe(tasks.length);
  });

  describe('getRoutingEntry', () => {
    for (const task of ALL_TASKS) {
      it(`returns entry for ${task}`, () => {
        const entry = getRoutingEntry(task);
        expect(entry.task).toBe(task);
        expect(entry.provider).toBeTruthy();
        expect(entry.model).toBeTruthy();
        expect(entry.timeout_ms).toBeGreaterThan(0);
      });
    }

    it('throws for unknown task', () => {
      expect(() => getRoutingEntry('unknown' as Task)).toThrow();
    });
  });

  describe('Model assignments match D4 spec', () => {
    it('fast_track_triage → Haiku', () => {
      expect(getRoutingEntry('fast_track_triage').model).toBe('claude-haiku-4-5');
    });

    it('opportunity_analysis → Sonnet with 10s timeout', () => {
      const entry = getRoutingEntry('opportunity_analysis');
      expect(entry.model).toBe('claude-sonnet-4-5');
      expect(entry.timeout_ms).toBe(10_000);
    });

    it('capture_plan → Opus', () => {
      expect(getRoutingEntry('capture_plan').model).toBe('claude-opus-4-5');
    });

    it('semantic_embed → text-embedding-3-large', () => {
      expect(getRoutingEntry('semantic_embed').model).toBe('text-embedding-3-large');
    });

    it('source_research → sonar-pro', () => {
      expect(getRoutingEntry('source_research').model).toBe('sonar-pro');
    });

    it('doctrine_score → Haiku', () => {
      expect(getRoutingEntry('doctrine_score').model).toBe('claude-haiku-4-5');
    });
  });

  describe('Fallback configuration', () => {
    it('opportunity_analysis has fallback to Haiku', () => {
      const entry = getRoutingEntry('opportunity_analysis');
      expect(entry.fallback).not.toBeNull();
      expect(entry.fallback!.model).toBe('claude-haiku-4-5');
    });

    it('capture_plan has fallback to Sonnet', () => {
      const entry = getRoutingEntry('capture_plan');
      expect(entry.fallback).not.toBeNull();
      expect(entry.fallback!.model).toBe('claude-sonnet-4-5');
    });

    it('fast_track_triage has no fallback', () => {
      expect(getRoutingEntry('fast_track_triage').fallback).toBeNull();
    });

    it('sentinel_summary has no fallback', () => {
      expect(getRoutingEntry('sentinel_summary').fallback).toBeNull();
    });

    it('semantic_embed has no fallback', () => {
      expect(getRoutingEntry('semantic_embed').fallback).toBeNull();
    });

    it('source_research has no fallback', () => {
      expect(getRoutingEntry('source_research').fallback).toBeNull();
    });

    it('doctrine_score has no fallback', () => {
      expect(getRoutingEntry('doctrine_score').fallback).toBeNull();
    });

    it('fallback configs have min_remaining_budget_ms = 500', () => {
      for (const entry of ROUTING_TABLE) {
        if (entry.fallback) {
          expect(entry.fallback.min_remaining_budget_ms).toBe(500);
        }
      }
    });
  });
});
