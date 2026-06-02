/**
 * Raw NIH RePORTER project record shape returned by the v2 Projects API.
 * The API accepts PascalCase include_fields but returns snake_case keys.
 * All fields optional because the API may omit empty fields.
 */

export interface NIHOrganization {
  org_name?: string;
  org_state?: string;
}

export interface NIHAgencyIcAdmin {
  code?: string;
  abbreviation?: string;
  name?: string;
}

export interface NIHProjectRaw {
  appl_id?: number;
  project_num?: string;
  project_title?: string;
  fiscal_year?: number;
  award_amount?: number | null;
  activity_code?: string;
  project_start_date?: string;
  project_end_date?: string;
  award_type?: string | number;
  organization?: NIHOrganization;
  agency_ic_admin?: NIHAgencyIcAdmin;
}
