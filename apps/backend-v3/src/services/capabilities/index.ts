/**
 * Capabilities service — CRUD + matching + qualification gating (F-306).
 */

export {
  listCapabilities,
  getCapabilityById,
  createCapability,
  updateCapability,
} from './repository.js';

export {
  matchOpportunityCapabilities,
  getOpportunityCapabilityMatches,
} from './matching.js';

export {
  qualifyWithCapabilities,
} from './qualify.js';

export type {
  Capability,
  CapabilityCreateInput,
  CapabilityUpdateInput,
  CapabilityMatch,
  MatchReason,
  QualifyResult,
  OU,
  EvidenceGrade,
} from './types.js';
