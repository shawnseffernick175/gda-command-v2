export interface SourceRef {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface AwardItem {
  id: string;
  recipient_name: string | null;
  recipient_name_sources: SourceRef[];
  agency: string | null;
  agency_sources: SourceRef[];
  contract_type: string | null;
  contract_type_sources: SourceRef[];
  awarded_amount: number | null;
  awarded_amount_sources: SourceRef[];
  awarded_at: string | null;
  awarded_at_sources: SourceRef[];
  fpds_url: string | null;
  data_source: string;
}

export interface AwardListFilters {
  agency?: string | undefined;
  contract_type?: string | undefined;
  awarded_after?: string | undefined;
  awarded_before?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface AwardsListResponse {
  items: AwardItem[];
  next_cursor: string | null;
}


