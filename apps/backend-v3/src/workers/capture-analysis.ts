/**
 * Capture-specific analysis worker.
 *
 * Real pwin model: uses opportunity analysis + capture-specific signals:
 *   - compliance percentage (compliant / total items)
 *   - pricing margin adequacy
 *   - color review stage progression
 *   - teaming worksheet completeness
 *
 * Sources include opportunity analysis URL + capture compliance evidence URLs (R1).
 */

import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import type { ComplianceItem } from '../services/captures/compliance.js';
import type { ColorReviewStage } from '../services/captures/color-review.js';

interface CaptureAnalysisInput {
  captureId: string;
  colorReviewStage: ColorReviewStage;
  complianceItems: ComplianceItem[];
  pricingMarginPct: number | null;
  hasTeamingPartners: boolean;
  opportunityAnalysis: { pwin?: number } | null;
}

interface SourceRef {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

interface CaptureAnalysisResult {
  pwin: number;
  pwin_sources: SourceRef[];
  pwin_components: {
    base_pwin: number;
    compliance_factor: number;
    margin_factor: number;
    stage_factor: number;
    teaming_factor: number;
  };
  incumbent: string | null;
  incumbent_sources: SourceRef[];
  competitors: Array<{ name: string; threat_level: string }>;
  competitors_sources: SourceRef[];
  timeline: {
    rfp_release: string | null;
    proposals_due: string | null;
    award_estimate: string | null;
  };
  timeline_sources: SourceRef[];
  version: string;
  generated_at: string;
}

const STAGE_WEIGHTS: Record<ColorReviewStage, number> = {
  pink: 0.75,
  red: 0.85,
  gold: 0.95,
  submitted: 1.0,
};

function computeComplianceFactor(items: ComplianceItem[]): number {
  if (items.length === 0) return 0.5;
  const compliant = items.filter((i) => i.status === 'compliant').length;
  const partial = items.filter((i) => i.status === 'partial').length;
  const total = items.length;
  return (compliant + partial * 0.5) / total;
}

function computeMarginFactor(marginPct: number | null): number {
  if (marginPct === null) return 0.5;
  if (marginPct >= 15) return 1.0;
  if (marginPct >= 10) return 0.9;
  if (marginPct >= 8) return 0.75;
  if (marginPct >= 5) return 0.5;
  return 0.3;
}

function computeTeamingFactor(hasPartners: boolean): number {
  return hasPartners ? 1.05 : 1.0;
}

export function computeCaptureAnalysis(input: CaptureAnalysisInput): CaptureAnalysisResult {
  const now = new Date().toISOString();
  const basePwin = input.opportunityAnalysis?.pwin ?? 0.5;
  const complianceFactor = computeComplianceFactor(input.complianceItems);
  const marginFactor = computeMarginFactor(input.pricingMarginPct);
  const stageFactor = STAGE_WEIGHTS[input.colorReviewStage];
  const teamingFactor = computeTeamingFactor(input.hasTeamingPartners);

  let pwin = basePwin * complianceFactor * marginFactor * stageFactor * teamingFactor;
  pwin = Math.min(Math.max(pwin, 0), 1);
  pwin = Math.round(pwin * 1000) / 1000;

  const sources: SourceRef[] = [
    {
      kind: 'internal',
      title: `Capture analysis model ${config.analysisVersion}`,
      url: `/audit/analysis/capture/${input.captureId}`,
      retrieved_at: now,
    },
  ];

  if (input.opportunityAnalysis) {
    sources.push({
      kind: 'internal',
      title: 'Linked opportunity analysis (base pwin)',
      url: `/audit/analysis/opportunity/${input.captureId}`,
      retrieved_at: now,
    });
  }

  for (const item of input.complianceItems) {
    if (item.response_notes) {
      sources.push({
        kind: 'internal',
        title: `Compliance evidence: ${item.requirement}`,
        url: `/audit/compliance/${input.captureId}/${item.id}`,
        retrieved_at: now,
      });
    }
  }

  logger.info(
    {
      captureId: input.captureId,
      pwin,
      basePwin,
      complianceFactor,
      marginFactor,
      stageFactor,
      teamingFactor,
    },
    'Capture pwin computed'
  );

  return {
    pwin,
    pwin_sources: sources,
    pwin_components: {
      base_pwin: basePwin,
      compliance_factor: complianceFactor,
      margin_factor: marginFactor,
      stage_factor: stageFactor,
      teaming_factor: teamingFactor,
    },
    incumbent: null,
    incumbent_sources: [],
    competitors: [],
    competitors_sources: [],
    timeline: {
      rfp_release: null,
      proposals_due: null,
      award_estimate: null,
    },
    timeline_sources: [],
    version: config.analysisVersion,
    generated_at: now,
  };
}
