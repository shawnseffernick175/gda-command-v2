/**
 * GovTribe MCP response types — based on the live MCP Search tool response
 * shape (fields_to_return enum).
 *
 * The MCP search returns bare ID stubs by default: { govtribe_id }.
 * A detail call with fields_to_return populates the full shape below.
 */

/* ── ID stub returned by default search ──────────────────────────── */

export interface GovTribeIdStub {
  govtribe_id: string;
}

/* ── Full detail shape from fields_to_return ─────────────────────── */

export interface GovTribeDetailRecord {
  govtribe_id: string;
  govtribe_url?: string;
  source_url?: string;
  name?: string;
  solicitation_number?: string;
  opportunity_type?: string;
  opportunity_state?: string;
  set_aside_type?: string;
  posted_date?: string;
  due_date?: string;
  award_date?: string;
  descriptions?: string[];
  federal_agency?: GovTribeFederalAgency;
  naics_category?: GovTribeCategory;
  psc_category?: GovTribeCategory;
  place_of_performance?: GovTribePlaceOfPerformance;
  points_of_contact?: GovTribeContact[];
  federal_contract_awards?: GovTribeLinkedRecord[];
  federal_contract_vehicle?: GovTribeLinkedRecord;
  govtribe_ai_summary?: string;
  updated_at?: string;
}

export interface GovTribeFederalAgency {
  govtribe_id?: string;
  name?: string;
  sub_tier?: string;
  office?: string;
}

export interface GovTribeCategory {
  govtribe_id?: string;
  code?: string;
  name?: string;
}

export interface GovTribePlaceOfPerformance {
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

export interface GovTribeContact {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  role?: string;
}

export interface GovTribeLinkedRecord {
  govtribe_id?: string;
  name?: string;
}

/* ── Award detail shape from Search_Federal_Contract_Awards ──────── */

export interface GovTribeAwardVendor {
  govtribe_id?: string;
  name?: string;
  uei?: string;
}

export interface GovTribeAwardDetail {
  govtribe_id: string;
  govtribe_url?: string;
  name?: string;
  contract_number?: string;
  award_date?: string;
  completion_date?: string;
  ultimate_completion_date?: string;
  ceiling_value?: number;
  dollars_obligated?: number;
  contract_type?: string;
  set_aside_type?: string;
  extent_competed?: string;
  descriptions?: string[];
  awardee?: GovTribeAwardVendor;
  parent_of_awardee?: GovTribeAwardVendor;
  contracting_federal_agency?: GovTribeFederalAgency;
  funding_federal_agency?: GovTribeFederalAgency;
  naics_category?: GovTribeCategory;
  psc_category?: GovTribeCategory;
  place_of_performance?: GovTribePlaceOfPerformance;
  originating_federal_contract_opportunity?: GovTribeLinkedRecord;
  federal_contract_vehicle?: GovTribeLinkedRecord;
  govtribe_ai_summary?: string;
  updated_at?: string;
}

/* ── Forecast detail shape from Search_Federal_Forecasts ─────────── */

export interface GovTribeForecastDetail {
  govtribe_id: string;
  govtribe_url?: string;
  source_url?: string;
  name?: string;
  forecast_type?: string;
  set_aside?: string;
  estimated_solicitation_release_date?: string;
  estimated_award_start_date?: string;
  estimated_award_value?: number | { low?: number; high?: number };
  descriptions?: string[];
  federal_agency?: GovTribeFederalAgency;
  place_of_performance?: GovTribePlaceOfPerformance;
  points_of_contact?: GovTribeContact[];
  govtribe_ai_summary?: string;
  updated_at?: string;
}

/* ── Search response wrapper ─────────────────────────────────────── */

export interface GovTribeSearchResponse {
  results?: GovTribeIdStub[];
  total?: number;
  page?: number;
  per_page?: number;
}

/* ── Legacy REST shape (kept for backward compat, not used in live) ─ */

export interface GovTribeOpportunityRaw {
  _id?: string;
  id?: string;
  govtribe_id?: string;
  type?: string;
  attributes?: {
    title?: string;
    solicitationNumber?: string;
    agency?: {
      name?: string;
      subTier?: string;
      office?: string;
    };
    naicsCode?: string;
    pscCode?: string;
    setAside?: string;
    placeOfPerformance?: string;
    responseDate?: string;
    postedDate?: string;
    awardDate?: string;
    description?: string;
    awardAmount?: number;
    estimatedValue?: {
      low?: number;
      high?: number;
    };
    contacts?: GovTribeContact[];
    incumbent?: {
      name?: string;
      uei?: string;
    };
    status?: string;
    url?: string;
    slug?: string;
    modifiedDate?: string;
  };
  links?: {
    self?: string;
  };
}

export interface GovTribeAgencyContactsRaw {
  _id?: string;
  id?: string;
  attributes?: {
    name?: string;
    contacts?: GovTribeContact[];
  };
}

export interface GovTribeVehicleRaw {
  _id?: string;
  id?: string;
  attributes?: {
    name?: string;
    agency?: string;
    contractType?: string;
    ceiling?: number;
    awardDate?: string;
    endDate?: string;
    vendors?: Array<{ name?: string; uei?: string }>;
    status?: string;
  };
}

export interface GovTribeListResponse<T> {
  data?: T[];
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };
  links?: {
    next?: string;
    prev?: string;
  };
}
