export interface SourceChip {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface FastTrackResult {
  id: string;
  grade: 'A' | 'B' | 'C';
  rationale: string;
  naics_match_score: number;
  recommended_action: 'pursue' | 'watch' | 'skip';
  source_chips: SourceChip[];
  model_used: string;
  generated_at: string;
  cache_hit: boolean;
}

export interface FastTrackInput {
  title: string;
  description: string;
  naics_codes: string[];
  set_aside: string | null;
  place_of_performance: string | null;
}

export interface FastTrackHistoryResponse {
  items: FastTrackResult[];
  next_cursor: string | null;
}

export type SubmitOutcome =
  | { kind: 'result'; data: FastTrackResult }
  | { kind: 'timeout' };
