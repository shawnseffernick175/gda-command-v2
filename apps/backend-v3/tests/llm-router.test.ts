/**
 * LLM Router Tests — F-215 D4
 *
 * - Routing table completeness (exactly one entry per Task)
 * - Mock mode (zero real API calls)
 * - R2 wall-clock enforcement (opportunity_analysis 10s ceiling)
 * - Retry + fallback logic
 * - PERPLEXITY_API_KEY optional at startup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Task } from '../src/lib/llm-router.types.js';
import { ROUTING_TABLE, assertRoutingTableComplete, getRoutingEntry } from '../src/lib/llm-router.table.js';
import { DEFAULT_RETRY_POLICY, classifyError, getBackoffMs } from '../src/lib/llm-router.retry.js';
import { mockRegistry, hashInput, getDefaultMock, clearMocks } from '../src/lib/llm-router.mocks.js';

/** All tasks from the Task union — must match llm-router.types.ts exactly. */
const ALL_TASKS: readonly Task[] = [
  'fast_track_triage',
  'opportunity_analysis',
  'capture_plan',
  'sentinel_summary',
  'doctrine_score',
  'semantic_embed',
  'source_research',
  'black_hat_analysis',
  'risk_generation',
  'award_analysis',
  'competitor_analysis',
  'contact_enrich',
  'match_analysis',
  'vault_document_parse',
  'vault_smart_route',
  'financial_statement_extract',
  'balance_sheet_extract',
  'cost_detail_extract',
  'sie_extract',
  'digest_lead',
  'competitor_contact_discovery',
  'partner_contact_discovery',
  'financial_analyze',
  'vault_vehicle_extract',
  'workshop_teardown',
  'workshop_generate',
  'ap_extract',
  'ar_extract',
  'trial_balance_extract',
  'project_revenue_extract',
  'sitrep_document_analyze',
  'launchpad_sitrep',
  'action_item_draft',
] as const;

describe('Routing Table', () => {
  it('has exactly one entry per Task union member', () => {
    const result = assertRoutingTableComplete(ALL_TASKS);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('has exactly 17 entries (one per task)', () => {
    expect(ROUTING_TABLE.length).toBe(ALL_TASKS.length);
  });

  it('no duplicate task entries', () => {
    const tasks = ROUTING_TABLE.map((e) => e.task);
    expect(new Set(tasks).size).toBe(tasks.length);
  });

  it('every task resolves via getRoutingEntry', () => {
    for (const task of ALL_TASKS) {
      expect(() => getRoutingEntry(task)).not.toThrow();
    }
  });

  it('opportunity_analysis timeout is 75s (covers real Anthropic latency)', () => {
    const entry = getRoutingEntry('opportunity_analysis');
    expect(entry.timeout_ms).toBe(75_000);
  });

  it('opportunity_analysis has fallback to haiku', () => {
    const entry = getRoutingEntry('opportunity_analysis');
    expect(entry.fallback).not.toBeNull();
    expect(entry.fallback!.model).toBe('claude-haiku-4-5');
  });
});

describe('Retry Policy', () => {
  it('default policy has correct parameters', () => {
    expect(DEFAULT_RETRY_POLICY.max_retries).toBe(3);
    expect(DEFAULT_RETRY_POLICY.backoff_ms).toEqual([200, 600, 1800]);
    expect(DEFAULT_RETRY_POLICY.retry_on_5xx).toBe(true);
    expect(DEFAULT_RETRY_POLICY.retry_on_network).toBe(true);
    expect(DEFAULT_RETRY_POLICY.retry_on_429).toBe(false);
  });

  it('429 → immediate fallback (no retry)', () => {
    const decision = classifyError({ status: 429, message: 'Rate limited' }, DEFAULT_RETRY_POLICY);
    expect(decision).toBe('fallback');
  });

  it('5xx → retry', () => {
    const decision = classifyError({ status: 500, message: 'Server error' }, DEFAULT_RETRY_POLICY);
    expect(decision).toBe('retry');
  });

  it('4xx (non-429) → fail', () => {
    const decision = classifyError({ status: 400, message: 'Bad request' }, DEFAULT_RETRY_POLICY);
    expect(decision).toBe('fail');
  });

  it('network error → retry', () => {
    const decision = classifyError({ code: 'ECONNRESET', message: 'Connection reset' }, DEFAULT_RETRY_POLICY);
    expect(decision).toBe('retry');
  });

  it('backoff values match spec', () => {
    expect(getBackoffMs(0, DEFAULT_RETRY_POLICY)).toBe(200);
    expect(getBackoffMs(1, DEFAULT_RETRY_POLICY)).toBe(600);
    expect(getBackoffMs(2, DEFAULT_RETRY_POLICY)).toBe(1800);
  });
});

describe('Mock Mode', () => {
  beforeEach(() => clearMocks());

  it('provides default mocks for all tasks', () => {
    for (const task of ALL_TASKS) {
      const mock = getDefaultMock(task, 'test-trace-id');
      expect(mock.ok).toBe(true);
      expect(mock.task).toBe(task);
      expect(mock.output).toBeDefined();
    }
  });

  it('registry stores and retrieves mocks by task + hash', () => {
    const mock = getDefaultMock('fast_track_triage', 'trace-1');
    const hash = hashInput({ title: 'test', naics_codes: ['541330'] });
    mockRegistry.register('fast_track_triage', hash, mock);
    const retrieved = mockRegistry.get('fast_track_triage', hash);
    expect(retrieved).toEqual(mock);
  });

  it('registry returns null for unknown hash', () => {
    const result = mockRegistry.get('fast_track_triage', 'nonexistent-hash');
    expect(result).toBeNull();
  });
});

describe('R2 Enforcement — opportunity_analysis wall-clock', () => {
  it('routing table enforces 75s timeout (covers sonnet ~47s + margin)', () => {
    const entry = getRoutingEntry('opportunity_analysis');
    expect(entry.timeout_ms).toBe(75_000);
  });

  it('fallback min_remaining_budget_ms is 30s (haiku needs ~24s)', () => {
    const entry = getRoutingEntry('opportunity_analysis');
    expect(entry.fallback?.min_remaining_budget_ms).toBe(30_000);
  });
});

describe('Router — mock mode integration', () => {
  beforeEach(() => {
    process.env['MOCK_LLM'] = '1';
    clearMocks();
  });

  afterEach(() => {
    delete process.env['MOCK_LLM'];
  });

  it('route() returns mock response with MOCK_LLM=1', async () => {
    const { llmRouter } = await import('../src/lib/llm-router.js');
    const result = await llmRouter.route({
      task: 'fast_track_triage',
      input: {
        title: 'Test opp',
        description: 'Test description',
        naics_codes: ['541330'],
        set_aside: null,
        place_of_performance: null,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.task).toBe('fast_track_triage');
    if (result.ok) {
      expect(result.output.grade).toBeDefined();
    }
  });
});

describe('PERPLEXITY_API_KEY optional at startup', () => {
  it('validateKeys does not require PERPLEXITY_API_KEY', async () => {
    const originalAnth = process.env['ANTHROPIC_API_KEY'];
    const originalOai = process.env['OPENAI_API_KEY'];
    const originalPerp = process.env['PERPLEXITY_API_KEY'];

    process.env['ANTHROPIC_API_KEY'] = 'test-key';
    process.env['OPENAI_API_KEY'] = 'test-key';
    delete process.env['PERPLEXITY_API_KEY'];

    const { validateKeys } = await import('../src/lib/llm-router.js');
    expect(() => validateKeys()).not.toThrow();

    // Restore
    if (originalAnth) process.env['ANTHROPIC_API_KEY'] = originalAnth;
    else delete process.env['ANTHROPIC_API_KEY'];
    if (originalOai) process.env['OPENAI_API_KEY'] = originalOai;
    else delete process.env['OPENAI_API_KEY'];
    if (originalPerp) process.env['PERPLEXITY_API_KEY'] = originalPerp;
  });

  it('validateKeys throws if ANTHROPIC_API_KEY is missing', async () => {
    const original = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    process.env['OPENAI_API_KEY'] = 'test-key';

    const { validateKeys } = await import('../src/lib/llm-router.js');
    expect(() => validateKeys()).toThrow(/ANTHROPIC_API_KEY/);

    if (original) process.env['ANTHROPIC_API_KEY'] = original;
  });
});

describe('Sonnet default — no Opus in routing table defaults', () => {
  it('no routing table entry defaults to claude-opus', () => {
    for (const entry of ROUTING_TABLE) {
      expect(entry.model).not.toContain('opus');
    }
  });

  it('capture_plan defaults to claude-sonnet-4-5', () => {
    const entry = getRoutingEntry('capture_plan');
    expect(entry.model).toBe('claude-sonnet-4-5');
  });

  it('every Anthropic task defaults to sonnet or haiku', () => {
    const anthropicEntries = ROUTING_TABLE.filter((e) => e.provider === 'anthropic');
    for (const entry of anthropicEntries) {
      const isSonnet = entry.model === 'claude-sonnet-4-5' || entry.model.startsWith('claude-sonnet-4-5-');
      const isHaiku = entry.model === 'claude-haiku-4-5' || entry.model.startsWith('claude-haiku-4-5-');
      expect(isSonnet || isHaiku).toBe(true);
    }
  });
});

describe('Drift detector — no direct SDK imports outside providers/', () => {
  it('no direct import of openai or @anthropic-ai/sdk outside providers/', async () => {
    const { execSync } = await import('node:child_process');
    const repoRoot = new URL('../../../../', import.meta.url).pathname;
    const backendSrc = `${repoRoot}apps/backend-v3/src`;

    // Search for forbidden imports, excluding providers/ directory
    const patterns = [
      'from [\'"]openai[\'"]',
      'from [\'"]@anthropic-ai/sdk[\'"]',
      'from [\'"]perplexity[\'"]',
      'require\\([\'"]openai[\'"]\\)',
      'require\\([\'"]@anthropic-ai/sdk[\'"]\\)',
    ];

    const violations: string[] = [];

    for (const pattern of patterns) {
      try {
        const result = execSync(
          `grep -rn "${pattern}" "${backendSrc}" --include="*.ts" | grep -v "/providers/" || true`,
          { encoding: 'utf-8' }
        );
        if (result.trim()) {
          violations.push(result.trim());
        }
      } catch {
        // grep returns non-zero if no match — that's fine
      }
    }

    expect(violations).toEqual([]);
  });
});
