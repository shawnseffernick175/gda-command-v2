export interface SourceCitation {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface LaunchpadSummary {
  qualified_due_this_week: number;
  qualified_due_this_week_sources: SourceCitation[];
  pipeline_no_capture: number;
  pipeline_no_capture_sources: SourceCitation[];
  captures_color_review_stale: number;
  captures_color_review_stale_sources: SourceCitation[];
  action_items_open_today: number;
  action_items_open_today_sources: SourceCitation[];
  action_items_overdue: number;
  action_items_overdue_sources: SourceCitation[];
}

export type FlagSeverity = 'critical' | 'warning' | 'info';

export interface LaunchpadFlag {
  id: string;
  flag_key: string;
  severity: FlagSeverity;
  title: string;
  detail: string | null;
  due_date: string | null;
  doctrine_anchor: string | null;
  source_url: string | null;
  source_url_sources: SourceCitation[];
  created_at: string;
}

export interface LaunchpadFlagsResult {
  flags: LaunchpadFlag[];
  compliance_gaps: number;
  compliance_gaps_sources: SourceCitation[];
  teaming_unresolved: number;
  teaming_unresolved_sources: SourceCitation[];
  analysis_timeouts_24h: number;
  analysis_timeouts_24h_sources: SourceCitation[];
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta: {
    generatedAt: string;
    source: string;
    requestId: string;
  };
  error?: string;
}
