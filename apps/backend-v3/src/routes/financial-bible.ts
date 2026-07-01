/**
 * Financial Bible routes — F-311
 *
 * PD-SYS 4-file manual upload (Envision-OU scoped):
 *   01_Rates.xlsx, 02_Indirects.xlsx, 03_ODCs_Escalation.xlsx, 04_History_Priced.xlsx
 *
 * Endpoints:
 *   POST   /v3/financial-bible/upload          — multipart 4 xlsx files → validate → version
 *   GET    /v3/financial-bible/active           — active version metadata + summary stats
 *   POST   /v3/financial-bible/activate/:versionId — promote version to active (atomic)
 *   GET    /v3/financial-bible/versions         — list all versions
 *   GET    /v3/financial-bible/rates            — query rates from active version
 *   POST   /v3/pricing-scenarios                — build priced scenario → margin + doctrine check
 *   GET    /v3/pricing-scenarios                — list scenarios (optional filters)
 *   GET    /v3/pricing-scenarios/:id            — single scenario detail
 */

import type { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { recordAuditLog } from '../services/audit/audit-log.js';
import { logger } from '../lib/logger.js';

const UPLOAD_DIR = join(process.cwd(), 'data', 'financial-bible');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MARGIN_FLOOR_PCT = 8;

// Expected file keys for the 4-file PD-SYS format
const EXPECTED_FILES = ['rates_xlsx', 'indirects_xlsx', 'odcs_xlsx', 'history_xlsx'] as const;

mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Excel parsing helpers ───────────────────────────────────────────────────

interface RateRow {
  labor_category: string;
  clearance: string;
  rate: number;
  effective_from: string;
  effective_to: string | null;
}

interface IndirectRow {
  contract_type: string;
  fringe_pct: number;
  overhead_pct: number;
  ga_pct: number;
  fee_band_low: number;
  fee_band_high: number;
}

interface OdcRow {
  category: string;
  description: string | null;
  base_cost: number;
  escalation_year: number;
  escalation_pct: number;
}

interface HistoryRow {
  pursuit_id: string;
  agency: string | null;
  outcome: string | null;
  bid_price: number | null;
  winner_price: number | null;
  notes: string | null;
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof o.text === 'string') return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('');
    if (o.result !== undefined && o.result !== null) return String(o.result);
    return '';
  }
  return String(v);
}

function cellNum(v: unknown): number {
  const s = cellStr(v).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cellDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = cellStr(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function parseRatesXlsx(buf: Buffer): Promise<{ rows: RateRow[]; warnings: string[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], warnings: ['Rates file has no worksheets'] };

  const rows: RateRow[] = [];
  const warnings: string[] = [];
  let headerRow = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
    const first = cellStr(vals[0]).toLowerCase();
    if (!headerRow && rowNum <= 5 && (first.includes('labor') || first.includes('category'))) {
      headerRow = rowNum;
      return;
    }
    if (rowNum <= headerRow || vals.length < 3) return;

    const laborCat = cellStr(vals[0]).trim();
    if (!laborCat) return;

    rows.push({
      labor_category: laborCat,
      clearance: cellStr(vals[1]).trim() || 'None',
      rate: cellNum(vals[2]),
      effective_from: cellDate(vals[3]) ?? '2026-01-01',
      effective_to: cellDate(vals[4]),
    });
  });

  if (rows.length === 0) warnings.push('No rate rows parsed from Rates file');
  return { rows, warnings };
}

async function parseIndirectsXlsx(buf: Buffer): Promise<{ rows: IndirectRow[]; warnings: string[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], warnings: ['Indirects file has no worksheets'] };

  const rows: IndirectRow[] = [];
  const warnings: string[] = [];
  let headerRow = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
    const first = cellStr(vals[0]).toLowerCase();
    if (!headerRow && rowNum <= 5 && (first.includes('contract') || first.includes('type'))) {
      headerRow = rowNum;
      return;
    }
    if (rowNum <= headerRow || vals.length < 6) return;

    const contractType = cellStr(vals[0]).trim();
    if (!contractType) return;

    rows.push({
      contract_type: contractType,
      fringe_pct: cellNum(vals[1]),
      overhead_pct: cellNum(vals[2]),
      ga_pct: cellNum(vals[3]),
      fee_band_low: cellNum(vals[4]),
      fee_band_high: cellNum(vals[5]),
    });
  });

  if (rows.length === 0) warnings.push('No indirect rows parsed from Indirects file');
  return { rows, warnings };
}

async function parseOdcsXlsx(buf: Buffer): Promise<{ rows: OdcRow[]; warnings: string[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], warnings: ['ODCs file has no worksheets'] };

  const rows: OdcRow[] = [];
  const warnings: string[] = [];
  let headerRow = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
    const first = cellStr(vals[0]).toLowerCase();
    if (!headerRow && rowNum <= 5 && (first.includes('category') || first.includes('odc'))) {
      headerRow = rowNum;
      return;
    }
    if (rowNum <= headerRow || vals.length < 3) return;

    const category = cellStr(vals[0]).trim();
    if (!category) return;

    rows.push({
      category,
      description: cellStr(vals[1]).trim() || null,
      base_cost: cellNum(vals[2]),
      escalation_year: Math.round(cellNum(vals[3])) || 2026,
      escalation_pct: cellNum(vals[4]),
    });
  });

  if (rows.length === 0) warnings.push('No ODC rows parsed from ODCs/Escalation file');
  return { rows, warnings };
}

async function parseHistoryXlsx(buf: Buffer): Promise<{ rows: HistoryRow[]; warnings: string[] }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], warnings: ['History file has no worksheets'] };

  const rows: HistoryRow[] = [];
  const warnings: string[] = [];
  let headerRow = 0;

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
    const first = cellStr(vals[0]).toLowerCase();
    if (!headerRow && rowNum <= 5 && (first.includes('pursuit') || first.includes('solicitation'))) {
      headerRow = rowNum;
      return;
    }
    if (rowNum <= headerRow || vals.length < 2) return;

    const pursuitId = cellStr(vals[0]).trim();
    if (!pursuitId) return;

    const outcomeRaw = cellStr(vals[2]).toLowerCase().trim();
    const outcomeMap: Record<string, string> = {
      won: 'won', win: 'won', awarded: 'won',
      lost: 'lost', lose: 'lost',
      'no bid': 'no_bid', 'no_bid': 'no_bid', nobid: 'no_bid',
      withdrew: 'withdrew', withdrawn: 'withdrew', withdraw: 'withdrew',
    };
    const outcome = outcomeMap[outcomeRaw] ?? null;

    rows.push({
      pursuit_id: pursuitId,
      agency: cellStr(vals[1]).trim() || null,
      outcome,
      bid_price: cellNum(vals[3]) || null,
      winner_price: cellNum(vals[4]) || null,
      notes: cellStr(vals[5]).trim() || null,
    });
  });

  if (rows.length === 0) warnings.push('No history rows parsed from History file');
  return { rows, warnings };
}

// ── Route registration ──────────────────────────────────────────────────────

export async function financialBibleRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: 4 },
    attachFieldsToBody: false,
  });

  // POST /v3/financial-bible/upload
  app.post('/v3/financial-bible/upload', async (req, reply) => {
    const parts = req.parts();
    const fileMap: Record<string, { buf: Buffer; filename: string }> = {};
    let notes: string | null = null;
    let formatVersion = '1.0';

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buf = Buffer.concat(chunks);
        const fname = part.filename.toLowerCase();
        const fieldName = part.fieldname.toLowerCase();

        if (fieldName === 'rates_xlsx' || fname.includes('rate')) {
          fileMap['rates_xlsx'] = { buf, filename: part.filename };
        } else if (fieldName === 'indirects_xlsx' || fname.includes('indirect')) {
          fileMap['indirects_xlsx'] = { buf, filename: part.filename };
        } else if (fieldName === 'odcs_xlsx' || fname.includes('odc') || fname.includes('escalation')) {
          fileMap['odcs_xlsx'] = { buf, filename: part.filename };
        } else if (fieldName === 'history_xlsx' || fname.includes('history') || fname.includes('priced')) {
          fileMap['history_xlsx'] = { buf, filename: part.filename };
        }
      } else {
        const val = part.value as string;
        if (part.fieldname === 'notes') notes = val;
        if (part.fieldname === 'format_version') formatVersion = val;
      }
    }

    if (Object.keys(fileMap).length === 0) {
      return reply.status(400).send(
        errorEnvelope('VALIDATION_ERROR', 'No files uploaded. Expected 4 xlsx files (rates, indirects, odcs, history).', req.requestId),
      );
    }

    const missing = EXPECTED_FILES.filter((k) => !fileMap[k]);
    if (missing.length > 0) {
      return reply.status(400).send(
        errorEnvelope(
          'VALIDATION_ERROR',
          `Missing required files: ${missing.join(', ')}. Upload all 4 PD-SYS files (rates, indirects, odcs/escalation, history).`,
          req.requestId,
        ),
      );
    }

    // Parse all 4 files
    const allWarnings: string[] = [];

    const [ratesParsed, indirectsParsed, odcsParsed, historyParsed] = await Promise.all([
      parseRatesXlsx(fileMap['rates_xlsx'].buf),
      parseIndirectsXlsx(fileMap['indirects_xlsx'].buf),
      parseOdcsXlsx(fileMap['odcs_xlsx'].buf),
      parseHistoryXlsx(fileMap['history_xlsx'].buf),
    ]);

    allWarnings.push(...ratesParsed.warnings, ...indirectsParsed.warnings, ...odcsParsed.warnings, ...historyParsed.warnings);

    // Save files to disk
    const storedFiles: Record<string, string> = {};
    for (const [key, { buf, filename }] of Object.entries(fileMap)) {
      const storedName = `${Date.now()}_${filename}`;
      const filePath = join(UPLOAD_DIR, storedName);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(filePath, buf);
      storedFiles[key] = `financial-bible/${storedName}`;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create version record
      const { rows: [version] } = await client.query<{ id: string; uploaded_at: string }>(
        `INSERT INTO financial_bible_versions (uploaded_by, notes, format_version, source_files, validation_warnings)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, uploaded_at`,
        [
          'shawn',
          notes,
          formatVersion,
          JSON.stringify(storedFiles),
          JSON.stringify(allWarnings),
        ],
      );

      const versionId = version.id;

      // Insert rates
      for (const r of ratesParsed.rows) {
        await client.query(
          `INSERT INTO financial_rates (version_id, labor_category, clearance, rate, effective_from, effective_to)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (version_id, labor_category, clearance, effective_from) DO UPDATE
             SET rate = EXCLUDED.rate, effective_to = EXCLUDED.effective_to`,
          [versionId, r.labor_category, r.clearance, r.rate, r.effective_from, r.effective_to],
        );
      }

      // Insert indirects
      for (const r of indirectsParsed.rows) {
        await client.query(
          `INSERT INTO financial_indirects (version_id, contract_type, fringe_pct, overhead_pct, ga_pct, fee_band_low, fee_band_high)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (version_id, contract_type) DO UPDATE
             SET fringe_pct = EXCLUDED.fringe_pct, overhead_pct = EXCLUDED.overhead_pct,
                 ga_pct = EXCLUDED.ga_pct, fee_band_low = EXCLUDED.fee_band_low, fee_band_high = EXCLUDED.fee_band_high`,
          [versionId, r.contract_type, r.fringe_pct, r.overhead_pct, r.ga_pct, r.fee_band_low, r.fee_band_high],
        );
      }

      // Insert ODCs / escalation
      for (const r of odcsParsed.rows) {
        await client.query(
          `INSERT INTO financial_odc_escalation (version_id, category, description, base_cost, escalation_year, escalation_pct)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (version_id, category, escalation_year) DO UPDATE
             SET description = EXCLUDED.description, base_cost = EXCLUDED.base_cost, escalation_pct = EXCLUDED.escalation_pct`,
          [versionId, r.category, r.description, r.base_cost, r.escalation_year, r.escalation_pct],
        );
      }

      // Insert history
      for (const r of historyParsed.rows) {
        await client.query(
          `INSERT INTO financial_history (version_id, pursuit_id, agency, outcome, bid_price, winner_price, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (version_id, pursuit_id) DO UPDATE
             SET agency = EXCLUDED.agency, outcome = EXCLUDED.outcome,
                 bid_price = EXCLUDED.bid_price, winner_price = EXCLUDED.winner_price, notes = EXCLUDED.notes`,
          [versionId, r.pursuit_id, r.agency, r.outcome, r.bid_price, r.winner_price, r.notes],
        );
      }

      await client.query('COMMIT');

      await recordAuditLog(pool, {
        action: 'financial_bible_upload',
        table_name: 'financial_bible_versions',
        record_ref: versionId,
        new_values: {
          rates_count: ratesParsed.rows.length,
          indirects_count: indirectsParsed.rows.length,
          odcs_count: odcsParsed.rows.length,
          history_count: historyParsed.rows.length,
          warnings: allWarnings,
        },
        actor: 'shawn',
        source: 'user',
        request_id: req.requestId,
      });

      return reply.send(successEnvelope({
        version_id: versionId,
        uploaded_at: version.uploaded_at,
        summary: {
          rates: ratesParsed.rows.length,
          indirects: indirectsParsed.rows.length,
          odcs: odcsParsed.rows.length,
          history: historyParsed.rows.length,
        },
        warnings: allWarnings,
      }, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err }, 'Financial Bible upload failed');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /v3/financial-bible/active
  app.get('/v3/financial-bible/active', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT v.*,
              (SELECT COUNT(*) FROM financial_rates WHERE version_id = v.id) AS rates_count,
              (SELECT COUNT(*) FROM financial_indirects WHERE version_id = v.id) AS indirects_count,
              (SELECT COUNT(*) FROM financial_odc_escalation WHERE version_id = v.id) AS odcs_count,
              (SELECT COUNT(*) FROM financial_history WHERE version_id = v.id) AS history_count
       FROM financial_bible_versions v
       WHERE v.active = true
       LIMIT 1`,
    );

    if (!rows[0]) {
      return reply.send(successEnvelope({ active: null, message: 'No active Financial Bible version. Upload files to create one.' }, req.requestId));
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
        validation_warnings: v.validation_warnings,
        rates_count: Number(v.rates_count),
        indirects_count: Number(v.indirects_count),
        odcs_count: Number(v.odcs_count),
        history_count: Number(v.history_count),
      },
    }, req.requestId));
  });

  // GET /v3/financial-bible/versions
  app.get('/v3/financial-bible/versions', async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT v.*,
              (SELECT COUNT(*) FROM financial_rates WHERE version_id = v.id) AS rates_count,
              (SELECT COUNT(*) FROM financial_indirects WHERE version_id = v.id) AS indirects_count,
              (SELECT COUNT(*) FROM financial_odc_escalation WHERE version_id = v.id) AS odcs_count,
              (SELECT COUNT(*) FROM financial_history WHERE version_id = v.id) AS history_count
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
      validation_warnings: v.validation_warnings,
      rates_count: Number(v.rates_count),
      indirects_count: Number(v.indirects_count),
      odcs_count: Number(v.odcs_count),
      history_count: Number(v.history_count),
    }));

    return reply.send(successEnvelope({ items }, req.requestId));
  });

  // POST /v3/financial-bible/activate/:versionId
  app.post('/v3/financial-bible/activate/:versionId', async (req, reply) => {
    const { versionId } = req.params as { versionId: string };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Deactivate all
      await client.query(`UPDATE financial_bible_versions SET active = false WHERE active = true`);

      // Activate selected
      const { rowCount } = await client.query(
        `UPDATE financial_bible_versions SET active = true WHERE id = $1`,
        [versionId],
      );

      if (!rowCount) {
        await client.query('ROLLBACK');
        return reply.status(404).send(
          errorEnvelope('NOT_FOUND', 'Version not found', req.requestId),
        );
      }

      await client.query('COMMIT');

      await recordAuditLog(pool, {
        action: 'financial_bible_activate',
        table_name: 'financial_bible_versions',
        record_ref: versionId,
        actor: 'shawn',
        source: 'user',
        request_id: req.requestId,
      });

      return reply.send(successEnvelope({ activated: versionId }, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /v3/financial-bible/rates
  app.get('/v3/financial-bible/rates', async (req, reply) => {
    const query = req.query as {
      labor_category?: string;
      clearance?: string;
      date?: string;
      version_id?: string;
    };

    // Use specified version or active version
    let versionId = query.version_id;
    if (!versionId) {
      const { rows } = await pool.query(
        `SELECT id FROM financial_bible_versions WHERE active = true LIMIT 1`,
      );
      if (!rows[0]) {
        return reply.send(successEnvelope({ items: [], message: 'No active Financial Bible version' }, req.requestId));
      }
      versionId = rows[0].id as string;
    }

    const conditions = ['version_id = $1'];
    const params: unknown[] = [versionId];

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
      `SELECT * FROM financial_rates
       WHERE ${conditions.join(' AND ')}
       ORDER BY labor_category, clearance, effective_from`,
      params,
    );

    return reply.send(successEnvelope({
      items: rows.map((r) => ({
        labor_category: r.labor_category,
        clearance: r.clearance,
        rate: Number(r.rate),
        effective_from: r.effective_from,
        effective_to: r.effective_to,
      })),
      version_id: versionId,
    }, req.requestId));
  });

  // POST /v3/pricing-scenarios — build a priced scenario
  app.post('/v3/pricing-scenarios', async (req, reply) => {
    const body = req.body as {
      title: string;
      opportunity_id?: number | null;
      capture_id?: number | null;
      version_id?: string;
      contract_type?: string;
      period_months?: number;
      labor_mix: { labor_category: string; clearance: string; hours: number; rate_override?: number }[];
      odc_items?: { category: string; amount: number; description?: string }[];
      notes?: string;
    };

    if (!body.title?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'title is required', req.requestId));
    }
    if (!body.labor_mix || body.labor_mix.length === 0) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'labor_mix is required with at least one entry', req.requestId));
    }

    // Resolve version
    let versionId = body.version_id;
    if (!versionId) {
      const { rows } = await pool.query(
        `SELECT id FROM financial_bible_versions WHERE active = true LIMIT 1`,
      );
      if (!rows[0]) {
        return reply.status(400).send(
          errorEnvelope('VALIDATION_ERROR', 'No active Financial Bible version. Upload and activate a version first.', req.requestId),
        );
      }
      versionId = rows[0].id as string;
    }

    // Look up rates from the version
    const { rows: rateRows } = await pool.query(
      `SELECT labor_category, clearance, rate FROM financial_rates WHERE version_id = $1`,
      [versionId],
    );
    const rateMap = new Map<string, number>();
    for (const r of rateRows) {
      rateMap.set(`${r.labor_category}|${r.clearance}`, Number(r.rate));
    }

    // Look up indirects for the contract type
    const contractType = body.contract_type ?? 'T&M';
    const { rows: indirectRows } = await pool.query(
      `SELECT * FROM financial_indirects WHERE version_id = $1 AND contract_type = $2 LIMIT 1`,
      [versionId, contractType],
    );

    let fringePct = 0, overheadPct = 0, gaPct = 0, feePct = 0;
    if (indirectRows[0]) {
      fringePct = Number(indirectRows[0].fringe_pct);
      overheadPct = Number(indirectRows[0].overhead_pct);
      gaPct = Number(indirectRows[0].ga_pct);
      feePct = (Number(indirectRows[0].fee_band_low) + Number(indirectRows[0].fee_band_high)) / 2;
    }

    // Calculate labor costs
    let totalDirectLabor = 0;
    const laborDetails = body.labor_mix.map((item) => {
      const key = `${item.labor_category}|${item.clearance}`;
      const rate = item.rate_override ?? rateMap.get(key) ?? 0;
      const cost = rate * item.hours;
      totalDirectLabor += cost;
      return { ...item, rate, cost };
    });

    // Apply indirects
    const fringe = totalDirectLabor * (fringePct / 100);
    const overhead = totalDirectLabor * (overheadPct / 100);
    const subtotalBeforeGA = totalDirectLabor + fringe + overhead;
    const ga = subtotalBeforeGA * (gaPct / 100);

    // ODCs
    let totalOdcs = 0;
    const odcDetails = (body.odc_items ?? []).map((item) => {
      totalOdcs += item.amount;
      return item;
    });

    const totalCost = subtotalBeforeGA + ga + totalOdcs;
    const fee = totalCost * (feePct / 100);
    const totalPrice = totalCost + fee;
    const marginPct = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0;
    const doctrinePass = marginPct >= MARGIN_FLOOR_PCT;

    const periodMonths = body.period_months ?? 12;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [scenario] } = await client.query<{ id: string; created_at: string }>(
        `INSERT INTO pricing_scenarios
           (version_id, opportunity_id, capture_id, title, labor_mix, odc_items,
            contract_type, period_months, total_cost, total_price, margin_pct,
            doctrine_pass, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, created_at`,
        [
          versionId,
          body.opportunity_id ?? null,
          body.capture_id ?? null,
          body.title.trim(),
          JSON.stringify(laborDetails),
          JSON.stringify(odcDetails),
          contractType,
          periodMonths,
          totalCost,
          totalPrice,
          marginPct,
          doctrinePass,
          body.notes ?? null,
          'shawn',
        ],
      );

      // F-303 hook: if margin < 8%, create a risk
      if (!doctrinePass) {
        await client.query(
          `INSERT INTO risks (title, description, category, likelihood, impact, status, owner, source, opportunity_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            `Pricing scenario "${body.title}" below ${MARGIN_FLOOR_PCT}% margin floor`,
            `Margin ${marginPct.toFixed(1)}% is below the ${MARGIN_FLOOR_PCT}% doctrine floor. Executive override required per F-303.`,
            'pricing',
            4,
            4,
            'open',
            'Shawn',
            'financial_bible',
            body.opportunity_id ?? null,
          ],
        );
      }

      await client.query('COMMIT');

      await recordAuditLog(pool, {
        action: 'pricing_scenario_create',
        table_name: 'pricing_scenarios',
        record_ref: scenario.id,
        new_values: {
          title: body.title,
          margin_pct: marginPct,
          doctrine_pass: doctrinePass,
          total_price: totalPrice,
        },
        actor: 'shawn',
        source: 'user',
        request_id: req.requestId,
      });

      return reply.send(successEnvelope({
        id: scenario.id,
        version_id: versionId,
        title: body.title.trim(),
        contract_type: contractType,
        period_months: periodMonths,
        labor_detail: laborDetails,
        odc_detail: odcDetails,
        cost_breakdown: {
          direct_labor: totalDirectLabor,
          fringe,
          overhead,
          ga,
          total_odcs: totalOdcs,
          total_cost: totalCost,
          fee,
          total_price: totalPrice,
        },
        margin_pct: Math.round(marginPct * 100) / 100,
        doctrine_pass: doctrinePass,
        margin_floor: MARGIN_FLOOR_PCT,
        created_at: scenario.created_at,
      }, req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /v3/pricing-scenarios
  app.get('/v3/pricing-scenarios', async (req, reply) => {
    const query = req.query as {
      opportunity_id?: string;
      capture_id?: string;
    };

    const conditions = ['1=1'];
    const params: unknown[] = [];

    if (query.opportunity_id) {
      params.push(Number(query.opportunity_id));
      conditions.push(`opportunity_id = $${params.length}`);
    }
    if (query.capture_id) {
      params.push(Number(query.capture_id));
      conditions.push(`capture_id = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT ps.*, o.title AS opportunity_title, c.title AS capture_title
       FROM pricing_scenarios ps
       LEFT JOIN opportunities o ON o.id = ps.opportunity_id
       LEFT JOIN captures c ON c.id = ps.capture_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ps.created_at DESC`,
      params,
    );

    const items = rows.map((r) => ({
      id: r.id,
      version_id: r.version_id,
      opportunity_id: r.opportunity_id,
      capture_id: r.capture_id,
      opportunity_title: r.opportunity_title ?? null,
      capture_title: r.capture_title ?? null,
      title: r.title,
      contract_type: r.contract_type,
      period_months: r.period_months,
      total_cost: Number(r.total_cost),
      total_price: Number(r.total_price),
      margin_pct: Number(r.margin_pct),
      doctrine_pass: r.doctrine_pass,
      notes: r.notes,
      created_by: r.created_by,
      created_at: r.created_at,
    }));

    return reply.send(successEnvelope({ items }, req.requestId));
  });

  // GET /v3/pricing-scenarios/:id
  app.get('/v3/pricing-scenarios/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const { rows } = await pool.query(
      `SELECT ps.*, o.title AS opportunity_title, c.title AS capture_title
       FROM pricing_scenarios ps
       LEFT JOIN opportunities o ON o.id = ps.opportunity_id
       LEFT JOIN captures c ON c.id = ps.capture_id
       WHERE ps.id = $1`,
      [id],
    );

    if (!rows[0]) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Pricing scenario not found', req.requestId));
    }

    const r = rows[0];
    return reply.send(successEnvelope({
      id: r.id,
      version_id: r.version_id,
      opportunity_id: r.opportunity_id,
      capture_id: r.capture_id,
      opportunity_title: r.opportunity_title ?? null,
      capture_title: r.capture_title ?? null,
      title: r.title,
      labor_mix: r.labor_mix,
      odc_items: r.odc_items,
      contract_type: r.contract_type,
      period_months: r.period_months,
      total_cost: Number(r.total_cost),
      total_price: Number(r.total_price),
      margin_pct: Number(r.margin_pct),
      doctrine_pass: r.doctrine_pass,
      notes: r.notes,
      created_by: r.created_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }, req.requestId));
  });

  // GET /v3/financial-bible/indirects
  app.get('/v3/financial-bible/indirects', async (req, reply) => {
    const query = req.query as { version_id?: string };

    let versionId = query.version_id;
    if (!versionId) {
      const { rows } = await pool.query(
        `SELECT id FROM financial_bible_versions WHERE active = true LIMIT 1`,
      );
      if (!rows[0]) {
        return reply.send(successEnvelope({ items: [], message: 'No active version' }, req.requestId));
      }
      versionId = rows[0].id as string;
    }

    const { rows } = await pool.query(
      `SELECT * FROM financial_indirects WHERE version_id = $1 ORDER BY contract_type`,
      [versionId],
    );

    return reply.send(successEnvelope({
      items: rows.map((r) => ({
        contract_type: r.contract_type,
        fringe_pct: Number(r.fringe_pct),
        overhead_pct: Number(r.overhead_pct),
        ga_pct: Number(r.ga_pct),
        fee_band_low: Number(r.fee_band_low),
        fee_band_high: Number(r.fee_band_high),
      })),
      version_id: versionId,
    }, req.requestId));
  });

  // GET /v3/financial-bible/history
  app.get('/v3/financial-bible/history', async (req, reply) => {
    const query = req.query as { version_id?: string };

    let versionId = query.version_id;
    if (!versionId) {
      const { rows } = await pool.query(
        `SELECT id FROM financial_bible_versions WHERE active = true LIMIT 1`,
      );
      if (!rows[0]) {
        return reply.send(successEnvelope({ items: [], message: 'No active version' }, req.requestId));
      }
      versionId = rows[0].id as string;
    }

    const { rows } = await pool.query(
      `SELECT * FROM financial_history WHERE version_id = $1 ORDER BY pursuit_id`,
      [versionId],
    );

    return reply.send(successEnvelope({
      items: rows.map((r) => ({
        pursuit_id: r.pursuit_id,
        agency: r.agency,
        outcome: r.outcome,
        bid_price: r.bid_price != null ? Number(r.bid_price) : null,
        winner_price: r.winner_price != null ? Number(r.winner_price) : null,
        notes: r.notes,
      })),
      version_id: versionId,
    }, req.requestId));
  });
}
