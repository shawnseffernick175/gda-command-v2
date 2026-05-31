/**
 * GovTribe API response types — based on GovTribe REST API (JSON:API format).
 */

export interface GovTribeOpportunityRaw {
  _id?: string;
  id?: string;
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

export interface GovTribeContact {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  role?: string;
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
