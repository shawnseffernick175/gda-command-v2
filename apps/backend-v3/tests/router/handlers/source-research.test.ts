import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleSourceResearch } from '../../../src/lib/router/handlers/source-research.js';
import { sourceResearchOutputSchema } from '../../../src/lib/router/schemas.js';
import type { SourceResearchInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: SourceResearchInput = {
  query: 'Army TACOM vehicle maintenance sustainment contracts 2025-2026',
  context: 'Looking for competitive landscape data and incumbent contract details.',
  max_sources: 10,
};

defineHandlerTests({
  task: 'source_research',
  fixtureFile: 'source-research',
  handler: handleSourceResearch,
  schema: sourceResearchOutputSchema,
  sampleInput,
  assertionKey: 'findings',
  primaryModel: 'sonar-pro',
  fallbackModel: null,
  timeoutMs: 20_000,
});
