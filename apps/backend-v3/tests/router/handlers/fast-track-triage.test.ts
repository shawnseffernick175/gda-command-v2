import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleFastTrackTriage } from '../../../src/lib/router/handlers/fast-track-triage.js';
import { fastTrackTriageOutputSchema } from '../../../src/lib/router/schemas.js';
import type { FastTrackTriageInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: FastTrackTriageInput = {
  title: 'Army Logistics Sustainment Support',
  description: 'Seeking contractor for logistics sustainment services at Army Sustainment Command.',
  naics_codes: ['541611', '541330'],
  set_aside: 'SDB',
  place_of_performance: 'Redstone Arsenal, AL',
};

defineHandlerTests({
  task: 'fast_track_triage',
  fixtureFile: 'fast-track-triage',
  handler: handleFastTrackTriage,
  schema: fastTrackTriageOutputSchema,
  sampleInput,
  assertionKey: 'grade',
  primaryModel: 'claude-haiku-4-5',
  fallbackModel: null,
  timeoutMs: 5_000,
});
