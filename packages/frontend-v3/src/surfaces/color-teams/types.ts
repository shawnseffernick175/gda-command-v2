export type ColorTeamColor = 'pink' | 'red' | 'black' | 'blue' | 'white' | 'green';
export type FindingSeverity = 'info' | 'warning' | 'critical' | 'blocker';
export type RunStatus = 'queued' | 'running' | 'complete' | 'error';

export const ALL_COLORS: ColorTeamColor[] = ['pink', 'red', 'black', 'blue', 'white', 'green'];

export interface Citation {
  source: string;
  url: string;
  grade: 'A' | 'B' | 'C';
}

export interface DoctrineScoreRow {
  principle: string;
  score: number;
  detail: string;
}

export interface MarginCheck {
  projected_margin: number;
  floor: number;
  pass: boolean;
}

export interface ColorTeamFinding {
  id: string;
  run_id: string;
  color: ColorTeamColor;
  severity: FindingSeverity;
  section_ref: string | null;
  finding: string;
  recommended_fix: string | null;
  citations: Citation[];
  doctrine_score: DoctrineScoreRow[] | null;
  exclusion_hits: string[] | null;
  margin_check: MarginCheck | null;
  action_item_id: string | null;
  created_at: string;
}

export interface ColorCount {
  color: string;
  count: number;
}

export interface ColorTeamRun {
  id: string;
  document_id: string;
  linked_rfp_id: string | null;
  colors: string[];
  status: RunStatus;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  finding_counts?: ColorCount[];
  created_at: string;
}

export interface Document {
  id: string;
  filename: string;
  mime_type: string;
  file_size_bytes: number | null;
  doc_type: string;
  storage_path: string;
  uploaded_by: string;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiffResult {
  new_findings: ColorTeamFinding[];
  resolved_findings: ColorTeamFinding[];
  regressed_findings: ColorTeamFinding[];
  unchanged_findings: ColorTeamFinding[];
}
