import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleDoctrineScore } from '../../../src/lib/router/handlers/doctrine-score.js';
import { doctrineScoreOutputSchema } from '../../../src/lib/router/schemas.js';
import type { DoctrineScoreInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: DoctrineScoreInput = {
  opportunity_id: 'opp-test-003',
  title: 'Army C5ISR Engineering Support',
  description: 'Systems engineering and integration support for Army C5ISR programs.',
  naics_codes: ['541330', '541715'],
  set_aside: 'SDB',
  envision_alignment_context: 'Envision has active C5ISR contracts with PEO C3T and RS3 vehicle access.',
};

defineHandlerTests({
  task: 'doctrine_score',
  fixtureFile: 'doctrine-score',
  handler: handleDoctrineScore,
  schema: doctrineScoreOutputSchema,
  sampleInput,
  assertionKey: 'overall_score',
  primaryModel: 'claude-haiku-4-5',
  fallbackModel: 'claude-haiku-3-5',
  timeoutMs: 8_000,
});
