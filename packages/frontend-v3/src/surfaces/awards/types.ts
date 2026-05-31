export interface AwardItem {
  id: string;
  recipient_name: string | null;
  agency: string | null;
  contract_type: string | null;
  awarded_amount: number | null;
  awarded_at: string | null;
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

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    generatedAt: string;
    source: string;
    requestId: string;
  };
}
