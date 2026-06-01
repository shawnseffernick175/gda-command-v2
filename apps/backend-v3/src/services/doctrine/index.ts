/**
 * Doctrine Rules Engine — service layer.
 * Encodes AJ's 8 Principles, 6 Strategic Exclusions, 8% margin floor,
 * and Evidence A/B/C rubric as enforceable rules.
 */

export { getPrinciples, getExclusions, getConfig, updateConfig } from './config.js';
export {
  runDoctrineCheck,
  getEvaluationHistory,
  type DoctrineEvaluation,
  type PrincipleScore,
  type ExclusionResult,
  type MarginCheck,
} from './evaluate.js';
