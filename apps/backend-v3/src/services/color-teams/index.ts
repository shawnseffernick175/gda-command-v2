/**
 * Color Team Review service.
 *
 * Manages document uploads, color team run lifecycle, and finding persistence.
 * Agent execution stubs F-300 runtime until the Cognition Layer ships.
 */

import type { Pool as PgPool } from 'pg';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type {
  ColorTeamColor,
  ColorTeamRunRow,
  ColorTeamFindingRow,
  DocumentRow,
  Citation,
  DoctrineScoreRow,
  MarginCheck,
  PricingStrategy,
  FindingSeverity,
} from './types.js';
import { isValidColor, COLOR_TEAM_COLORS } from './types.js';
import { runColorTeamAnalysis } from './runtime.js';

// ─── Feature flag ───────────────────────────────────────────────────────────

export async function isColorTeamEnabled(pool: PgPool): Promise<boolean> {
  try {
    const res = await pool.query<{ enabled: boolean }>(
      "SELECT enabled FROM feature_flags WHERE flag_name = 'color_team_reviews_v1'"
    );
    return res.rows[0]?.enabled ?? false;
  } catch {
    return false;
  }
}

// ─── Documents ──────────────────────────────────────────────────────────────

export async function insertDocument(
  pool: PgPool,
  doc: {
    filename: string;
    mime_type: string;
    file_size_bytes: number | null;
    doc_type: string;
    storage_path: string;
    uploaded_by: string;
    opportunity_id?: string | null;
  }
): Promise<DocumentRow> {
  const res = await pool.query<DocumentRow>(
    `INSERT INTO documents (filename, mime_type, file_size_bytes, doc_type, storage_path, uploaded_by, opportunity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      doc.filename,
      doc.mime_type,
      doc.file_size_bytes,
      doc.doc_type,
      doc.storage_path,
      doc.uploaded_by,
      doc.opportunity_id ?? null,
    ]
  );
  return res.rows[0]!;
}

export async function getDocument(pool: PgPool, id: string): Promise<DocumentRow | null> {
  const res = await pool.query<DocumentRow>(
    'SELECT * FROM documents WHERE id = $1',
    [id]
  );
  return res.rows[0] ?? null;
}

export async function listDocuments(
  pool: PgPool,
  opts: { uploadedBy?: string; limit?: number; offset?: number }
): Promise<{ items: DocumentRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.uploadedBy) {
    conditions.push(`uploaded_by = $${idx++}`);
    params.push(opts.uploadedBy);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await pool.query<{ count: string }>(`SELECT count(*) FROM documents ${where}`, params);
  const total = parseInt(countRes.rows[0]!.count, 10);

  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const dataRes = await pool.query<DocumentRow>(
    `SELECT * FROM documents ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return { items: dataRes.rows, total };
}

// ─── Runs ───────────────────────────────────────────────────────────────────

export async function createRun(
  pool: PgPool,
  opts: {
    document_id: string;
    colors: ColorTeamColor[];
    triggered_by: string;
    linked_rfp_id?: string | null;
  }
): Promise<ColorTeamRunRow> {
  const res = await pool.query<ColorTeamRunRow>(
    `INSERT INTO color_team_runs (document_id, colors, triggered_by, linked_rfp_id, status)
     VALUES ($1, $2, $3, $4, 'queued')
     RETURNING *`,
    [opts.document_id, opts.colors, opts.triggered_by, opts.linked_rfp_id ?? null]
  );
  return res.rows[0]!;
}

export async function getRun(pool: PgPool, runId: string): Promise<ColorTeamRunRow | null> {
  const res = await pool.query<ColorTeamRunRow>(
    'SELECT * FROM color_team_runs WHERE id = $1',
    [runId]
  );
  return res.rows[0] ?? null;
}

export async function listRunsForDocument(
  pool: PgPool,
  documentId: string
): Promise<ColorTeamRunRow[]> {
  const res = await pool.query<ColorTeamRunRow>(
    'SELECT * FROM color_team_runs WHERE document_id = $1 ORDER BY created_at DESC',
    [documentId]
  );
  return res.rows;
}

export async function updateRunStatus(
  pool: PgPool,
  runId: string,
  status: string,
  errorMessage?: string | null
): Promise<void> {
  const completedAt = status === 'complete' || status === 'error' ? 'NOW()' : 'NULL';
  await pool.query(
    `UPDATE color_team_runs SET status = $1, error_message = $2, completed_at = ${completedAt} WHERE id = $3`,
    [status, errorMessage ?? null, runId]
  );
}

// ─── Findings ───────────────────────────────────────────────────────────────

export async function insertFinding(
  pool: PgPool,
  finding: {
    run_id: string;
    color: ColorTeamColor;
    severity: FindingSeverity;
    section_ref?: string | null;
    finding: string;
    recommended_fix?: string | null;
    citations?: Citation[];
    doctrine_score?: DoctrineScoreRow[] | null;
    exclusion_hits?: string[] | null;
    margin_check?: MarginCheck | null;
    pricing_strategy?: PricingStrategy | null;
  }
): Promise<ColorTeamFindingRow> {
  const res = await pool.query<ColorTeamFindingRow>(
    `INSERT INTO color_team_findings
     (run_id, color, severity, section_ref, finding, recommended_fix, citations, doctrine_score, exclusion_hits, margin_check, pricing_strategy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      finding.run_id,
      finding.color,
      finding.severity,
      finding.section_ref ?? null,
      finding.finding,
      finding.recommended_fix ?? null,
      JSON.stringify(finding.citations ?? []),
      finding.doctrine_score ? JSON.stringify(finding.doctrine_score) : null,
      finding.exclusion_hits ?? null,
      finding.margin_check ? JSON.stringify(finding.margin_check) : null,
      finding.pricing_strategy ? JSON.stringify(finding.pricing_strategy) : null,
    ]
  );
  return res.rows[0]!;
}

export async function getFindings(
  pool: PgPool,
  runId: string,
  color?: string
): Promise<ColorTeamFindingRow[]> {
  if (color) {
    const res = await pool.query<ColorTeamFindingRow>(
      'SELECT * FROM color_team_findings WHERE run_id = $1 AND color = $2 ORDER BY created_at',
      [runId, color]
    );
    return res.rows;
  }
  const res = await pool.query<ColorTeamFindingRow>(
    'SELECT * FROM color_team_findings WHERE run_id = $1 ORDER BY color, created_at',
    [runId]
  );
  return res.rows;
}

export async function getFindingById(
  pool: PgPool,
  findingId: string
): Promise<ColorTeamFindingRow | null> {
  const res = await pool.query<ColorTeamFindingRow>(
    'SELECT * FROM color_team_findings WHERE id = $1',
    [findingId]
  );
  return res.rows[0] ?? null;
}

export async function linkFindingToActionItem(
  pool: PgPool,
  findingId: string,
  actionItemId: string
): Promise<void> {
  await pool.query(
    'UPDATE color_team_findings SET action_item_id = $1 WHERE id = $2',
    [actionItemId, findingId]
  );
}

// ─── Diff ───────────────────────────────────────────────────────────────────

export interface DiffResult {
  new_findings: ColorTeamFindingRow[];
  resolved_findings: ColorTeamFindingRow[];
  regressed_findings: ColorTeamFindingRow[];
  unchanged_findings: ColorTeamFindingRow[];
}

export async function diffRuns(
  pool: PgPool,
  currentRunId: string,
  priorRunId: string
): Promise<DiffResult> {
  const current = await getFindings(pool, currentRunId);
  const prior = await getFindings(pool, priorRunId);

  const priorFingerprints = new Map<string, ColorTeamFindingRow>();
  for (const f of prior) {
    priorFingerprints.set(`${f.color}:${f.section_ref ?? ''}:${f.finding}`, f);
  }

  const currentFingerprints = new Set<string>();
  const newFindings: ColorTeamFindingRow[] = [];
  const unchanged: ColorTeamFindingRow[] = [];
  const regressed: ColorTeamFindingRow[] = [];

  for (const f of current) {
    const key = `${f.color}:${f.section_ref ?? ''}:${f.finding}`;
    currentFingerprints.add(key);

    const priorMatch = priorFingerprints.get(key);
    if (!priorMatch) {
      newFindings.push(f);
    } else if (severityRank(f.severity) > severityRank(priorMatch.severity)) {
      regressed.push(f);
    } else {
      unchanged.push(f);
    }
  }

  const resolved = prior.filter((f) => {
    const key = `${f.color}:${f.section_ref ?? ''}:${f.finding}`;
    return !currentFingerprints.has(key);
  });

  return {
    new_findings: newFindings,
    resolved_findings: resolved,
    regressed_findings: regressed,
    unchanged_findings: unchanged,
  };
}

function severityRank(s: string): number {
  const ranks: Record<string, number> = { info: 0, warning: 1, critical: 2, blocker: 3 };
  return ranks[s] ?? 0;
}

// ─── Run counts ─────────────────────────────────────────────────────────────

interface ColorCount {
  color: string;
  count: number;
}

export async function getRunFindingCounts(
  pool: PgPool,
  runId: string
): Promise<ColorCount[]> {
  const res = await pool.query<{ color: string; count: string }>(
    `SELECT color, count(*)::text FROM color_team_findings WHERE run_id = $1 GROUP BY color ORDER BY color`,
    [runId]
  );
  return res.rows.map((r) => ({ color: r.color, count: parseInt(r.count, 10) }));
}

// ─── Agent runner ───────────────────────────────────────────────────────────

/**
 * Execute a color team run. Real analysis is provided by the F-300 Agent
 * Runtime. Until that ships, we must NOT fabricate findings (invented margins,
 * doctrine scores, exclusion codes, placeholder citations) that look real —
 * doing so violates R1 (every data point must have a searchable source) and
 * risks executive decisions on fake numbers. When the runtime is unavailable
 * the run terminates in an honest `error` state with no findings.
 */
export async function executeColorTeamRun(
  pool: PgPool,
  runId: string
): Promise<void> {
  const run = await getRun(pool, runId);
  if (!run) {
    logger.warn({ runId }, 'Color team run not found');
    return;
  }

  if (!config.colorTeamAgentRuntimeEnabled) {
    logger.warn({ runId }, 'Color team run requested but F-300 Agent Runtime is not enabled');
    await updateRunStatus(
      pool,
      runId,
      'error',
      'Color Team analysis is not yet available — the F-300 Agent Runtime is not enabled. ' +
        'No findings were generated (findings are never fabricated).'
    );
    return;
  }

  await updateRunStatus(pool, runId, 'running');

  try {
    const drafts = await runColorTeamAnalysis(pool, run);
    for (const draft of drafts) {
      await insertFinding(pool, { run_id: runId, ...draft });
    }
    await updateRunStatus(pool, runId, 'complete');
    logger.info({ runId, findings: drafts.length }, 'Color team run complete');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err, runId }, 'Color team run failed');
    await updateRunStatus(pool, runId, 'error', msg);
  }
}

export { isValidColor, COLOR_TEAM_COLORS };
export type { ColorTeamColor, ColorTeamRunRow, ColorTeamFindingRow, DocumentRow };
