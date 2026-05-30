import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleCapturePlan } from '../../../src/lib/router/handlers/capture-plan.js';
import { capturePlanOutputSchema } from '../../../src/lib/router/schemas.js';
import type { CapturePlanInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: CapturePlanInput = {
  opportunity_id: 'opp-test-002',
  title: 'CASCOM Training Modernization',
  description: 'Modernize training curricula and simulation environments for CASCOM.',
  solicitation_number: 'W91WAW-26-R-0042',
  analysis_summary: 'Grade A opportunity with 72% pwin, strong NAICS alignment.',
  incumbent_info: null,
  competitor_landscape: 'Expected 2-3 bids from mid-tier training firms.',
  envision_capabilities: ['Training development', 'Simulation engineering', 'LMS deployment'],
  teaming_partners: ['Simtech Solutions'],
  sources: [
    { kind: 'sam_gov', title: 'SAM.gov Opportunity', url: 'https://sam.gov/opp/test-capture' },
  ],
};

defineHandlerTests({
  task: 'capture_plan',
  fixtureFile: 'capture-plan',
  handler: handleCapturePlan,
  schema: capturePlanOutputSchema,
  sampleInput,
  assertionKey: 'capture_plan',
  primaryModel: 'claude-opus-4-5',
  fallbackModel: 'claude-sonnet-4-5',
  timeoutMs: 60_000,
});
