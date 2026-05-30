/**
 * Schema validation tests — verify all mock fixtures pass their zod schemas.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fastTrackTriageOutputSchema,
  opportunityAnalysisOutputSchema,
  capturePlanOutputSchema,
  dailyBriefingOutputSchema,
  sentinelSummaryOutputSchema,
  doctrineScoreOutputSchema,
  semanticEmbedOutputSchema,
  sourceResearchOutputSchema,
  TASK_SCHEMAS,
} from '../../src/lib/router/schemas.js';
import type { Task } from '../../src/lib/llm-router.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/llm-mock');

function loadFixtureOutput(taskFile: string): unknown {
  const raw = readFileSync(join(FIXTURE_DIR, `${taskFile}.json`), 'utf-8');
  const fixture = JSON.parse(raw) as { output: unknown };
  return fixture.output;
}

describe('[Schemas] Zod schema validation', () => {
  it('TASK_SCHEMAS has exactly one entry per Task', () => {
    const tasks: Task[] = [
      'fast_track_triage', 'opportunity_analysis', 'capture_plan',
      'daily_briefing', 'sentinel_summary', 'doctrine_score',
      'semantic_embed', 'source_research',
    ];
    expect(Object.keys(TASK_SCHEMAS).sort()).toEqual(tasks.sort());
  });
});

describe('[Schemas] Mock fixture validation', () => {
  it('fast-track-triage fixture validates', () => {
    const output = loadFixtureOutput('fast-track-triage');
    expect(() => fastTrackTriageOutputSchema.parse(output)).not.toThrow();
  });

  it('opportunity-analysis fixture validates', () => {
    const output = loadFixtureOutput('opportunity-analysis');
    expect(() => opportunityAnalysisOutputSchema.parse(output)).not.toThrow();
  });

  it('capture-plan fixture validates against CapturePlanOutput', () => {
    const output = loadFixtureOutput('capture-plan');
    const result = capturePlanOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  it('daily-briefing fixture validates', () => {
    const output = loadFixtureOutput('daily-briefing');
    expect(() => dailyBriefingOutputSchema.parse(output)).not.toThrow();
  });

  it('sentinel-summary fixture validates', () => {
    const output = loadFixtureOutput('sentinel-summary');
    expect(() => sentinelSummaryOutputSchema.parse(output)).not.toThrow();
  });

  it('doctrine-score fixture validates', () => {
    const output = loadFixtureOutput('doctrine-score');
    expect(() => doctrineScoreOutputSchema.parse(output)).not.toThrow();
  });

  it('semantic-embed fixture validates', () => {
    const output = loadFixtureOutput('semantic-embed');
    expect(() => semanticEmbedOutputSchema.parse(output)).not.toThrow();
  });

  it('source-research fixture validates', () => {
    const output = loadFixtureOutput('source-research');
    expect(() => sourceResearchOutputSchema.parse(output)).not.toThrow();
  });
});
