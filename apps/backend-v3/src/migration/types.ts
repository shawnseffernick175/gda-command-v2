/**
 * Shared types for the V2 → V3 data migration pipeline.
 */

import type { SourceKind } from '../lib/sources.js';

export interface LegacyOpportunity {
  id: string | number;
  notice_id?: string | null;
  solicitation_number?: string | null;
  title: string;
  agency?: string | null;
  sub_agency?: string | null;
  status?: string | null;
  posted_date?: string | null;
  response_deadline?: string | null;
  naics?: string | null;
  psc?: string | null;
  set_aside?: string | null;
  value?: number | string | null;
  value_min?: number | string | null;
  value_max?: number | string | null;
  place_of_performance?: string | null;
  description?: string | null;
  raw_source_url?: string | null;
  source_url?: string | null;
  data_source?: string | null;
  tags?: string[] | null;
  incumbent?: string | null;
  analysis?: Record<string, unknown> | null;
  analysis_version?: string | null;
  ai_analyzed_at?: string | null;
  qualified_at?: string | null;
  qualified_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LegacyCapture {
  id: string | number;
  opportunity_id?: string | number | null;
  title?: string | null;
  capture_owner?: string | null;
  status?: string | null;
  win_probability?: number | string | null;
  win_prob_evidence?: string | null;
  milestone_90day?: string | null;
  analysis?: Record<string, unknown> | null;
  analysis_version?: string | null;
  ai_analyzed_at?: string | null;
  teaming_partners?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LegacyActionItem {
  id: string | number;
  title: string;
  detail?: string | null;
  owner?: string | null;
  status?: string | null;
  due_date?: string | null;
  source?: string | null;
  source_id?: string | null;
  linked_record_type?: string | null;
  linked_record_id?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LegacySource {
  id: string | number;
  kind?: string | null;
  url?: string | null;
  title?: string | null;
  retrieved_at?: string | null;
  confidence?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface LegacyPartner {
  id: string | number;
  name: string;
  display_name?: string | null;
  anchor_company?: string | null;
  uei?: string | null;
  cage?: string | null;
  primary_naics?: string | null;
  capabilities?: string[] | null;
  certifications?: unknown[] | null;
  vehicles?: unknown[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface V3Opportunity {
  id: string;
  title: string;
  agency: string | null;
  sub_agency: string | null;
  solicitation_number: string | null;
  sam_notice_id: string | null;
  status: string;
  grade: string | null;
  grade_evidence: string | null;
  value_min: number | null;
  value_max: number | null;
  naics: string | null;
  psc: string | null;
  set_aside: string | null;
  place_of_performance: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  incumbent: string | null;
  description: string | null;
  tags: string[];
  data_source: string;
  analysis: Record<string, unknown> | null;
  analysis_version: string | null;
  ai_analyzed_at: string | null;
  qualified_at: string | null;
  qualified_by: string | null;
  source_id: number;
  legacy_id: string;
  created_at: string;
  updated_at: string;
}

export interface V3Capture {
  id: string;
  opportunity_id: string;
  status: string;
  analysis: Record<string, unknown> | null;
  analysis_version: string | null;
  ai_analyzed_at: string | null;
  legacy_id: string;
  created_at: string;
  updated_at: string;
}

export interface V3ActionItem {
  id: string;
  title: string;
  detail: string | null;
  owner: string;
  status: string;
  due_date: string | null;
  source: string;
  source_id: string | null;
  linked_record_type: string | null;
  linked_record_id: string | null;
  completed_at: string | null;
  legacy_id: string;
  created_at: string;
  updated_at: string;
}

export interface V3Source {
  id: string;
  kind: SourceKind;
  url: string | null;
  title: string | null;
  retrieved_at: string;
  confidence: string;
  meta: Record<string, unknown>;
  legacy_id: string;
  created_at: string;
}

export interface V3Partner {
  id: string;
  name: string;
  display_name: string | null;
  anchor_company: string | null;
  uei: string | null;
  cage: string | null;
  primary_naics: string | null;
  capabilities: string[];
  certifications: unknown[];
  vehicles: unknown[];
  legacy_id: string;
  created_at: string;
  updated_at: string;
}

export interface AnalysisSourceRef {
  kind: SourceKind;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface MigrationCounts {
  opportunities: { v2: number; v3: number };
  captures: { v2: number; v3: number };
  action_items: { v2: number; v3: number };
  sources: { v2: number; v3: number };
  partners: { v2: number; v3: number };
}

export interface FieldCoverageRow {
  field: string;
  with_value: number;
  with_sources: number;
  coverage_pct: number;
}

export type GapReasonCode =
  | 'MISSING_SOURCES'
  | 'TYPE_MISMATCH'
  | 'ORPHANED_REFERENCE'
  | 'DUPLICATE_KEY';

export interface GapEntry {
  entity_type: string;
  entity_id: string;
  field: string;
  reason: GapReasonCode;
  url: string;
  detail: string;
}

export interface PreWarmJob {
  entityType: 'opportunity' | 'capture';
  entityId: string;
  priority: 'normal';
  trigger: 'pre-warm';
}

export interface MigrationOptions {
  commit: boolean;
  entity: 'opportunity' | 'capture' | 'action_item' | 'all';
  legacyDatabaseUrl: string;
  v3DatabaseUrl: string;
}
