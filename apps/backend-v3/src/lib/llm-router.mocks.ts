/**
 * LLM Router — Mock Registry for CI
 *
 * MOCK_LLM=1 or opts.mock=true activates this registry.
 * Zero real API calls in CI. Keyed by task + deterministic input hash.
 */

import { createHash } from 'node:crypto';
import type {
  Task,
  MockRegistry,
  RouteResponseOk,
  TaskInputMap,
  FastTrackTriageOutput,
  OpportunityAnalysisOutput,
  CapturePlanOutput,
  DailyBriefingOutput,
  SentinelSummaryOutput,
  DoctrineScoreOutput,
  SemanticEmbedOutput,
  SourceResearchOutput,
  BlackHatAnalysisOutput,
  RiskGenerationOutput,
  AwardAnalysisOutput,
  CompetitorAnalysisOutput,
  ContactEnrichOutput,
  MatchAnalysisOutput,
  VaultDocumentParseOutput,
  VaultSmartRouteOutput,
  FinancialStatementExtractOutput,
  DigestLeadOutput,
  CompetitorContactDiscoveryOutput,
  PartnerContactDiscoveryOutput,
} from './llm-router.types.js';

/** Deterministic hash of input for mock lookup. Deep-sorts all object keys. */
export function hashInput(input: unknown): string {
  const json = JSON.stringify(input, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (value as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return value;
  });
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

const store = new Map<string, RouteResponseOk<Task>>();

function makeKey(task: Task, inputHash: string): string {
  return `${task}:${inputHash}`;
}

export const mockRegistry: MockRegistry = {
  get<T extends Task>(task: T, inputHash: string): RouteResponseOk<T> | null {
    const key = makeKey(task, inputHash);
    const entry = store.get(key);
    return (entry as RouteResponseOk<T>) ?? null;
  },

  register<T extends Task>(task: T, inputHash: string, response: RouteResponseOk<T>): void {
    const key = makeKey(task, inputHash);
    store.set(key, response as RouteResponseOk<Task>);
  },
};

/** Clear all registered mocks (for test cleanup). */
export function clearMocks(): void {
  store.clear();
}

/** Generate a default mock response for any task. Used as catch-all in CI. */
export function getDefaultMock<T extends Task>(task: T, traceId: string): RouteResponseOk<T> {
  const base = {
    ok: true as const,
    task,
    model_used: 'mock-model',
    latency_ms: 50,
    tokens: { input: 100, output: 50 },
    cost_estimate_usd: 0.0001,
    fallback_used: false,
    quality_flag: 'full' as const,
    trace_id: traceId,
  };

  const outputs: Record<Task, unknown> = {
    fast_track_triage: {
      grade: 'B',
      rationale: 'Mock triage response',
      naics_match_score: 70,
      recommended_action: 'watch',
    } satisfies FastTrackTriageOutput,

    opportunity_analysis: {
      win_probability: 55,
      win_probability_reasoning: 'Mock analysis',
      shipley_bid_no_bid: {
        overall: 'Conditional',
        customer_knowledge: { score: 6, reasoning: 'Mock', evidence: [] },
        solution_match: { score: 7, reasoning: 'Mock', evidence: [] },
        competitive_position: { score: 5, reasoning: 'Mock', evidence: [] },
        past_performance: { score: 6, reasoning: 'Mock', evidence: [] },
      },
      incumbent: null,
      competitive_landscape: [],
      doctrine_alignment: [],
      source_chips: [],
      generated_at: new Date().toISOString(),
      model_used: 'mock-model',
      analysis_version: 'mock-v1',
    } satisfies OpportunityAnalysisOutput,

    capture_plan: {
      capture_plan: {
        customer_profile: 'Mock customer',
        requirements_summary: 'Mock requirements',
        solution_strategy: 'Mock strategy',
        win_themes: [],
        ghost_themes: [],
        discriminators: [],
        pricing_strategy: 'Mock pricing',
        teaming_plan: null,
      },
      pink_hat_gaps: [],
      red_team_weaknesses: [],
      gold_team_readiness: { ready: false, items: [] },
      black_hat_competitor_positioning: [],
      next_action: { action: 'Mock action', owner: 'Mock', deadline: '2026-01-01', priority: 'medium' },
      source_chips: [],
      generated_at: new Date().toISOString(),
      model_used: 'mock-model',
      is_partial: false,
    } satisfies CapturePlanOutput,

    daily_briefing: {
      headline: 'Mock daily briefing',
      priority_actions: [],
      risk_flags: [],
      market_intel_summary: 'Mock intel summary',
      cert_expiration_warnings: [],
    } satisfies DailyBriefingOutput,

    sentinel_summary: {
      severity: 'info',
      root_cause: 'Mock root cause',
      recommended_fix: 'Mock fix',
      affected_components: [],
    } satisfies SentinelSummaryOutput,

    doctrine_score: {
      overall_score: 28,
      principle_scores: [],
      alignment_summary: 'Mock alignment',
      concerns: [],
    } satisfies DoctrineScoreOutput,

    semantic_embed: {
      embedding: new Array(3072).fill(0),
      dimensions: 3072,
    } satisfies SemanticEmbedOutput,

    source_research: {
      findings: [],
      summary: 'Mock research summary',
      sources_consulted: 0,
    } satisfies SourceResearchOutput,

    black_hat_analysis: {
      competitor: 'Mock Corp',
      likely_approach: 'Mock approach targeting small business set-asides.',
      strengths: ['Incumbent presence', 'Agency relationships'],
      weaknesses: ['Limited NAICS coverage', 'No 8(a) certification'],
      counter_strategy: 'Leverage our 8(a) status and past performance.',
      intel_summary: 'Mock competitor with moderate federal presence.',
      generated_at: new Date().toISOString(),
    } satisfies BlackHatAnalysisOutput,

    risk_generation: {
      risks: [{ title: 'Mock Technical Risk', description: 'Mock risk description', category: 'technical', likelihood: 3, impact: 4, mitigation: 'Mock mitigation', rationale: 'Mock rationale', risk_type: 'negative', if_condition: 'If key personnel depart mid-performance', then_impact: 'Then delivery timelines slip and quality degrades', mitigation_plan: 'Maintain bench depth and cross-train team members', exploitation_plan: undefined }],
      generation_summary: 'Generated 1 mock risk.',
      generated_at: new Date().toISOString(),
    } satisfies RiskGenerationOutput,

    award_analysis: {
      win_rationale: 'Incumbent advantage with strong past performance in this NAICS code.',
      agency_signal: 'Agency continues to invest in IT modernization services.',
      recompete_assessment: 'Contract expires within 18 months — viable re-compete target for Envision.',
      winner_classification: 'THREAT',
      recommended_action: 'Pursue Re-Compete',
      so_what: 'This award signals continued DoD investment in IT services under NAICS 541512. The incumbent holds a strong position, but the upcoming re-compete window creates an opening. Envision should begin positioning now.',
    } satisfies AwardAnalysisOutput,

    competitor_analysis: {
      size_classification: 'Large Business',
      classification: 'THREAT',
      classification_rationale: 'Direct competitor in same NAICS codes with larger contract base.',
      so_what: 'This firm holds multiple active contracts in Envision\'s target agencies and NAICS codes. Their incumbency in DoD IT modernization creates significant barriers to displacement, but their size may exclude them from small business set-asides where Envision competes.',
      recompete_contracts: [],
      recommended_action: 'Compete',
      trend: 'Flat',
    } satisfies CompetitorAnalysisOutput,

    contact_enrich: {
      role_summary: 'Senior contracting officer managing IT modernization procurements for DoD.',
      procurement_influence: 'high',
      likely_decision_authority: 'Source selection authority for IT services contracts under $50M.',
      engagement_approach: 'Schedule an introductory capability briefing through the OSDBU office.',
      relevance_to_envision: 'Directly manages procurements in Envision\'s core NAICS codes and agencies.',
      model_used: 'mock',
    } satisfies ContactEnrichOutput,

    match_analysis: {
      broker_role: 'Envision bridges this technology to the requirement through its data analytics pipeline and DoD integration expertise.',
      gap_analysis: 'Technology maturity needs to advance from prototype to pilot stage; ATO requirements may introduce schedule risk.',
      recommended_actions: [
        { action: 'Schedule teaming discussion with technology provider', priority: 'high', vehicle: 'OT Agreement' },
        { action: 'Prepare capability statement highlighting Envision analytics stack', priority: 'medium', vehicle: 'Direct contract' },
      ],
      risk_flags: [
        { risk: 'Technology readiness level below threshold for direct procurement', severity: 'medium' },
      ],
      envision_fit: 'Envision\'s digital transformation practice and active DoD program access make it a natural integrator for this capability.',
      ai_narrative: 'This match pairs emerging autonomous capabilities with an active DoD requirement. Envision can serve as the systems integrator bridging commercial innovation to military application. The OT pathway is open and the timing aligns with Envision\'s Q3 capture calendar.',
      model_used: 'mock-model',
    } satisfies MatchAnalysisOutput,

    vault_document_parse: {
      summary: 'Mock document analysis — contract for IT modernization services.',
      tags: ['IT modernization', 'DoD', 'NAICS 541512'],
      entities: [{ name: 'Department of Defense', type: 'party', value: 'Contracting Agency' }],
      regulatory_citations: ['FAR 15.304'],
      doc_type_confirmed: 'contract',
      key_dates: [{ label: 'Period of Performance Start', date: '2025-01-01' }],
      dollar_amounts: [{ label: 'Total Contract Value', amount: '$5,000,000' }],
      model_used: 'mock-model',
    } satisfies VaultDocumentParseOutput,

    vault_smart_route: {
      doc_type: 'contract',
      doc_category: 'work_product',
      linked_opportunity_id: null,
      linked_capture_id: null,
      regulatory_citation: null,
      routing_rationale: 'Document classified as work product contract based on content analysis.',
      confidence: 'high',
    } satisfies VaultSmartRouteOutput,

    financial_statement_extract: {
      is_financial: true,
      currency: 'USD',
      rows: [
        {
          period: 'FY26 Q1',
          fiscal_year: 2026,
          quarter: 1,
          kind: 'plan',
          orders: 580000,
          sales: 510000,
          ebit: 68000,
          gross_margin: 37.5,
          ros: 13.3,
        },
        {
          period: 'FY26 Q1',
          fiscal_year: 2026,
          quarter: 1,
          kind: 'actual',
          orders: 595000,
          sales: 518000,
          ebit: 71200,
          gross_margin: 38.1,
          ros: 13.7,
        },
      ],
      notes: 'Mock financial extraction - one plan and one actual row for FY26 Q1.',
      model_used: 'mock-model',
    } satisfies FinancialStatementExtractOutput,

    digest_lead: {
      headline: 'No significant developments in the last 24 hours',
      body: 'No new federal register notices, solicitations, or regulatory changes affecting Envision\u2019s NAICS space were published in the last 24 hours.',
      source_label: '',
      source_url: null,
      related_opportunity_ids: [],
    } satisfies DigestLeadOutput,

    competitor_contact_discovery: {
      contacts: [
        {
          name: 'Jane Smith',
          title: 'VP Business Development',
          company: 'Mock Competitor Corp',
          email: null,
          phone: null,
          linkedin_url: 'https://linkedin.com/in/janesmith',
          source_url: 'https://www.mockcompetitor.com/leadership',
          confidence: 'medium',
        },
      ],
      sources_consulted: 3,
    } satisfies CompetitorContactDiscoveryOutput,

    partner_contact_discovery: {
      contacts: [
        {
          name: 'John Doe',
          title: 'Director of Partnerships',
          company: 'Mock Partner LLC',
          email: null,
          phone: null,
          linkedin_url: 'https://linkedin.com/in/johndoe',
          source_url: 'https://www.mockpartner.com/team',
          confidence: 'medium',
        },
      ],
      sources_consulted: 3,
    } satisfies PartnerContactDiscoveryOutput,
  };

  return {
    ...base,
    output: outputs[task] as RouteResponseOk<T>['output'],
  };
}
