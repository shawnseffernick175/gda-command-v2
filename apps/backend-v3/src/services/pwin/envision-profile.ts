/**
 * F-451 — Centralized Envision profile constants.
 *
 * Single source of truth for Envision NAICS lanes, known customers,
 * contract-vehicle keywords, mission keywords, and core offerings.
 * Used by enrich-features.ts and (optionally) doctrine/evaluate.ts + teaming.ts.
 */

export const ENVISION_NAICS_LANES = [
  '541330',
  '541512',
  '541519',
  '541611',
  '541613',
  '541690',
  '541715',
  '561210',
  '611430',
];

export const ENVISION_KNOWN_CUSTOMERS = [
  'army',
  'tacom',
  'cascom',
  'tradoc',
  'uscg',
  'usn',
  'navy',
  'fema',
  'va',
  'dhs',
  'coast guard',
];

export const ENVISION_VEHICLE_KEYWORDS = [
  'rs3',
  'oasis',
  'seaport',
  'gsa',
  'idiq',
  'gwac',
  '8(a) stars',
  'alliant',
  'ces',
];

export const ENVISION_MISSION_KEYWORDS = [
  'sustainment',
  'logistics',
  'mission assurance',
  'field service',
  'c5isr',
  'c4isr',
  'systems engineering',
  'training',
  'readiness',
  'depot',
  'maintenance',
  'integration',
];

export const ENVISION_CORE_OFFERINGS = [
  'logistics',
  'sustainment',
  'systems engineering',
  'integration',
  'field service',
  'training',
  'maintenance',
  'program management',
  'c5isr',
  'readiness',
];
