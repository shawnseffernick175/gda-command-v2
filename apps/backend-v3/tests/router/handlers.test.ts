/**
 * Handler unit tests — each handler tested with mock provider.
 * Tests: success path, schema validation failure + re-prompt, double failure → 502.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LLMProvider, LLMChatResponse, LLMEmbedResponse } from '../../src/lib/router/providers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/llm-mock');

function loadFixtureOutput(file: string): unknown {
  const raw = readFileSync(join(FIXTURE_DIR, `${file}.json`), 'utf-8');
  return (JSON.parse(raw) as { output: unknown }).output;
}

function makeMockProvider(responses: LLMChatResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    chat: vi.fn(async () => {
      const resp = responses[callIndex] ?? responses[responses.length - 1]!;
      callIndex++;
      return resp;
    }),
  };
}

function makeMockEmbedProvider(resp: LLMEmbedResponse): LLMProvider {
  return {
    name: 'mock',
    chat: vi.fn(async () => ({ text: '', tokens_in: 0, tokens_out: 0, model: 'mock' })),
    embed: vi.fn(async () => resp),
  };
}

function chatResponse(output: unknown): LLMChatResponse {
  return {
    text: JSON.stringify(output),
    tokens_in: 100,
    tokens_out: 200,
    model: 'mock-model',
  };
}

// --- fast_track_triage ---
describe('[Handler] fast_track_triage', () => {
  it('success path with valid output', async () => {
    const { handleFastTrackTriage } = await import('../../src/lib/router/handlers/fast-track-triage.js');
    const output = loadFixtureOutput('fast-track-triage');
    const provider = makeMockProvider([chatResponse(output)]);

    const result = await handleFastTrackTriage(
      { title: 'Test', description: 'Test opp', naics_codes: ['541614'], set_aside: null, place_of_performance: null },
      { provider, model: 'claude-haiku-4-5' },
    );

    expect(result.output.grade).toBe('A');
    expect(result.output.recommended_action).toBe('pursue');
    expect(result.tokens_in).toBe(100);
  });

  it('schema validation failure → re-prompt → success', async () => {
    const { handleFastTrackTriage } = await import('../../src/lib/router/handlers/fast-track-triage.js');
    const validOutput = loadFixtureOutput('fast-track-triage');
    const provider = makeMockProvider([
      chatResponse({ bad: 'data' }),
      chatResponse(validOutput),
    ]);

    const result = await handleFastTrackTriage(
      { title: 'Test', description: 'Test', naics_codes: [], set_aside: null, place_of_performance: null },
      { provider, model: 'claude-haiku-4-5' },
    );

    expect(result.output.grade).toBe('A');
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('double validation failure → throws INVALID_OUTPUT', async () => {
    const { handleFastTrackTriage } = await import('../../src/lib/router/handlers/fast-track-triage.js');
    const provider = makeMockProvider([
      chatResponse({ bad: 'data' }),
      chatResponse({ still: 'bad' }),
    ]);

    await expect(handleFastTrackTriage(
      { title: 'Test', description: 'Test', naics_codes: [], set_aside: null, place_of_performance: null },
      { provider, model: 'claude-haiku-4-5' },
    )).rejects.toThrow('INVALID_OUTPUT');
  });
});

// --- opportunity_analysis ---
describe('[Handler] opportunity_analysis', () => {
  it('success path with valid output', async () => {
    const { handleOpportunityAnalysis } = await import('../../src/lib/router/handlers/opportunity-analysis.js');
    const output = loadFixtureOutput('opportunity-analysis');
    const provider = makeMockProvider([chatResponse(output)]);

    const result = await handleOpportunityAnalysis(
      {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        solicitation_number: null, naics_codes: ['541614'], set_aside: null,
        place_of_performance: null, response_deadline: null, incumbent_info: null, sources: [],
      },
      { provider, model: 'claude-sonnet-4-5' },
    );

    expect(result.output.pwin).toBe(68);
    expect(result.output.doctrine_alignment_score).toBe(85);
  });

  it('schema validation failure → re-prompt → success', async () => {
    const { handleOpportunityAnalysis } = await import('../../src/lib/router/handlers/opportunity-analysis.js');
    const validOutput = loadFixtureOutput('opportunity-analysis');
    const provider = makeMockProvider([
      chatResponse({ pwin: 'not a number' }),
      chatResponse(validOutput),
    ]);

    const result = await handleOpportunityAnalysis(
      {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        solicitation_number: null, naics_codes: [], set_aside: null,
        place_of_performance: null, response_deadline: null, incumbent_info: null, sources: [],
      },
      { provider, model: 'claude-sonnet-4-5' },
    );

    expect(result.output.pwin).toBe(68);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('double validation failure → throws INVALID_OUTPUT', async () => {
    const { handleOpportunityAnalysis } = await import('../../src/lib/router/handlers/opportunity-analysis.js');
    const provider = makeMockProvider([
      chatResponse({}),
      chatResponse({ pwin: 'bad' }),
    ]);

    await expect(handleOpportunityAnalysis(
      {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        solicitation_number: null, naics_codes: [], set_aside: null,
        place_of_performance: null, response_deadline: null, incumbent_info: null, sources: [],
      },
      { provider, model: 'claude-sonnet-4-5' },
    )).rejects.toThrow('INVALID_OUTPUT');
  });
});

// --- capture_plan ---
describe('[Handler] capture_plan', () => {
  it('success path — validates CapturePlanOutput shape', async () => {
    const { handleCapturePlan } = await import('../../src/lib/router/handlers/capture-plan.js');
    const output = loadFixtureOutput('capture-plan');
    const provider = makeMockProvider([chatResponse(output)]);

    const result = await handleCapturePlan(
      {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        solicitation_number: null, analysis_summary: 'Summary',
        incumbent_info: null, competitor_landscape: null,
        envision_capabilities: [], teaming_partners: [], sources: [],
      },
      { provider, model: 'claude-opus-4-5' },
    );

    expect(result.output.capture_plan.win_themes.length).toBeGreaterThan(0);
    expect(result.output.source_chips.length).toBeGreaterThan(0);
    expect(result.output.is_partial).toBe(false);
    expect(result.output.next_action.priority).toBe('high');
  });
});

// --- daily_briefing ---
describe('[Handler] daily_briefing', () => {
  it('success path with valid output', async () => {
    const { handleDailyBriefing } = await import('../../src/lib/router/handlers/daily-briefing.js');
    const output = loadFixtureOutput('daily-briefing');
    const provider = makeMockProvider([chatResponse(output)]);

    const result = await handleDailyBriefing(
      {
        date: '2026-05-30',
        open_opportunities: [], captures_with_gaps: [],
        action_items_due: [],
        sentinel_status: { overall_health: 'healthy', active_alerts: [], last_check_at: '2026-05-30T12:00:00Z' },
        pending_recommendations: [], pipeline_at_risk: [], expiring_certs: [],
      },
      { provider, model: 'claude-sonnet-4-5' },
    );

    expect(result.output.headline).toBeTruthy();
    expect(result.output.priority_actions.length).toBeGreaterThan(0);
  });
});

// --- sentinel_summary ---
describe('[Handler] sentinel_summary', () => {
  it('success path with valid output', async () => {
    const { handleSentinelSummary } = await import('../../src/lib/router/handlers/sentinel-summary.js');
    const output = loadFixtureOutput('sentinel-summary');
    const provider = makeMockProvider([chatResponse(output)]);

    const result = await handleSentinelSummary(
      { alert_type: 'webhook_failure', component: 'n8n', details: 'Test', recent_log_lines: ['log1'] },
      { provider, model: 'claude-haiku-4-5' },
    );

    expect(result.output.severity).toBe('warning');
    expect(result.output.affected_components.length).toBeGreaterThan(0);
  });
});

// --- doctrine_score ---
describe('[Handler] doctrine_score', () => {
  it('success path with valid output', async () => {
    const { handleDoctrineScore } = await import('../../src/lib/router/handlers/doctrine-score.js');
    const output = loadFixtureOutput('doctrine-score');
    const provider = makeMockProvider([chatResponse(output)]);

    const result = await handleDoctrineScore(
      {
        opportunity_id: 'opp-1', title: 'Test', description: 'Desc',
        naics_codes: ['541614'], set_aside: null, envision_alignment_context: 'Context',
      },
      { provider, model: 'claude-sonnet-4-5' },
    );

    expect(result.output.overall_score).toBe(82);
    expect(result.output.principle_scores.length).toBe(7);
  });
});

// --- semantic_embed ---
describe('[Handler] semantic_embed', () => {
  it('success path with valid embedding', async () => {
    const { handleSemanticEmbed } = await import('../../src/lib/router/handlers/semantic-embed.js');
    const output = loadFixtureOutput('semantic-embed') as { embedding: number[]; dimensions: number };
    const provider = makeMockEmbedProvider({
      embedding: output.embedding,
      dimensions: output.dimensions,
      tokens_in: 50,
      model: 'text-embedding-3-large',
    });

    const result = await handleSemanticEmbed(
      { text: 'Test text', namespace: 'opportunities' },
      { provider, model: 'text-embedding-3-large' },
    );

    expect(result.output.embedding.length).toBe(output.dimensions);
    expect(result.output.dimensions).toBe(output.dimensions);
  });

  it('throws if provider does not support embeddings', async () => {
    const { handleSemanticEmbed } = await import('../../src/lib/router/handlers/semantic-embed.js');
    const provider: LLMProvider = {
      name: 'mock-no-embed',
      chat: vi.fn(async () => ({ text: '', tokens_in: 0, tokens_out: 0, model: 'mock' })),
    };

    await expect(handleSemanticEmbed(
      { text: 'Test', namespace: 'test' },
      { provider, model: 'text-embedding-3-large' },
    )).rejects.toThrow('Provider does not support embeddings');
  });
});

// --- source_research ---
describe('[Handler] source_research', () => {
  it('success path with valid output', async () => {
    const { handleSourceResearch } = await import('../../src/lib/router/handlers/source-research.js');
    const output = loadFixtureOutput('source-research');
    const provider = makeMockProvider([chatResponse(output)]);

    const result = await handleSourceResearch(
      { query: 'Army logistics support', context: null, max_sources: 5 },
      { provider, model: 'sonar-pro' },
    );

    expect(result.output.findings.length).toBeGreaterThan(0);
    expect(result.output.sources_consulted).toBe(12);
  });
});
