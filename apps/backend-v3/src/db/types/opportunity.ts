/**
 * TypeScript types for the unified opportunity model (F-401).
 *
 * These map directly to the four tables created in v3_026_unified_opportunities.sql.
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type LifecycleStage =
  | 'signal'
  | 'qualify'
  | 'forecast'
  | 'pre_sol'
  | 'solicitation'
  | 'awarded'
  | 'post_award'
  | 'closed';

export type LinkConfidence =
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'CONFIRMED'
  | 'REJECTED';

export type DoctrineStatus = 'qualified' | 'excluded' | 'unknown';

export type PrimarySource =
  | 'sam'
  | 'govtribe'
  | 'govwin'
  | 'nsf'
  | 'sbir'
  | 'nih'
  | 'arxiv'
  | 'dod_rss'
  | 'fedreg'
  | 'manual'
  | (string & {});

export type MatchMethod =
  | 'exact_notice_id'
  | 'fuzzy_title_agency'
  | 'manual'
  | (string & {});

export type SignalType =
  | 'nsf_award'
  | 'sbir_topic'
  | 'arxiv_paper'
  | 'fedreg_rule'
  | 'gao_report'
  | 'dod_news'
  | (string & {});

// ─── Table: opportunities ────────────────────────────────────────────────────

export interface Opportunity {
  internal_id: string;
  lifecycle_stage: LifecycleStage;
  primary_source: PrimarySource | null;
  title: string | null;
  agency: string | null;
  office: string | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  estimated_value_cents: number | null;
  posted_at: string | null;
  response_due_at: string | null;
  award_at: string | null;
  pwin: number | null;
  doctrine_status: DoctrineStatus | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityInsert {
  internal_id?: string;
  lifecycle_stage: LifecycleStage;
  primary_source?: PrimarySource | null;
  title?: string | null;
  agency?: string | null;
  office?: string | null;
  naics?: string | null;
  psc?: string | null;
  set_aside?: string | null;
  estimated_value_cents?: number | null;
  posted_at?: string | null;
  response_due_at?: string | null;
  award_at?: string | null;
  pwin?: number | null;
  doctrine_status?: DoctrineStatus | null;
}

export interface OpportunityUpdate {
  lifecycle_stage?: LifecycleStage;
  primary_source?: PrimarySource | null;
  title?: string | null;
  agency?: string | null;
  office?: string | null;
  naics?: string | null;
  psc?: string | null;
  set_aside?: string | null;
  estimated_value_cents?: number | null;
  posted_at?: string | null;
  response_due_at?: string | null;
  award_at?: string | null;
  pwin?: number | null;
  doctrine_status?: DoctrineStatus | null;
}

// ─── Table: opportunity_links ────────────────────────────────────────────────

export interface OpportunityLink {
  id: number;
  internal_id: string;
  source: string;
  source_native_id: string;
  confidence: LinkConfidence | null;
  match_method: MatchMethod | null;
  matched_at: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface OpportunityLinkInsert {
  internal_id: string;
  source: string;
  source_native_id: string;
  confidence?: LinkConfidence | null;
  match_method?: MatchMethod | null;
  matched_at?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
}

// ─── Table: opportunity_field_overrides ──────────────────────────────────────

export interface OpportunityFieldOverride {
  id: number;
  internal_id: string;
  field_name: string;
  field_value_json: unknown;
  set_by: string;
  set_at: string;
  reason: string | null;
}

export interface OpportunityFieldOverrideInsert {
  internal_id: string;
  field_name: string;
  field_value_json: unknown;
  set_by: string;
  reason?: string | null;
}

// ─── Table: opportunity_signals ──────────────────────────────────────────────

export interface OpportunitySignal {
  id: number;
  internal_id: string;
  signal_type: SignalType;
  signal_native_id: string | null;
  signal_payload_json: unknown | null;
  signal_score: number | null;
  created_at: string;
}

export interface OpportunitySignalInsert {
  internal_id: string;
  signal_type: SignalType;
  signal_native_id?: string | null;
  signal_payload_json?: unknown | null;
  signal_score?: number | null;
}

// ─── Query helpers ───────────────────────────────────────────────────────────

export interface FindStageOptions {
  agency?: string;
  naics?: string;
  due_before?: string;
  due_after?: string;
  limit?: number;
  offset?: number;
}
