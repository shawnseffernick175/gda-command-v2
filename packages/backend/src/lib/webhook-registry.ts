/**
 * Centralized n8n webhook registry.
 * Maps every webhook path used by GDA Command to its current status.
 *
 * Status:
 *   "live"     — returns 200, data flows into the app
 *   "exists"   — n8n workflow exists (returns 500, needs internal config)
 *   "planned"  — no matching n8n workflow yet (returns 404)
 *
 * When an n8n workflow gets configured/fixed, just update the status here
 * and the route will automatically start using real data.
 */

export type WebhookStatus = "live" | "exists" | "planned";

export interface WebhookEntry {
  path: string;
  status: WebhookStatus;
  n8nWorkflow: string | null;
  usedBy: string;
  description: string;
}

export const WEBHOOK_REGISTRY: Record<string, WebhookEntry> = {
  // === LIVE (HTTP 200) — fully working ===
  "gda-opp-tracker": {
    path: "gda-opp-tracker",
    status: "live",
    n8nWorkflow: "GDA.api.opp-tracker 2",
    usedBy: "opportunities.ts",
    description: "Ops Tracker opportunity list",
  },
  "gda-pipeline": {
    path: "gda-pipeline",
    status: "live",
    n8nWorkflow: "GDA.api.pipeline",
    usedBy: "opportunities.ts",
    description: "Pipeline-filtered opportunities",
  },
  "gda-launchpad": {
    path: "gda-launchpad",
    status: "live",
    n8nWorkflow: "GDA.api.launchpad",
    usedBy: "dashboard.ts",
    description: "Launchpad KPIs + top opportunities",
  },
  "gda-launchpad-funnel": {
    path: "gda-launchpad-funnel",
    status: "live",
    n8nWorkflow: "GDA.api.launchpad-funnel",
    usedBy: "dashboard.ts",
    description: "Launchpad funnel stages + capture stages",
  },
  "gda-opportunity-detail": {
    path: "gda-opportunity-detail",
    status: "live",
    n8nWorkflow: "GDA.api.opportunity-detail",
    usedBy: "opportunities.ts",
    description: "Single opportunity OODA detail",
  },
  "gda-deep-research-history": {
    path: "gda-deep-research-history",
    status: "live",
    n8nWorkflow: "GDA.api.deep-research-history",
    usedBy: "intel.ts",
    description: "Deep research report history",
  },
  "gda-capture-plan": {
    path: "gda-capture-plan",
    status: "live",
    n8nWorkflow: "GDA.api.capture-plan",
    usedBy: "capture.ts",
    description: "Capture plans list + detail",
  },
  "gda-platform-health": {
    path: "gda-platform-health",
    status: "live",
    n8nWorkflow: "GDA.api.platform-health",
    usedBy: "qa.ts",
    description: "Platform health status",
  },
  "gda-dashboard-mega": {
    path: "gda-dashboard-mega",
    status: "live",
    n8nWorkflow: "GDA.api.dashboard-mega",
    usedBy: "dashboard.ts",
    description: "Mega dashboard with funnel, risks, stats, trends, contracts, opps, sitrep",
  },
  "gda-trends": {
    path: "gda-trends",
    status: "live",
    n8nWorkflow: "GDA.api.trends",
    usedBy: "dashboard.ts",
    description: "Daily trend metrics (action_items, alerts, etc.)",
  },
  "gda-daily-actions": {
    path: "gda-daily-actions",
    status: "live",
    n8nWorkflow: "GDA.api.daily-actions",
    usedBy: "dashboard.ts",
    description: "Daily action items for launchpad",
  },

  // === EXISTS (HTTP 500) — n8n workflow exists, needs internal config ===
  "gda-pwin-calculator": {
    path: "gda-pwin-calculator",
    status: "exists",
    n8nWorkflow: "GDA.api.pwin-calculator",
    usedBy: "enrichments.ts",
    description: "Probability of win calculation",
  },
  "gda-incumbent-analysis": {
    path: "gda-incumbent-analysis",
    status: "exists",
    n8nWorkflow: "GDA.api.incumbent-analysis",
    usedBy: "enrichments.ts",
    description: "Incumbent analysis for an opportunity",
  },
  "gda-competitor-field": {
    path: "gda-competitor-field",
    status: "exists",
    n8nWorkflow: "GDA.api.competitor-field",
    usedBy: "enrichments.ts",
    description: "Competitive field analysis",
  },
  "gda-black-hat": {
    path: "gda-black-hat",
    status: "exists",
    n8nWorkflow: "GDA.api.black-hat",
    usedBy: "enrichments.ts",
    description: "Black hat (competitor perspective) analysis",
  },
  "gda-wargame": {
    path: "gda-wargame",
    status: "exists",
    n8nWorkflow: "GDA.api.wargame",
    usedBy: "enrichments.ts",
    description: "War game scenario analysis",
  },
  "gda-semantic-search": {
    path: "gda-semantic-search",
    status: "exists",
    n8nWorkflow: "GDA.api.semantic-search",
    usedBy: "enrichments.ts",
    description: "RAG semantic search across documents",
  },
  "gda-morning-briefing": {
    path: "gda-morning-briefing",
    status: "exists",
    n8nWorkflow: "GDA.api.morning-briefing",
    usedBy: "intel.ts",
    description: "Morning intelligence briefing",
  },
  "gda-save-opp": {
    path: "gda-save-opp",
    status: "exists",
    n8nWorkflow: "GDA.api.save-opp",
    usedBy: "opportunities.ts",
    description: "Save/bookmark an opportunity",
  },
  "gda-risk": {
    path: "gda-risk",
    status: "exists",
    n8nWorkflow: "GDA.api.risk-intel",
    usedBy: "dashboard.ts",
    description: "Risk intelligence feed",
  },
  "gda-intel-feed": {
    path: "gda-intel-feed",
    status: "exists",
    n8nWorkflow: "GDA.api.intel-feed",
    usedBy: "intel.ts",
    description: "Intelligence feed items",
  },
  "gda-report-builder": {
    path: "gda-report-builder",
    status: "exists",
    n8nWorkflow: "GDA.api.report-builder",
    usedBy: "reports.ts",
    description: "Report generation engine",
  },
  "gda-compliance-matrix": {
    path: "gda-compliance-matrix",
    status: "exists",
    n8nWorkflow: "GDA.api.compliance-matrix",
    usedBy: "compliance.ts",
    description: "Compliance matrix analysis",
  },
  "gda-relationship-tracker": {
    path: "gda-relationship-tracker",
    status: "exists",
    n8nWorkflow: "GDA.api.relationship-tracker",
    usedBy: "contacts.ts",
    description: "Contact relationship tracking",
  },
  "gda-discussions": {
    path: "gda-discussions",
    status: "exists",
    n8nWorkflow: "GDA.api.discussions",
    usedBy: "discussions.ts",
    description: "Discussion threads and messages",
  },
  "gda-knowledge-base": {
    path: "gda-knowledge-base",
    status: "exists",
    n8nWorkflow: "GDA.api.knowledge-base",
    usedBy: "knowledge.ts",
    description: "Knowledge base document management",
  },
  "gda-daily-brief": {
    path: "gda-daily-brief",
    status: "exists",
    n8nWorkflow: "GDA.api.daily-brief",
    usedBy: "intel.ts",
    description: "Daily brief summary",
  },
  "gda-predictive-intel": {
    path: "gda-predictive-intel",
    status: "exists",
    n8nWorkflow: "GDA.api.predictive-intel",
    usedBy: "predictive.ts",
    description: "Predictive intelligence models",
  },
  "gda-competitor-watchlist": {
    path: "gda-competitor-watchlist",
    status: "exists",
    n8nWorkflow: "GDA.api.competitor-watchlist",
    usedBy: "anomaly.ts",
    description: "Competitor movement watchlist",
  },
  "gda-competitor-threat-score": {
    path: "gda-competitor-threat-score",
    status: "exists",
    n8nWorkflow: "GDA.api.competitor-threat-score",
    usedBy: "anomaly.ts",
    description: "Competitor threat scoring",
  },
  "gda-contacts": {
    path: "gda-contacts",
    status: "exists",
    n8nWorkflow: "GDA.api.contacts",
    usedBy: "contacts.ts",
    description: "Contact directory from n8n",
  },
  "gda-prompt-architect": {
    path: "gda-prompt-architect",
    status: "exists",
    n8nWorkflow: "GDA.api.prompt-architect",
    usedBy: "prompts.ts",
    description: "Prompt library management",
  },

  // === LIVE — n8n workflow nV36K8LgL31nY37b activated 2026-05-20 ===
  "govtribe-ingest": {
    path: "govtribe-ingest",
    status: "live",
    n8nWorkflow: "GDA.ingest.govtribe-zapier",
    usedBy: "ingest.ts",
    description: "GovTribe Saved Search → Zapier → n8n → GDA ingest pipeline (Tier 1)",
  },

  // === PLANNED (HTTP 404) — no n8n workflow yet ===
  "gda-smart-recommender": {
    path: "gda-smart-recommender",
    status: "planned",
    n8nWorkflow: "GDA.api.smart-recommender",
    usedBy: "enrichments.ts",
    description: "AI-powered smart recommendations",
  },
  "gda-capture-intel-modules": {
    path: "gda-capture-intel-modules",
    status: "planned",
    n8nWorkflow: "GDA.api.capture-intel-modules",
    usedBy: "enrichments.ts",
    description: "Capture intelligence module data",
  },
  "gda-teaming-finder": {
    path: "gda-teaming-finder",
    status: "planned",
    n8nWorkflow: "GDA.api.teaming-finder",
    usedBy: "enrichments.ts",
    description: "Teaming partner finder",
  },
  "gda-pwin-models": {
    path: "gda-pwin-models",
    status: "planned",
    n8nWorkflow: null,
    usedBy: "predictive.ts",
    description: "ML Pwin model list",
  },
  "gda-pipeline-forecast": {
    path: "gda-pipeline-forecast",
    status: "planned",
    n8nWorkflow: null,
    usedBy: "predictive.ts",
    description: "Monte Carlo pipeline revenue forecast",
  },
  "gda-bid-assessments": {
    path: "gda-bid-assessments",
    status: "planned",
    n8nWorkflow: null,
    usedBy: "predictive.ts",
    description: "Bid/No-Bid assessments",
  },
  "gda-win-loss-analysis": {
    path: "gda-win-loss-analysis",
    status: "planned",
    n8nWorkflow: null,
    usedBy: "predictive.ts",
    description: "Historical win/loss pattern analysis",
  },
  "gda-anomalies": {
    path: "gda-anomalies",
    status: "planned",
    n8nWorkflow: null,
    usedBy: "anomaly.ts",
    description: "Portfolio anomaly detection",
  },
  "gda-escalation-rules": {
    path: "gda-escalation-rules",
    status: "planned",
    n8nWorkflow: null,
    usedBy: "anomaly.ts",
    description: "Escalation rule definitions",
  },
  "gda-escalations": {
    path: "gda-escalations",
    status: "planned",
    n8nWorkflow: null,
    usedBy: "anomaly.ts",
    description: "Active escalation list",
  },
};

/** Get all webhooks by status */
export function getWebhooksByStatus(status: WebhookStatus): WebhookEntry[] {
  return Object.values(WEBHOOK_REGISTRY).filter((w) => w.status === status);
}

/** Check if a webhook is live */
export function isWebhookLive(path: string): boolean {
  return WEBHOOK_REGISTRY[path]?.status === "live";
}

/** Summary counts */
export function getRegistrySummary() {
  const entries = Object.values(WEBHOOK_REGISTRY);
  return {
    total: entries.length,
    live: entries.filter((w) => w.status === "live").length,
    exists: entries.filter((w) => w.status === "exists").length,
    planned: entries.filter((w) => w.status === "planned").length,
  };
}
