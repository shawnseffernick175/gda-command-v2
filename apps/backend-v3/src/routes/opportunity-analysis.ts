/**
 * F-305: Opportunity Auto-Analysis SSE endpoint.
 *
 * GET /v3/opportunities/:id/analysis
 *   Returns the canonical 10-section decision brief via Server-Sent Events.
 *   Cache-aware: serves cached results when fresh (24h + sources unchanged).
 *   When stale, triggers analysis and streams sections progressively.
 *
 * Each SSE event is: { section, data, sources, trace_id }
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { errorEnvelope } from '../lib/envelope.js';
import { requireBoss, QUEUE_NAMES, ANALYSIS_PRIORITY, type AnalysisJobData } from '../lib/queue.js';
import { runDoctrineCheck, type DoctrineEvaluation } from '../services/doctrine/index.js';
import { resolveOpportunityId, UUID_RE } from '../services/opportunities/resolve-id.js';
import { getOpportunityById } from '../services/opportunities/index.js';
import { search as ragSearch } from '../services/rag/index.js';
import type { SourceRef } from '../lib/sources.js';

interface AnalysisCacheRow {
  opportunity_id: string;
  version: string;
  generated_at: string;
  pwin: number | null;
  incumbent: string | null;
  competitors: unknown;
  blackhat: unknown;
  wargame: unknown;
  timeline: unknown;
}

interface SectionPayload {
  section: string;
  data: unknown;
  sources: SourceRef[];
  trace_id: string;
  stale?: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isCacheFresh(cacheRow: AnalysisCacheRow, oppUpdatedAt: string): boolean {
  const cacheAge = Date.now() - new Date(cacheRow.generated_at).getTime();
  if (cacheAge > CACHE_TTL_MS) return false;
  // Cache is stale if opportunity was updated after cache generation
  return new Date(cacheRow.generated_at) >= new Date(oppUpdatedAt);
}

function sseEvent(payload: SectionPayload): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function opportunityAnalysisRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /v3/opportunities/:id/analysis — SSE stream of 10-section decision brief.
   */
  app.get<{ Params: { id: string } }>('/v3/opportunities/:id/analysis', async (req, reply) => {
    const traceId = req.requestId;

    const id = await resolveOpportunityId(pool, req.params.id);
    if (id === null) {
      if (UUID_RE.test(req.params.id)) {
        return reply.status(404).send(errorEnvelope('NOT_FOUND', 'opportunity_not_found', traceId));
      }
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'invalid_id_format', traceId));
    }

    const opp = await getOpportunityById(id);
    if (!opp) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Resource not found', traceId));
    }

    // Set SSE headers
    void reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-GDA-Trace-Id': traceId,
    });

    const oppRow = opp as unknown as Record<string, unknown>;
    const oppId = String(opp.id);
    const oppUpdatedAt = (opp.updated_at as string) ?? new Date().toISOString();

    // Check analysis cache
    const cacheRes = await pool.query<AnalysisCacheRow>(
      `SELECT * FROM opportunity_analysis_cache
       WHERE opportunity_id = $1
       ORDER BY generated_at DESC LIMIT 1`,
      [oppId],
    );
    const cacheRow = cacheRes.rows[0] ?? null;
    const cacheFresh = cacheRow ? isCacheFresh(cacheRow, oppUpdatedAt) : false;

    // If cache is stale/missing, enqueue analysis in background
    if (!cacheFresh) {
      try {
        const boss = requireBoss();
        const jobData: AnalysisJobData = {
          entityType: 'opportunity',
          entityId: oppId,
          priority: 'high',
          trigger: 'detail-endpoint',
        };
        void boss.send(QUEUE_NAMES.ANALYSIS_OPPORTUNITY, jobData, {
          priority: ANALYSIS_PRIORITY.USER_DETAIL,
          retryLimit: 3,
          retryDelay: 5,
          retryBackoff: true,
          singletonKey: `opp-${oppId}`,
        });
      } catch {
        // pg-boss not initialized
      }
    }

    // Build and stream sections from existing data (cache + live computation)
    const analysis = oppRow.analysis as Record<string, unknown> | null;
    const llmAnalysis = analysis?.llm_analysis as Record<string, unknown> | null;

    // Section 1: PWin Score
    try {
      const pwinCacheRes = await pool.query<{ pwin: number | null }>(
        `SELECT pwin FROM opportunity_analysis_cache WHERE opportunity_id = $1 ORDER BY generated_at DESC LIMIT 1`,
        [oppId],
      );
      const canonicalPwin = pwinCacheRes.rows[0]?.pwin ?? null;
      const pwinScore = canonicalPwin != null ? Math.round(canonicalPwin * 100) : (llmAnalysis?.win_probability as number | null) ?? null;
      const pwinGrade = pwinScore != null
        ? pwinScore >= 65 ? 'Go' : pwinScore >= 40 ? 'Reconsider' : 'Pass'
        : null;

      const topDrivers: string[] = [];
      if (analysis?.pwin && typeof analysis.pwin === 'object') {
        const pwinObj = analysis.pwin as Record<string, unknown>;
        if (pwinObj.top_drivers && Array.isArray(pwinObj.top_drivers)) {
          topDrivers.push(...(pwinObj.top_drivers as string[]).slice(0, 3));
        } else {
          // Derive from scoring factors
          if (pwinObj.naics_fit) topDrivers.push(`NAICS fit: ${pwinObj.naics_fit}`);
          if (pwinObj.agency_relationship) topDrivers.push(`Agency relationship: ${pwinObj.agency_relationship}`);
          if (pwinObj.set_aside_match) topDrivers.push(`Set-aside match: ${pwinObj.set_aside_match}`);
        }
      }
      if (topDrivers.length === 0 && llmAnalysis?.win_probability_reasoning) {
        topDrivers.push(String(llmAnalysis.win_probability_reasoning));
      }

      reply.raw.write(sseEvent({
        section: 'pwin',
        data: {
          score: pwinScore,
          grade: pwinGrade,
          top_drivers: topDrivers,
        },
        sources: [
          {
            kind: 'internal',
            title: 'Deterministic PWin model v1-rules (F-302)',
            url: '/audit/analysis/pwin',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: pwin section failed');
    }

    // Section 2: Doctrine Alignment
    try {
      let doctrineData: DoctrineEvaluation | null = null;
      // Check for existing recent evaluation
      const evalRes = await pool.query<DoctrineEvaluation>(
        `SELECT * FROM doctrine_evaluations
         WHERE entity_kind = 'opportunity' AND entity_id = $1
         ORDER BY evaluated_at DESC LIMIT 1`,
        [oppId],
      );
      if (evalRes.rows[0]) {
        const evalAge = Date.now() - new Date(evalRes.rows[0].evaluated_at).getTime();
        if (evalAge < CACHE_TTL_MS) {
          doctrineData = evalRes.rows[0];
        }
      }
      // Run fresh if no cached
      if (!doctrineData) {
        doctrineData = await runDoctrineCheck('opportunity', oppId);
      }

      const exclusionTriggers = Array.isArray(doctrineData?.exclusion_triggers)
        ? doctrineData.exclusion_triggers
        : [];
      const exclusionsTriggered = exclusionTriggers.filter(
        (e) => e.triggered,
      );

      reply.raw.write(sseEvent({
        section: 'doctrine',
        data: {
          alignment_total: doctrineData?.alignment_total ?? null,
          max_score: 40,
          principle_scores: doctrineData?.principle_scores ?? {},
          exclusions_triggered: exclusionsTriggered,
          margin_check: doctrineData?.margin_check ?? null,
          evidence_grades: doctrineData?.evidence_grades ?? {},
          recommendations: doctrineData?.recommendations ?? [],
        },
        sources: [
          {
            kind: 'doctrine',
            title: 'Doctrine Rules Engine (F-303) — 8 principles + 6 exclusions',
            url: '/docs/canonical/gda_company_profile_v1.md',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: doctrine section failed');
      reply.raw.write(sseEvent({
        section: 'doctrine',
        data: { error: 'Doctrine evaluation unavailable' },
        sources: [],
        trace_id: traceId,
      }));
    }

    // Section 3: Incumbent
    try {
      const incumbent = oppRow.incumbent as string | null;
      const incumbentSource = oppRow.incumbent_source as string | null;
      const incumbentConfidence = oppRow.incumbent_confidence as string | null;

      let sourceUrl = `https://www.fpds.gov/ezsearch/search.do?q=${encodeURIComponent((oppRow.solicitation_number as string) ?? (oppRow.agency as string) ?? '')}`;
      let sourceKind: string = 'fpds';
      if (incumbentSource) {
        const pipeIdx = incumbentSource.indexOf('|');
        if (pipeIdx > 0) sourceUrl = incumbentSource.slice(pipeIdx + 1);
        if (incumbentSource.startsWith('usaspending:')) sourceKind = 'usaspending';
      }

      // Try to get contract details from cache
      const cachedIncumbent = cacheRow?.incumbent ?? incumbent;

      reply.raw.write(sseEvent({
        section: 'incumbent',
        data: {
          name: cachedIncumbent,
          confidence: incumbentConfidence,
          contract_number: null,
          contract_ceiling: null,
          end_date: null,
          performance_signals: null,
        },
        sources: incumbent ? [
          {
            kind: sourceKind as SourceRef['kind'],
            title: `Incumbent: ${incumbent} (confidence: ${incumbentConfidence ?? 'unknown'}) via ${sourceKind === 'usaspending' ? 'USAspending.gov' : 'FPDS'}`,
            url: sourceUrl,
            retrieved_at: new Date().toISOString(),
          },
        ] : [
          {
            kind: 'internal',
            title: 'Incumbent pending — enrichment pipeline will populate via FPDS/USAspending',
            url: '/audit/analysis/incumbent-search',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: incumbent section failed');
    }

    // Section 4: Similar Awards (RAG F-301)
    try {
      const title = (oppRow.title as string) ?? '';
      const agency = (oppRow.agency as string) ?? '';
      const naics = (oppRow.naics as string) ?? '';
      const queryText = `${title} ${agency} ${naics}`.trim();

      let similarAwards: Array<{ title: string; agency: string; value: string; awardee: string; date: string; score: number; url: string }> = [];
      try {
        const ragResults = await ragSearch({
          query: queryText,
          top_k: 5,
          doc_type_filter: 'awarded_contract',
          min_score: 0.4,
        });
        similarAwards = ragResults.map((r) => ({
          title: r.section_title ?? r.chunk_text?.slice(0, 80) ?? 'Award',
          agency: agency,
          value: 'N/A',
          awardee: 'N/A',
          date: 'N/A',
          score: Math.round((r.score ?? 0) * 100),
          url: r.source_url ?? `https://www.usaspending.gov/search/?q=${encodeURIComponent(title)}`,
        }));
      } catch {
        // RAG may not have awards indexed yet
      }

      reply.raw.write(sseEvent({
        section: 'similar_awards',
        data: {
          awards: similarAwards,
          query_used: queryText,
        },
        sources: similarAwards.length > 0 ? [
          {
            kind: 'usaspending',
            title: `Similar awards via vector similarity (F-301 RAG) — top ${similarAwards.length} matches`,
            url: `https://www.usaspending.gov/search/?q=${encodeURIComponent(title)}`,
            retrieved_at: new Date().toISOString(),
          },
        ] : [
          {
            kind: 'internal',
            title: 'No similar awards found in knowledge base — insufficient data',
            url: '/audit/analysis/similar-awards',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: similar_awards section failed');
    }

    // Section 5: Competitors
    try {
      const competitors = cacheRow?.competitors ?? analysis?.competitors ?? [];
      const competitorsArr = Array.isArray(competitors) ? competitors : [];

      reply.raw.write(sseEvent({
        section: 'competitors',
        data: {
          competitors: competitorsArr,
        },
        sources: competitorsArr.length > 0 ? [
          {
            kind: 'fpds',
            title: 'FPDS historical bidders for similar contracts',
            url: `https://www.fpds.gov/ezsearch/search.do?q=${encodeURIComponent((oppRow.naics as string) ?? (oppRow.agency as string) ?? '')}`,
            retrieved_at: new Date().toISOString(),
          },
        ] : [
          {
            kind: 'internal',
            title: 'Competitor analysis — insufficient data for reliable identification',
            url: '/audit/analysis/competitors',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: competitors section failed');
    }

    // Section 6: Decision Factors
    try {
      const setAside = (oppRow.set_aside as string) ?? null;
      const description = (oppRow.description as string) ?? '';
      const isLpta = description.toLowerCase().includes('lpta') || description.toLowerCase().includes('lowest price');
      const evaluationType = isLpta ? 'LPTA (Lowest Price Technically Acceptable)' : 'Best Value Trade-Off';
      const ppWeight = description.toLowerCase().includes('past performance') ? 'High' : 'Standard';
      const keyPersonnel = description.toLowerCase().includes('key personnel') || description.toLowerCase().includes('resume');

      reply.raw.write(sseEvent({
        section: 'decision_factors',
        data: {
          evaluation_type: evaluationType,
          past_performance_weight: ppWeight,
          key_personnel_required: keyPersonnel,
          set_aside_type: setAside,
          small_business_play: setAside?.toLowerCase().includes('small') ?? false,
        },
        sources: [
          {
            kind: 'sam_gov',
            title: 'Decision factors derived from solicitation description',
            url: oppRow.source_uri as string ?? `https://sam.gov/opp/${(oppRow.sam_notice_id as string) ?? 'search'}/view`,
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: decision_factors section failed');
    }

    // Section 7: Teaming Opportunities
    try {
      const description = ((oppRow.description as string) ?? '').toLowerCase();
      const teamingOpps: Array<{ partner: string; rationale: string }> = [];

      if (description.includes('cyber') || description.includes('sigint') || description.includes('intelligence')) {
        teamingOpps.push({
          partner: 'Riverstone (OU-II)',
          rationale: 'Cyber/SIGINT/Intelligence capability alignment',
        });
      }
      if (description.includes('training') || description.includes('simulation') || description.includes('courseware')) {
        teamingOpps.push({
          partner: 'PD Systems (OU-III)',
          rationale: 'Training and simulation capability alignment',
        });
      }

      reply.raw.write(sseEvent({
        section: 'teaming',
        data: {
          opportunities: teamingOpps,
          has_teaming_fit: teamingOpps.length > 0,
        },
        sources: teamingOpps.length > 0 ? [
          {
            kind: 'doctrine',
            title: 'Teaming assessment — OU capability mapping',
            url: '/docs/canonical/tool_ownership_model_v1.md',
            retrieved_at: new Date().toISOString(),
          },
        ] : [
          {
            kind: 'internal',
            title: 'No cross-OU teaming signals detected in scope',
            url: '/audit/analysis/teaming',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: teaming section failed');
    }

    // Section 8: Doctrine-Aligned Win Themes
    try {
      const wargame = cacheRow?.wargame ?? analysis?.wargame;
      const wargameObj = (typeof wargame === 'object' && wargame !== null) ? wargame as Record<string, unknown> : null;
      const winThemes = (wargameObj?.win_themes ?? wargameObj?.discriminators ?? []) as string[];
      const llmThemes = llmAnalysis?.win_themes as string[] | undefined;
      const finalThemes = (llmThemes ?? winThemes).slice(0, 5);

      reply.raw.write(sseEvent({
        section: 'win_themes',
        data: {
          themes: finalThemes,
          strategy: wargameObj?.strategy ?? null,
        },
        sources: [
          {
            kind: 'doctrine',
            title: 'Win themes aligned to CEO doctrine and Envision brand positioning',
            url: '/docs/canonical/gda_company_profile_v1.md',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: win_themes section failed');
    }

    // Section 9: Risks
    try {
      const llmRisks = llmAnalysis?.risks as Array<{ level: string; description: string; mitigation?: string; regulatory_citation?: string }> | undefined;
      const blackhat = cacheRow?.blackhat ?? analysis?.blackhat;
      const blackhatObj = (typeof blackhat === 'object' && blackhat !== null) ? blackhat as Record<string, unknown> : null;
      const riskAreas = (blackhatObj?.risk_areas ?? []) as string[];

      const risks = llmRisks ?? riskAreas.map((r, i) => ({
        level: i === 0 ? 'HIGH' : 'MED',
        description: r,
        mitigation: null,
        regulatory_citation: null,
      }));

      reply.raw.write(sseEvent({
        section: 'risks',
        data: {
          risks: (risks as unknown[]).slice(0, 5),
        },
        sources: [
          {
            kind: 'internal',
            title: 'Risk assessment from blackhat analysis and competitive intelligence',
            url: '/audit/analysis/risks',
            retrieved_at: new Date().toISOString(),
          },
        ],
        trace_id: traceId,
        stale: !cacheFresh,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: risks section failed');
    }

    // Section 10: Citations Footer
    try {
      const allSources: SourceRef[] = [];
      if (oppRow.source_uri) {
        allSources.push({
          kind: 'sam_gov',
          title: `SAM.gov Notice: ${(oppRow.solicitation_number as string) ?? (oppRow.title as string)}`,
          url: oppRow.source_uri as string,
          retrieved_at: new Date().toISOString(),
        });
      }
      if (oppRow.incumbent_source) {
        const src = oppRow.incumbent_source as string;
        const pipeIdx = src.indexOf('|');
        allSources.push({
          kind: src.startsWith('usaspending:') ? 'usaspending' : 'fpds',
          title: `Incumbent data: ${src.slice(0, pipeIdx > 0 ? pipeIdx : undefined)}`,
          url: pipeIdx > 0 ? src.slice(pipeIdx + 1) : `https://www.fpds.gov/ezsearch/search.do?q=${encodeURIComponent((oppRow.solicitation_number as string) ?? '')}`,
          retrieved_at: new Date().toISOString(),
        });
      }
      // Add doctrine source
      allSources.push({
        kind: 'doctrine',
        title: 'Envision Doctrine — CEO-defined scoring and exclusion rules',
        url: '/docs/canonical/gda_company_profile_v1.md',
        retrieved_at: new Date().toISOString(),
      });

      reply.raw.write(sseEvent({
        section: 'citations',
        data: {
          all_sources: allSources,
          analysis_version: config.analysisVersion,
          generated_at: cacheRow?.generated_at ?? analysis?.generated_at ?? new Date().toISOString(),
          cache_fresh: cacheFresh,
        },
        sources: allSources,
        trace_id: traceId,
      }));
    } catch (err) {
      logger.warn({ err, oppId }, 'F-305: citations section failed');
    }

    // End stream
    reply.raw.write('event: done\ndata: {}\n\n');
    reply.raw.end();
  });
}
