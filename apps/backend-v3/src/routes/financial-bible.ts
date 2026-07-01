/**
 * Financial Bible routes — Manual upload of PD-SYS 4-file format,
 * version management, rate queries, and pricing scenario builder.
 *
 * Endpoints:
 *   POST   /v3/financial-bible/upload              — multipart 4 xlsx upload → validate → version
 *   GET    /v3/financial-bible/active               — active version metadata + summary
 *   GET    /v3/financial-bible/versions              — all versions (history)
 *   GET    /v3/financial-bible/versions/:id          — single version detail
 *   POST   /v3/financial-bible/activate/:version_id  — promote version to active
 *   GET    /v3/financial-bible/rates                 — query rates from active version
 *   GET    /v3/financial-bible/diff/:id              — diff version against previous
 *   POST   /v3/pricing-scenarios                     — build priced scenario → margin check
 *   GET    /v3/pricing-scenarios                     — list scenarios
 *   GET    /v3/pricing-scenarios/:id                 — single scenario
 */

import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { recordAuditLog } from '../services/audit/audit-log.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MARGIN_FLOOR_PCT = 8; // F-303: 8% margin floor

// ── Expected sheet names per file (PD-SYS format contract) ──────────────────

interface SheetSpec {
  requiredSheets: string[];
  requiredColumns: Record<string, string[]>;
}

const FILE_SPECS: Record<string, SheetSpec> = {
  rates: {
    requiredSheets: ['Rates'],
    requiredColumns: {
      Rates: ['Labor Category', 'Clearance', 'Rate', 'Effective From'],
    },
  },
  indirects: {
    requiredSheets: ['Indirects'],
    requiredColumns: {
      Indirects: ['Contract Type', 'Fringe', 'Overhead', 'G&A', 'Fee Band Low', 'Fee Band High'],
    },
  },
  odcs: {
    requiredSheets: ['ODCs'],
    requiredColumns: {
      ODCs: ['Category', 'Base Year', 'Base Amount', 'Escalation'],
    },
  },
  history: {
    requiredSheets: ['History'],
    requiredColumns: {
      History: ['Pursuit ID', 'Outcome'],
    },
  },
};

// ── XLSX validation helpers ─────────────────────────────────────────────────

interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Record<string, string | number | null>[];
}

async function parseXlsx(buf: Buffer): Promise<ParsedSheet[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf as unknown as ArrayBuffer);

  const sheets: ParsedSheet[] = [];
  for (const worksheet of workbook.worksheets) {
    const headers: string[] = [];
    const rows: Record<string, string | number | null>[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = values.map((v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') {
          const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
          if (typeof o.text === 'string') return o.text;
          if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('');
          if (o.result !== undefined && o.result !== null) return String(o.result);
          return '';
        }
        return typeof v === 'number' ? v : String(v);
      });

      if (rowNumber === 1) {
        for (const c of cells) headers.push(String(c).trim());
      } else {
        const record: Record<string, string | number | null> = {};
        headers.forEach((h, i) => {
          const val = i < cells.length ? cells[i] : null;
          record[h] = val === '' ? null : val;
        });
        rows.push(record);
      }
    });

    sheets.push({ name: worksheet.name, headers, rows });
  }
  return sheets;
}

function validateFile(
  sheets: ParsedSheet[],
  spec: SheetSpec,
  fileLabel: string,
): string[] {
  const errors: string[] = [];
  const sheetNames = sheets.map((s) => s.name);

  for (const req of spec.requiredSheets) {
    // Case-insensitive sheet name matching
    const match = sheets.find((s) => s.name.toLowerCase() === req.toLowerCase());
    if (!match) {
      errors.push(`${fileLabel}: missing required sheet "${req}" (found: ${sheetNames.join(', ') || 'none'})`);
      continue;
    }
    const requiredCols = spec.requiredColumns[req] ?? [];
    const headerLower = match.headers.map((h) => h.toLowerCase());
    for (const col of requiredCols) {
      if (!headerLower.includes(col.toLowerCase())) {
        errors.push(`${fileLabel}/${match.name}: missing required column "${col}"`);
      }
    }
  }
  return errors;
}

// ── Helpers to find column index case-insensitively ─────────────────────────

function getCol(row: Record<string, string | number | null>, name: string): string | number | null {
  // Exact match first
  if (name in row) return row[name];
  // Case-insensitive fallback
  const key = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? row[key] : null;
}

function toNumber(v: string | number | null): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function toDateStr(v: string | number | null): string | null {
  if (!v) return null;
  if (typeof v === 'number') {
    // Excel serial date
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().split('T')[0];
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

// ── Route registration ──────────────────────────────────────────────────────

export async function financialBibleRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_SIZE },
    attachFieldsToBody: false,
  });

  // ── POST /v3/financial-bible/upload ──────────────────────────────────────
  app.post('/v3/financial-bible/upload', async (req, reply) => {
    const parts = req.parts();
    const files: Record<string, { buf: Buffer; filename: string }> = {};
    let notes = '';
    let formatVersion = '1.0';

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk as Buffer);
        }
        const buf = Buffer.concat(chunks);
        // Map field names to file types
        const fieldName = part.fieldname.toLowerCase();
        if (fieldName.includes('rate')) files['rates'] = { buf, filename: part.filename };
        else if (fieldName.includes('indirect')) files['indirects'] = { buf, filename: part.filename };
        else if (fieldName.includes('odc') || fieldName.includes('escalation')) files['odcs'] = { buf, filename: part.filename };
        else if (fieldName.includes('history') || fieldName.includes('priced')) files['history'] = { buf, filename: part.filename };
        else {
          // Try to match by filename
          const fn = part.filename.toLowerCase();
          if (fn.includes('rate') || fn.startsWith('01')) files['rates'] = { buf, filename: part.filename };
          else if (fn.includes('indirect') || fn.startsWith('02')) files['indirects'] = { buf, filename: part.filename };
          else if (fn.includes('odc') || fn.includes('escalation') || fn.startsWith('03')) files['odcs'] = { buf, filename: part.filename };
          else if (fn.includes('history') || fn.includes('priced') || fn.startsWith('04')) files['history'] = { buf, filename: part.filename };
        }
      } else {
        if (part.fieldname === 'notes') notes = (part as unknown as { value: string }).value ?? '';
        if (part.fieldname === 'format_version') formatVersion = (part as unknown as { value: string }).value ?? '1.0';
      }
    }

    // Require all 4 files
    const missing = ['rates', 'indirects', 'odcs', 'history'].filter((k) => !files[k]);
    if (missing.length > 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Missing required files: ${missing.join(', ')}. Expected 4 xlsx files: Rates, Indirects, ODCs/Escalation, History/Priced.`, req.requestId),
      );
    }

    // Parse and validate each file
    const allErrors: string[] = [];
    const parsed: Record<string, ParsedSheet[]> = {};

    for (const [key, file] of Object.entries(files)) {
      try {
        const sheets = await parseXlsx(file.buf);
        parsed[key] = sheets;
        const spec = FILE_SPECS[key];
        if (spec) {
          const errors = validateFile(sheets, spec, file.filename);
          allErrors.push(...errors);
        }
      } catch (err) {
        allErrors.push(`${file.filename}: failed to parse xlsx — ${(err as Error).message}`);
      }
    }

    if (allErrors.length > 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', `Schema validation failed:\n${allErrors.join('\n')}`, req.requestId, JSON.stringify(allErrors)),
      );
    }

    // Create version record
    const sourceFiles = {
      rates_xlsx: files['rates']!.filename,
      indirects_xlsx: files['indirects']!.filename,
      odcs_xlsx: files['odcs']!.filename,
      history_xlsx: files['history']!.filename,
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [version] } = await client.query<{ id: string }>(
        `INSERT INTO financial_bible_versions (uploaded_by, notes, format_version, source_files, active)
         VALUES ($1, $2, $3, $4, FALSE)
         RETURNING id`,
        ['system', notes || null, formatVersion, JSON.stringify(sourceFiles)],
      );

      const versionId = version.id;

      // Insert rates
      const ratesSheet = parsed['rates']!.find((s) => s.name.toLowerCase() === 'rates');
      let rateCount = 0;
      if (ratesSheet) {
        for (const row of ratesSheet.rows) {
          const laborCat = String(getCol(row, 'Labor Category') ?? '').trim();
          const clearance = String(getCol(row, 'Clearance') ?? '').trim();
          const rate = toNumber(getCol(row, 'Rate'));
          const effFrom = toDateStr(getCol(row, 'Effective From'));
          const effTo = toDateStr(getCol(row, 'Effective To'));

          if (!laborCat || !effFrom) continue;

          await client.query(
            `INSERT INTO financial_rates (version_id, labor_category, clearance, rate, effective_from, effective_to)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (version_id, labor_category, clearance, effective_from) DO UPDATE
               SET rate = EXCLUDED.rate, effective_to = EXCLUDED.effective_to`,
            [versionId, laborCat, clearance || 'None', rate, effFrom, effTo],
          );
          rateCount++;
        }
      }

      // Insert indirects
      const indirectsSheet = parsed['indirects']!.find((s) => s.name.toLowerCase() === 'indirects');
      let indirectCount = 0;
      if (indirectsSheet) {
        for (const row of indirectsSheet.rows) {
          const contractType = String(getCol(row, 'Contract Type') ?? '').trim();
          if (!contractType) continue;

          await client.query(
            `INSERT INTO financial_indirects (version_id, contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (version_id, contract_type) DO UPDATE
               SET fringe_pct = EXCLUDED.fringe_pct, overhead_pct = EXCLUDED.overhead_pct,
                   ga_pct = EXCLUDED.ga_pct, fee_band_low = EXCLUDED.fee_band_low, fee_band_high = EXCLUDED.fee_band_high`,
            [
              versionId, contractType,
              toNumber(getCol(row, 'Fringe')),
              toNumber(getCol(row, 'Overhead')),
              toNumber(getCol(row, 'G&A')),
              toNumber(getCol(row, 'Fee Band Low')),
              toNumber(getCol(row, 'Fee Band High')),
            ],
          );
          indirectCount++;
        }
      }

      // Insert ODCs/escalation
      const odcSheet = parsed['odcs']!.find((s) => s.name.toLowerCase() === 'odcs');
      let odcCount = 0;
      if (odcSheet) {
        for (const row of odcSheet.rows) {
          const category = String(getCol(row, 'Category') ?? '').trim();
          const baseYear = toNumber(getCol(row, 'Base Year'));
          if (!category || !baseYear) continue;

          await client.query(
            `INSERT INTO financial_odc_escalation (version_id, category, base_year, base_amount, escalation_pct, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (version_id, category, base_year) DO UPDATE
               SET base_amount = EXCLUDED.base_amount, escalation_pct = EXCLUDED.escalation_pct, notes = EXCLUDED.notes`,
            [
              versionId, category, baseYear,
              toNumber(getCol(row, 'Base Amount')),
              toNumber(getCol(row, 'Escalation')),
              String(getCol(row, 'Notes') ?? '') || null,
            ],
          );
          odcCount++;
        }
      }

      // Insert history
      const historySheet = parsed['history']!.find((s) => s.name.toLowerCase() === 'history');
      let historyCount = 0;
      if (historySheet) {
        for (const row of historySheet.rows) {
          const pursuitId = String(getCol(row, 'Pursuit ID') ?? '').trim();
          if (!pursuitId) continue;

          const outcomeRaw = String(getCol(row, 'Outcome') ?? '').trim().toLowerCase();
          const outcome = ['won', 'lost', 'no_bid', 'withdrew'].includes(outcomeRaw) ? outcomeRaw : null;

          await client.query(
            `INSERT INTO financial_history (version_id, pursuit_id, agency, outcome, bid_price, winner_price, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (version_id, pursuit_id) DO UPDATE
               SET agency = EXCLUDED.agency, outcome = EXCLUDED.outcome,
                   bid_price = EXCLUDED.bid_price, winner_price = EXCLUDED.winner_price, notes = EXCLUDED.notes`,
            [
              versionId, pursuitId,
              String(getCol(row, 'Agency') ?? '') || null,
              outcome,
              toNumber(getCol(row, 'Bid Price')) || null,
              toNumber(getCol(row, 'Winner Price')) || null,
              String(getCol(row, 'Notes') ?? '') || null,
            ],
          );
          historyCount++;
        }
      }

      // Update summary stats
      const summaryStats = { rates: rateCount, indirects: indirectCount, odcs: odcCount, history: historyCount };
      await client.query(
        `UPDATE financial_bible_versions SET summary_stats = $1 WHERE id = $2`,
        [JSON.stringify(summaryStats), versionId],
      );

      await client.query('COMMIT');

      await recordAuditLog(pool, {
        table_name: 'financial_bible_versions',
        record_ref: versionId,
        action: 'upload',
        actor: 'system',
        source: 'user',
      });

      return reply.send(successEnvelope({
        version_id: versionId,
        summary: summaryStats,
        source_files: sourceFiles,
        notes,
        format_version: formatVersion,
      }, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'Financial Bible upload failed');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── GET /v3/financial-bible/active ──────────────────────────────────────
  app.get('/v3/financial-bible/active', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT v.*,
              (SELECT COUNT(*) FROM financial_rates WHERE version_id = v.id) AS rate_count,
              (SELECT COUNT(*) FROM financial_indirects WHERE version_id = v.id) AS indirect_count,
              (SELECT COUNT(*) FROM financial_odc_escalation WHERE version_id = v.id) AS odc_count,
              (SELECT COUNT(*) FROM financial_history WHERE version_id = v.id) AS history_count
       FROM financial_bible_versions v
       WHERE v.active = TRUE
       LIMIT 1`,
    );

    if (!rows.length) {
      return reply.send(successEnvelope({ active: null }, req.requestId));
    }

    const v = rows[0];
    return reply.send(successEnvelope({
      active: {
        id: v.id,
        uploaded_at: v.uploaded_at,
        uploaded_by: v.uploaded_by,
        notes: v.notes,
        format_version: v.format_version,
        source_files: v.source_files,
        summary_stats: v.summary_stats,
        rate_count: Number(v.rate_count),
        indirect_count: Number(v.indirect_count),
        odc_count: Number(v.odc_count),
        history_count: Number(v.history_count),
      },
    }, req.requestId));
  });

  // ── GET /v3/financial-bible/versions ────────────────────────────────────
  app.get('/v3/financial-bible/versions', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT v.*,
              (SELECT COUNT(*) FROM financial_rates WHERE version_id = v.id) AS rate_count,
              (SELECT COUNT(*) FROM financial_indirects WHERE version_id = v.id) AS indirect_count,
              (SELECT COUNT(*) FROM financial_odc_escalation WHERE version_id = v.id) AS odc_count,
              (SELECT COUNT(*) FROM financial_history WHERE version_id = v.id) AS history_count,
              (SELECT COUNT(*) FROM pricing_scenarios WHERE bible_version_id = v.id) AS scenario_count
       FROM financial_bible_versions v
       ORDER BY v.uploaded_at DESC`,
    );

    const items = rows.map((v) => ({
      id: v.id,
      uploaded_at: v.uploaded_at,
      uploaded_by: v.uploaded_by,
      notes: v.notes,
      active: v.active,
      format_version: v.format_version,
      source_files: v.source_files,
      summary_stats: v.summary_stats,
      rate_count: Number(v.rate_count),
      indirect_count: Number(v.indirect_count),
      odc_count: Number(v.odc_count),
      history_count: Number(v.history_count),
      scenario_count: Number(v.scenario_count),
    }));

    return reply.send(successEnvelope({ items, total: items.length }, req.requestId));
  });

  // ── GET /v3/financial-bible/versions/:id ────────────────────────────────
  app.get('/v3/financial-bible/versions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows: [version] } = await pool.query(
      `SELECT * FROM financial_bible_versions WHERE id = $1`,
      [id],
    );
    if (!version) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Version not found', req.requestId));
    }

    const { rows: rates } = await pool.query(
      `SELECT * FROM financial_rates WHERE version_id = $1 ORDER BY labor_category, clearance, effective_from`,
      [id],
    );
    const { rows: indirects } = await pool.query(
      `SELECT * FROM financial_indirects WHERE version_id = $1 ORDER BY contract_type`,
      [id],
    );
    const { rows: odcs } = await pool.query(
      `SELECT * FROM financial_odc_escalation WHERE version_id = $1 ORDER BY category, base_year`,
      [id],
    );
    const { rows: history } = await pool.query(
      `SELECT * FROM financial_history WHERE version_id = $1 ORDER BY pursuit_id`,
      [id],
    );

    return reply.send(successEnvelope({
      version: {
        id: version.id,
        uploaded_at: version.uploaded_at,
        uploaded_by: version.uploaded_by,
        notes: version.notes,
        active: version.active,
        format_version: version.format_version,
        source_files: version.source_files,
        summary_stats: version.summary_stats,
      },
      rates: rates.map((r) => ({
        labor_category: r.labor_category,
        clearance: r.clearance,
        rate: Number(r.rate),
        effective_from: r.effective_from,
        effective_to: r.effective_to,
      })),
      indirects: indirects.map((r) => ({
        contract_type: r.contract_type,
        fringe_pct: Number(r.fringe_pct),
        overhead_pct: Number(r.overhead_pct),
        ga_pct: Number(r.ga_pct),
        fee_band_low: Number(r.fee_band_low),
        fee_band_high: Number(r.fee_band_high),
      })),
      odcs: odcs.map((r) => ({
        category: r.category,
        base_year: Number(r.base_year),
        base_amount: Number(r.base_amount),
        escalation_pct: Number(r.escalation_pct),
        notes: r.notes,
      })),
      history: history.map((r) => ({
        pursuit_id: r.pursuit_id,
        agency: r.agency,
        outcome: r.outcome,
        bid_price: r.bid_price != null ? Number(r.bid_price) : null,
        winner_price: r.winner_price != null ? Number(r.winner_price) : null,
        notes: r.notes,
      })),
    }, req.requestId));
  });

  // ── POST /v3/financial-bible/activate/:version_id ───────────────────────
  app.post('/v3/financial-bible/activate/:version_id', async (req, reply) => {
    const { version_id } = req.params as { version_id: string };

    const { rows: [target] } = await pool.query(
      `SELECT id FROM financial_bible_versions WHERE id = $1`,
      [version_id],
    );
    if (!target) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Version not found', req.requestId));
    }

    // Atomic switch: deactivate all, activate target
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE financial_bible_versions SET active = FALSE WHERE active = TRUE`);
      await client.query(`UPDATE financial_bible_versions SET active = TRUE WHERE id = $1`, [version_id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await recordAuditLog(pool, {
      table_name: 'financial_bible_versions',
      record_ref: version_id,
      action: 'activate',
      actor: 'system',
      source: 'user',
    });

    return reply.send(successEnvelope({ activated: version_id }, req.requestId));
  });

  // ── GET /v3/financial-bible/rates ───────────────────────────────────────
  app.get('/v3/financial-bible/rates', async (req, reply) => {
    const query = req.query as { labor_category?: string; clearance?: string; date?: string };

    // Get active version
    const { rows: [activeVersion] } = await pool.query(
      `SELECT id FROM financial_bible_versions WHERE active = TRUE LIMIT 1`,
    );
    if (!activeVersion) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'No active Financial Bible version', req.requestId));
    }

    const conditions: string[] = ['version_id = $1'];
    const params: unknown[] = [activeVersion.id];

    if (query.labor_category) {
      params.push(`%${query.labor_category}%`);
      conditions.push(`labor_category ILIKE $${params.length}`);
    }
    if (query.clearance) {
      params.push(query.clearance);
      conditions.push(`clearance = $${params.length}`);
    }
    if (query.date) {
      params.push(query.date);
      conditions.push(`effective_from <= $${params.length}::date`);
      params.push(query.date);
      conditions.push(`(effective_to IS NULL OR effective_to >= $${params.length}::date)`);
    }

    const { rows } = await pool.query(
      `SELECT * FROM financial_rates WHERE ${conditions.join(' AND ')} ORDER BY labor_category, clearance`,
      params,
    );

    return reply.send(successEnvelope({
      version_id: activeVersion.id,
      items: rows.map((r) => ({
        labor_category: r.labor_category,
        clearance: r.clearance,
        rate: Number(r.rate),
        effective_from: r.effective_from,
        effective_to: r.effective_to,
      })),
      total: rows.length,
    }, req.requestId));
  });

  // ── GET /v3/financial-bible/diff/:id ────────────────────────────────────
  app.get('/v3/financial-bible/diff/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    // Get this version's upload time
    const { rows: [current] } = await pool.query(
      `SELECT id, uploaded_at FROM financial_bible_versions WHERE id = $1`,
      [id],
    );
    if (!current) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Version not found', req.requestId));
    }

    // Find the previous version
    const { rows: [previous] } = await pool.query(
      `SELECT id FROM financial_bible_versions WHERE uploaded_at < $1 ORDER BY uploaded_at DESC LIMIT 1`,
      [current.uploaded_at],
    );

    if (!previous) {
      return reply.send(successEnvelope({
        current_id: id,
        previous_id: null,
        diff: { message: 'No previous version to compare against' },
      }, req.requestId));
    }

    // Compare rates
    const { rows: addedRates } = await pool.query(
      `SELECT labor_category, clearance, rate, effective_from
       FROM financial_rates WHERE version_id = $1
       EXCEPT
       SELECT labor_category, clearance, rate, effective_from
       FROM financial_rates WHERE version_id = $2`,
      [id, previous.id],
    );

    const { rows: removedRates } = await pool.query(
      `SELECT labor_category, clearance, rate, effective_from
       FROM financial_rates WHERE version_id = $1
       EXCEPT
       SELECT labor_category, clearance, rate, effective_from
       FROM financial_rates WHERE version_id = $2`,
      [previous.id, id],
    );

    // Compare indirects
    const { rows: addedIndirects } = await pool.query(
      `SELECT contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high
       FROM financial_indirects WHERE version_id = $1
       EXCEPT
       SELECT contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high
       FROM financial_indirects WHERE version_id = $2`,
      [id, previous.id],
    );

    const { rows: removedIndirects } = await pool.query(
      `SELECT contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high
       FROM financial_indirects WHERE version_id = $1
       EXCEPT
       SELECT contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high
       FROM financial_indirects WHERE version_id = $2`,
      [previous.id, id],
    );

    return reply.send(successEnvelope({
      current_id: id,
      previous_id: previous.id,
      diff: {
        rates: { added: addedRates.length, removed: removedRates.length, added_rows: addedRates, removed_rows: removedRates },
        indirects: { added: addedIndirects.length, removed: removedIndirects.length, added_rows: addedIndirects, removed_rows: removedIndirects },
      },
    }, req.requestId));
  });

  // ── POST /v3/pricing-scenarios ──────────────────────────────────────────
  app.post('/v3/pricing-scenarios', async (req, reply) => {
    const body = req.body as {
      title: string;
      opportunity_id?: number | null;
      capture_id?: number | null;
      bible_version_id?: string;
      labor_mix: Array<{
        labor_category: string;
        clearance: string;
        hours: number;
        rate_override?: number;
      }>;
      period_months?: number;
      contract_type?: string;
      fee_pct?: number;
      odc_amount?: number;
    };

    if (!body.title?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'title is required', req.requestId));
    }
    if (!body.labor_mix || !Array.isArray(body.labor_mix) || body.labor_mix.length === 0) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'labor_mix must be a non-empty array', req.requestId));
    }

    // Get Bible version (explicit or active)
    let versionId = body.bible_version_id;
    if (!versionId) {
      const { rows: [active] } = await pool.query(
        `SELECT id FROM financial_bible_versions WHERE active = TRUE LIMIT 1`,
      );
      if (!active) {
        return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No active Financial Bible version — upload and activate one first', req.requestId));
      }
      versionId = active.id;
    }

    const periodMonths = body.period_months ?? 12;
    const contractType = body.contract_type ?? 'T&M';

    // Get indirect rates for the contract type
    const { rows: [indirects] } = await pool.query(
      `SELECT * FROM financial_indirects WHERE version_id = $1 AND LOWER(contract_type) = LOWER($2)`,
      [versionId, contractType],
    );

    const fringePct = indirects ? Number(indirects.fringe_pct) : 0;
    const overheadPct = indirects ? Number(indirects.overhead_pct) : 0;
    const gaPct = indirects ? Number(indirects.ga_pct) : 0;

    // Calculate direct costs from labor mix
    let totalDirect = 0;
    const resolvedMix: Array<{ labor_category: string; clearance: string; hours: number; rate: number; cost: number }> = [];

    for (const item of body.labor_mix) {
      let rate = item.rate_override ?? 0;

      if (!item.rate_override) {
        // Look up rate from Bible
        const { rows: [rateRow] } = await pool.query(
          `SELECT rate FROM financial_rates
           WHERE version_id = $1
             AND LOWER(labor_category) = LOWER($2)
             AND LOWER(clearance) = LOWER($3)
           ORDER BY effective_from DESC LIMIT 1`,
          [versionId, item.labor_category, item.clearance || 'None'],
        );
        rate = rateRow ? Number(rateRow.rate) : 0;
      }

      const cost = rate * item.hours * (periodMonths / 12);
      totalDirect += cost;
      resolvedMix.push({
        labor_category: item.labor_category,
        clearance: item.clearance,
        hours: item.hours,
        rate,
        cost,
      });
    }

    // Indirect costs
    const fringeAmt = totalDirect * (fringePct / 100);
    const overheadAmt = (totalDirect + fringeAmt) * (overheadPct / 100);
    const gaAmt = (totalDirect + fringeAmt + overheadAmt) * (gaPct / 100);
    const totalIndirect = fringeAmt + overheadAmt + gaAmt;

    // ODC
    const totalOdc = body.odc_amount ?? 0;

    // Total cost
    const totalCost = totalDirect + totalIndirect + totalOdc;

    // Fee / profit
    const feePct = body.fee_pct ?? (indirects ? (Number(indirects.fee_band_low) + Number(indirects.fee_band_high)) / 2 : 8);
    const feeAmount = totalCost * (feePct / 100);
    const totalPrice = totalCost + feeAmount;

    // Margin calculation
    const marginPct = totalPrice > 0 ? (feeAmount / totalPrice) * 100 : 0;
    const doctrinePass = marginPct >= MARGIN_FLOOR_PCT;
    const doctrineNotes = !doctrinePass
      ? `Margin ${marginPct.toFixed(2)}% is below the ${MARGIN_FLOOR_PCT}% floor (F-303 doctrine violation)`
      : null;

    const indirectRatesJson = { fringe_pct: fringePct, overhead_pct: overheadPct, ga_pct: gaPct, contract_type: contractType };

    const { rows: [scenario] } = await pool.query(
      `INSERT INTO pricing_scenarios
         (bible_version_id, opportunity_id, capture_id, title, labor_mix, period_months,
          indirect_rates, total_direct, total_indirect, total_odc, total_cost,
          fee_pct, fee_amount, total_price, margin_pct, doctrine_pass, doctrine_notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        versionId, body.opportunity_id ?? null, body.capture_id ?? null,
        body.title.trim(), JSON.stringify(resolvedMix), periodMonths,
        JSON.stringify(indirectRatesJson), totalDirect, totalIndirect, totalOdc, totalCost,
        feePct, feeAmount, totalPrice, marginPct, doctrinePass, doctrineNotes, 'system',
      ],
    );

    // F-303: If margin below 8%, auto-create a risk
    if (!doctrinePass && (body.opportunity_id || body.capture_id)) {
      try {
        await pool.query(
          `INSERT INTO risks (title, description, category, likelihood, impact, status, owner, source, opportunity_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            `Margin floor violation: ${marginPct.toFixed(1)}% on "${body.title}"`,
            `Pricing scenario "${body.title}" produced a margin of ${marginPct.toFixed(2)}%, below the ${MARGIN_FLOOR_PCT}% floor. Review pricing assumptions or request a doctrine override.`,
            'financial',
            4, // high likelihood (scenario was run)
            4, // high impact (margin floor is doctrine)
            'open',
            'Financial Bible',
            'auto_pricing',
            body.opportunity_id ?? null,
          ],
        );
      } catch (riskErr) {
        logger.warn({ err: riskErr }, 'Failed to auto-create margin risk');
      }
    }

    await recordAuditLog(pool, {
      table_name: 'pricing_scenarios',
      record_ref: scenario.id,
      action: 'create',
      actor: 'system',
      source: 'user',
    });

    return reply.send(successEnvelope({
      id: scenario.id,
      bible_version_id: versionId,
      title: body.title,
      labor_mix: resolvedMix,
      period_months: periodMonths,
      indirect_rates: indirectRatesJson,
      total_direct: totalDirect,
      total_indirect: totalIndirect,
      total_odc: totalOdc,
      total_cost: totalCost,
      fee_pct: feePct,
      fee_amount: feeAmount,
      total_price: totalPrice,
      margin_pct: marginPct,
      doctrine_pass: doctrinePass,
      doctrine_notes: doctrineNotes,
    }, req.requestId));
  });

  // ── GET /v3/pricing-scenarios ───────────────────────────────────────────
  app.get('/v3/pricing-scenarios', async (req, reply) => {
    const query = req.query as { opportunity_id?: string; capture_id?: string };
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (query.opportunity_id) {
      params.push(Number(query.opportunity_id));
      conditions.push(`ps.opportunity_id = $${params.length}`);
    }
    if (query.capture_id) {
      params.push(Number(query.capture_id));
      conditions.push(`ps.capture_id = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT ps.*, o.title AS opportunity_title
       FROM pricing_scenarios ps
       LEFT JOIN opportunities o ON o.id = ps.opportunity_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ps.created_at DESC`,
      params,
    );

    return reply.send(successEnvelope({
      items: rows.map((r) => ({
        id: r.id,
        bible_version_id: r.bible_version_id,
        opportunity_id: r.opportunity_id,
        capture_id: r.capture_id,
        title: r.title,
        total_price: Number(r.total_price),
        margin_pct: Number(r.margin_pct),
        doctrine_pass: r.doctrine_pass,
        doctrine_notes: r.doctrine_notes,
        opportunity_title: r.opportunity_title ?? null,
        created_at: r.created_at,
      })),
      total: rows.length,
    }, req.requestId));
  });

  // ── GET /v3/pricing-scenarios/:id ───────────────────────────────────────
  app.get('/v3/pricing-scenarios/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows: [scenario] } = await pool.query(
      `SELECT ps.*, o.title AS opportunity_title
       FROM pricing_scenarios ps
       LEFT JOIN opportunities o ON o.id = ps.opportunity_id
       WHERE ps.id = $1`,
      [id],
    );

    if (!scenario) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Pricing scenario not found', req.requestId));
    }

    return reply.send(successEnvelope({
      id: scenario.id,
      bible_version_id: scenario.bible_version_id,
      opportunity_id: scenario.opportunity_id,
      capture_id: scenario.capture_id,
      title: scenario.title,
      labor_mix: scenario.labor_mix,
      period_months: scenario.period_months,
      indirect_rates: scenario.indirect_rates,
      total_direct: Number(scenario.total_direct),
      total_indirect: Number(scenario.total_indirect),
      total_odc: Number(scenario.total_odc),
      total_cost: Number(scenario.total_cost),
      fee_pct: Number(scenario.fee_pct),
      fee_amount: Number(scenario.fee_amount),
      total_price: Number(scenario.total_price),
      margin_pct: Number(scenario.margin_pct),
      doctrine_pass: scenario.doctrine_pass,
      doctrine_notes: scenario.doctrine_notes,
      opportunity_title: scenario.opportunity_title ?? null,
      created_by: scenario.created_by,
      created_at: scenario.created_at,
    }, req.requestId));
  });
}
