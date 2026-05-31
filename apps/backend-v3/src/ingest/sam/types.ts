/**
 * SAM.gov Opportunities API types for the ingest framework.
 */

export interface SAMOpportunityRaw {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  fullParentPathCode?: string;
  postedDate: string;
  type: string;
  baseType: string;
  archiveType?: string;
  archiveDate?: string;
  typeOfSetAsideDescription?: string;
  typeOfSetAside?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  naicsCodes?: string[];
  classificationCode?: string;
  active: string;
  organizationType?: string;
  description?: string;
  organizationId?: string;
  pointOfContact?: Array<{
    fax?: string;
    type: string;
    email?: string;
    phone?: string;
    title?: string;
    fullName?: string;
  }>;
  officeAddress?: {
    zipcode?: string;
    city?: string;
    countryCode?: string;
    state?: string;
  };
  placeOfPerformance?: {
    city?: { code?: string; name?: string };
    state?: { code?: string; name?: string };
    country?: { code?: string; name?: string };
  };
  award?: {
    date?: string;
    number?: string;
    amount?: string;
    awardee?: {
      name?: string;
      duns?: string;
      ueiSAM?: string;
    };
  };
  additionalInfoLink?: string;
  uiLink?: string;
  links?: Array<{ rel: string; href: string }>;
}

export interface SAMSearchResponse {
  totalRecords: number;
  limit: number;
  offset: number;
  opportunitiesData: SAMOpportunityRaw[];
}
