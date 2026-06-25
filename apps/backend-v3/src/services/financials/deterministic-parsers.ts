/**
 * Deterministic parsers for the 6 financial doc types that return no_rows
 * when handled by LLM prompts alone. These parse the CSV-like extracted text
 * (produced by ExcelJS in parseXlsx) directly, handling:
 * - Grouped/blank-key rows (AR, AP)
 * - Embedded _x000D_ in headers (AP)
 * - Header not on row 0 (SIE)
 * - Large files (GL Detail: 8776 rows)
 * - Non-standard column layouts (Trial Balance: Beginning/Ending instead of debit/credit)
 *
 * Each parser returns rows matching the LLM output interfaces so they can be
 * passed directly to the existing ingest functions.
 */

import { logger } from '../../lib/logger.js';
import type { ArExtractOutput } from '../../lib/llm-router.types.js';
import type { ApExtractOutput } from '../../lib/llm-router.types.js';
import type { TrialBalanceExtractOutput } from '../../lib/llm-router.types.js';
import type { SieExtractOutput } from '../../lib/llm-router.types.js';
import type { CostDetailExtractOutput } from '../../lib/llm-router.types.js';
import type { ProjectRevenueExtractOutput } from '../../lib/llm-router.types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract lines from a specific sheet section of the extracted text. */
function getSheetLines(text: string, sheetName: string): string[] | null {
  // Support both formats: [Sheet: X] (xlsx extraction) and ## Sheet: X (vault extracted_text)
  const markers = [`[Sheet: ${sheetName}]`, `## Sheet: ${sheetName}`];
  let idx = -1;
  let markerLen = 0;
  for (const marker of markers) {
    idx = text.indexOf(marker);
    if (idx !== -1) {
      markerLen = marker.length;
      break;
    }
  }
  if (idx === -1) return null;

  const start = idx + markerLen;
  // Find the next sheet marker (either format)
  const nextBracket = text.indexOf('[Sheet:', start);
  const nextHash = text.indexOf('## Sheet:', start);
  let nextSheet: number;
  if (nextBracket === -1 && nextHash === -1) nextSheet = -1;
  else if (nextBracket === -1) nextSheet = nextHash;
  else if (nextHash === -1) nextSheet = nextBracket;
  else nextSheet = Math.min(nextBracket, nextHash);

  const section = nextSheet === -1 ? text.slice(start) : text.slice(start, nextSheet);
  return section.split('\n').filter((l) => l.trim().length > 0);
}

/** Try multiple sheet names, return first match. */
function getSheetLinesMulti(text: string, names: string[]): string[] | null {
  for (const name of names) {
    const lines = getSheetLines(text, name);
    if (lines && lines.length > 0) return lines;
  }
  // Fallback: if no sheet marker, treat entire text as lines
  if (!text.includes('[Sheet:') && !text.includes('## Sheet:')) {
    return text.split('\n').filter((l) => l.trim().length > 0);
  }
  return null;
}

/** Extract all sheet names from extracted text. */
function getAllSheetNames(text: string): string[] {
  const names: string[] = [];
  // Support both [Sheet: X] and ## Sheet: X formats
  const regex = /(?:\[Sheet: ([^\]]+)\]|## Sheet: (.+?)$)/gm;
  let m;
  while ((m = regex.exec(text)) !== null) names.push(m[1] || m[2]);
  return names;
}

/**
 * Normalize a line for fuzzy header-token matching: lowercase, drop the embedded
 * carriage-return marker ExcelJS leaves in multi-line cells, strip parentheses
 * (so "Prior Period(s)" matches "prior period"), and collapse whitespace.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/_x000d_/gi, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Select a worksheet by CONTENT, not by name.
 * 1. If no [Sheet:] markers → treat entire text as one sheet.
 * 2. If only one sheet → use it.
 * 3. Otherwise → pick the sheet whose header best matches headerSignature.
 * 4. Fallback → try fallbackNames in order (legacy name-based tiebreaker).
 *
 * Scoring sums the count of DISTINCT signature tokens found within a sliding
 * window of consecutive lines, not within a single line. This is essential
 * because ExcelJS splits a header cell that contains a newline (e.g. the Trial
 * Balance "Prior Period(s)\nYTD Activity" / "...Ending Balance" cell) across two
 * extracted lines — so no single line carries the full signature and a per-line
 * scorer caps the real sheet below a decoy/cover sheet that happens to mention a
 * couple of the tokens in prose, mis-selecting it and yielding no_rows.
 */
const SHEET_MATCH_WINDOW = 3;

function getSheetLinesByContent(
  text: string,
  headerSignature: string[],
  fallbackNames: string[],
): string[] | null {
  if (!text.includes('[Sheet:') && !text.includes('## Sheet:')) {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    return lines.length > 0 ? lines : null;
  }

  const sheetNames = getAllSheetNames(text);

  if (sheetNames.length === 1) {
    const lines = getSheetLines(text, sheetNames[0]);
    return lines && lines.length > 0 ? lines : null;
  }

  const lowerSig = headerSignature.map((s) => normalizeForMatch(s));
  let bestSheet: string | null = null;
  let bestScore = 0;

  for (const name of sheetNames) {
    const lines = getSheetLines(text, name);
    if (!lines || lines.length < 3) continue;

    const scan = Math.min(lines.length, 20);
    const norm = lines.slice(0, scan).map(normalizeForMatch);
    for (let i = 0; i < scan; i++) {
      const windowText = norm.slice(i, i + SHEET_MATCH_WINDOW).join(' ');
      const matchCount = lowerSig.filter((s) => windowText.includes(s)).length;
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestSheet = name;
      }
    }
  }

  if (bestSheet && bestScore >= Math.ceil(lowerSig.length * 0.5)) {
    return getSheetLines(text, bestSheet);
  }

  return getSheetLinesMulti(text, fallbackNames);
}

/**
 * Split a row into columns. Auto-detects pipe-delimited (vault extracted_text)
 * vs comma-delimited (xlsx extraction) format.
 */
function splitRow(line: string): string[] {
  // Pipe-delimited format: used by vault extracted_text
  if (line.includes('|')) {
    return line.split('|').map((v) => v.trim());
  }
  // Comma-delimited: legacy xlsx extraction format
  return line.split(',').map((v) => v.trim());
}

/** Parse a numeric string, stripping $, commas, whitespace. Returns NaN on failure. */
function parseNum(v: string): number {
  if (!v || v === '' || v === '-' || v === 'null' || v === 'undefined') return 0;
  const cleaned = v.replace(/[$,\s]/g, '').replace(/[()]/g, (m) => m === '(' ? '-' : '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Infer period and fiscal year from filename. */
function inferPeriod(filename: string): { period: string; fiscal_year: number; quarter: number } | null {
  const months: Record<string, { num: number; label: string }> = {
    jan: { num: 1, label: 'Jan' }, feb: { num: 2, label: 'Feb' }, mar: { num: 3, label: 'Mar' },
    apr: { num: 4, label: 'Apr' }, may: { num: 5, label: 'May' }, jun: { num: 6, label: 'Jun' },
    jul: { num: 7, label: 'Jul' }, aug: { num: 8, label: 'Aug' }, sep: { num: 9, label: 'Sep' },
    oct: { num: 10, label: 'Oct' }, nov: { num: 11, label: 'Nov' }, dec: { num: 12, label: 'Dec' },
  };

  // Match patterns like MAY-2026, MAY-26, MAY2026, MAY26, 2026-MAY, etc.
  const monthYearPattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[- ]?(20\d{2}|\d{2})\b/i;
  const yearMonthPattern = /\b(20\d{2}|\d{2})[- ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

  let match = filename.match(monthYearPattern);
  if (match) {
    const monthKey = match[1].toLowerCase();
    const yearStr = match[2];
    const year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
    const m = months[monthKey];
    if (m) {
      return {
        period: `FY${String(year).slice(2)} ${m.label}`,
        fiscal_year: year,
        quarter: Math.ceil(m.num / 3),
      };
    }
  }

  match = filename.match(yearMonthPattern);
  if (match) {
    const yearStr = match[1];
    const monthKey = match[2].toLowerCase();
    const year = yearStr.length === 2 ? 2000 + parseInt(yearStr, 10) : parseInt(yearStr, 10);
    const m = months[monthKey];
    if (m) {
      return {
        period: `FY${String(year).slice(2)} ${m.label}`,
        fiscal_year: year,
        quarter: Math.ceil(m.num / 3),
      };
    }
  }

  return null;
}

/**
 * Find a header row by checking if a line contains expected column names.
 * Returns the 0-based index of the header row, or -1 if not found.
 */
function findHeaderRow(lines: string[], expectedCols: string[], startFrom = 0): number {
  const lowerCols = expectedCols.map((c) => c.toLowerCase().replace(/_x000d_/gi, ''));
  for (let i = startFrom; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase().replace(/_x000d_/gi, '');
    const matchCount = lowerCols.filter((c) => lower.includes(c)).length;
    if (matchCount >= Math.ceil(expectedCols.length * 0.5)) {
      return i;
    }
  }
  return -1;
}

/**
 * Build a column index map from a header row.
 * Strips _x000D_ and normalizes whitespace.
 */
function buildColumnMap(headerLine: string): Map<string, number> {
  const cols = splitRow(headerLine);
  const map = new Map<string, number>();
  for (let i = 0; i < cols.length; i++) {
    const normalized = cols[i].replace(/_x000D_/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized) map.set(normalized, i);
  }
  return map;
}

/** Get column value by approximate key match (exact then substring). */
function getCol(cols: string[], colMap: Map<string, number>, ...keys: string[]): string {
  // Exact match first
  for (const key of keys) {
    const idx = colMap.get(key.toLowerCase());
    if (idx !== undefined && idx < cols.length) return cols[idx];
  }
  // Substring fallback: handle format drift where headers contain extra words
  for (const key of keys) {
    const lk = key.toLowerCase();
    for (const [header, idx] of colMap.entries()) {
      if (header.includes(lk) && idx < cols.length) return cols[idx];
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Parser: 184 Aged AR — sheet "DataSetLandTbl", 102 rows × 9 cols → ar_actuals
// ---------------------------------------------------------------------------

export function parseAgedAr(
  extractedText: string,
  filename: string,
): ArExtractOutput | null {
  const lines = getSheetLinesByContent(
    extractedText,
    ['project', 'invoice', 'due date', 'current'],
    ['DataSetLandTbl', 'Sheet1', 'Page1'],
  );
  if (!lines || lines.length < 3) return null;

  const periodInfo = inferPeriod(filename);
  if (!periodInfo) {
    logger.warn({ filename }, 'AR deterministic: cannot infer period from filename');
    return null;
  }

  // Find header row containing "Project" and "Invoice"
  let headerIdx = findHeaderRow(lines, ['project', 'invoice', 'due date', 'current', 'balance due']);
  if (headerIdx === -1) {
    headerIdx = findHeaderRow(lines, ['project', 'invoice', 'due date', 'current', 'total']);
    if (headerIdx === -1) {
      headerIdx = findHeaderRow(lines, ['project', 'invoice', 'current']);
      if (headerIdx === -1) return null;
    }
  }

  const colMap = buildColumnMap(lines[headerIdx]);
  const rows: ArExtractOutput['rows'] = [];
  let currentCustomer = '';

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const rawLine = lines[i];

    // Detect "Customer Account" group-header rows BEFORE the length check —
    // In pipe format: "Customer Account: A00001   US Army Contracting Cmd |  | Customer Account: ..."
    const rawFirst = cols[0] || '';
    if (/customer\s*account/i.test(rawFirst) || /customer\s*account/i.test(cols[2] || '')) {
      // Extract customer name: strip the "Customer Account: XXXXX   " prefix
      const fullText = /customer\s*account/i.test(rawFirst) ? rawFirst : (cols[2] || '');
      const match = fullText.match(/customer\s*account[:\s]*\S+\s{2,}(.*)/i);
      if (match) {
        currentCustomer = match[1].trim();
      } else {
        const match2 = fullText.match(/customer\s*account[:\s]*\S+\s+(.*)/i);
        currentCustomer = match2 ? match2[1].trim() : fullText.replace(/^customer\s*account[:\s]*/i, '').trim();
      }
      continue;
    }

    if (cols.length < 5) continue;

    const firstCol = rawFirst;
    const projectCol = getCol(cols, colMap, 'project') || cols[1] || '';
    const invoiceCol = getCol(cols, colMap, 'invoice number', 'invoice') || cols[2] || '';

    // Detect standalone customer name rows (non-blank first col, no project/invoice)
    if (firstCol && !projectCol && !invoiceCol) {
      currentCustomer = firstCol.replace(/^customer\s*account[:\s]*/i, '').trim();
      continue;
    }

    // Skip subtotal rows — in pipe format these look like: " | Total for Project: ... | ..."
    if (/^total\s*(for|$)/i.test(projectCol) || /^total\s*(for|$)/i.test(firstCol)) continue;
    if (/^grand\s+total/i.test(firstCol) || /^grand\s+total/i.test(projectCol)) continue;
    // Also catch "Total for Customer Account:" rows
    if (/total\s+for\s+(customer|project)/i.test(rawLine)) continue;
    // Skip the final "Total" summary row
    if (/^\s*\|?\s*total\s*$/i.test(projectCol) || projectCol.toLowerCase() === 'total') continue;

    // Data row: needs at least a project/invoice
    if (!projectCol && !invoiceCol) continue;

    // Parse aging buckets
    const currentAmt = parseNum(getCol(cols, colMap, 'current') || cols[4] || '0');
    const days31_60 = parseNum(getCol(cols, colMap, '31 to 60', '31-60') || cols[5] || '0');
    const days61_90 = parseNum(getCol(cols, colMap, '61 to 90', '61-90') || cols[6] || '0');
    const days91plus = parseNum(getCol(cols, colMap, 'over 90', '(91+/over)', '91+') || cols[7] || '0');
    const total = parseNum(getCol(cols, colMap, 'balance due', 'total') || cols[cols.length - 1] || '0');

    if (total === 0 && currentAmt === 0 && days31_60 === 0 && days61_90 === 0 && days91plus === 0) continue;

    const customerName = currentCustomer || firstCol || projectCol;

    // Parse due date — handles ISO, US date, and JS Date.toString() format
    const dueDateRaw = getCol(cols, colMap, 'due date') || cols[3] || '';
    let dueDate: string | null = null;
    if (dueDateRaw) {
      const dateMatch = dueDateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        dueDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      } else {
        const altMatch = dueDateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (altMatch) {
          const yr = altMatch[3].length === 2 ? `20${altMatch[3]}` : altMatch[3];
          dueDate = `${yr}-${altMatch[1].padStart(2, '0')}-${altMatch[2].padStart(2, '0')}`;
        } else {
          // Handle JS Date.toString(): "Tue Jun 30 2026 00:00:00 GMT+0000 (...)"
          const jsDateMatch = dueDateRaw.match(/\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/);
          if (jsDateMatch) {
            const monthMap: Record<string, string> = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
            const mm = monthMap[jsDateMatch[1]] || '01';
            dueDate = `${jsDateMatch[3]}-${mm}-${jsDateMatch[2].padStart(2, '0')}`;
          }
        }
      }
    }

    // Emit one row per non-zero aging bucket (AR-DATA-1: capture all 4 buckets)
    const buckets: Array<{ bucket: string; amt: number }> = [
      { bucket: 'Current', amt: currentAmt },
      { bucket: '31-60', amt: days31_60 },
      { bucket: '61-90', amt: days61_90 },
      { bucket: 'Over 90', amt: days91plus },
    ];
    for (const { bucket, amt } of buckets) {
      if (amt === 0) continue;
      rows.push({
        period: periodInfo.period,
        fiscal_year: periodInfo.fiscal_year,
        quarter: periodInfo.quarter,
        customer_name: customerName,
        invoice_number: invoiceCol || null,
        invoice_date: null,
        due_date: dueDate,
        amount: Math.abs(amt),
        age_bucket: bucket,
      });
    }
  }

  if (rows.length === 0) return null;

  return {
    is_ar: true,
    rows,
    notes: `Deterministic parser: extracted ${rows.length} AR rows from ${filename}`,
    model_used: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Parser: 185 Full Proj Revenue Summary — sheet "Page1", 184 rows × 29 cols
// ---------------------------------------------------------------------------

export function parseProjectRevenueSummary(
  extractedText: string,
  filename: string,
): ProjectRevenueExtractOutput | null {
  const lines = getSheetLinesByContent(
    extractedText,
    ['revenue project', 'itd value', 'itd funding'],
    ['Page1', 'Sheet1', 'DataSetLandTbl'],
  );
  if (!lines || lines.length < 3) return null;

  const periodInfo = inferPeriod(filename);
  if (!periodInfo) {
    logger.warn({ filename }, 'ProjRev deterministic: cannot infer period from filename');
    return null;
  }

  // Find header row containing "Revenue Project" or "Project"
  let effectiveHeaderIdx = findHeaderRow(lines, ['revenue project', 'itd value', 'itd funding']);
  if (effectiveHeaderIdx === -1) {
    effectiveHeaderIdx = findHeaderRow(lines, ['project', 'revenue', 'cost', 'funding']);
    if (effectiveHeaderIdx === -1) return null;
  }
  const colMap = buildColumnMap(lines[effectiveHeaderIdx]);
  const rows: ProjectRevenueExtractOutput['rows'] = [];

  for (let i = effectiveHeaderIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 3) continue;

    // Get project identification
    const projectId = getCol(cols, colMap, 'revenue project (id)', 'revenue project', 'project id', 'project') || cols[0] || '';
    const projectName = getCol(cols, colMap, 'revenue project (name)', 'project name', 'name') || cols[1] || '';

    if (!projectId && !projectName) continue;
    // Skip total/summary rows
    if (/^(grand\s+)?total/i.test(projectId) || /^(grand\s+)?total/i.test(projectName)) continue;

    const displayName = projectName || projectId;
    const contractNum = projectId || null;

    // Period-specific columns (preferred — these are the single-period values)
    const periodRevenue = parseNum(getCol(cols, colMap,
      'actual period revenue', 'period revenue', 'current revenue',
      'current period revenue', 'act period revenue', 'act per revenue',
      'act. period revenue', 'actual per revenue'));
    const periodCosts = parseNum(getCol(cols, colMap,
      'actual period costs', 'period costs', 'current costs',
      'current period costs', 'act period costs', 'act per costs',
      'act. period costs', 'actual per costs'));
    const periodProfit = parseNum(getCol(cols, colMap,
      'actual period profit', 'period profit', 'current profit',
      'current period profit', 'act period profit', 'act per profit'));

    // ITD columns (only used as signal that a row has data, never as revenue)
    const itdFunding = parseNum(getCol(cols, colMap, 'itd funding'));
    const itdValue = parseNum(getCol(cols, colMap, 'itd value', 'itd revenue', 'total revenue'));

    // Revenue/cost: use period columns only — never fall back to ITD cumulative
    // values which inflate monthly totals by the full contract lifetime amount.
    const revenue = periodRevenue;
    const cost = periodCosts;

    // Skip rows with no financial data at all
    if (revenue === 0 && cost === 0 && itdFunding === 0 && itdValue === 0) continue;

    // Compute margin from period values; clamp to plausible range
    let marginPct: number | null = null;
    if (revenue !== 0) {
      const raw = ((revenue - cost) / revenue) * 100;
      marginPct = raw > 200 || raw < -200 ? null : Math.round(raw * 100) / 100;
    }

    rows.push({
      period: periodInfo.period,
      fiscal_year: periodInfo.fiscal_year,
      quarter: periodInfo.quarter,
      project_name: displayName,
      contract_number: contractNum,
      revenue,
      cost,
      margin_pct: marginPct,
    });
  }

  if (rows.length === 0) return null;

  return {
    is_project_revenue: true,
    rows,
    notes: `Deterministic parser: extracted ${rows.length} project revenue rows from ${filename}`,
    model_used: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Parser: 188 Open AP Report — sheet "Detail", 293 rows × 12 cols → ap_actuals
// ---------------------------------------------------------------------------

export function parseOpenAp(
  extractedText: string,
  filename: string,
): ApExtractOutput | null {
  // Try primary signature, then relaxed signatures to handle month-to-month
  // layout drift (AP-DATA-2). Some months omit 'voucher' or rename 'amount'.
  let lines = getSheetLinesByContent(
    extractedText,
    ['vendor', 'voucher', 'invoice', 'amount'],
    ['Detail', 'Sheet1', 'Page1'],
  );
  if (!lines || lines.length < 3) {
    lines = getSheetLinesByContent(
      extractedText,
      ['vendor', 'invoice', 'due'],
      ['Detail', 'Sheet1', 'Page1'],
    );
  }
  if (!lines || lines.length < 3) {
    lines = getSheetLinesByContent(
      extractedText,
      ['vendor', 'amount'],
      ['Detail', 'Sheet1', 'Page1', 'AP Detail'],
    );
  }
  if (!lines || lines.length < 3) return null;

  const periodInfo = inferPeriod(filename);
  if (!periodInfo) {
    logger.warn({ filename }, 'AP deterministic: cannot infer period from filename');
    return null;
  }

  // Find header row - strip _x000D_ when searching; handle varied month formats
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cleaned = lines[i].replace(/_x000D_/gi, '').replace(/\r/g, '').toLowerCase();
    if ((cleaned.includes('vendor') || cleaned.includes('voucher') || cleaned.includes('supplier')) &&
        (cleaned.includes('invoice') || cleaned.includes('amount') || cleaned.includes('due') ||
         cleaned.includes('balance') || cleaned.includes('total'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    // Fallback: first line is header
    headerIdx = 0;
  }

  const colMap = buildColumnMap(lines[headerIdx]);
  const rows: ApExtractOutput['rows'] = [];
  let currentVendor = '';

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = splitRow(rawLine);
    if (cols.length < 3) continue;

    const firstCol = cols[0] || '';
    const cleanFirst = firstCol.replace(/_x000D_/gi, '').trim();

    // Skip Account: and Organization: group headers
    if (/^account\s*:/i.test(cleanFirst)) continue;
    if (/^organization\s*:/i.test(cleanFirst)) continue;

    // Skip subtotal rows
    if (/^subtotal\s+for/i.test(cleanFirst)) continue;
    if (/^total/i.test(cleanFirst) && !/^\d/.test(cleanFirst)) continue;
    if (/^grand\s+total/i.test(cleanFirst)) continue;

    // Detect vendor name rows: non-empty first col that isn't a number/voucher
    if (cleanFirst && !cols[1] && !cols[2]) {
      // Likely a vendor name row (single value on the line)
      currentVendor = cleanFirst;
      continue;
    }
    // Also detect vendor rows: non-empty text that doesn't look like data
    if (cleanFirst && !/^\d/.test(cleanFirst) && cols.filter((c) => c).length <= 2) {
      currentVendor = cleanFirst;
      continue;
    }

    // Parse data row
    const vendorName = currentVendor || cleanFirst;
    if (!vendorName) continue;

    // Try to get invoice/voucher number and amounts
    const voucherNum = getCol(cols, colMap, 'voucher', 'voucher number') || cols[1] || '';
    const invoiceNum = getCol(cols, colMap, 'invoice', 'invoice number', 'invoice no', 'invoice #') || '';
    const invoiceDateRaw = getCol(cols, colMap, 'invoice date', 'invoice_date') || '';
    const dueDateRaw = getCol(cols, colMap, 'due date', 'due_date') || '';

    // Find amount columns — try many patterns to handle month-to-month layout drift
    let amountStr = getCol(cols, colMap,
      'amount', 'amount due', 'balance', 'balance due', 'total',
      'open amount', 'invoice amount', 'current', 'net amount',
      'amt', 'amt due', 'document amount', 'original amount',
      'open balance', 'remaining amount', 'amount remaining');
    // Positional fallback: if getCol found nothing, try the last numeric column
    if (!amountStr) {
      for (let ci = cols.length - 1; ci >= 3; ci--) {
        const candidate = cols[ci];
        if (candidate && /^[\s$()\d,.-]+$/.test(candidate) && parseNum(candidate) !== 0) {
          amountStr = candidate;
          break;
        }
      }
    }
    const amount = parseNum(amountStr);

    // If no identifiable data, skip
    if (amount === 0 && !voucherNum && !invoiceNum) continue;

    // Parse dates
    let invoiceDate: string | null = null;
    let dueDate: string | null = null;
    const parseDateStr = (raw: string): string | null => {
      if (!raw) return null;
      const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return raw.trim().slice(0, 10);
      const usMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (usMatch) {
        const yr = usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3];
        return `${yr}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
      }
      return null;
    };
    invoiceDate = parseDateStr(invoiceDateRaw);
    dueDate = parseDateStr(dueDateRaw);

    // Determine age bucket
    const ageBucket = getCol(cols, colMap, 'status', 'current status', 'age', 'aging', 'age bucket') || null;

    rows.push({
      period: periodInfo.period,
      fiscal_year: periodInfo.fiscal_year,
      quarter: periodInfo.quarter,
      vendor_name: vendorName,
      invoice_number: invoiceNum || voucherNum || null,
      invoice_date: invoiceDate,
      due_date: dueDate,
      amount: Math.abs(amount),
      age_bucket: ageBucket,
    });
  }

  if (rows.length === 0) return null;

  return {
    is_ap: true,
    rows,
    notes: `Deterministic parser: extracted ${rows.length} AP rows from ${filename}`,
    model_used: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Parser: 189 Trail Balance — sheet "DataSetLandTbl", 209 rows × 7 cols
// ---------------------------------------------------------------------------

export function parseTrialBalance(
  extractedText: string,
  filename: string,
): TrialBalanceExtractOutput | null {
  const lines = getSheetLinesByContent(
    extractedText,
    ['account', 'beginning balance', 'ending balance'],
    ['DataSetLandTbl', 'Sheet1', 'Page1'],
  );
  if (!lines || lines.length < 3) return null;

  const periodInfo = inferPeriod(filename);
  if (!periodInfo) {
    logger.warn({ filename }, 'TB deterministic: cannot infer period from filename');
    return null;
  }

  // Find header: Account | Account Name | Organization | Beginning Balance | Prior Period(s) YTD Activity | Current Pd Activity | Ending Balance
  // NOTE: In extracted_text format, the header wraps across two physical lines:
  //   Line A: Account | Account Name | Organization | Beginning Balance | Prior Period(s)
  //   Line B: YTD Activity | Current Pd Activity | Ending Balance
  // Detect the wrap and reconstruct a single logical header.
  let effectiveHeaderIdx = findHeaderRow(lines, ['account', 'beginning balance', 'ending balance']);
  if (effectiveHeaderIdx === -1) {
    effectiveHeaderIdx = findHeaderRow(lines, ['account', 'account name', 'balance']);
    if (effectiveHeaderIdx === -1) {
      effectiveHeaderIdx = findHeaderRow(lines, ['account', 'beginning balance']);
      if (effectiveHeaderIdx === -1) {
        effectiveHeaderIdx = findHeaderRow(lines, ['account', 'account name', 'beginning']);
        if (effectiveHeaderIdx === -1) return null;
      }
    }
  }
  // If the header line doesn't contain "ending balance", it might be split across two lines.
  // Merge with the next line to reconstruct the full header.
  let headerLine = lines[effectiveHeaderIdx];
  const headerLower = headerLine.toLowerCase();
  const isPipeFormat = headerLine.includes('|');
  let dataStartIdx = effectiveHeaderIdx + 1;
  if (!headerLower.includes('ending balance') && !headerLower.includes('ending bal')) {
    if (effectiveHeaderIdx + 1 < lines.length) {
      const nextLine = lines[effectiveHeaderIdx + 1];
      const nextLower = nextLine.toLowerCase();
      // If next line contains balance-related terms or "activity", it's the continuation
      if (nextLower.includes('ending') || nextLower.includes('activity') || nextLower.includes('current pd')) {
        // For pipe format, join with pipe; for CSV, join with comma
        const joiner = isPipeFormat ? ' | ' : ',';
        headerLine = headerLine + joiner + nextLine;
        dataStartIdx = effectiveHeaderIdx + 2;
      }
    }
  }

  // For the Trial Balance extracted_text format, we have a merged 8-column header
  // but data rows only have 7 columns (Organization + Beginning Balance are combined
  // or Prior Period(s) is missing from data). Detect and handle this alignment:
  // Header (8 cols after merge): Account | Account Name | Organization | Beginning Balance | Prior Period(s) | YTD Activity | Current Pd Activity | Ending Balance
  // Data (7 cols): Account | Account Name | Organization | Beginning Balance | YTD Activity | Current Pd Activity | Ending Balance
  // The trick: build a map from the known column NAMES the data actually has.
  const colMap = buildColumnMap(headerLine);
  const rows: TrialBalanceExtractOutput['rows'] = [];

  for (let i = dataStartIdx; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 4) continue;

    const accountCode = getCol(cols, colMap, 'account', 'account code', 'acct') || cols[0] || '';
    const accountName = getCol(cols, colMap, 'account name', 'name', 'description') || cols[1] || '';

    if (!accountCode) continue;
    // Skip total/summary rows and "AMOUNT OUT OF BALANCE" rows
    if (/^total/i.test(accountCode) || /^grand/i.test(accountCode)) continue;
    if (/^amount\s+out/i.test(accountCode)) continue;
    // Account code should look like a code (contain digits or known alpha patterns like ADM-CRT, FRG-DLR)
    if (!/\d/.test(accountCode) && !/^[A-Z]{2,4}-[A-Z]{2,4}$/i.test(accountCode)) continue;

    // Get ending balance (primary value for debit/credit mapping)
    // In pipe format with 7 data cols vs 8 header cols, ending balance is always the LAST column
    const endingBalance = parseNum(
      getCol(cols, colMap, 'ending balance', 'ending bal', 'end balance', 'balance') || cols[cols.length - 1] || '0',
    );

    // Map to debit/credit: positive ending balance → debit, negative → credit
    const debit = endingBalance >= 0 ? endingBalance : 0;
    const credit = endingBalance < 0 ? Math.abs(endingBalance) : 0;

    rows.push({
      period: periodInfo.period,
      fiscal_year: periodInfo.fiscal_year,
      quarter: periodInfo.quarter,
      account_code: accountCode,
      account_name: accountName || accountCode,
      debit,
      credit,
    });
  }

  if (rows.length === 0) return null;

  return {
    is_trial_balance: true,
    rows,
    notes: `Deterministic parser: extracted ${rows.length} trial balance rows from ${filename}`,
    model_used: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Parser: 190 Trend SIE — sheet "Page1", 197 rows × 15 cols
// Header on ROW 1 (row 0 is title). Extract pool rates for the ingest month.
// ---------------------------------------------------------------------------

export function parseTrendSie(
  extractedText: string,
  filename: string,
): SieExtractOutput | null {
  const lines = getSheetLinesByContent(
    extractedText,
    ['pool number', 'pool name', 'wrap rate'],
    ['Page1', 'Sheet1'],
  );
  if (!lines || lines.length < 4) return null;

  const periodInfo = inferPeriod(filename);
  if (!periodInfo) {
    logger.warn({ filename }, 'SIE deterministic: cannot infer period from filename');
    return null;
  }

  // Find the header row containing "Pool Number" or "Pool Name"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('pool number') || lower.includes('pool name')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const headerCols = splitRow(lines[headerIdx]);

  // Detect the left-table boundary: find the empty separator column or the second
  // occurrence of "pool number"/"pool name" which indicates the right-side table.
  // The left table has: Pool Number, Pool Name, then monthly ACT columns.
  // Headers often render as "[object Object]" when cells contain RichText formatting.
  let leftTableEnd = headerCols.length;
  for (let c = 2; c < headerCols.length; c++) {
    const val = headerCols[c].trim().toLowerCase();
    // Empty separator column between left and right tables
    if (val === '' && c > 2) {
      leftTableEnd = c;
      break;
    }
    // Or if we hit another "pool number" / "pool name" (right table header)
    if (val === 'pool number' || val === 'pool name') {
      leftTableEnd = c;
      break;
    }
  }

  // The monthly ACT columns are at indices 2..(leftTableEnd-1) in order JAN, FEB, MAR, ...
  // Since headers may be [object Object], we use positional logic based on month number.
  const periodMonthMatch = periodInfo.period.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  const periodMonthStr = periodMonthMatch ? periodMonthMatch[1].toLowerCase() : null;

  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthIdx = periodMonthStr ? monthNames.indexOf(periodMonthStr) : -1;

  // Try name-based matching first (works when headers are not [object Object])
  let targetColIdx = -1;
  for (let c = 2; c < leftTableEnd; c++) {
    const colLower = headerCols[c].toLowerCase().trim();
    if (periodMonthStr && colLower.includes('act') && colLower.includes(periodMonthStr)) {
      targetColIdx = c;
      break;
    }
  }

  // Fallback: positional logic — month columns start at index 2 in chronological order
  if (targetColIdx === -1 && monthIdx >= 0) {
    const positionalIdx = 2 + monthIdx; // JAN=2, FEB=3, MAR=4, APR=5, MAY=6, ...
    if (positionalIdx < leftTableEnd) {
      targetColIdx = positionalIdx;
    }
  }

  if (targetColIdx === -1) {
    logger.warn({ filename, headerCols: headerCols.slice(0, leftTableEnd) }, 'SIE deterministic: could not identify target month column');
    return null;
  }

  const rows: SieExtractOutput['rows'] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 3) continue;

    // Always use positional cols 0 and 1 for pool number/name (left table)
    const poolNumber = cols[0] || '';
    const poolName = cols[1] || '';

    if (!poolNumber && !poolName) continue;
    // Stop at "POOL DETAIL" section
    if (/^pool\s*detail/i.test(poolNumber) || /^pool\s*detail/i.test(poolName)) break;
    // Skip headers/titles/blank rows
    if (/^(trend|rate|summary|acct)/i.test(poolNumber)) continue;
    if (/^(trend|rate|summary|acct)/i.test(poolName)) continue;
    // Pool number should be numeric
    if (poolNumber && !/^\d+$/.test(poolNumber.trim())) continue;

    const rate = targetColIdx < cols.length
      ? parseNum(cols[targetColIdx])
      : 0;

    rows.push({
      period: periodInfo.period,
      fiscal_year: periodInfo.fiscal_year,
      quarter: periodInfo.quarter,
      pool: poolName || `Pool ${poolNumber}`,
      account_code: poolNumber || null,
      account_name: poolName || `Pool ${poolNumber}`,
      current_period_actual: rate,
      current_period_budget: 0,
      ytd_actual: 0,
      ytd_budget: 0,
    });
  }

  if (rows.length === 0) return null;

  return {
    is_sie: true,
    rows,
    notes: `Deterministic parser: extracted ${rows.length} SIE rate rows from ${filename}`,
    model_used: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Parser: 192 YTD GL Detail — sheet "Page1", 8776 rows × 26 cols
// Aggregates journal entries into cost_element × pool groupings.
// ---------------------------------------------------------------------------

export function parseYtdGlDetail(
  extractedText: string,
  filename: string,
): CostDetailExtractOutput | null {
  const lines = getSheetLinesByContent(
    extractedText,
    ['fy', 'pd', 'proj classification', 'project id'],
    ['Page1', 'Sheet1'],
  );
  if (!lines || lines.length < 3) return null;

  const periodInfo = inferPeriod(filename);
  if (!periodInfo) {
    logger.warn({ filename }, 'GL deterministic: cannot infer period from filename');
    return null;
  }

  // Find header row: FY | PD | SP | Jrnl | Seq | Proj Classification | Project ID | ...
  let effectiveHeaderIdx = findHeaderRow(lines, ['fy', 'pd', 'proj classification', 'project id']);
  if (effectiveHeaderIdx === -1) {
    effectiveHeaderIdx = findHeaderRow(lines, ['fy', 'pd', 'project', 'account']);
    if (effectiveHeaderIdx === -1) return null;
  }
  const colMap = buildColumnMap(lines[effectiveHeaderIdx]);
  const headerCols = splitRow(lines[effectiveHeaderIdx]);

  // Find key column indices
  const fyIdx = colMap.get('fy') ?? 0;
  const pdIdx = colMap.get('pd') ?? 1;
  const projClassIdx = colMap.get('proj classification') ?? colMap.get('project classification') ?? 5;
  const projectIdIdx = colMap.get('project id') ?? 6;

  // Find account/amount columns
  let accountIdx = -1;
  let amountIdx = -1;
  for (const [key, idx] of colMap.entries()) {
    if (key.includes('account') && !key.includes('name') && accountIdx === -1) accountIdx = idx;
    if ((key.includes('amount') || key.includes('total') || key.includes('debit') || key.includes('credit')) && amountIdx === -1) amountIdx = idx;
  }
  // Fallback: look for numeric columns in the header
  if (amountIdx === -1) {
    // Try common positions for amount in GL detail
    for (let c = headerCols.length - 1; c >= 10; c--) {
      const h = headerCols[c].toLowerCase();
      if (h.includes('amount') || h.includes('total') || h.includes('amt')) {
        amountIdx = c;
        break;
      }
    }
  }

  // Determine ingest period number from the period label
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const periodMonthMatch = periodInfo.period.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  const targetPd = periodMonthMatch ? monthMap[periodMonthMatch[1].toLowerCase()] : null;

  // Aggregate by proj_classification (pool) + account (cost_element)
  const aggregates = new Map<string, { target: number; actual: number }>();

  for (let i = effectiveHeaderIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 5) continue;

    // Filter by fiscal year if present
    const fy = cols[fyIdx] || '';
    if (fy && !/^\d{4}$/.test(fy.trim())) continue;

    // Filter by period if targetPd is set
    const pd = cols[pdIdx] || '';
    if (targetPd !== null && pd) {
      const pdNum = parseInt(pd.trim(), 10);
      if (!isNaN(pdNum) && pdNum !== targetPd) continue;
    }

    const projClass = (cols[projClassIdx] || '').trim();
    const projectId = (cols[projectIdIdx] || '').trim();
    const account = accountIdx >= 0 && accountIdx < cols.length ? (cols[accountIdx] || '').trim() : '';
    const amount = amountIdx >= 0 && amountIdx < cols.length ? parseNum(cols[amountIdx]) : 0;

    if (!projClass && !account && !projectId) continue;
    if (amount === 0) continue;

    // Use proj classification as pool, account (or project ID) as cost element
    const pool = projClass || 'UNCLASSIFIED';
    const costElement = account || projectId || 'UNKNOWN';
    const key = `${pool}|||${costElement}`;

    const existing = aggregates.get(key);
    if (existing) {
      existing.actual += amount;
    } else {
      aggregates.set(key, { target: 0, actual: amount });
    }
  }

  const rows: CostDetailExtractOutput['rows'] = [];
  for (const [key, values] of aggregates.entries()) {
    const [pool, costElement] = key.split('|||');
    rows.push({
      period: periodInfo.period,
      fiscal_year: periodInfo.fiscal_year,
      quarter: periodInfo.quarter,
      cost_element: costElement,
      pool,
      target_amount: values.target,
      actual_amount: values.actual,
    });
  }

  if (rows.length === 0) return null;

  return {
    is_cost_detail: true,
    rows,
    notes: `Deterministic parser: extracted ${rows.length} GL detail cost rows (aggregated by classification × account) from ${filename}`,
    model_used: 'deterministic',
  };
}
