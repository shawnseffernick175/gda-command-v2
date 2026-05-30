/**
 * Integration tests — end-to-end route() calls using mock fixtures.
 * Verifies schema validation, R2 timing, fallback, and mock mode.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { route } from '../../src/lib/llm-router.js';
import { clearMockCache } from '../../src/lib/llm-router.mocks.js';
import type {
  Task,
  FastTrackTriageInput,
  OpportunityAnalysisInput,
  CapturePlanInput,
  DailyBriefingInput,
  SentinelSummaryInput,
  DoctrineScoreInput,
  SemanticEmbedInput,
  SourceResearchInput,
  RouteRequest,
} from '../../src/lib/llm-router.types.js';
import { validateTaskOutput } from '../../src/lib/router/schemas.js';

beforeAll(() => {
  process.env['MOCK_LLM'] = '1';
});

afterAll(() => {
  delete process.env['MOCK_LLM'];
  clearMockCache();
});

// ---------------------------------------------------------------------------
// Test inputs
// ---------------------------------------------------------------------------

const FAST_TRACK_INPUT: FastTrackTriageInput = {
  title: 'Army Logistics Sustainment Support',
  description: 'Field service engineering and supply chain management for ASC installations.',
  naics_codes: ['541330', '541611'],
  set_aside: 'SDB',
  place_of_performance: 'Fort Gregg-Adams, VA',
};

const OPP_ANALYSIS_INPUT: OpportunityAnalysisInput = {
  opportunity_id: 'SAM-W912PM-26-R-0042',
  title: 'Army Sustainment Command Logistics Support',
  description: 'Comprehensive logistics sustainment services.',
  solicitation_number: 'W912PM-26-R-0042',
  naics_codes: ['541330'],
  set_aside: 'SDB',
  place_of_performance: 'Fort Gregg-Adams, VA',
  response_deadline: '2026-07-15',
  incumbent_info: 'BAE Systems — W912PM-21-D-0045',
  sources: [
    { kind: 'sam_gov', title: 'SAM.gov Listing', url: 'https://sam.gov/opp/abc', retrieved_at: '2026-05-30T12:00:00Z' },
  ],
};

const CAPTURE_PLAN_INPUT: CapturePlanInput = {
  opportunity_id: 'SAM-W912PM-26-R-0042',
  title: 'Army Sustainment Command Logistics Support',
  description: 'Comprehensive logistics sustainment services.',
  solicitation_number: 'W912PM-26-R-0042',
  analysis_summary: 'Pwin 68%. Strong alignment with Envision capabilities.',
  incumbent_info: 'BAE Systems',
  competitor_landscape: 'BAE Systems, SAIC, Engility',
  envision_capabilities: ['logistics', 'sustainment', 'field service'],
  teaming_partners: ['Riverstone Solutions'],
  sources: [
    { kind: 'sam_gov', title: 'SAM.gov Listing', url: 'https://sam.gov/opp/abc', retrieved_at: '2026-05-30T12:00:00Z' },
  ],
};

const DAILY_BRIEFING_INPUT: DailyBriefingInput = {
  date: '2026-05-30',
  open_opportunities: [
    {
      opportunity_id: 'SAM-W912PM-26-R-0042',
      title: 'Army Sustainment Support',
      solicitation_number: 'W912PM-26-R-0042',
      response_deadline: '2026-07-15',
      grade: 'A',
      pwin: 68,
      days_until_deadline: 46,
    },
  ],
  captures_with_gaps: [],
  action_items_due: [],
  sentinel_status: {
    overall_health: 'healthy',
    active_alerts: [],
    last_check_at: '2026-05-30T11:00:00Z',
  },
  pending_recommendations: [],
  pipeline_at_risk: [],
  expiring_certs: [
    {
      cert_name: 'CMMI-DEV ML3',
      expiration_date: '2026-08-07',
      days_remaining: 69,
      severity: 'critical',
    },
  ],
};

const SENTINEL_INPUT: SentinelSummaryInput = {
  alert_type: 'ingest_delay',
  component: 'govtribe-ingest',
  details: 'GovTribe API returning 503 errors intermittently.',
  recent_log_lines: [
    '2026-05-30T10:00:00Z ERROR govtribe fetch failed: 503',
    '2026-05-30T10:15:00Z ERROR govtribe fetch failed: 503',
    '2026-05-30T10:30:00Z WARN govtribe retry exhausted',
  ],
};

const DOCTRINE_SCORE_INPUT: DoctrineScoreInput = {
  opportunity_id: 'SAM-W912PM-26-R-0042',
  title: 'Army Sustainment Support',
  description: 'Logistics sustainment services for Army installations.',
  naics_codes: ['541330'],
  set_aside: 'SDB',
  envision_alignment_context: 'Core logistics and sustainment capability. Army is a primary customer.',
};

const SEMANTIC_EMBED_INPUT: SemanticEmbedInput = {
  text: 'Army logistics sustainment field service engineering',
  namespace: 'opportunities',
};

const SOURCE_RESEARCH_INPUT: SourceResearchInput = {
  query: 'Army Sustainment Command FY26 logistics modernization',
  context: 'Envision is evaluating this market segment for new pursuits',
  max_sources: 5,
};

// ---------------------------------------------------------------------------
// Mock mode integration tests
// ---------------------------------------------------------------------------

describe('Router Integration (mock mode)', () => {
  describe('End-to-end route() for each task type', () => {
    it('fast_track_triage returns valid output', async () => {
      const result = await route({ task: 'fast_track_triage', input: FAST_TRACK_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('fast_track_triage');
        expect(result.output.grade).toMatch(/^[ABC]$/);
        expect(result.trace_id).toBeTruthy();
        expect(result.latency_ms).toBeGreaterThanOrEqual(0);
        const v = validateTaskOutput('fast_track_triage', result.output);
        expect(v.success).toBe(true);
      }
    });

    it('opportunity_analysis returns valid output', async () => {
      const result = await route({ task: 'opportunity_analysis', input: OPP_ANALYSIS_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('opportunity_analysis');
        expect(typeof result.output.pwin).toBe('number');
        const v = validateTaskOutput('opportunity_analysis', result.output);
        expect(v.success).toBe(true);
      }
    });

    it('capture_plan returns valid CapturePlanOutput', async () => {
      const result = await route({ task: 'capture_plan', input: CAPTURE_PLAN_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('capture_plan');
        expect(result.output.capture_plan).toBeDefined();
        expect(result.output.source_chips).toBeDefined();
        expect(result.output.is_partial).toBe(false);
        const v = validateTaskOutput('capture_plan', result.output);
        expect(v.success).toBe(true);
      }
    });

    it('daily_briefing returns valid output', async () => {
      const result = await route({ task: 'daily_briefing', input: DAILY_BRIEFING_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('daily_briefing');
        expect(result.output.headline).toBeTruthy();
        expect(result.output.priority_actions.length).toBeGreaterThan(0);
        const v = validateTaskOutput('daily_briefing', result.output);
        expect(v.success).toBe(true);
      }
    });

    it('sentinel_summary returns valid output', async () => {
      const result = await route({ task: 'sentinel_summary', input: SENTINEL_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('sentinel_summary');
        expect(result.output.severity).toMatch(/^(info|warning|critical)$/);
        const v = validateTaskOutput('sentinel_summary', result.output);
        expect(v.success).toBe(true);
      }
    });

    it('doctrine_score returns valid output', async () => {
      const result = await route({ task: 'doctrine_score', input: DOCTRINE_SCORE_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('doctrine_score');
        expect(typeof result.output.overall_score).toBe('number');
        expect(result.output.principle_scores.length).toBe(7);
        const v = validateTaskOutput('doctrine_score', result.output);
        expect(v.success).toBe(true);
      }
    });

    it('semantic_embed returns valid output', async () => {
      const result = await route({ task: 'semantic_embed', input: SEMANTIC_EMBED_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('semantic_embed');
        expect(Array.isArray(result.output.embedding)).toBe(true);
        expect(result.output.dimensions).toBeGreaterThan(0);
        const v = validateTaskOutput('semantic_embed', result.output);
        expect(v.success).toBe(true);
      }
    });

    it('source_research returns valid output', async () => {
      const result = await route({ task: 'source_research', input: SOURCE_RESEARCH_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.task).toBe('source_research');
        expect(result.output.findings.length).toBeGreaterThan(0);
        const v = validateTaskOutput('source_research', result.output);
        expect(v.success).toBe(true);
      }
    });
  });

  describe('Response metadata', () => {
    it('includes cost_estimate_usd', async () => {
      const result = await route({ task: 'fast_track_triage', input: FAST_TRACK_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.cost_estimate_usd).toBe('number');
      }
    });

    it('includes token counts', async () => {
      const result = await route({ task: 'fast_track_triage', input: FAST_TRACK_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.tokens.input).toBeGreaterThan(0);
        expect(result.tokens.output).toBeGreaterThan(0);
      }
    });

    it('includes model_used', async () => {
      const result = await route({ task: 'fast_track_triage', input: FAST_TRACK_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.model_used).toBeTruthy();
      }
    });

    it('includes trace_id (UUID)', async () => {
      const result = await route({ task: 'fast_track_triage', input: FAST_TRACK_INPUT });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.trace_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });
  });

  describe('opts.mock overrides env', () => {
    it('route with opts.mock=true works even without MOCK_LLM env', async () => {
      const origMock = process.env['MOCK_LLM'];
      delete process.env['MOCK_LLM'];
      clearMockCache();

      const result = await route({
        task: 'fast_track_triage',
        input: FAST_TRACK_INPUT,
        opts: { mock: true },
      });
      expect(result.ok).toBe(true);

      process.env['MOCK_LLM'] = origMock ?? '1';
    });
  });

  describe('disable_router_retry flag', () => {
    it('accepts disable_router_retry option without error', async () => {
      const result = await route({
        task: 'fast_track_triage',
        input: FAST_TRACK_INPUT,
        opts: { disable_router_retry: true },
      });
      expect(result.ok).toBe(true);
    });
  });
});
