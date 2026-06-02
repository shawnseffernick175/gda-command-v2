/**
 * DSIP (DoD SBIR/STTR Innovation Portal) API response types.
 *
 * Search endpoint: GET /topics/api/public/topics/search
 * Detail endpoint: GET /topics/api/public/topics/{topicId}/details
 */

/** Topic record from the DSIP search (list) endpoint. */
export interface DSIPTopicListItem {
  topicId: string;
  topicCode: string;
  topicTitle: string;
  topicStatus: string;
  program: string;
  component: string;
  command: string | null;
  solicitationNumber: string;
  solicitationTitle: string;
  phaseHierarchy: string | null;
  topicStartDate: number | null;
  topicEndDate: number | null;
  topicPreReleaseStartDate: number | null;
  topicPreReleaseEndDate: number | null;
  cycleName: string | null;
  cmmcLevel: string | null;
  releaseNumber: number | null;
}

/** Detail payload from /topics/{topicId}/details. */
export interface DSIPTopicDetail {
  topicId: string;
  description: string | null;
  objective: string | null;
  focusAreas: string[] | null;
  technologyAreas: string[] | null;
  keywords: string | null;
  itar: boolean | null;
  cmmcLevel: string | null;
  phase1Description: string | null;
  phase2Description: string | null;
  phase3Description: string | null;
  referenceDocuments: unknown[] | null;
}

/** Search response wrapper. */
export interface DSIPSearchResponse {
  total: number;
  data: DSIPTopicListItem[];
}

/** Enriched topic: list item + detail merged. */
export interface DSIPEnrichedTopic {
  list: DSIPTopicListItem;
  detail: DSIPTopicDetail | null;
}
