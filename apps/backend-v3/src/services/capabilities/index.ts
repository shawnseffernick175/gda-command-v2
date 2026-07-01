/**
 * Capabilities service — CRUD + matching + qualification logic.
 *
 * OU3 (Envision) catalog is the only qualification gate.
 * OU1 (PD Systems) and OU2 (Riverstone) are read-only teaming context.
 */

export {
  listCapabilities,
  getCapability,
  createCapability,
  updateCapability,
  type Capability,
  type CapabilityCreateInput,
  type CapabilityUpdateInput,
} from './crud.js';

export {
  getOpportunityCapabilityMatches,
  computeCapabilityMatches,
  type CapabilityMatch,
} from './matching.js';

export {
  checkQualification,
  type QualificationResult,
} from './qualify.js';
