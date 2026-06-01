/**
 * SourceAdapter abstract interfaces — F-402.
 *
 * Every ingest source implements one of these interfaces:
 *   SignalAdapter       → creates opportunity_signals rows (stage = signal)
 *   ForecastAdapter     → creates opportunities at forecast stage
 *   SolicitationAdapter → creates opportunities at solicitation / pre_sol stage
 *
 * The adapter registry dispatches by `source` key; the cron scheduler
 * never branch-checks source names outside the adapter layer.
 */

export type LifecycleStage = 'signal' | 'forecast' | 'pre_sol' | 'solicitation';

export interface FetchOpts {
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

export interface SourceCitationEntry {
  field: string;
  sourceUrl: string;
}

export interface NormalizedOpportunity {
  externalId: string;
  title: string;
  agency: string | null;
  subAgency: string | null;
  department: string | null;
  solicitationNumber: string | null;
  status: string;
  valueMin: number | null;
  valueMax: number | null;
  naics: string | null;
  psc: string | null;
  setAside: string | null;
  placeOfPerformance: string | null;
  responseDueAt: string | null;
  postedAt: string | null;
  description: string | null;
  dataSource: string;
  tags: string[];
  sourceUrl: string | null;
  citations: SourceCitationEntry[];
}

/**
 * Base adapter metadata — stored by the registry when the generic
 * type parameter is erased.
 */
export interface AdapterMeta {
  readonly source: string;
  readonly defaultStage: LifecycleStage;
}

/**
 * Core adapter interface — every ingest source implements this.
 *
 * `TRaw` is the source-specific raw record type (e.g. SAMOpportunityRaw).
 * The registry erases TRaw to AdapterMeta for storage; the concrete
 * adapter retains full type safety in fetchRecent / normalize.
 */
export interface SourceAdapter<TRaw = Record<string, unknown>> extends AdapterMeta {
  fetchRecent(opts: FetchOpts): Promise<TRaw[]>;
  normalize(raw: TRaw): NormalizedOpportunity;
}

export interface SignalAdapter<TRaw = Record<string, unknown>> extends SourceAdapter<TRaw> {
  readonly defaultStage: 'signal';
}

export interface ForecastAdapter<TRaw = Record<string, unknown>> extends SourceAdapter<TRaw> {
  readonly defaultStage: 'forecast';
}

export interface SolicitationAdapter<TRaw = Record<string, unknown>> extends SourceAdapter<TRaw> {
  readonly defaultStage: 'solicitation';
}
