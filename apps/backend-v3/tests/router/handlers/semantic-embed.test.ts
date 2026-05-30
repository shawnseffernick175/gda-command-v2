import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleSemanticEmbed } from '../../../src/lib/router/handlers/semantic-embed.js';
import { semanticEmbedOutputSchema } from '../../../src/lib/router/schemas.js';
import type { SemanticEmbedInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: SemanticEmbedInput = {
  text: 'Army logistics sustainment support services for TACOM ground vehicle fleet maintenance.',
  namespace: 'opportunities',
};

defineHandlerTests({
  task: 'semantic_embed',
  fixtureFile: 'semantic-embed',
  handler: handleSemanticEmbed,
  schema: semanticEmbedOutputSchema,
  sampleInput,
  assertionKey: 'embedding',
  isEmbedHandler: true,
  primaryModel: 'text-embedding-3-large',
  fallbackModel: null,
  timeoutMs: 10_000,
});
