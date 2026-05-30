import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleSentinelSummary } from '../../../src/lib/router/handlers/sentinel-summary.js';
import { sentinelSummaryOutputSchema } from '../../../src/lib/router/schemas.js';
import type { SentinelSummaryInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: SentinelSummaryInput = {
  alert_type: 'api_degradation',
  component: 'SAM.gov ingestion pipeline',
  details: 'Response times increased 3x over last 24 hours.',
  recent_log_lines: [
    '2026-05-30T07:00:00Z [WARN] SAM.gov API timeout: 15200ms',
    '2026-05-30T07:15:00Z [WARN] SAM.gov API timeout: 18400ms',
    '2026-05-30T07:30:00Z [ERROR] SAM.gov API 503 Service Unavailable',
  ],
};

defineHandlerTests({
  task: 'sentinel_summary',
  fixtureFile: 'sentinel-summary',
  handler: handleSentinelSummary,
  schema: sentinelSummaryOutputSchema,
  sampleInput,
  assertionKey: 'severity',
  primaryModel: 'claude-haiku-4-5',
  fallbackModel: null,
  timeoutMs: 5_000,
});
