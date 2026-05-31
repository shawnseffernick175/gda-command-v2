/**
 * Fast Track triage worker — F-227.
 *
 * Subscribes to: analysis-fast-track
 * Calls llmRouter.route({ task: 'fast_track_triage', ... }), writes result
 * to fast_track_assessments. On UNIQUE violation (concurrent insert lost
 * race) → ignore. On router error → throw for pg-boss retry.
 */

import type PgBoss from 'pg-boss';
import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { requireBoss, QUEUE_NAMES } from '../lib/queue.js';
import { config } from '../config/index.js';
import {
  fastTrackAssessmentsCompleted,
  fastTrackAssessmentDuration,
} from '../lib/metrics.js';
import type {
  FastTrackTriageInput,
  FastTrackTriageOutput,
  SourceChip,
} from '../lib/llm-router.types.js';

export interface FastTrackJobData {
  input_hash: string;
  input: FastTrackTriageInput;
  analysis_version: string;
  requestId: string;
}

export async function subscribeFastTrack(): Promise<void> {
  const boss = requireBoss();

  await boss.work<FastTrackJobData>(
    QUEUE_NAMES.ANALYSIS_FAST_TRACK,
    { batchSize: 1 },
    async (jobs: PgBoss.Job<FastTrackJobData>[]) => {
      for (const job of jobs) {
        const { input_hash, input, analysis_version, requestId } = job.data;
        const start = Date.now();

        logger.info(
          { requestId, input_hash, task: 'fast_track_triage' },
          'Fast track worker processing job',
        );

        try {
          const { llmRouter } = await import('../lib/llm-router.js');
          const result = await llmRouter.route({
            task: 'fast_track_triage',
            input,
            opts: { disable_router_retry: true },
          });

          if (!result.ok) {
            throw new Error(`Router error: ${result.error_kind} — ${result.error_message}`);
          }

          const output = result.output as FastTrackTriageOutput;
          const sourceChips: SourceChip[] = (result.output as unknown as { source_chips?: SourceChip[] }).source_chips ?? [];

          await pool.query(
            `INSERT INTO fast_track_assessments
               (input_hash, title, description, naics_codes, set_aside, place_of_performance,
                grade, rationale, naics_match_score, recommended_action,
                source_chips, model_used, analysis_version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (input_hash, analysis_version) DO NOTHING`,
            [
              input_hash,
              input.title,
              input.description,
              input.naics_codes,
              input.set_aside,
              input.place_of_performance,
              output.grade,
              output.rationale,
              output.naics_match_score,
              output.recommended_action,
              JSON.stringify(sourceChips),
              result.model_used,
              analysis_version,
            ],
          );

          const durationS = (Date.now() - start) / 1000;
          fastTrackAssessmentsCompleted.inc({
            grade: output.grade,
            recommended_action: output.recommended_action,
          });
          fastTrackAssessmentDuration.observe(durationS);

          logger.info(
            { requestId, input_hash, grade: output.grade, durationMs: Date.now() - start },
            'Fast track assessment complete',
          );
        } catch (err) {
          logger.error({ err, requestId, input_hash }, 'Fast track worker failed');
          throw err;
        }
      }
    },
  );

  logger.info('Fast track worker subscribed to analysis-fast-track queue');
}
