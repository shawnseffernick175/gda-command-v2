export interface RegulatoryNotice {
  id: number;
  document_number: string;
  title: string;
  agency_names: string[];
  publication_date: string;
  html_url: string;
  pdf_url: string | null;
  data_source: string;
}

export interface RegulatoryListResult {
  items: RegulatoryNotice[];
  next_cursor: string | null;
}

export interface RegulatoryListFilters {
  agency?: string | undefined;
  published_after?: string | undefined;
  published_before?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}
