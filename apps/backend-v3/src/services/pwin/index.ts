/**
 * PWin service — feature computation, scoring, model management, training.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { scoreV1Rules } from './rules-scorer.js';
import type {
  PwinFeatures,
  PwinFeatureRow,
  PwinModelVersionRow,
  PwinScoreResult,
  PwinModelInfo,
  RetrainResult,
} from './types.js';

export { scoreV1Rules } from './rules-scorer.js';
export { resolveSizeStatus, NAICS_SIZE_STANDARDS, ENVISION_EMPLOYEE_COUNT, ENVISION_AVG_ANNUAL_RECEIPTS_M } from './naics-size-standards.js';
export type { SbaStandardType, NaicsSizeStandard, SizeStatusResult } from './naics-size-standards.js';
export { FORECAST_PROMOTION_THRESHOLD, recommendStatus } from './promotion.js';
export type {
  PwinFeatures,
  PwinFeatureRow,
  PwinModelVersionRow,
  PwinScoreResult,
  PwinModelInfo,
  RetrainResult,
} from './types.js';

/** Save a feature snapshot for an opportunity. */
export async function saveFeatureSnapshot(
  opportunityId: string,
  features: PwinFeatures,
): Promise<PwinFeatureRow> {
  const res = await pool.query<PwinFeatureRow>(
    `INSERT INTO pwin_features (opportunity_id, features)
     VALUES ($1, $2)
     RETURNING *`,
    [opportunityId, JSON.stringify(features)],
  );
  return res.rows[0]!;
}

/** Get the latest feature snapshot for an opportunity. */
export async function getLatestFeatures(
  opportunityId: string,
): Promise<PwinFeatureRow | null> {
  const res = await pool.query<PwinFeatureRow>(
    `SELECT * FROM pwin_features
     WHERE opportunity_id = $1
     ORDER BY computed_at DESC
     LIMIT 1`,
    [opportunityId],
  );
  return res.rows[0] ?? null;
}

/** Get the currently active model version. */
export async function getActiveModel(): Promise<PwinModelVersionRow | null> {
  const res = await pool.query<PwinModelVersionRow>(
    'SELECT * FROM pwin_model_versions WHERE is_active = TRUE LIMIT 1',
  );
  return res.rows[0] ?? null;
}

/** Get model info summary. */
export async function getModelInfo(): Promise<PwinModelInfo | null> {
  const model = await getActiveModel();
  if (!model) return null;
  return {
    active_version: model.version,
    model_kind: model.model_kind,
    trained_at: model.trained_at,
    trained_on_outcomes_count: model.trained_on_outcomes_count,
    metrics: model.metrics,
  };
}

/** Score an opportunity using the active model. */
export async function scoreOpportunity(
  opportunityId: string,
  providedFeatures?: PwinFeatures,
): Promise<PwinScoreResult> {
  const model = await getActiveModel();
  if (!model) {
    throw new Error('No active PWin model found');
  }

  let features = providedFeatures;
  if (!features) {
    const snapshot = await getLatestFeatures(opportunityId);
    if (!snapshot) {
      throw new Error(`No feature snapshot found for opportunity ${opportunityId}. Compute features first via POST /pwin/features.`);
    }
    features = snapshot.features;
  }

  if (model.model_kind === 'rules') {
    return scoreV1Rules(features, model.version);
  }

  // v2 logistic and v3 xgboost use the same interface
  // In-container ML models would be loaded from model_blob and run here.
  // For now, fall back to rules scorer with a note.
  logger.warn(
    { model_kind: model.model_kind, version: model.version },
    'ML model scoring not yet implemented in-process; falling back to rules',
  );
  return scoreV1Rules(features, model.version);
}

/** Count resolved outcomes available for training. */
export async function countResolvedOutcomes(): Promise<number> {
  const res = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM pwin_outcomes',
  );
  return parseInt(res.rows[0]!.count, 10);
}

/** Get all training data (features + outcomes). */
export async function getTrainingData(): Promise<Array<{
  features: PwinFeatures;
  outcome: string;
  outcome_value: number | null;
}>> {
  const res = await pool.query<{
    features: PwinFeatures;
    outcome: string;
    outcome_value: number | null;
  }>(
    `SELECT f.features, o.outcome, o.outcome_value
     FROM pwin_outcomes o
     JOIN pwin_features f ON f.id = o.feature_snapshot_id
     ORDER BY o.recorded_at ASC`,
  );
  return res.rows;
}

/**
 * Check whether enough resolved outcomes exist to (re)train a data-driven
 * model and, if so, record the readiness with the REAL counts we have.
 *
 * Real ML training (logistic / xgboost) is not implemented in-process yet.
 * This function deliberately does NOT fabricate model-quality metrics
 * (AUC / accuracy / calibration) and NEVER auto-promotes a model. Doing so
 * would surface unsupported numbers (R1) and could silently swap the active
 * scorer on invented evidence. It records a non-active readiness marker with
 * only measured facts (outcome/win/loss counts); promotion of any real model
 * is an explicit, human-reviewed step.
 */
export async function trainIfReady(): Promise<RetrainResult | null> {
  const outcomeCount = await countResolvedOutcomes();

  if (outcomeCount < 20) {
    logger.info({ outcomeCount }, '[pwin] Not enough outcomes for ML training (<20)');
    return null;
  }

  const modelKind = outcomeCount >= 100 ? 'xgboost' : 'logistic';
  const dateStr = new Date().toISOString().slice(0, 10);
  const newVersion = `${modelKind === 'xgboost' ? 'v3-xgb' : 'v2-logistic'}-ready-${dateStr}`;

  // Only record the readiness marker once per day.
  const existingCheck = await pool.query<{ id: string }>(
    'SELECT id FROM pwin_model_versions WHERE version = $1',
    [newVersion],
  );
  if (existingCheck.rows.length > 0) {
    logger.info({ version: newVersion }, '[pwin] Readiness already recorded today, skipping');
    return null;
  }

  const trainingData = await getTrainingData();
  const winCount = trainingData.filter((d) => d.outcome === 'won').length;
  const lossCount = trainingData.filter((d) => d.outcome === 'lost').length;

  // Only measured facts — no fabricated quality metrics.
  const metrics = {
    training_samples: trainingData.length,
    win_count: winCount,
    loss_count: lossCount,
  };

  // Record a NON-active readiness marker. Never auto-promote.
  await pool.query(
    `INSERT INTO pwin_model_versions (
      version, model_kind, trained_on_outcomes_count,
      feature_schema, metrics, is_active, notes
    ) VALUES ($1, $2, $3, $4, $5, FALSE, $6)`,
    [
      newVersion,
      modelKind,
      outcomeCount,
      JSON.stringify({}),
      JSON.stringify(metrics),
      `Training data ready (${outcomeCount} outcomes: ${winCount} won / ${lossCount} lost). ` +
        `In-process ${modelKind} training is not implemented; no model was fit and none was promoted. ` +
        `Promotion of a real trained model is a separate, human-reviewed step.`,
    ],
  );

  logger.info(
    { version: newVersion, metrics, modelKind },
    '[pwin] Training-readiness recorded (no model fit, no auto-promotion)',
  );

  return {
    new_version: newVersion,
    promoted: false,
    metrics,
  };
}

/** List all model versions. */
export async function listModelVersions(): Promise<PwinModelVersionRow[]> {
  const res = await pool.query<PwinModelVersionRow>(
    'SELECT id, version, model_kind, trained_at, trained_on_outcomes_count, feature_schema, rules_config, metrics, is_active, notes FROM pwin_model_versions ORDER BY trained_at DESC',
  );
  return res.rows;
}
