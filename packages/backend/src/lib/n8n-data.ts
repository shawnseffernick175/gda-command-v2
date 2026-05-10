/**
 * n8n webhook data source layer.
 * Maps n8n webhook responses to GDA types used by the frontend.
 * Falls back gracefully when n8n is unavailable.
 */

import type { Opportunity, OpportunityStatus, DeepResearchReport, CompetitorProfile, ResearchStatus, CapturePlan, CapturePhase, TeamingPartner, CaptureMilestone, CaptureGateReview, CaptureRisk } from "@gda/shared";
import { callWebhook, webhookConfig } from "./n8n-client";

// Webhook paths (distinct from workflow names)
const WEBHOOKS = {
  oppTracker: "gda-opp-tracker",
  pipeline: "gda-pipeline",
  launchpad: "gda-launchpad",
  launchpadFunnel: "gda-launchpad-funnel",
  opportunityDetail: "gda-opportunity-detail",
  deepResearch: "gda-deep-research-history",
  capturePlan: "gda-capture-plan",
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

// --- Deep Research data ---

interface N8nDeepResearchItem {
  id: number;
  target: string;
  research_type: string;
  confidence: string;
  sources_used: number;
  summary: string;
  created_at: string;
}

export interface N8nDeepResearchResult {
  ok: boolean;
  reports: DeepResearchReport[];
  error?: string;
}

function mapResearchStatus(confidence: string): ResearchStatus {
  return "completed";
}

function mapDeepResearch(raw: N8nDeepResearchItem): DeepResearchReport {
  return {
    id: `research-${raw.id}`,
    query: raw.target,
    status: mapResearchStatus(raw.confidence),
    summary: raw.summary,
    findings: null,
    sources_count: raw.sources_used,
    requested_at: raw.created_at,
    completed_at: raw.created_at,
    requested_by: "GDA Intelligence Engine",
  };
}

export async function fetchDeepResearchFromN8n(): Promise<N8nDeepResearchResult> {
  const result = await callWebhook(WEBHOOKS.deepResearch, {}, { timeoutMs: 30_000 });
  if (!result.ok || !result.body) {
    return {
      ok: false,
      reports: [],
      error: result.error ?? `HTTP ${result.http}`,
    };
  }

  const rawItems = (Array.isArray(result.body) ? result.body : []) as N8nDeepResearchItem[];
  return {
    ok: true,
    reports: rawItems.map(mapDeepResearch),
  };
}

// --- Competitor data (derived from deep research) ---

export interface N8nCompetitorResult {
  ok: boolean;
  competitors: CompetitorProfile[];
  error?: string;
}

function mapCompetitor(raw: N8nDeepResearchItem, index: number): CompetitorProfile {
  const summaryLower = raw.summary.toLowerCase();

  const threatScore = raw.confidence === "HIGH" ? 90 :
    raw.confidence === "MEDIUM" ? 75 : 60;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recentWins: string[] = [];

  const sentencesArr = raw.summary.split(/\.\s+/);
  for (const s of sentencesArr) {
    const sl = s.toLowerCase();
    if (sl.includes("win") || sl.includes("award") || sl.includes("contract")) {
      const winMatch = s.match(/\$[\d.]+[BMK]\b[^.]{0,80}/);
      if (winMatch) recentWins.push(winMatch[0].trim());
    }
    if (sl.includes("strength") || sl.includes("strong") || sl.includes("advantage") || sl.includes("dominat")) {
      if (strengths.length < 4) strengths.push(s.trim().slice(0, 120));
    }
    if (sl.includes("weakness") || sl.includes("weak") || sl.includes("headwind") || sl.includes("challenge") || sl.includes("turnover") || sl.includes("flat revenue")) {
      if (weaknesses.length < 3) weaknesses.push(s.trim().slice(0, 120));
    }
  }

  if (strengths.length === 0) strengths.push("Defense IT/SETA capabilities");
  if (weaknesses.length === 0) weaknesses.push("See detailed research report");

  const valueMatch = raw.summary.match(/\$([\d.]+)\s*(B|billion)/i);
  const contractsValue = valueMatch ? parseFloat(valueMatch[1]) * 1_000_000_000 : 0;

  return {
    id: `comp-n8n-${raw.id}`,
    name: raw.target,
    threat_score: threatScore,
    contracts_won: recentWins.length || (raw.sources_used > 10 ? 5 : 3),
    contracts_value: contractsValue,
    primary_naics: ["541715", "541330", "541511"],
    strengths,
    weaknesses,
    recent_wins: recentWins.length > 0 ? recentWins : [`See ${raw.target} research report`],
    watch_status: "active",
    last_updated: raw.created_at,
  };
}

export async function fetchCompetitorsFromN8n(): Promise<N8nCompetitorResult> {
  const result = await callWebhook(WEBHOOKS.deepResearch, {}, { timeoutMs: 30_000 });
  if (!result.ok || !result.body) {
    return {
      ok: false,
      competitors: [],
      error: result.error ?? `HTTP ${result.http}`,
    };
  }

  const rawItems = (Array.isArray(result.body) ? result.body : []) as N8nDeepResearchItem[];
  const competitorItems = rawItems.filter((item) => item.research_type === "competitor");

  const seen = new Set<string>();
  const uniqueCompetitors: N8nDeepResearchItem[] = [];
  for (const item of competitorItems) {
    if (!seen.has(item.target)) {
      seen.add(item.target);
      uniqueCompetitors.push(item);
    }
  }

  return {
    ok: true,
    competitors: uniqueCompetitors.map((item, i) => mapCompetitor(item, i)),
  };
}

// --- Capture Plan mapping: n8n → GDA CapturePlan ---

interface N8nCapturePlanItem {
  id: number;
  opportunity: string;
  agency: string | null;
  contract_value: string | null;
  plan_data: Record<string, unknown> | null;
  opp_title: string | null;
  created_at: string;
  updated_at: string;
  no_bid: boolean;
}

interface N8nCapturePlansResponse {
  status: string;
  plans: N8nCapturePlanItem[];
}

export interface N8nCapturePlansResult {
  ok: boolean;
  plans: CapturePlan[];
}

function mapN8nStageToPhase(stage: string | undefined): CapturePhase {
  if (!stage) return "pre_rfp";
  const s = stage.toLowerCase();
  if (s === "pass" || s === "no-bid") return "pre_rfp";
  if (s === "qualify" || s === "pursue") return "pre_rfp";
  if (s === "go/no-go") return "rfp_released";
  if (s === "proposal" || s === "proposal prep") return "proposal_prep";
  if (s === "post-submittal" || s === "submitted") return "submitted";
  if (s === "evaluation") return "evaluation";
  if (s === "awarded" || s === "won") return "awarded";
  return "pre_rfp";
}

function mapBidDecision(noBid: boolean, stage: string | undefined): "bid" | "no_bid" | "pending" {
  if (noBid) return "no_bid";
  const s = (stage ?? "").toLowerCase();
  if (s === "pass" || s === "no-bid") return "no_bid";
  if (s === "go/no-go" || s === "qualify") return "pending";
  if (s === "proposal" || s === "proposal prep" || s === "post-submittal" || s === "awarded" || s === "pursue") return "bid";
  return "pending";
}

function parseValue(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = String(raw).replace(/[$,]/g, "").trim();
  const m = s.match(/([\d.]+)\s*([BMKbmk])?/);
  if (!m) return parseFloat(s) || 0;
  const num = parseFloat(m[1]);
  const suffix = (m[2] ?? "").toUpperCase();
  if (suffix === "B") return num * 1_000_000_000;
  if (suffix === "M") return num * 1_000_000;
  if (suffix === "K") return num * 1_000;
  return num;
}

function parseBulletList(text: unknown): string[] {
  if (!text || typeof text !== "string") return [];
  return text
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseTeamComposition(raw: unknown): TeamingPartner[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    return parseBulletList(raw).map((line) => ({
      name: line.split(/[:(–—-]/)[0].trim(),
      role: /prime/i.test(line) ? "prime" : "sub",
      capability: line,
      status: "identified" as const,
      past_performance_score: null,
    }));
  }
  if (Array.isArray(raw)) {
    return raw.map((item: Record<string, unknown>) => ({
      name: String(item.name ?? item.company ?? "Unknown"),
      role: (String(item.role ?? "sub").toLowerCase().includes("prime") ? "prime" : "sub") as "prime" | "sub",
      capability: String(item.capability ?? item.role_description ?? ""),
      status: "identified" as const,
      past_performance_score: null,
    }));
  }
  return [];
}

function parseRisks(raw: unknown): CaptureRisk[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    return parseBulletList(raw).map((line) => ({
      description: line,
      likelihood: "medium" as const,
      impact: "medium" as const,
      mitigation: "",
    }));
  }
  if (Array.isArray(raw)) {
    return raw.map((r: Record<string, unknown>) => ({
      description: String(r.description ?? r.risk ?? r.title ?? ""),
      likelihood: (String(r.likelihood ?? "medium").toLowerCase() as "high" | "medium" | "low"),
      impact: (String(r.impact ?? "medium").toLowerCase() as "high" | "medium" | "low"),
      mitigation: String(r.mitigation ?? r.mitigation_plan ?? ""),
    }));
  }
  return [];
}

function mapCapturePlan(raw: N8nCapturePlanItem): CapturePlan {
  const pd = (raw.plan_data ?? {}) as Record<string, unknown>;
  const stage = String(pd.stage ?? "");
  const pwinRaw = pd.pwin ?? pd.pwin_scores;
  let pwin = 0;
  if (typeof pwinRaw === "number") pwin = pwinRaw;
  else if (typeof pwinRaw === "string") pwin = parseInt(pwinRaw, 10) || 0;

  const value = parseValue(raw.contract_value) || parseValue(pd.contract_value as string) || parseValue(pd.total_contract_value as string);

  const strengths = parseBulletList(pd.eis_strengths);
  const weaknesses = parseBulletList(pd.eis_weaknesses);
  const threats = parseBulletList(pd.swot_threats);
  const winStrategy = parseBulletList(pd.win_strategy);

  const winThemes = winStrategy.length > 0 ? winStrategy : strengths.slice(0, 4);
  const discriminators = winStrategy.length > 0 ? strengths.slice(0, 3) : strengths.length > winThemes.length ? strengths.slice(winThemes.length, winThemes.length + 3) : [];

  const risks = parseRisks(pd.risks);
  if (risks.length === 0 && threats.length > 0) {
    for (const t of threats.slice(0, 3)) {
      risks.push({ description: t, likelihood: "medium", impact: "medium", mitigation: "" });
    }
  }

  const teamPartners = parseTeamComposition(pd.team_composition);
  if (teamPartners.length === 0 && pd.prime_company) {
    teamPartners.push({
      name: String(pd.prime_company),
      role: "prime",
      capability: "Prime contractor",
      status: "confirmed",
      past_performance_score: null,
    });
  }

  const goNoGoRec = String(pd.go_no_go_recommendation ?? "");
  const gateReviews: CaptureGateReview[] = [];
  if (goNoGoRec) {
    gateReviews.push({
      gate: "Go/No-Go",
      status: /go|pursue|bid/i.test(goNoGoRec) && !/no.go|no.bid|pass/i.test(goNoGoRec) ? "passed" : "pending",
      reviewer: String(pd.source ?? "GDA System"),
      reviewed_at: raw.updated_at || null,
      notes: goNoGoRec.length > 100 ? goNoGoRec.slice(0, 100) + "…" : goNoGoRec,
    });
  }

  const milestones: CaptureMilestone[] = [];
  const deadline = pd.response_deadline ?? pd.rfp_date;
  if (deadline) {
    milestones.push({
      id: `ms-${raw.id}-deadline`,
      title: "Response Deadline",
      due_date: String(deadline),
      status: "on_track",
      owner: String(pd.source ?? "Capture Manager"),
      notes: null,
    });
  }

  return {
    id: `n8n-cap-${raw.id}`,
    opportunity_id: `n8n-opp-${raw.id}`,
    opportunity_title: raw.opp_title || String(pd.opportunity_name ?? pd.opportunity ?? raw.opportunity),
    agency: raw.agency || String(pd.agency ?? ""),
    phase: mapN8nStageToPhase(stage),
    pwin,
    value_estimated: value,
    capture_manager: String(pd.source ?? pd.division_owners ?? "GDA System"),
    bid_decision: mapBidDecision(raw.no_bid, stage),
    teaming_partners: teamPartners,
    milestones,
    gate_reviews: gateReviews,
    win_themes: winThemes,
    discriminators,
    risks,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

export async function fetchCapturePlansFromN8n(): Promise<N8nCapturePlansResult> {
  const result = await callWebhook(WEBHOOKS.capturePlan, { action: "list" });
  const body = result.body as N8nCapturePlansResponse | undefined;
  if (!result.ok || !body || body.status !== "ok") {
    return { ok: false, plans: [] };
  }

  const rawPlans = body.plans ?? [];
  return {
    ok: true,
    plans: rawPlans.map(mapCapturePlan),
  };
}
