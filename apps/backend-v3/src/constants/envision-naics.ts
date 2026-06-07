/**
 * Envision NAICS Codes — Full SAM.gov Registration
 * Source: SAM.gov entity VNMLXFMQD976 / CAGE 4JB87
 * Updated: June 2026
 *
 * DO NOT edit this list manually.
 * These codes drive opportunity filtering, award ingestion, pWin scoring,
 * competitor classification, and AI prompt context across the entire platform.
 */

export const ENVISION_NAICS = [
  // Engineering & Architecture
  '541310', // Architectural Services
  '541330', // Engineering Services (PRIMARY)
  '541360', // Geophysical Surveying and Mapping Services
  '541370', // Surveying and Mapping (except Geophysical) Services
  '541380', // Testing Laboratories and Services
  '541430', // Graphic Design Services
  '541490', // Other Specialized Design Services

  // IT & Software
  '541511', // Custom Computer Programming Services
  '541512', // Computer Systems Design Services
  '541513', // Computer Facilities Management Services
  '541519', // Other Computer Related Services (incl. IT Value Added Resellers)
  '513210', // Software Publishers
  '518210', // Computing Infrastructure, Data Processing, Web Hosting

  // Telecommunications
  '517111', // Wired Telecommunications Carriers
  '517112', // Wireless Telecommunications Carriers (except Satellite)
  '517121', // Telecommunications Resellers
  '517122', // Agents for Wireless Telecommunications Services
  '517410', // Satellite Telecommunications
  '517810', // All Other Telecommunications
  '519290', // Web Search Portals and All Other Information Services

  // Management & Professional Consulting
  '541611', // Administrative Management and General Management Consulting
  '541613', // Marketing Consulting Services
  '541614', // Process, Physical Distribution, and Logistics Consulting
  '541618', // Other Management Consulting Services
  '541690', // Other Scientific and Technical Consulting Services
  '541990', // All Other Professional, Scientific, and Technical Services

  // R&D
  '541713', // Research and Development in Nanotechnology
  '541714', // Research and Development in Biotechnology
  '541715', // R&D in Physical, Engineering, and Life Sciences

  // Training & Education
  '611310', // Colleges, Universities, and Professional Schools
  '611420', // Computer Training
  '611430', // Professional and Management Development Training
  '611512', // Flight Training
  '611519', // Other Technical and Trade Schools
  '611691', // Exam Preparation and Tutoring
  '611710', // Educational Support Services

  // Administrative & Facilities Support
  '561110', // Office Administrative Services
  '561210', // Facilities Support Services
  '561320', // Temporary Help Services
  '561499', // All Other Business Support Services
  '561621', // Security Systems Services (except Locksmiths)

  // Transportation Support
  '488111', // Air Traffic Control
  '488190', // Other Support Activities for Air Transportation
  '488999', // All Other Support Activities for Transportation

  // Media & Publishing
  '512191', // Teleproduction and Other Postproduction Services
  '512290', // Other Sound Recording Industries
  '513199', // All Other Publishers
  '516210', // Media Streaming Distribution Services

  // Equipment Repair & Maintenance
  '811210', // Electronic and Precision Equipment Repair and Maintenance
] as const;

export type EnvisionNaicsCode = typeof ENVISION_NAICS[number];

/**
 * Primary competitive NAICS lanes — curated subset where Envision has
 * demonstrated past performance and actively competes. Used for pWin
 * scoring bonuses and teaming partner evaluation (where we check if an
 * opp's NAICS is OUTSIDE our primary lanes to suggest partners).
 * This is intentionally narrower than the full SAM registration.
 */
export const ENVISION_PRIMARY_NAICS = [
  '541330', // Engineering Services
  '541511', // Custom Computer Programming
  '541512', // Computer Systems Design
  '541519', // Other Computer Related Services
  '541611', // Admin/General Management Consulting
  '541613', // Marketing Consulting
  '541614', // Logistics Consulting
  '541690', // Other Scientific/Technical Consulting
  '541715', // R&D Physical/Engineering/Life Sciences
  '541990', // All Other Professional/Scientific/Technical
  '561110', // Office Administrative Services
  '561210', // Facilities Support Services
  '611430', // Professional/Management Development Training
] as const;

/** String used in AI prompts — top 8 most relevant codes */
export const ENVISION_NAICS_PROMPT_SUMMARY =
  'NAICS 541330 (Engineering), 541511/541512/541513/541519 (IT/Software), 541715 (R&D), ' +
  '611430/611512 (Training & Simulation), 561210 (Facilities Support)';

/** Envision company context string for AI prompts */
export const ENVISION_COMPANY_CONTEXT =
  'Envision is a Service-Disabled Veteran-Owned Small Business (SDVOSB) competing for federal ' +
  'defense and civilian contracts across engineering services, IT/software development, training ' +
  'and simulation, R&D, and facilities support. Contract vehicles include Army RS3, Seaport NxG, ' +
  'GSA MAS, and CIO-SP3. Primary customers: DoD, Army, Navy, DHS, FAA, GSA. ' +
  'Based in the DC metro area.';
