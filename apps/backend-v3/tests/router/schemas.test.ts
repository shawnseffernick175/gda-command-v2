/**
 * Unit tests for router zod schemas + mock fixture validation.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FastTrackTriageOutputSchema,
  OpportunityAnalysisOutputSchema,
  CapturePlanOutputSchema,
  DailyBriefingOutputSchema,
  SentinelSummaryOutputSchema,
  DoctrineScoreOutputSchema,
  SemanticEmbedOutputSchema,
  SourceResearchOutputSchema,
  TASK_OUTPUT_SCHEMAS,
  validateTaskOutput,
} from '../../src/lib/router/schemas.js';
import type { Task } from '../../src/lib/llm-router.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../fixtures/llm-mock');

function loadFixture(name: string): { output: unknown } {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${name}.json`), 'utf-8'));
}

describe('Router Schemas', () => {
  describe('Schema coverage', () => {
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

    it('has a schema for every task type', () => {
      for (const task of ALL_TASKS) {
        expect(TASK_OUTPUT_SCHEMAS[task]).toBeDefined();
      }
    });

    it('TASK_OUTPUT_SCHEMAS has exactly 8 entries', () => {
      expect(Object.keys(TASK_OUTPUT_SCHEMAS)).toHaveLength(8);
    });
  });

  describe('Mock fixture validation — all 8 fixtures validate against their schemas', () => {
    const fixtures: [string, Task][] = [
      ['fast-track-triage', 'fast_track_triage'],
      ['opportunity-analysis', 'opportunity_analysis'],
      ['capture-plan', 'capture_plan'],
      ['daily-briefing', 'daily_briefing'],
      ['sentinel-summary', 'sentinel_summary'],
      ['doctrine-score', 'doctrine_score'],
      ['semantic-embed', 'semantic_embed'],
      ['source-research', 'source_research'],
    ];

    for (const [filename, task] of fixtures) {
      it(`fixture "${filename}" validates against ${task} schema`, () => {
        const fixture = loadFixture(filename);
        const result = validateTaskOutput(task, fixture.output);
        expect(result.success).toBe(true);
      });
    }
  });

  describe('Schema rejects invalid data', () => {
    it('FastTrackTriageOutput rejects missing grade', () => {
      const result = FastTrackTriageOutputSchema.safeParse({
        rationale: 'test',
        naics_match_score: 50,
        recommended_action: 'pursue',
      });
      expect(result.success).toBe(false);
    });

    it('FastTrackTriageOutput rejects invalid grade value', () => {
      const result = FastTrackTriageOutputSchema.safeParse({
        grade: 'D',
        rationale: 'test',
        naics_match_score: 50,
        recommended_action: 'pursue',
      });
      expect(result.success).toBe(false);
    });

    it('OpportunityAnalysisOutput rejects non-numeric pwin', () => {
      const result = OpportunityAnalysisOutputSchema.safeParse({
        pwin: 'high',
        pwin_rationale: 'test',
        incumbent_analysis: 'test',
        competitor_landscape: 'test',
        blackhat_assessment: 'test',
        wargame_summary: 'test',
        timeline_analysis: 'test',
        strengths: [],
        weaknesses: [],
        recommended_teaming: [],
        doctrine_alignment_score: 50,
      });
      expect(result.success).toBe(false);
    });

    it('CapturePlanOutput rejects missing capture_plan', () => {
      const result = CapturePlanOutputSchema.safeParse({
        pink_hat_gaps: [],
        red_team_weaknesses: [],
        gold_team_readiness: { ready: false, items: [] },
        black_hat_competitor_positioning: [],
        next_action: { action: 'test', owner: 'test', deadline: '2026-01-01', priority: 'high' },
        source_chips: [],
        generated_at: '2026-01-01T00:00:00Z',
        model_used: 'test',
        is_partial: false,
      });
      expect(result.success).toBe(false);
    });

    it('DailyBriefingOutput rejects invalid urgency', () => {
      const result = DailyBriefingOutputSchema.safeParse({
        headline: 'test',
        priority_actions: [{ action: 'test', urgency: 'ASAP', related_entity: null }],
        risk_flags: [],
        market_intel_summary: 'test',
        cert_expiration_warnings: [],
      });
      expect(result.success).toBe(false);
    });

    it('SemanticEmbedOutput rejects non-array embedding', () => {
      const result = SemanticEmbedOutputSchema.safeParse({
        embedding: 'not-an-array',
        dimensions: 16,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateTaskOutput helper', () => {
    it('returns success:true for valid data', () => {
      const result = validateTaskOutput('fast_track_triage', {
        grade: 'A',
        rationale: 'Test',
        naics_match_score: 90,
        recommended_action: 'pursue',
      });
      expect(result.success).toBe(true);
    });

    it('returns success:false with error message for invalid data', () => {
      const result = validateTaskOutput('fast_track_triage', { grade: 'X' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });
});
