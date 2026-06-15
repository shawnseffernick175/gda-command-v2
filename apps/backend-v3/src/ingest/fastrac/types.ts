/**
 * FasTrac Tier 1 ingestion types — signal adapter interfaces for
 * DoD innovation org signal sensing.
 */

export interface FasTracSignal {
  source: string;
  source_url: string;
  title: string;
  mission_tags: string[];
  horizon: '0-6mo' | '6-12mo' | '12-24mo' | '24mo+';
  signal_type: 'need' | 'solution';
  institution_type: InstitutionType;
  funding_mechanism: string | null;
  published_at: string | null;
  summary: string | null;
}

export type InstitutionType =
  | 'INNOVATION FACTORY'
  | 'FFRDC'
  | 'ACADEMIA'
  | 'AGENCY'
  | 'COMMAND';

export type IngestionPattern = 'sam_keyword' | 'dsip_api' | 'html_scrape' | 'govdelivery';

export interface SourceConfig {
  /** Display name / org name (e.g. "AFWERX") */
  name: string;
  /** Whether this adapter is active */
  enabled: boolean;
  /** Ingestion pattern to use */
  pattern: IngestionPattern;
  /** institution_type classification for signals from this source */
  institutionType: InstitutionType;
  /** Primary funding mechanism (e.g. "SBIR", "BAA", "CSO") */
  fundingMechanism: string;
  /** SAM.gov keyword(s) for Pattern A */
  samKeywords?: string[];
  /** Direct URL(s) to scrape for Pattern C */
  scrapeUrls?: string[];
  /** DSIP search parameters for Pattern A (DSIP) */
  dsipParams?: Record<string, string>;
  /** GovDelivery account / topic for Pattern B */
  govDeliveryAccount?: string;
  /** Note for disabled adapters */
  disabledReason?: string;
}

export interface IngestionResult {
  source: string;
  inserted: number;
  updated: number;
  errors: number;
}
