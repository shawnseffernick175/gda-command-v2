#!/usr/bin/env tsx
/**
 * Backfill validator replay — runs validateAndRecompute + rejectReason over
 * every existing opportunity row and (§13 addendum) re-evaluates relevance
 * against the current 18-code NAICS allowlist.
 *
 * Modes:
 *   --dry-run (default): computes diffs, writes report, no DB changes.
 *   --apply:             commits normalized values + quarantine/relevance updates.
 *
 * Usage:
 *   npm run --workspace=apps/backend-v3 backfill:validate-opps
 *   npm run --workspace=apps/backend-v3 backfill:validate-opps -- --apply
 */

import { validateAndRecompute, rejectReason, type OpportunityValidationFields } from '../src/ingest/framework/opportunity_validation.js';
import { evaluateRelevance } from '../src/constants/relevance.js';
import { pool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import fs from 'node:fs';
import path from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OpportunityRow {
  id: number;
  title: string;
  description: string | null;
  agency: string | null;
  agency_name: string | null;
  department_name: string | null;
  office: string | null;
  naics: string | null;
  set_aside: string | null;
  value_min: string | null;  // numeric comes as string from pg
  value_max: string | null;
  response_due_at: string | null;
  posted_at: string | null;
  tags: string[];
  data_source: string;
  sam_notice_id: string | null;
  external_id: string | null;
  relevance_status: string | null;
  relevance_reason: string | null;
}

interface RowDiff {
  opportunity_id: number;
  rules_fired: string[];
  changes: Record<string, { old: unknown; new: unknown }>;
  reject_reason: string | null;
  preserved_due_to_pipeline: boolean;
  relevance_change?: { old_status: string | null; new_status: string; old_reason: string | null; new_reason: string };
}

interface BackfillReport {
  started_at: string;
  ended_at: string;
  mode: 'dry-run' | 'apply';
  total_rows_scanned: number;
  rows_unchanged: number;
  rows_data_normalized: number;
  rows_quarantined: number;
  rows_skipped_quarantine_due_to_pipeline: number;
  rows_relevance_changed: number;
  rule_breakdown: {
    R1_due_before_posted_nulled: number;
    R2_due_10y_out_nulled: number;
    R3_posted_7d_future_nulled: number;
    R4_value_swapped: number;
    R5_value_out_of_range_nulled: number;
    R6_bad_naics_nulled: number;
    R7_agency_fallback_filled: number;
    R8_set_aside_trimmed: number;
    X1_no_title_no_description: number;
    X2_stale_junk: number;
  };
  relevance_breakdown: {
    off_profile_to_relevant: number;
    off_profile_to_auto_pass: number;
    unknown_naics_to_relevant: number;
    relevant_to_off_profile: number;
    relevant_to_auto_pass: number;
    skipped_due_to_pipeline: number;
    skipped_due_to_quarantine: number;
  };
  sample_diffs: RowDiff[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function numOrNull(v: string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Attribute which rule(s) fired based on field changes.
 */
function attributeRules(
  original: OpportunityRow,
  validated: OpportunityValidationFields,
): string[] {
  const rules: string[] = [];

  const origDue = isoOrNull(original.response_due_at);
  const newDue = validated.response_due_at;
  if (origDue !== null && newDue === null) {
    // Due was nulled — determine why
    const origPosted = isoOrNull(original.posted_at);
    if (origPosted !== null && new Date(origDue).getTime() < new Date(origPosted).getTime()) {
      rules.push('R1');
    } else {
      // Check if it was >10y out
      const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
      if (new Date(origDue).getTime() > Date.now() + TEN_YEARS_MS) {
        rules.push('R2');
      } else {
        rules.push('R1'); // fallback — posted was also nulled by R3
      }
    }
  }

  const origPosted = isoOrNull(original.posted_at);
  const newPosted = validated.posted_at;
  if (origPosted !== null && newPosted === null) {
    rules.push('R3');
  }

  const origMin = numOrNull(original.value_min);
  const origMax = numOrNull(original.value_max);
  const newMin = validated.value_min;
  const newMax = validated.value_max;
  if (origMin !== newMin || origMax !== newMax) {
    if (newMin === null && newMax === null && (origMin !== null || origMax !== null)) {
      rules.push('R5');
    } else if (origMin !== null && origMax !== null && origMin > origMax && newMin === origMax && newMax === origMin) {
      rules.push('R4');
    } else if (origMin !== newMin || origMax !== newMax) {
      // Swapped or out of range
      if (newMin !== null && newMax !== null && origMin !== null && origMax !== null && origMin > origMax) {
        rules.push('R4');
      } else {
        rules.push('R5');
      }
    }
  }

  if (original.naics !== validated.naics) {
    rules.push('R6');
  }

  if ((!original.agency || original.agency.trim() === '') && validated.agency && validated.agency.trim() !== '') {
    rules.push('R7');
  }

  if (original.set_aside !== validated.set_aside && validated.set_aside !== null) {
    rules.push('R8');
  }

  return rules;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = !isApply;

  const startedAt = new Date().toISOString();
  logger.info({ isApply, startedAt }, 'backfill: starting');

  // Report accumulators
  const report: BackfillReport = {
    started_at: startedAt,
    ended_at: '',
    mode: isDryRun ? 'dry-run' : 'apply',
    total_rows_scanned: 0,
    rows_unchanged: 0,
    rows_data_normalized: 0,
    rows_quarantined: 0,
    rows_skipped_quarantine_due_to_pipeline: 0,
    rows_relevance_changed: 0,
    rule_breakdown: {
      R1_due_before_posted_nulled: 0,
      R2_due_10y_out_nulled: 0,
      R3_posted_7d_future_nulled: 0,
      R4_value_swapped: 0,
      R5_value_out_of_range_nulled: 0,
      R6_bad_naics_nulled: 0,
      R7_agency_fallback_filled: 0,
      R8_set_aside_trimmed: 0,
      X1_no_title_no_description: 0,
      X2_stale_junk: 0,
    },
    relevance_breakdown: {
      off_profile_to_relevant: 0,
      off_profile_to_auto_pass: 0,
      unknown_naics_to_relevant: 0,
      relevant_to_off_profile: 0,
      relevant_to_auto_pass: 0,
      skipped_due_to_pipeline: 0,
      skipped_due_to_quarantine: 0,
    },
    sample_diffs: [],
  };

  // Sample buckets for §8 + addendum
  const sampleBuckets: Record<string, RowDiff[]> = {
    R1: [], R6: [], R7: [], X1: [], relevance_change: [],
  };
  const SAMPLE_MAX = 5;

  // Get total count
  const countRes = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM opportunities WHERE deleted_at IS NULL',
  );
  const totalRows: number = countRes.rows[0].cnt;
  logger.info({ totalRows }, 'backfill: total active rows');

  let lastId = 0;
  let scanned = 0;

  while (true) {
    const batchRes = await pool.query<OpportunityRow>(
      `SELECT id, title, description, agency, agency_name, department_name, office,
              naics, set_aside, value_min::text, value_max::text,
              response_due_at::text, posted_at::text,
              tags, data_source, sam_notice_id, external_id,
              relevance_status, relevance_reason
       FROM opportunities
       WHERE deleted_at IS NULL AND id > $1
       ORDER BY id
       LIMIT $2`,
      [lastId, BATCH_SIZE],
    );

    if (batchRes.rows.length === 0) break;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updates: Array<{ id: number; sets: string[]; values: unknown[]; diff: RowDiff }> = [];

      for (const row of batchRes.rows) {
        scanned++;
        lastId = row.id;

        // Construct input for validator
        const input: OpportunityValidationFields = {
          title: row.title,
          description: row.description,
          data_source: row.data_source,
          agency: row.agency,
          agency_name: row.agency_name,
          department_name: row.department_name,
          office: row.office,
          naics: row.naics,
          set_aside: row.set_aside,
          value_min: numOrNull(row.value_min),
          value_max: numOrNull(row.value_max),
          response_due_at: isoOrNull(row.response_due_at),
          posted_at: isoOrNull(row.posted_at),
          tags: row.tags ?? [],
          sam_notice_id: row.sam_notice_id ?? undefined,
          external_id: row.external_id ?? undefined,
        };

        // Layer 2: validateAndRecompute
        const validated = validateAndRecompute(input);
        // Layer 3: rejectReason
        const xReason = rejectReason(validated);

        // Check pipeline protection
        const pipelineRes = await client.query(
          'SELECT 1 FROM pipeline_items WHERE opportunity_id = $1 LIMIT 1',
          [row.id],
        );
        const hasInPipeline = pipelineRes.rows.length > 0;

        // §13: Re-evaluate relevance
        const newRelevance = evaluateRelevance({
          naics: validated.naics,
          set_aside: validated.set_aside,
          response_due_at: validated.response_due_at,
        });

        const wouldRelevanceChange =
          newRelevance.status !== row.relevance_status ||
          newRelevance.reason !== row.relevance_reason;

        const relevanceChanged = (xReason === null) && wouldRelevanceChange;

        // Compute diff
        const rules = attributeRules(row, validated);
        const changes: Record<string, { old: unknown; new: unknown }> = {};

        if (isoOrNull(row.response_due_at) !== validated.response_due_at) {
          changes['response_due_at'] = { old: isoOrNull(row.response_due_at), new: validated.response_due_at };
        }
        if (isoOrNull(row.posted_at) !== validated.posted_at) {
          changes['posted_at'] = { old: isoOrNull(row.posted_at), new: validated.posted_at };
        }
        if (numOrNull(row.value_min) !== validated.value_min) {
          changes['value_min'] = { old: numOrNull(row.value_min), new: validated.value_min };
        }
        if (numOrNull(row.value_max) !== validated.value_max) {
          changes['value_max'] = { old: numOrNull(row.value_max), new: validated.value_max };
        }
        if (row.naics !== validated.naics) {
          changes['naics'] = { old: row.naics, new: validated.naics };
        }
        if (row.agency !== validated.agency) {
          changes['agency'] = { old: row.agency, new: validated.agency };
        }
        if (row.set_aside !== validated.set_aside) {
          changes['set_aside'] = { old: row.set_aside, new: validated.set_aside };
        }
        if (!tagsEqual(row.tags ?? [], validated.tags)) {
          changes['tags'] = { old: row.tags, new: validated.tags };
        }

        const hasDataChanges = Object.keys(changes).length > 0;
        const hasQuarantine = xReason !== null;
        const hasRelevanceChange = relevanceChanged;

        if (!hasDataChanges && !hasQuarantine && !hasRelevanceChange && !wouldRelevanceChange) {
          report.rows_unchanged++;
          continue;
        }

        // Build the diff record
        const diff: RowDiff = {
          opportunity_id: row.id,
          rules_fired: rules,
          changes,
          reject_reason: xReason,
          preserved_due_to_pipeline: false,
        };

        if (hasRelevanceChange) {
          diff.relevance_change = {
            old_status: row.relevance_status,
            new_status: newRelevance.status,
            old_reason: row.relevance_reason,
            new_reason: newRelevance.reason,
          };
        }

        // Count rules
        for (const r of rules) {
          switch (r) {
            case 'R1': report.rule_breakdown.R1_due_before_posted_nulled++; break;
            case 'R2': report.rule_breakdown.R2_due_10y_out_nulled++; break;
            case 'R3': report.rule_breakdown.R3_posted_7d_future_nulled++; break;
            case 'R4': report.rule_breakdown.R4_value_swapped++; break;
            case 'R5': report.rule_breakdown.R5_value_out_of_range_nulled++; break;
            case 'R6': report.rule_breakdown.R6_bad_naics_nulled++; break;
            case 'R7': report.rule_breakdown.R7_agency_fallback_filled++; break;
            case 'R8': report.rule_breakdown.R8_set_aside_trimmed++; break;
          }
        }

        // Count quarantine
        if (hasQuarantine) {
          if (xReason === 'no title and no description') {
            report.rule_breakdown.X1_no_title_no_description++;
          } else {
            report.rule_breakdown.X2_stale_junk++;
          }
        }

        // Build UPDATE sets
        const sets: string[] = [];
        const values: unknown[] = [];
        let paramIdx = 1;

        if (hasDataChanges) {
          report.rows_data_normalized++;
          if (validated.response_due_at !== isoOrNull(row.response_due_at)) {
            sets.push(`response_due_at = $${paramIdx++}`);
            values.push(validated.response_due_at);
          }
          if (validated.posted_at !== isoOrNull(row.posted_at)) {
            sets.push(`posted_at = $${paramIdx++}`);
            values.push(validated.posted_at);
          }
          if (validated.value_min !== numOrNull(row.value_min)) {
            sets.push(`value_min = $${paramIdx++}`);
            values.push(validated.value_min);
          }
          if (validated.value_max !== numOrNull(row.value_max)) {
            sets.push(`value_max = $${paramIdx++}`);
            values.push(validated.value_max);
          }
          if (validated.naics !== row.naics) {
            sets.push(`naics = $${paramIdx++}`);
            values.push(validated.naics);
          }
          if (validated.agency !== row.agency) {
            sets.push(`agency = $${paramIdx++}`);
            values.push(validated.agency);
          }
          if (validated.set_aside !== row.set_aside) {
            sets.push(`set_aside = $${paramIdx++}`);
            values.push(validated.set_aside);
          }
          if (!tagsEqual(row.tags ?? [], validated.tags)) {
            sets.push(`tags = $${paramIdx++}`);
            values.push(validated.tags);
          }
        }

        // Quarantine logic
        if (hasQuarantine && !hasInPipeline) {
          sets.push(`relevance_status = $${paramIdx++}`);
          values.push('rejected');
          sets.push(`relevance_reason = $${paramIdx++}`);
          values.push(xReason);
          report.rows_quarantined++;
        } else if (hasQuarantine && hasInPipeline) {
          diff.preserved_due_to_pipeline = true;
          report.rows_skipped_quarantine_due_to_pipeline++;
          logger.warn(
            { opportunity_id: row.id, reject_reason: xReason },
            'backfill: quarantine skipped due to pipeline protection',
          );
        }

        // §13: Relevance re-scoring
        if (hasRelevanceChange && !hasInPipeline && !hasQuarantine) {
          sets.push(`relevance_status = $${paramIdx++}`);
          values.push(newRelevance.status);
          sets.push(`relevance_reason = $${paramIdx++}`);
          values.push(newRelevance.reason);
          report.rows_relevance_changed++;

          // Count relevance breakdown
          const oldStatus = row.relevance_status;
          const newStatus = newRelevance.status;
          if (oldStatus === 'off_profile' && newStatus === 'relevant') {
            report.relevance_breakdown.off_profile_to_relevant++;
          } else if (oldStatus === 'off_profile' && newStatus === 'auto_pass') {
            report.relevance_breakdown.off_profile_to_auto_pass++;
          } else if (oldStatus === 'unknown_naics' && newStatus === 'relevant') {
            report.relevance_breakdown.unknown_naics_to_relevant++;
          } else if (oldStatus === 'relevant' && newStatus === 'off_profile') {
            report.relevance_breakdown.relevant_to_off_profile++;
          } else if (oldStatus === 'relevant' && newStatus === 'auto_pass') {
            report.relevance_breakdown.relevant_to_auto_pass++;
          }
        } else if (hasRelevanceChange && hasInPipeline) {
          diff.preserved_due_to_pipeline = true;
          report.relevance_breakdown.skipped_due_to_pipeline++;
          logger.warn(
            { opportunity_id: row.id, old_status: row.relevance_status, new_status: newRelevance.status },
            'backfill: relevance change skipped due to pipeline protection',
          );
        } else if (wouldRelevanceChange && hasQuarantine) {
          report.relevance_breakdown.skipped_due_to_quarantine++;
        }

        if (sets.length > 0) {
          sets.push(`updated_at = NOW()`);
          values.push(row.id);
          updates.push({ id: row.id, sets, values, diff });
        } else {
          // Only relevance/quarantine changes that were skipped
          updates.push({ id: row.id, sets: [], values: [], diff });
        }

        // Collect samples
        for (const r of rules) {
          if (sampleBuckets[r] && sampleBuckets[r].length < SAMPLE_MAX) {
            sampleBuckets[r].push(diff);
          }
        }
        if (hasQuarantine && xReason === 'no title and no description' && sampleBuckets['X1'].length < SAMPLE_MAX) {
          sampleBuckets['X1'].push(diff);
        }
        if (hasRelevanceChange && sampleBuckets['relevance_change'].length < SAMPLE_MAX) {
          sampleBuckets['relevance_change'].push(diff);
        }
      }

      // Execute updates
      if (isApply) {
        for (const u of updates) {
          if (u.sets.length === 0) continue;
          const whereIdx = u.values.length;
          const sql = `UPDATE opportunities SET ${u.sets.join(', ')} WHERE id = $${whereIdx}`;
          await client.query(sql, u.values);
        }
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(
        { err: err instanceof Error ? err.message : String(err), lastId },
        'backfill: batch error, rolled back — continuing to next batch',
      );
    } finally {
      client.release();
    }

    if (scanned % 2000 === 0) {
      logger.info({ scanned, totalRows }, 'backfill: progress');
    }
  }

  report.total_rows_scanned = scanned;
  report.ended_at = new Date().toISOString();

  // Assemble sample_diffs (§8 + addendum)
  const samples: RowDiff[] = [];
  for (const key of ['R1', 'R6', 'R7', 'X1', 'relevance_change']) {
    for (const d of sampleBuckets[key] ?? []) {
      if (samples.length < 20 && !samples.some(s => s.opportunity_id === d.opportunity_id)) {
        samples.push(d);
      }
    }
  }
  report.sample_diffs = samples;

  // Write report
  const logsDir = path.resolve(import.meta.dirname, '..', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const reportFileName = `backfill_${startedAt.replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(logsDir, reportFileName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  logger.info(
    {
      mode: report.mode,
      total_rows_scanned: report.total_rows_scanned,
      rows_unchanged: report.rows_unchanged,
      rows_data_normalized: report.rows_data_normalized,
      rows_quarantined: report.rows_quarantined,
      rows_relevance_changed: report.rows_relevance_changed,
      reportPath,
    },
    'backfill: complete',
  );

  await pool.end();
}

main().catch(err => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'backfill: fatal');
  process.exit(1);
});
