/**
 * LLM Router — stub implementation.
 *
 * The real router will be implemented by F-215 D4.
 * This stub returns mock responses for development and testing.
 */

import type {
  Task,
  RouteRequest,
  RouteResponse,
  RouteResponseOk,
  FastTrackTriageOutput,
  SourceChip,
} from './llm-router.types.js';

async function route<T extends Task>(
  request: RouteRequest<T>,
): Promise<RouteResponse<T>> {
  const { task, input } = request;

  if (task === 'fast_track_triage') {
    const ftInput = input as unknown as { title: string; naics_codes: string[] };
    const output: FastTrackTriageOutput & { source_chips: SourceChip[] } = {
      grade: 'B',
      rationale: `Stub triage for: ${ftInput.title}`,
      naics_match_score: 65,
      recommended_action: 'watch',
      source_chips: [
        {
          label: 'LLM Router Stub',
          url: 'https://gda.csr-llc.tech',
          kind: 'internal',
          retrieved_at: new Date().toISOString(),
        },
      ],
    };

    return {
      ok: true,
      task,
      model_used: 'stub-model',
      output: output as unknown as RouteResponseOk<T>['output'],
      latency_ms: 0,
      tokens: { input: 0, output: 0 },
      cost_estimate_usd: 0,
      fallback_used: false,
      quality_flag: 'full',
      trace_id: `stub-${Date.now()}`,
    };
  }

  return {
    ok: false,
    task,
    model_used: null,
    output: null,
    latency_ms: 0,
    tokens: null,
    cost_estimate_usd: 0,
    fallback_used: false,
    quality_flag: 'degraded',
    error_kind: 'VALIDATION_ERROR',
    error_message: `No stub handler for task: ${task}`,
    trace_id: `stub-${Date.now()}`,
  } as RouteResponse<T>;
}

export const llmRouter = { route };
