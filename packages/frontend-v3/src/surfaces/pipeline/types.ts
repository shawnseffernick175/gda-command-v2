export type PipelineStage =
  | 'identified'
  | 'qualified'
  | 'capture'
  | 'proposal'
  | 'submitted'
  | 'awarded'
  | 'lost'
  | 'no-bid';

export const PIPELINE_STAGES: PipelineStage[] = [
  'identified',
  'qualified',
  'capture',
  'proposal',
  'submitted',
  'awarded',
  'lost',
  'no-bid',
];

export const TERMINAL_STAGES: PipelineStage[] = ['awarded', 'lost', 'no-bid'];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  identified: 'Identified',
  qualified: 'Qualified',
  capture: 'Capture',
  proposal: 'Proposal',
  submitted: 'Submitted',
  awarded: 'Awarded',
  lost: 'Lost',
  'no-bid': 'No-Bid',
};

export type TeamingRole = 'prime' | 'sub' | 'self-perform' | 'undecided';

export const TEAMING_LABELS: Record<TeamingRole, string> = {
  prime: 'Prime',
  sub: 'Sub',
  'self-perform': 'Self-Perform',
  undecided: 'Undecided',
};

export interface PipelinePartner {
  id: string;
  name: string;
  role: string;
  source_url?: string | undefined;
}

export interface StageHistoryEntry {
  stage: PipelineStage;
  changed_at: string;
  changed_by: string;
  source_url?: string | undefined;
}

export interface PipelineRow {
  id: string;
  title: string;
  agency: string;
  naics?: string | undefined;
  response_date: string;
  pwin: number;
  pwin_source_url?: string | undefined;
  stage: PipelineStage;
  teaming: TeamingRole;
  partners: PipelinePartner[];
  linked_opportunity_id?: string | undefined;
  linked_capture_id?: string | undefined;
  stage_history: StageHistoryEntry[];
  source_url?: string | undefined;
  updated_at: string;
}

export interface PipelineListResponse {
  data: PipelineRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface PipelineDetailResponse {
  data: PipelineRow;
}

export interface PartnerDirectoryEntry {
  id: string;
  name: string;
  source_url?: string | undefined;
}

export interface PipelineListParams {
  limit?: number | undefined;
  offset?: number | undefined;
  sort?: string | undefined;
  filter?: {
    stage?: PipelineStage[] | undefined;
    teaming?: TeamingRole[] | undefined;
    agency?: string | undefined;
    naics?: string | undefined;
  } | undefined;
}
