/**
 * Lightweight enrichment call logger.
 * Inserts one row per enrichment API call into enrichment_call_log.
 * Fire-and-forget — never blocks the enrichment pipeline.
 */
import { log } from "./logger";

export async function logEnrichmentCall(params: {
  source: string;
  success: boolean;
  error_message?: string | null;
  opportunity_id?: string | null;
  duration_ms?: number | null;
}): Promise<void> {
  try {
    const { getPool } = await import("./db");
    const pool = getPool();
    if (!pool) return;

    await pool.query(
      `INSERT INTO enrichment_call_log (id, source, success, error_message, opportunity_id, duration_ms)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
      [
        params.source,
        params.success,
        params.error_message ?? null,
        params.opportunity_id ?? null,
        params.duration_ms ?? null,
      ],
    );
  } catch (e) {
    log.warn("enrichment_log_write_failed", { error: (e as Error).message });
  }
}
