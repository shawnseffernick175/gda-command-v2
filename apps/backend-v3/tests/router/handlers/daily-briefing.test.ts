import { defineHandlerTests } from '../__helpers__/handler-test-suite.js';
import { handleDailyBriefing } from '../../../src/lib/router/handlers/daily-briefing.js';
import { dailyBriefingOutputSchema } from '../../../src/lib/router/schemas.js';
import type { DailyBriefingInput } from '../../../src/lib/llm-router.types.js';

const sampleInput: DailyBriefingInput = {
  date: '2026-05-30',
  open_opportunities: [
    {
      opportunity_id: 'opp-001',
      title: 'Army Logistics Support',
      solicitation_number: 'W56HZV-26-R-0001',
      response_deadline: '2026-07-15',
      grade: 'A',
      pwin: 68,
      days_until_deadline: 46,
    },
  ],
  captures_with_gaps: [
    {
      capture_id: 'cap-001',
      opportunity_title: 'CASCOM Training',
      color_review_stage: 'pink',
      gaps: ['Incomplete past performance volume'],
      next_milestone: 'Pink Team Review 2026-06-10',
    },
  ],
  action_items_due: [
    {
      id: 'ai-001',
      title: 'Submit RS3 task order proposal',
      due_date: '2026-05-31',
      urgency: 'today',
      related_entity: 'opp-001',
    },
  ],
  sentinel_status: {
    overall_health: 'healthy',
    active_alerts: [],
    last_check_at: '2026-05-30T08:00:00Z',
  },
  pending_recommendations: [],
  pipeline_at_risk: [],
  expiring_certs: [
    {
      cert_name: 'CMMI-DEV ML3',
      expiration_date: '2026-08-07',
      days_remaining: 69,
      severity: 'warning',
    },
  ],
};

defineHandlerTests({
  task: 'daily_briefing',
  fixtureFile: 'daily-briefing',
  handler: handleDailyBriefing,
  schema: dailyBriefingOutputSchema,
  sampleInput,
  assertionKey: 'headline',
  primaryModel: 'claude-sonnet-4-5',
  fallbackModel: 'claude-haiku-4-5',
  timeoutMs: 30_000,
});
