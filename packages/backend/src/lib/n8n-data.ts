/**
 * n8n webhook data source layer.
 * Maps n8n webhook responses to GDA types used by the frontend.
 * Falls back gracefully when n8n is unavailable.
 */

import type { Opportunity, OpportunityStatus } from "@gda/shared";
import { callWebhook, webhookConfig } from "./n8n-client";

// Webhook paths (distinct from workflow names)
const WEBHOOKS = {
  oppTracker: "gda-opp-tracker",
  pipeline: "gda-pipeline",
  launchpad: "gda-launchpad",
  launchpadFunnel: "gda-launchpad-funnel",
  opportunityDetail: "gda-opportunity-detail",
} as const;

export function n8nWebhookConfigured(): boolean {
  const { base, key, missing } = webhookConfig();
  return missing.length === 0 && !!base && !!key;
}

// --- Field mapping: n8n opportunity → GDA Opportunity ---

interface N8nOpportunity {
  id: number | string;
  title?: string;
  opp_title?: string;
  name?: string;
  agency?: string;
  dept?: string;
  raw_agency?: string;
  stage?: string;
  gda_score?: number;
  estimated_value?: number | string | null;
  naics_code?: string;
  set_aside?: string;
  response_deadline?: string;
  solicitation_number?: string;
  place_of_performance?: string;
  source_url?: string;
  ai_analysis?: string;
  incumbent_analysis?: string;
  likely_competitors?: string;
  eligible_vehicles?: string;
  gda_label?: string;
  sb_qualified?: boolean | null;
  assigned_ou?: string;
  has_capture_plan?: boolean;
  data_source?: string;
  govtribe_id?: string;
  last_refreshed?: string;
  level_1?: string;
  level_2?: string;
  level_3?: string;
  psc?: string;
  needs_score?: number | null;
  financials_score?: number | null;
  ooda_score?: number | null;
  eis_fit_score?: number | null;
}

const STAGE_MAP: Record<string, OpportunityStatus> = {
  identified: "discovery",
  qualified: "qualified",
  pipeline: "pipeline",
  "go/no-go": "pipeline",
  "post-submittal": "pipeline",
  interest: "discovery",
  pursuit: "qualified",
  pursue: "qualified",
  evaluate: "discovery",
  monitor: "discovery",
  won: "won",
  awarded: "won",
  lost: "lost",
};

function mapStage(stage: string | undefined): OpportunityStatus {
  if (!stage) return "discovery";
  const lower = stage.toLowerCase();
  return STAGE_MAP[lower] ?? "discovery";
}

function mapOpportunity(raw: N8nOpportunity): Opportunity {
  const value = raw.estimated_value != null ? Number(raw.estimated_value) : null;
  const score = raw.gda_score ?? raw.eis_fit_score ?? 0;

  return {
    id: String(raw.id),
    title: raw.opp_title ?? raw.title ?? raw.name ?? "Untitled",
    agency: raw.agency ?? raw.raw_agency ?? null,
    department: raw.dept ?? raw.level_1 ?? null,
    status: mapStage(raw.stage),
    score,
    value_estimated: value,
    probability_of_win: null,
    naics: raw.naics_code ?? null,
    psc: raw.psc ?? null,
    due_date: raw.response_deadline ?? null,
    solicitation_number: raw.solicitation_number ?? null,
    set_aside: raw.set_aside ?? null,
    place_of_performance: raw.place_of_performance ?? null,
    incumbent: raw.incumbent_analysis ?? null,
    qualified_at: null,
    qualified_by: null,
    tags: [
      raw.gda_label,
      raw.data_source,
      raw.assigned_ou,
    ].filter((t): t is string => !!t),
    raw_source_url: raw.source_url ?? null,
    created_at: raw.last_refreshed ?? new Date().toISOString(),
    updated_at: raw.last_refreshed ?? new Date().toISOString(),
  };
}

// --- Ops Tracker data ---

export interface N8nOpsTrackerResult {
  ok: boolean;
  opportunities: Opportunity[];
  meta: {
    total: number;
    pipelineValue: number;
    pursueCount: number;
    evaluateCount: number;
    lastSync: string;
    dataSources: Array<{ name: string; type: string }>;
  };
  error?: string;
}

export async function fetchOpsTrackerFromN8n(): Promise<N8nOpsTrackerResult> {
  const result = await callWebhook(WEBHOOKS.oppTracker, {}, { timeoutMs: 30_000 });
  if (!result.ok || !result.body) {
    return {
      ok: false,
      opportunities: [],
      meta: { total: 0, pipelineValue: 0, pursueCount: 0, evaluateCount: 0, lastSync: "", dataSources: [] },
      error: result.error ?? `HTTP ${result.http}`,
    };
  }

  const data = result.body as Record<string, unknown>;
  const rawOpps = (data.opportunities ?? []) as N8nOpportunity[];
  const opportunities = rawOpps.map(mapOpportunity);

  return {
    ok: true,
    opportunities,
    meta: {
      total: (data.total_opportunities as number) ?? opportunities.length,
      pipelineValue: (data.pipeline_value as number) ?? 0,
      pursueCount: (data.pursue_count as number) ?? 0,
      evaluateCount: (data.evaluate_count as number) ?? 0,
      lastSync: (data.last_sync as string) ?? "",
      dataSources: (data.data_sources as Array<{ name: string; type: string }>) ?? [],
    },
  };
}

// --- Pipeline data ---

export interface N8nPipelineResult {
  ok: boolean;
  opportunities: Opportunity[];
  meta: { count: number };
  error?: string;
}

export async function fetchPipelineFromN8n(): Promise<N8nPipelineResult> {
  const result = await callWebhook(WEBHOOKS.pipeline, {}, { timeoutMs: 30_000 });
  if (!result.ok || !result.body) {
    return {
      ok: false,
      opportunities: [],
      meta: { count: 0 },
      error: result.error ?? `HTTP ${result.http}`,
    };
  }

  const data = result.body as Record<string, unknown>;
  const rawPipeline = (data.pipeline ?? []) as N8nOpportunity[];
  const opportunities = rawPipeline.map(mapOpportunity);

  return {
    ok: true,
    opportunities,
    meta: { count: (data.count as number) ?? opportunities.length },
  };
}

// --- Launchpad / Dashboard data ---

export interface N8nLaunchpadKpi {
  pursueCount: number;
  evaluateCount: number;
  monitorCount: number;
  weightedPipeline: string;
  weightedPipelineRaw: number;
  avgScore: number;
  totalOpps: number;
}

export interface N8nFunnelStage {
  stage: string;
  count: number;
  valueM: number;
}

export interface N8nLaunchpadResult {
  ok: boolean;
  kpis: N8nLaunchpadKpi;
  topOpportunities: Opportunity[];
  ftSignals: unknown[];
  analysisStatus: { available: boolean; message: string };
  generatedAt: string;
  error?: string;
}

export async function fetchLaunchpadFromN8n(): Promise<N8nLaunchpadResult> {
  const result = await callWebhook(WEBHOOKS.launchpad, {}, { timeoutMs: 30_000 });
  if (!result.ok || !result.body) {
    return {
      ok: false,
      kpis: { pursueCount: 0, evaluateCount: 0, monitorCount: 0, weightedPipeline: "$0", weightedPipelineRaw: 0, avgScore: 0, totalOpps: 0 },
      topOpportunities: [],
      ftSignals: [],
      analysisStatus: { available: false, message: "" },
      generatedAt: "",
      error: result.error ?? `HTTP ${result.http}`,
    };
  }

  const data = result.body as Record<string, unknown>;
  const kpisRaw = data.kpis as Record<string, unknown> ?? {};
  const topRaw = (data.top_opportunities ?? []) as N8nOpportunity[];

  return {
    ok: true,
    kpis: {
      pursueCount: (kpisRaw.pursue_count as number) ?? 0,
      evaluateCount: (kpisRaw.evaluate_count as number) ?? 0,
      monitorCount: (kpisRaw.monitor_count as number) ?? 0,
      weightedPipeline: (kpisRaw.weighted_pipeline as string) ?? "$0",
      weightedPipelineRaw: (kpisRaw.weighted_pipeline_raw as number) ?? 0,
      avgScore: (kpisRaw.avg_score as number) ?? 0,
      totalOpps: (kpisRaw.total_opps as number) ?? 0,
    },
    topOpportunities: topRaw.map(mapOpportunity),
    ftSignals: (data.ft_signals ?? []) as unknown[],
    analysisStatus: (data.analysis_status as { available: boolean; message: string }) ?? { available: false, message: "" },
    generatedAt: (data.generated_at as string) ?? "",
  };
}

export interface N8nFunnelResult {
  ok: boolean;
  summary: {
    totalOpps: number;
    totalValue: number;
    totalCapture: number;
  };
  oppStages: N8nFunnelStage[];
  captureStages: N8nFunnelStage[];
  topOpps: Opportunity[];
  error?: string;
}

export async function fetchLaunchpadFunnelFromN8n(): Promise<N8nFunnelResult> {
  const result = await callWebhook(WEBHOOKS.launchpadFunnel, {}, { timeoutMs: 30_000 });
  if (!result.ok || !result.body) {
    return {
      ok: false,
      summary: { totalOpps: 0, totalValue: 0, totalCapture: 0 },
      oppStages: [],
      captureStages: [],
      topOpps: [],
      error: result.error ?? `HTTP ${result.http}`,
    };
  }

  const data = result.body as Record<string, unknown>;
  const summaryRaw = data.summary as Record<string, unknown> ?? {};
  const oppStagesRaw = (data.oppStages ?? []) as Array<{ stage: string; count: string | number; value_m: string | number }>;
  const captureStagesRaw = (data.captureStages ?? []) as Array<{ stage: string; count: string | number; alloc_m?: string | number; tcv_m?: string | number }>;
  const topRaw = (data.topOpps ?? []) as N8nOpportunity[];

  return {
    ok: true,
    summary: {
      totalOpps: (summaryRaw.totalOpps as number) ?? 0,
      totalValue: (summaryRaw.totalValue as number) ?? 0,
      totalCapture: (summaryRaw.totalCapture as number) ?? 0,
    },
    oppStages: oppStagesRaw.map((s) => ({
      stage: s.stage,
      count: Number(s.count) || 0,
      valueM: Number(s.value_m) || 0,
    })),
    captureStages: captureStagesRaw.map((s) => ({
      stage: s.stage,
      count: Number(s.count) || 0,
      valueM: Number(s.tcv_m ?? s.alloc_m) || 0,
    })),
    topOpps: topRaw.map(mapOpportunity),
  };
}
