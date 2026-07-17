/**
 * SourceAdapter interfaces — abstract contract for every ingest source.
 *
 * Three specialisations mirror the unified_opportunities lifecycle model (F-401):
 *   SignalAdapter      -> defaultStage 'signal'
 *   ForecastAdapter    -> defaultStage 'forecast'
 *   SolicitationAdapter -> defaultStage 'solicitation' (also handles 'pre_sol')
 */

import type { LifecycleStage, PrimarySource } from '../../db/types/opportunity.js';
import type { IngestResult } from '../framework/registry.js';

/** Opaque raw record from a source — each adapter defines its own shape. */
export type RawRecord = Record<string, unknown>;

/** Minimal normalised output that every adapter must produce. */
export interface NormalizedOpportunity {
  source_native_id: string;
  lifecycle_stage: LifecycleStage;
  title: string;
  agency: string | null;
  office: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  estimated_value_cents: number | null;
  posted_at: string | null;
  response_due_at: string | null;
  award_at: string | null;
  source_url: string | null;
  description: string | null;
  /**
   * Enrichment fields (currently populated by GovWin's detail endpoint).
   * Optional so existing adapters that do not source them are unaffected.
   */
  incumbent?: string | null;
  /** 'high' | 'medium' | 'low' — GovWin analyst-sourced incumbents are 'high'. */
  incumbent_confidence?: 'high' | 'medium' | 'low' | null;
  /** Which source provided the incumbent (e.g. 'govwin'). */
  incumbent_source?: string | null;
  /** Known/likely competitor names. */
  competitors?: string[];
  /** Estimated value floor, in whole dollars (matches opportunities.value_min). */
  value_min?: number | null;
  /** Estimated value ceiling, in whole dollars (matches opportunities.value_max). */
  value_max?: number | null;
  /** Raw source lifecycle/solicitation status passed through for classification. */
  source_status?: string | null;
}

export interface FetchOpts {
  /** ISO-8601 lower bound for the fetch window. */
  since?: string;
  /** Maximum records to fetch in one pass. */
  limit?: number;
}

export interface SourceAdapter {
  /** Unique key identifying this source (e.g. 'sam', 'govwin', 'govtribe'). */
  readonly source: PrimarySource;
  /** The default lifecycle stage records from this source start in. */
  readonly defaultStage: LifecycleStage;
  /** Pull recent raw records from the external source. */
  fetchRecent(opts: FetchOpts): Promise<RawRecord[]>;
  /** Map one raw record to the normalised shape. Returns null to skip. */
  normalize(raw: RawRecord): NormalizedOpportunity | null;
}

export interface SignalAdapter extends SourceAdapter {
  readonly defaultStage: 'signal';
}

export interface ForecastAdapter extends SourceAdapter {
  readonly defaultStage: 'forecast';
}

export interface SolicitationAdapter extends SourceAdapter {
  readonly defaultStage: 'solicitation';
}

/** Metadata returned after an adapter-driven ingest cycle. */
export type AdapterIngestResult = IngestResult;
