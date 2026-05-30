/**
 * Integration tests — end-to-end route() calls using mock fixtures.
 * Verifies schema validation, R2 timing, fallback, and retry behavior.
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { route } from '../../src/lib/llm-router.js';
import type { Task, RouteRequest } from '../../src/lib/llm-router.types.js';
import {
  fastTrackTriageOutputSchema,
  opportunityAnalysisOutputSchema,
  capturePlanOutputSchema,
  dailyBriefingOutputSchema,
  sentinelSummaryOutputSchema,
  doctrineScoreOutputSchema,
  semanticEmbedOutputSchema,
  sourceResearchOutputSchema,
} from '../../src/lib/router/schemas.js';

beforeAll(() => {
  process.env['LLM_ROUTER_MODE'] = 'mock';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- End-to-end mock route() for each task ---
describe('[Integration] route() with mock mode', () => {
  it('routes fast_track_triage and returns valid output', async () => {
    const result = await route({
      task: 'fast_track_triage',
      input: { title: 'Test', description: 'Test', naics_codes: ['541614'], set_aside: null, place_of_performance: null },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task).toBe('fast_track_triage');
      expect(result.trace_id).toBeTruthy();
      expect(() => fastTrackTriageOutputSchema.parse(result.output)).not.toThrow();
    }
  });

  it('routes opportunity_analysis and returns valid output', async () => {
    const result = await route({
      task: 'opportunity_analysis',
      input: {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        solicitation_number: null, naics_codes: ['541614'], set_aside: null,
        place_of_performance: null, response_deadline: null, incumbent_info: null, sources: [],
      },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => opportunityAnalysisOutputSchema.parse(result.output)).not.toThrow();
    }
  });

  it('routes capture_plan and returns CapturePlanOutput matching zod schema', async () => {
    const result = await route({
      task: 'capture_plan',
      input: {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        solicitation_number: null, analysis_summary: 'Summary',
        incumbent_info: null, competitor_landscape: null,
        envision_capabilities: [], teaming_partners: [], sources: [],
      },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = capturePlanOutputSchema.safeParse(result.output);
      expect(parsed.success).toBe(true);
    }
  });

  it('routes daily_briefing and returns valid output', async () => {
    const result = await route({
      task: 'daily_briefing',
      input: {
        date: '2026-05-30',
        open_opportunities: [], captures_with_gaps: [],
        action_items_due: [],
        sentinel_status: { overall_health: 'healthy', active_alerts: [], last_check_at: '2026-05-30T12:00:00Z' },
        pending_recommendations: [], pipeline_at_risk: [], expiring_certs: [],
      },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => dailyBriefingOutputSchema.parse(result.output)).not.toThrow();
    }
  });

  it('routes sentinel_summary and returns valid output', async () => {
    const result = await route({
      task: 'sentinel_summary',
      input: { alert_type: 'test', component: 'test', details: 'test', recent_log_lines: [] },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => sentinelSummaryOutputSchema.parse(result.output)).not.toThrow();
    }
  });

  it('routes doctrine_score and returns valid output', async () => {
    const result = await route({
      task: 'doctrine_score',
      input: {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        naics_codes: ['541614'], set_aside: null, envision_alignment_context: 'Context',
      },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => doctrineScoreOutputSchema.parse(result.output)).not.toThrow();
    }
  });

  it('routes semantic_embed and returns valid output', async () => {
    const result = await route({
      task: 'semantic_embed',
      input: { text: 'Test text', namespace: 'test' },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => semanticEmbedOutputSchema.parse(result.output)).not.toThrow();
    }
  });

  it('routes source_research and returns valid output', async () => {
    const result = await route({
      task: 'source_research',
      input: { query: 'Test query', context: null, max_sources: 5 },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => sourceResearchOutputSchema.parse(result.output)).not.toThrow();
    }
  });
});

// --- R2 timing behavior ---
describe('[Integration] R2 — opportunity_analysis timeout', () => {
  it('returns 503 ANALYSIS_TIMEOUT when fixture simulates timeout', async () => {
    const { writeFileSync, readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(dir, '../fixtures/llm-mock/opportunity-analysis.json');

    const original = readFileSync(fixturePath, 'utf-8');
    const fixture = JSON.parse(original);

    try {
      fixture._simulate_timeout = true;
      writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

      const result = await route({
        task: 'opportunity_analysis',
        input: {
          opportunity_id: 'opp-timeout', title: 'Timeout test', description: 'Desc',
          solicitation_number: null, naics_codes: [], set_aside: null,
          place_of_performance: null, response_deadline: null, incumbent_info: null, sources: [],
        },
        opts: { mock: true },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error_kind).toBe('ANALYSIS_TIMEOUT');
      }
    } finally {
      writeFileSync(fixturePath, original);
    }
  });

  it('never returns a pending/polling state — only sync result or 503', async () => {
    const result = await route({
      task: 'opportunity_analysis',
      input: {
        opportunity_id: 'opp-sync', title: 'Sync test', description: 'Desc',
        solicitation_number: null, naics_codes: [], set_aside: null,
        place_of_performance: null, response_deadline: null, incumbent_info: null, sources: [],
      },
      opts: { mock: true },
    });

    if (result.ok) {
      expect(result.output).toBeTruthy();
    } else {
      expect(result.error_kind).toBe('ANALYSIS_TIMEOUT');
    }
    // No third state — no "pending", no "polling"
  });
});

// --- Fallback behavior ---
describe('[Integration] Fallback with mock mode', () => {
  it('fires fallback when _simulate_primary_fail is set', async () => {
    const { writeFileSync, readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(dir, '../fixtures/llm-mock/opportunity-analysis.json');

    const original = readFileSync(fixturePath, 'utf-8');
    const fixture = JSON.parse(original);

    try {
      fixture._simulate_primary_fail = true;
      writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));

      const result = await route({
        task: 'opportunity_analysis',
        input: {
          opportunity_id: 'opp-fallback', title: 'Fallback test', description: 'Desc',
          solicitation_number: null, naics_codes: [], set_aside: null,
          place_of_performance: null, response_deadline: null, incumbent_info: null, sources: [],
        },
        opts: { mock: true },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fallback_used).toBe(true);
        expect(result.quality_flag).toBe('degraded');
      }
    } finally {
      writeFileSync(fixturePath, original);
    }
  });
});

// --- Mock response metadata ---
describe('[Integration] Response metadata', () => {
  it('includes all required metadata fields on success', async () => {
    const result = await route({
      task: 'fast_track_triage',
      input: { title: 'Meta test', description: 'Desc', naics_codes: [], set_aside: null, place_of_performance: null },
      opts: { mock: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task).toBe('fast_track_triage');
      expect(result.model_used).toBeTruthy();
      expect(typeof result.latency_ms).toBe('number');
      expect(result.tokens).toHaveProperty('input');
      expect(result.tokens).toHaveProperty('output');
      expect(typeof result.cost_estimate_usd).toBe('number');
      expect(typeof result.fallback_used).toBe('boolean');
      expect(['full', 'degraded']).toContain(result.quality_flag);
      expect(result.trace_id).toBeTruthy();
    }
  });
});
