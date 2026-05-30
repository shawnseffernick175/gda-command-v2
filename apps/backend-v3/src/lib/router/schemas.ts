/**
 * Zod schemas derived from llm-router.types.ts TaskOutput types.
 * Used for runtime validation of LLM structured output.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const sourceKindSchema = z.enum([
  'sam_gov', 'fpds', 'usaspending', 'govwin', 'govtribe',
  'sbir_sttr', 'darpa_baa', 'afwerx', 'sofwerx', 'edu_rfi',
  'orangeslices', 'news', 'doctrine', 'partner_site', 'internal',
]);

const sourceChipSchema = z.object({
  label: z.string(),
  url: z.string(),
  kind: sourceKindSchema,
  retrieved_at: z.string(),
});

// ---------------------------------------------------------------------------
// FastTrackTriageOutput
// ---------------------------------------------------------------------------

export const fastTrackTriageOutputSchema = z.object({
  grade: z.enum(['A', 'B', 'C']),
  rationale: z.string(),
  naics_match_score: z.number(),
  recommended_action: z.enum(['pursue', 'watch', 'skip']),
});

// ---------------------------------------------------------------------------
// OpportunityAnalysisOutput
// ---------------------------------------------------------------------------

export const opportunityAnalysisOutputSchema = z.object({
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

const winThemeSchema = z.object({
  theme: z.string(),
  evidence: z.array(z.string()),
  customer_hot_button: z.string(),
});

const ghostThemeSchema = z.object({
  target_competitor: z.string(),
  theme: z.string(),
  rationale: z.string(),
});

const teamingPartnerSchema = z.object({
  name: z.string(),
  role: z.enum(['sub', 'prime', 'jv_partner']),
  contribution: z.string(),
  certs_leveraged: z.array(z.string()),
  vehicles_leveraged: z.array(z.string()),
});

const teamingPlanSchema = z.object({
  partners: z.array(teamingPartnerSchema),
  rationale: z.string(),
  teaming_arrangement: z.enum(['prime_sub', 'joint_venture', 'mentor_protege']),
});

const pinkHatGapSchema = z.object({
  gap: z.string(),
  section: z.string(),
  severity: z.enum(['blocking', 'significant', 'minor']),
  recommended_fix: z.string(),
});

const redTeamWeaknessSchema = z.object({
  weakness: z.string(),
  likelihood: z.enum(['High', 'Med', 'Low']),
  mitigation: z.string(),
});

const goldTeamItemSchema = z.object({
  item: z.string(),
  status: z.enum(['complete', 'incomplete', 'not_applicable']),
  notes: z.string().nullable(),
});

const goldTeamChecklistSchema = z.object({
  ready: z.boolean(),
  items: z.array(goldTeamItemSchema),
});

const blackHatEntrySchema = z.object({
  competitor: z.string(),
  likely_approach: z.string(),
  strengths_vs_us: z.array(z.string()),
  weaknesses_vs_us: z.array(z.string()),
  counter_strategy: z.string(),
});

const nextActionSchema = z.object({
  action: z.string(),
  owner: z.string(),
  deadline: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
});

export const capturePlanOutputSchema = z.object({
  capture_plan: z.object({
    customer_profile: z.string(),
    requirements_summary: z.string(),
    solution_strategy: z.string(),
    win_themes: z.array(winThemeSchema),
    ghost_themes: z.array(ghostThemeSchema),
    discriminators: z.array(z.string()),
    pricing_strategy: z.string(),
    teaming_plan: teamingPlanSchema.nullable(),
  }),
  pink_hat_gaps: z.array(pinkHatGapSchema),
  red_team_weaknesses: z.array(redTeamWeaknessSchema),
  gold_team_readiness: goldTeamChecklistSchema,
  black_hat_competitor_positioning: z.array(blackHatEntrySchema),
  next_action: nextActionSchema,
  source_chips: z.array(sourceChipSchema),
  generated_at: z.string(),
  model_used: z.string(),
  is_partial: z.boolean(),
});

// ---------------------------------------------------------------------------
// DailyBriefingOutput
// ---------------------------------------------------------------------------

const briefingActionSchema = z.object({
  action: z.string(),
  urgency: z.enum(['immediate', 'today', 'this_week']),
  related_entity: z.string().nullable(),
});

export const dailyBriefingOutputSchema = z.object({
  headline: z.string(),
  priority_actions: z.array(briefingActionSchema),
  risk_flags: z.array(z.string()),
  market_intel_summary: z.string(),
  cert_expiration_warnings: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// SentinelSummaryOutput
// ---------------------------------------------------------------------------

export const sentinelSummaryOutputSchema = z.object({
  severity: z.enum(['info', 'warning', 'critical']),
  root_cause: z.string(),
  recommended_fix: z.string(),
  affected_components: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// DoctrineScoreOutput
// ---------------------------------------------------------------------------

const doctrinePrincipleScoreSchema = z.object({
  principle: z.string(),
  score: z.number(),
  rationale: z.string(),
});

export const doctrineScoreOutputSchema = z.object({
  overall_score: z.number(),
  principle_scores: z.array(doctrinePrincipleScoreSchema),
  alignment_summary: z.string(),
  concerns: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// SemanticEmbedOutput
// ---------------------------------------------------------------------------

export const semanticEmbedOutputSchema = z.object({
  embedding: z.array(z.number()),
  dimensions: z.number(),
});

// ---------------------------------------------------------------------------
// SourceResearchOutput
// ---------------------------------------------------------------------------

const researchFindingSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  relevance_score: z.number(),
});

export const sourceResearchOutputSchema = z.object({
  findings: z.array(researchFindingSchema),
  summary: z.string(),
  sources_consulted: z.number(),
});

// ---------------------------------------------------------------------------
// Task → schema map
// ---------------------------------------------------------------------------

import type { Task } from '../llm-router.types.js';

export const TASK_SCHEMAS: Record<Task, z.ZodTypeAny> = {
  fast_track_triage: fastTrackTriageOutputSchema,
  opportunity_analysis: opportunityAnalysisOutputSchema,
  capture_plan: capturePlanOutputSchema,
  daily_briefing: dailyBriefingOutputSchema,
  sentinel_summary: sentinelSummaryOutputSchema,
  doctrine_score: doctrineScoreOutputSchema,
  semantic_embed: semanticEmbedOutputSchema,
  source_research: sourceResearchOutputSchema,
};
