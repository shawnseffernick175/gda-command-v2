/**
 * GovTribe Saved Search definitions — 7 named searches per V2 production doc.
 * 3 Opportunities, 2 Awards, 2 Forecasts.
 *
 * Total estimated credit cost: ~115 credits/cycle (Mon + Thu).
 */

export type SearchCategory = 'opportunities' | 'awards' | 'forecasts';

export interface GovTribeSavedSearch {
  id: string;
  name: string;
  category: SearchCategory;
  mcpTool: string;
  keywords: string[];
  naicsFilter: string[];
  expectedCreditsPerPage: number;
  maxResults: number;
}

export const GOVTRIBE_SAVED_SEARCHES: GovTribeSavedSearch[] = [
  // --- Opportunities (3) ---
  {
    id: 'gda-opps-core',
    name: 'GDA-Opps-Core',
    category: 'opportunities',
    mcpTool: 'Search_Federal_Contract_Opportunities',
    keywords: ['SETA', 'C5ISR', 'PEO IEW&S', 'CPE IEW&S', 'PEO C3N', 'CPE C3N', 'cybersecurity', 'systems engineering'],
    naicsFilter: ['541511', '541512', '541519', '541330', '541611', '541690'],
    expectedCreditsPerPage: 15,
    maxResults: 50,
  },
  {
    id: 'gda-opps-growth',
    name: 'GDA-Opps-Growth',
    category: 'opportunities',
    mcpTool: 'Search_Federal_Contract_Opportunities',
    keywords: ['CMMC', 'AI/ML', 'XR/AR', 'DEVCOM', 'synthetic training'],
    naicsFilter: ['541511', '541512', '541715', '518210'],
    expectedCreditsPerPage: 15,
    maxResults: 50,
  },
  {
    id: 'gda-opps-opportunistic',
    name: 'GDA-Opps-Opportunistic',
    category: 'opportunities',
    mcpTool: 'Search_Federal_Contract_Opportunities',
    keywords: ['advisory services', 'innovation', 'ISR', 'EW'],
    naicsFilter: ['541611', '541690', '541715'],
    expectedCreditsPerPage: 15,
    maxResults: 50,
  },

  // --- Awards (2) ---
  {
    id: 'gda-awards-core',
    name: 'GDA-Awards-Core',
    category: 'awards',
    mcpTool: 'Search_Federal_Contract_Awards',
    keywords: ['SETA', 'C5ISR', 'PEO IEW&S', 'CPE IEW&S', 'cybersecurity', 'systems engineering'],
    naicsFilter: ['541511', '541512', '541519', '541330'],
    expectedCreditsPerPage: 20,
    maxResults: 50,
  },
  {
    id: 'gda-awards-growth',
    name: 'GDA-Awards-Growth',
    category: 'awards',
    mcpTool: 'Search_Federal_Contract_Awards',
    keywords: ['CMMC', 'AI/ML', 'DEVCOM'],
    naicsFilter: ['541511', '541512', '541715'],
    expectedCreditsPerPage: 20,
    maxResults: 50,
  },

  // --- Forecasts (2) ---
  {
    id: 'gda-forecasts-core',
    name: 'GDA-Forecasts-Core',
    category: 'forecasts',
    mcpTool: 'Search_Federal_Forecasts',
    keywords: ['SETA', 'C5ISR', 'PEO IEW&S', 'CPE IEW&S', 'cybersecurity'],
    naicsFilter: ['541511', '541512', '541519'],
    expectedCreditsPerPage: 15,
    maxResults: 50,
  },
  {
    id: 'gda-forecasts-growth',
    name: 'GDA-Forecasts-Growth',
    category: 'forecasts',
    mcpTool: 'Search_Federal_Forecasts',
    keywords: ['AI/ML', 'CMMC', 'DEVCOM', 'innovation'],
    naicsFilter: ['541715', '518210'],
    expectedCreditsPerPage: 15,
    maxResults: 50,
  },
];

/** Compute the endpoint key for credit costing based on category. */
export function endpointKeyForCategory(category: SearchCategory): string {
  switch (category) {
    case 'opportunities': return 'search_opportunities';
    case 'awards': return 'search_awards';
    case 'forecasts': return 'search_forecasts';
  }
}
