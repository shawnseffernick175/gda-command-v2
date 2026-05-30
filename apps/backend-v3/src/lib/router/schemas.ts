/**
 * Zod schemas derived from llm-router.types.ts TaskOutput types.
 * Used for runtime validation of LLM structured output.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

const SourceKindSchema = z.enum([
  'sam_gov',
  'fpds',
  'usaspending',
  'govwin',
  'govtribe',
  'sbir_sttr',
  'darpa_baa',
  'afwerx',
  'sofwerx',
  'edu_rfi',
  'orangeslices',
  'news',
  'doctrine',
  'partner_site',
  'internal',
]);

const SourceChipSchema = z.object({
  label: z.string(),
  url: z.string(),
  kind: SourceKindSchema,
  retrieved_at: z.string(),
});

// ---------------------------------------------------------------------------
// FastTrackTriageOutput
// ---------------------------------------------------------------------------

export const FastTrackTriageOutputSchema = z.object({
  grade: z.enum(['A', 'B', 'C']),
  rationale: z.string(),
  naics_match_score: z.number(),
  recommended_action: z.enum(['pursue', 'watch', 'skip']),
});

// ---------------------------------------------------------------------------
// OpportunityAnalysisOutput
// ---------------------------------------------------------------------------

export const OpportunityAnalysisOutputSchema = z.object({
  pwin: z.number(),
  pwin_rationale: z.string(),
  incumbent_analysis: z.string(),
  competitor_landscape: z.string(),
  blackhat_assessment: z.string(),
  wargame_summary: z.string(),
  timeline_analysis: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommended_teaming: z.array(z.string()),
  doctrine_alignment_score: z.number(),
});

// ---------------------------------------------------------------------------
// CapturePlanOutput (mirrors D3 §5.5 CoachOutput)
// ---------------------------------------------------------------------------

const WinThemeSchema = z.object({
  theme: z.string(),
  evidence: z.array(z.string()),
  customer_hot_button: z.string(),
});

const GhostThemeSchema = z.object({
  target_competitor: z.string(),
  theme: z.string(),
  rationale: z.string(),
});

const TeamingPartnerSchema = z.object({
  name: z.string(),
  role: z.enum(['sub', 'prime', 'jv_partner']),
  contribution: z.string(),
  certs_leveraged: z.array(z.string()),
  vehicles_leveraged: z.array(z.string()),
});

const TeamingPlanSchema = z.object({
  partners: z.array(TeamingPartnerSchema),
  rationale: z.string(),
  teaming_arrangement: z.enum(['prime_sub', 'joint_venture', 'mentor_protege']),
});

const PinkHatGapSchema = z.object({
  gap: z.string(),
  section: z.string(),
  severity: z.enum(['blocking', 'significant', 'minor']),
  recommended_fix: z.string(),
});

const RedTeamWeaknessSchema = z.object({
  weakness: z.string(),
  likelihood: z.enum(['High', 'Med', 'Low']),
  mitigation: z.string(),
});

const GoldTeamItemSchema = z.object({
  item: z.string(),
  status: z.enum(['complete', 'incomplete', 'not_applicable']),
  notes: z.string().nullable(),
});

const GoldTeamChecklistSchema = z.object({
  ready: z.boolean(),
  items: z.array(GoldTeamItemSchema),
});

const BlackHatEntrySchema = z.object({
  competitor: z.string(),
  likely_approach: z.string(),
  strengths_vs_us: z.array(z.string()),
  weaknesses_vs_us: z.array(z.string()),
  counter_strategy: z.string(),
});

const NextActionSchema = z.object({
  action: z.string(),
  owner: z.string(),
  deadline: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
});

export const CapturePlanOutputSchema = z.object({
  capture_plan: z.object({
    customer_profile: z.string(),
    requirements_summary: z.string(),
    solution_strategy: z.string(),
    win_themes: z.array(WinThemeSchema),
    ghost_themes: z.array(GhostThemeSchema),
    discriminators: z.array(z.string()),
    pricing_strategy: z.string(),
    teaming_plan: TeamingPlanSchema.nullable(),
  }),
  pink_hat_gaps: z.array(PinkHatGapSchema),
  red_team_weaknesses: z.array(RedTeamWeaknessSchema),
  gold_team_readiness: GoldTeamChecklistSchema,
  black_hat_competitor_positioning: z.array(BlackHatEntrySchema),
  next_action: NextActionSchema,
  source_chips: z.array(SourceChipSchema),
  generated_at: z.string(),
  model_used: z.string(),
  is_partial: z.boolean(),
});

// ---------------------------------------------------------------------------
// DailyBriefingOutput
// ---------------------------------------------------------------------------

const BriefingActionSchema = z.object({
  action: z.string(),
  urgency: z.enum(['immediate', 'today', 'this_week']),
  related_entity: z.string().nullable(),
});

export const DailyBriefingOutputSchema = z.object({
  headline: z.string(),
  priority_actions: z.array(BriefingActionSchema),
  risk_flags: z.array(z.string()),
  market_intel_summary: z.string(),
  cert_expiration_warnings: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// SentinelSummaryOutput
// ---------------------------------------------------------------------------

export const SentinelSummaryOutputSchema = z.object({
  severity: z.enum(['info', 'warning', 'critical']),
  root_cause: z.string(),
  recommended_fix: z.string(),
  affected_components: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// DoctrineScoreOutput
// ---------------------------------------------------------------------------

const DoctrinePrincipleScoreSchema = z.object({
  principle: z.string(),
  score: z.number(),
  rationale: z.string(),
});

export const DoctrineScoreOutputSchema = z.object({
  overall_score: z.number(),
  principle_scores: z.array(DoctrinePrincipleScoreSchema),
  alignment_summary: z.string(),
  concerns: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// SemanticEmbedOutput
// ---------------------------------------------------------------------------

export const SemanticEmbedOutputSchema = z.object({
  embedding: z.array(z.number()),
  dimensions: z.number(),
});

// ---------------------------------------------------------------------------
// SourceResearchOutput
// ---------------------------------------------------------------------------

const ResearchFindingSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  relevance_score: z.number(),
});

export const SourceResearchOutputSchema = z.object({
  findings: z.array(ResearchFindingSchema),
  summary: z.string(),
  sources_consulted: z.number(),
});

// ---------------------------------------------------------------------------
// Task → Schema map (for runtime lookup)
// ---------------------------------------------------------------------------

import type { Task } from '../llm-router.types.js';

export const TASK_OUTPUT_SCHEMAS: Record<Task, z.ZodType> = {
  fast_track_triage: FastTrackTriageOutputSchema,
  opportunity_analysis: OpportunityAnalysisOutputSchema,
  capture_plan: CapturePlanOutputSchema,
  daily_briefing: DailyBriefingOutputSchema,
  sentinel_summary: SentinelSummaryOutputSchema,
  doctrine_score: DoctrineScoreOutputSchema,
  semantic_embed: SemanticEmbedOutputSchema,
  source_research: SourceResearchOutputSchema,
};

export function validateTaskOutput<T extends Task>(
  task: T,
  data: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = TASK_OUTPUT_SCHEMAS[task];
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}
