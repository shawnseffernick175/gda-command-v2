/**
 * FasTrac signal normalization utilities — horizon inference,
 * signal_type classification, and mission tag extraction.
 */

import type { FasTracSignal, InstitutionType } from './types.js';

const HORIZON_PATTERNS: Array<{ regex: RegExp; horizon: FasTracSignal['horizon'] }> = [
  { regex: /immediate|urgent|within\s+\d+\s*days|0.?6\s*mo|phase\s*i\b/i, horizon: '0-6mo' },
  { regex: /6.?12\s*mo|near.?term|next\s+year|fy\s*2[67]/i, horizon: '6-12mo' },
  { regex: /12.?24\s*mo|mid.?term|2.?year/i, horizon: '12-24mo' },
  { regex: /long.?term|24\+?\s*mo|multi.?year|5.?year/i, horizon: '24mo+' },
];

const NEED_KEYWORDS = [
  'sources sought', 'rfi', 'request for information', 'market research',
  'baa', 'broad agency', 'solicitation', 'rfp', 'request for proposal',
  'cso', 'commercial solutions opening', 'sbir', 'sttr', 'challenge',
  'prize', 'topic', 'area of interest', 'white paper',
];

const SOLUTION_KEYWORDS = [
  'award', 'prototype', 'demonstration', 'pilot', 'success',
  'transition', 'capability', 'solution', 'product',
];

const MISSION_TAG_PATTERNS: Array<{ regex: RegExp; tag: string }> = [
  { regex: /\bAI\b|artificial intelligence|machine learning|\bML\b/i, tag: 'AI/ML' },
  { regex: /cyber|zero.?trust|network\s+defense/i, tag: 'cyber' },
  { regex: /autonomous|unmanned|\bUAS\b|\bUAV\b|\bUGV\b/i, tag: 'autonomous systems' },
  { regex: /C[45]ISR|command.*control|comms|communications/i, tag: 'C5ISR' },
  { regex: /logistics|sustainment|supply\s+chain/i, tag: 'logistics' },
  { regex: /electronic\s+warfare|\bEW\b|\bEMS\b/i, tag: 'EW' },
  { regex: /hypersonic|missile|directed\s+energy/i, tag: 'advanced weapons' },
  { regex: /space|satellite|orbit/i, tag: 'space' },
  { regex: /quantum|photon/i, tag: 'quantum' },
  { regex: /biotech|bio.?defense|medical|casualty/i, tag: 'biotech' },
  { regex: /training|simulation|\bXR\b|\bAR\b|\bVR\b/i, tag: 'training' },
  { regex: /ISR|surveillance|reconnaissance|sensor/i, tag: 'ISR' },
  { regex: /robotics|robot/i, tag: 'robotics' },
  { regex: /energy|power|battery/i, tag: 'energy' },
  { regex: /materials|manufacturing|additive/i, tag: 'materials' },
  { regex: /data|analytics|big\s+data/i, tag: 'data analytics' },
];

export function inferHorizon(text: string): FasTracSignal['horizon'] {
  for (const { regex, horizon } of HORIZON_PATTERNS) {
    if (regex.test(text)) return horizon;
  }
  return '6-12mo';
}

export function inferSignalType(text: string): 'need' | 'solution' {
  const lower = text.toLowerCase();
  let needScore = 0;
  let solutionScore = 0;

  for (const kw of NEED_KEYWORDS) {
    if (lower.includes(kw)) needScore++;
  }
  for (const kw of SOLUTION_KEYWORDS) {
    if (lower.includes(kw)) solutionScore++;
  }

  return needScore >= solutionScore ? 'need' : 'solution';
}

export function extractMissionTags(text: string): string[] {
  const tags: string[] = [];
  for (const { regex, tag } of MISSION_TAG_PATTERNS) {
    if (regex.test(text)) tags.push(tag);
  }
  return tags.length > 0 ? tags : ['general'];
}

export function classifyInstitutionType(orgName: string): InstitutionType {
  const factoryOrgs = [
    'AFWERX', 'SpaceWERX', 'AAL', 'xTech', 'SOFWERX', 'DIU',
  ];
  const agencyOrgs = ['DARPA', 'IARPA', 'NRL'];
  const ffrdcOrgs = ['MIT Lincoln Lab'];
  const commandOrgs = ['NSWC Crane', 'AFC/AI2C', 'DEVCOM ARL', 'PEO IEW&S'];

  if (factoryOrgs.includes(orgName)) return 'INNOVATION FACTORY';
  if (agencyOrgs.includes(orgName)) return 'AGENCY';
  if (ffrdcOrgs.includes(orgName)) return 'FFRDC';
  if (commandOrgs.includes(orgName)) return 'COMMAND';
  return 'AGENCY';
}
