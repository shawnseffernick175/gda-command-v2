/**
 * R2 contract tests — opportunity_analysis respects 10s wall-clock.
 * Uses mock fixtures with _simulate_timeout to verify 503 ANALYSIS_TIMEOUT.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from '../../src/lib/llm-router.js';
import { clearMockCache } from '../../src/lib/llm-router.mocks.js';
import type { OpportunityAnalysisInput } from '../../src/lib/llm-router.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../fixtures/llm-mock');
const OPP_FIXTURE = resolve(FIXTURE_DIR, 'opportunity-analysis.json');

const TEST_INPUT: OpportunityAnalysisInput = {
  opportunity_id: 'SAM-TEST-R2',
  title: 'R2 Timeout Test',
  description: 'Testing R2 contract enforcement.',
  solicitation_number: null,
  naics_codes: ['541330'],
  set_aside: null,
  place_of_performance: null,
  response_deadline: null,
  incumbent_info: null,
  sources: [],
};

let originalFixture: string;

beforeEach(() => {
  process.env['MOCK_LLM'] = '1';
  originalFixture = readFileSync(OPP_FIXTURE, 'utf-8');
  clearMockCache();
});

afterEach(() => {
  writeFileSync(OPP_FIXTURE, originalFixture, 'utf-8');
  clearMockCache();
  delete process.env['MOCK_LLM'];
});

describe('R2 Contract — opportunity_analysis timeout', () => {
  it('returns 503 ANALYSIS_TIMEOUT when _simulate_timeout is true', async () => {
    const fixture = JSON.parse(originalFixture);
    fixture._simulate_timeout = true;
    writeFileSync(OPP_FIXTURE, JSON.stringify(fixture, null, 2), 'utf-8');
    clearMockCache();

    const result = await route({ task: 'opportunity_analysis', input: TEST_INPUT });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error_kind).toBe('ANALYSIS_TIMEOUT');
      expect(result.error_message).toContain('timeout');
      expect(result.output).toBeNull();
    }
  });

  it('returns valid analysis when _simulate_timeout is not set', async () => {
    const result = await route({ task: 'opportunity_analysis', input: TEST_INPUT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.output.pwin).toBe('number');
      expect(result.task).toBe('opportunity_analysis');
    }
  });

  it('never returns a polling or pending state — only ok or error', async () => {
    const result = await route({ task: 'opportunity_analysis', input: TEST_INPUT });

    // The response is either ok:true with output or ok:false with error_kind
    if (result.ok) {
      expect(result.output).toBeTruthy();
    } else {
      expect(result.error_kind).toBeTruthy();
      expect(result.output).toBeNull();
    }

    // No "pending" or "polling" properties exist
    expect('status' in result && (result as Record<string, unknown>).status === 'pending').toBe(false);
    expect('status' in result && (result as Record<string, unknown>).status === 'polling').toBe(false);
  });
});

describe('R2 Contract — fallback behavior', () => {
  it('returns degraded quality when _simulate_primary_fail is true', async () => {
    const fixture = JSON.parse(originalFixture);
    fixture._simulate_primary_fail = true;
    writeFileSync(OPP_FIXTURE, JSON.stringify(fixture, null, 2), 'utf-8');
    clearMockCache();

    const result = await route({ task: 'opportunity_analysis', input: TEST_INPUT });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fallback_used).toBe(true);
      expect(result.quality_flag).toBe('degraded');
      expect(result.model_used).toBe('claude-haiku-4-5');
    }
  });
});
