import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleOpportunityAnalysis } from '../../../src/lib/router/handlers/opportunity-analysis.js';
import { opportunityAnalysisOutputSchema } from '../../../src/lib/router/schemas.js';
import type { OpportunityAnalysisInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: OpportunityAnalysisInput = {
  opportunity_id: 'opp-test-001',
  title: 'TACOM Sustainment Contract',
  description: 'Full lifecycle sustainment support for TACOM ground vehicle fleet.',
  solicitation_number: 'W56HZV-26-R-0001',
  naics_codes: ['541611'],
  set_aside: 'SDB',
  place_of_performance: 'Warren, MI',
  response_deadline: '2026-07-15',
  incumbent_info: 'Apex Defense Solutions LLC holds predecessor contract.',
  sources: [
    { kind: 'sam_gov', title: 'SAM.gov Listing', url: 'https://sam.gov/opp/test' },
  ],
};

defineHandlerTests({
  task: 'opportunity_analysis',
  fixtureFile: 'opportunity-analysis',
  handler: handleOpportunityAnalysis,
  schema: opportunityAnalysisOutputSchema,
  sampleInput,
  assertionKey: 'win_probability',
  primaryModel: 'claude-sonnet-4-5',
  fallbackModel: 'claude-haiku-4-5',
  timeoutMs: 10_000,
});
