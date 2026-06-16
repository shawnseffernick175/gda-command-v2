/**
 * Tier 1 Army Installation & Unit Innovation Signal Catalog.
 *
 * Source of truth: docs/dev-notes/2026-06-15_research_army_bases.md
 * Quick-reference table at end of that file defines the Tier 1 set.
 *
 * Each entry drives SAM.gov keyword queries and/or direct URL polling.
 * Do NOT add or remove entries without updating the research file first.
 */

export interface Tier1Installation {
  /** Display name used as `source` and `installation` in fast_track_signals. */
  name: string;
  /** State or country for context. */
  state: string;
  /** SAM.gov keyword queries — each is run as a separate search. */
  samKeywords: string[];
  /** SAM.gov organization path fragments to match against fullParentPathName. */
  samOrgFragments: string[];
  /** Mission tags from research file. */
  missionTags: string[];
  /** Institution type for FasTrac tab classification. */
  institutionType: 'AGENCY' | 'COMMAND';
  /** Whether this adapter is enabled. Set false if source returns no results. */
  enabled: boolean;
}

export interface Tier1UnitChannel {
  /** Display name used as `source` in fast_track_signals. */
  name: string;
  /** Parent installation name. */
  installation: string;
  /** Unit name for `unit` column. */
  unit: string;
  /** Public URL to poll (if available). */
  url: string | null;
  /** SAM.gov keyword queries for this unit's signals. */
  samKeywords: string[];
  /** Mission tags from research file. */
  missionTags: string[];
  /** Institution type — COMMAND for unit-level. */
  institutionType: 'COMMAND';
  enabled: boolean;
}

/**
 * Tier 1 installations from the quick-reference table.
 * Each entry's fields come directly from the research file.
 */
export const TIER1_INSTALLATIONS: Tier1Installation[] = [
  {
    name: 'Aberdeen Proving Ground',
    state: 'MD',
    samKeywords: [
      'DEVCOM ARL',
      'DEVCOM C5ISR',
      'PEO IEW&S',
      'CECOM',
      'Aberdeen Proving Ground',
    ],
    samOrgFragments: [
      'DEVCOM',
      'Army Research Laboratory',
      'CECOM',
      'PEO Intelligence Electronic Warfare',
    ],
    missionTags: ['T&E', 'DEVCOM', 'C4ISR', 'EW', 'RDT&E', 'sensors'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Redstone Arsenal',
    state: 'AL',
    samKeywords: [
      'DEVCOM AvMC',
      'DEVCOM Aviation and Missile',
      'AMCOM',
      'PEO Missiles Space',
      'PEO Aviation',
      'Redstone Arsenal',
    ],
    samOrgFragments: [
      'DEVCOM Aviation',
      'Army Aviation and Missile Command',
      'PEO Missiles',
      'PEO Aviation',
    ],
    missionTags: ['aviation', 'missiles', 'RDT&E', 'hypersonics', 'UAS'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Fort George G. Meade',
    state: 'MD',
    samKeywords: [
      'USCYBERCOM',
      'Cyber Command',
      'DISA',
      'Fort Meade',
    ],
    samOrgFragments: [
      'U.S. Cyber Command',
      'Defense Information Systems Agency',
    ],
    missionTags: ['cyber', 'SIGINT', 'DoDIN', 'intelligence'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Picatinny Arsenal',
    state: 'NJ',
    samKeywords: [
      'DEVCOM Armaments Center',
      'Picatinny Arsenal',
      'PEO Ammunition',
    ],
    samOrgFragments: [
      'DEVCOM Armaments',
      'PEO Ammunition',
    ],
    missionTags: ['armaments', 'munitions', 'energetics', 'EW'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Fort Detrick',
    state: 'MD',
    samKeywords: [
      'USAMRDC',
      'AMRAA',
      'Army Medical Research',
      'Fort Detrick',
    ],
    samOrgFragments: [
      'Army Medical Research',
      'USAMRDC',
    ],
    missionTags: ['biomedical', 'CBRN', 'medical countermeasures', 'infectious disease'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Fort Belvoir',
    state: 'VA',
    samKeywords: [
      'NGA',
      'INSCOM',
      'DTRA',
      'JIDO',
      'Fort Belvoir',
    ],
    samOrgFragments: [
      'National Geospatial-Intelligence Agency',
      'Army Intelligence and Security Command',
      'Defense Threat Reduction Agency',
    ],
    missionTags: ['intelligence', 'geospatial', 'CBRN threat defeat', 'logistics'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Fort Sill',
    state: 'OK',
    samKeywords: [
      'LRPF CFT',
      'Long Range Precision Fires',
      'AMD CFT',
      'Air and Missile Defense',
      'Fort Sill',
    ],
    samOrgFragments: [
      'Fires Center of Excellence',
    ],
    missionTags: ['fires', 'LRPF', 'AMD', 'field artillery'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Detroit Arsenal',
    state: 'MI',
    samKeywords: [
      'PEO GCS',
      'PEO Ground Combat Systems',
      'NGCV CFT',
      'TACOM',
      'Detroit Arsenal',
    ],
    samOrgFragments: [
      'PEO Ground Combat',
      'TACOM',
    ],
    missionTags: ['ground vehicles', 'NGCV', 'Abrams', 'Bradley', 'Stryker'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Natick Soldier Center',
    state: 'MA',
    samKeywords: [
      'DEVCOM Soldier Center',
      'Natick Soldier',
    ],
    samOrgFragments: [
      'DEVCOM Soldier',
    ],
    missionTags: ['soldier systems', 'body armor', 'equipment', 'survivability'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Fort Gordon',
    state: 'GA',
    samKeywords: [
      'ARCYBER',
      'Army Cyber Command',
      'Fort Gordon',
    ],
    samOrgFragments: [
      'Army Cyber Command',
    ],
    missionTags: ['cyber', 'signals', 'EW', 'Army networks'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Fort Sam Houston',
    state: 'TX',
    samKeywords: [
      'USAISR',
      'Army Institute of Surgical Research',
      'MEDCOM',
      'Fort Sam Houston',
    ],
    samOrgFragments: [
      'Army Medical Command',
      'Army Institute of Surgical Research',
    ],
    missionTags: ['medical', 'surgical research', 'trauma', 'MEDCOM'],
    institutionType: 'AGENCY',
    enabled: true,
  },
  {
    name: 'Joint Base San Antonio',
    state: 'TX',
    samKeywords: [
      'MEDCOM',
      'Brooke Army Medical Center',
      'BAMC',
      'Joint Base San Antonio',
    ],
    samOrgFragments: [
      'Brooke Army Medical Center',
    ],
    missionTags: ['medical', 'MEDCOM', 'military hospital'],
    institutionType: 'AGENCY',
    enabled: true,
  },
];

/**
 * Tier 1 unit innovation channels from the research file.
 * These are unit-level signals (COMMAND institution_type).
 */
export const TIER1_UNIT_CHANNELS: Tier1UnitChannel[] = [
  {
    name: 'XVIII Airborne Corps Dragon\'s Lair',
    installation: 'Fort Bragg',
    unit: 'XVIII Airborne Corps',
    url: 'https://home.army.mil/bragg',
    samKeywords: [
      'XVIII Airborne Corps Innovation',
      'Dragon\'s Lair',
    ],
    missionTags: ['SOF', 'airborne', 'innovation', 'rapid deployment'],
    institutionType: 'COMMAND',
    enabled: true,
  },
  {
    name: '75th Innovation Command',
    installation: 'Fort Bragg',
    unit: '75th Innovation Command',
    url: null,
    samKeywords: [
      '75th Innovation Command',
      'Army Reserve Innovation',
    ],
    missionTags: ['Army Reserve', 'innovation'],
    institutionType: 'COMMAND',
    enabled: true,
  },
];
