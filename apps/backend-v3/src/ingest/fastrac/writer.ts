/**
 * FasTrac signal writer — upserts normalized signals into fast_track_signals
 * with dedup on source_url. Returns insert/update/error counts.
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { FasTracSignal } from './types.js';

export interface WriteResult {
  inserted: number;
  updated: number;
  errors: number;
}

/**
 * Upsert a batch of signals. Dedup by source_url (unique index).
 * On conflict: update title, mission_tags, ingested_at if changed.
 */
export async function upsertSignals(signals: FasTracSignal[]): Promise<WriteResult> {
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const sig of signals) {
    try {
      const result = await pool.query(
        `INSERT INTO fast_track_signals
           (pipeline, source, title, summary, mission_tags, horizon,
            signal_strength, source_url, published_at, ingested_at,
            funding_mechanism, institution_type, signal_type)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12)
         ON CONFLICT (source_url) WHERE source_url IS NOT NULL
         DO UPDATE SET
           title = EXCLUDED.title,
           mission_tags = EXCLUDED.mission_tags,
           ingested_at = NOW(),
           summary = COALESCE(EXCLUDED.summary, fast_track_signals.summary),
           signal_type = COALESCE(EXCLUDED.signal_type, fast_track_signals.signal_type),
           institution_type = COALESCE(EXCLUDED.institution_type, fast_track_signals.institution_type),
           funding_mechanism = COALESCE(EXCLUDED.funding_mechanism, fast_track_signals.funding_mechanism)
         RETURNING (xmax = 0) AS is_insert`,
        [
          'requirement',
          sig.source,
          sig.title,
          sig.summary,
          sig.mission_tags,
          sig.horizon,
          3, // default signal_strength
          sig.source_url,
          sig.published_at,
          sig.funding_mechanism,
          sig.institution_type,
          sig.signal_type,
        ],
      );

      if (result.rows[0]?.is_insert) {
        inserted++;
      } else {
        updated++;
      }
    } catch (err) {
      errors++;
      logger.error(
        {
          source: sig.source,
          url: sig.source_url,
          error: err instanceof Error ? err.message : String(err),
        },
        'fastrac_signal_write_error',
      );
    }
  }

  return { inserted, updated, errors };
}
