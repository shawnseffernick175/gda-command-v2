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
import type { FinancialStatementExtractOutput } from '../../lib/llm-router.types.js';
import type { BalanceSheetExtractOutput } from '../../lib/llm-router.types.js';

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
export function cleanHeaderText(s: string): string {
  // ExcelJS renders a carriage return inside a header cell as the literal
  // _x000D_ (and occasionally a raw \r). Replace both with a space — not the
  // empty string — so a split cell like "Vendor_x000D_Name" normalizes to
  // "vendor name" (matchable) rather than "vendorname" (a lookup miss).
  return s
    .replace(/_x000d_/gi, ' ')
    .replace(/\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatch(s: string): string {
  return cleanHeaderText(s.replace(/[()]/g, ' ')).toLowerCase();
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
export function inferPeriod(filename: string): { period: string; fiscal_year: number; quarter: number } | null {
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
  const lowerCols = expectedCols.map((c) => cleanHeaderText(c).toLowerCase());
  for (let i = startFrom; i < Math.min(lines.length, 10); i++) {
    const lower = cleanHeaderText(lines[i]).toLowerCase();
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
    const normalized = cleanHeaderText(cols[i]).toLowerCase();
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
    // In pipe format with 7 data cols vs 8 header cols, the colMap maps 'ending balance'
    // to an out-of-bounds index (8-col header vs 7-col data). Avoid the generic 'balance'
    // key which substring-matches 'beginning balance' at a valid index, yielding a wrong value.
    // Fallback to the last data column which is always the ending balance.
    const endingBalance = parseNum(
      getCol(cols, colMap, 'ending balance', 'ending bal', 'end balance') || cols[cols.length - 1] || '0',
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

  // Find ACT YTD and PROV YTD columns by header name (within left table only)
  let ytdActColIdx = -1;
  let provYtdColIdx = -1;
  for (let c = 2; c < leftTableEnd; c++) {
    const colLower = headerCols[c].toLowerCase().trim();
    if (/\bact\b.*\bytd/.test(colLower) && !colLower.includes('wrap')) {
      ytdActColIdx = c;
    }
    if (/\bprov\b.*\bytd/.test(colLower) && !colLower.includes('wrap')) {
      provYtdColIdx = c;
    }
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

    const ytdActual = ytdActColIdx >= 0 && ytdActColIdx < cols.length ? parseNum(cols[ytdActColIdx]) : 0;
    const ytdBudget = provYtdColIdx >= 0 && provYtdColIdx < cols.length ? parseNum(cols[provYtdColIdx]) : 0;

    rows.push({
      period: periodInfo.period,
      fiscal_year: periodInfo.fiscal_year,
      quarter: periodInfo.quarter,
      pool: poolName || `Pool ${poolNumber}`,
      account_code: poolNumber || null,
      account_name: poolName || `Pool ${poolNumber}`,
      current_period_actual: rate,
      current_period_budget: 0,
      ytd_actual: ytdActual,
      ytd_budget: ytdBudget,
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

  // Period is derived PER ROW from the FY + PD columns below, so the filename is
  // NOT required to parse — a renamed GL export still yields identical rows. The
  // filename period only supplies a fallback fiscal year for the rare row whose
  // FY cell is blank; when it can't be inferred we fall back to the first FY seen
  // in the data (computed just below).
  const periodInfo = inferPeriod(filename);
  const dataFallbackFy = (() => {
    for (const ln of lines) {
      const first = splitRow(ln)[0]?.trim() ?? '';
      if (/^\d{4}$/.test(first)) return parseInt(first, 10);
    }
    return null;
  })();
  const fallbackFy = periodInfo?.fiscal_year ?? dataFallbackFy;

  // Find header row: FY | PD | SP | Jrnl | Seq | Proj Classification | Project ID | ...
  let effectiveHeaderIdx = findHeaderRow(lines, ['fy', 'pd', 'proj classification', 'project id']);
  if (effectiveHeaderIdx === -1) {
    effectiveHeaderIdx = findHeaderRow(lines, ['fy', 'pd', 'project', 'account']);
    if (effectiveHeaderIdx === -1) return null;
  }
  const colMap = buildColumnMap(lines[effectiveHeaderIdx]);
  const headerCols = splitRow(lines[effectiveHeaderIdx]);

  // Key column indices, read from the START of the row. In these GL files the
  // only free-text column that can contain embedded commas is "Name" (~col 14),
  // which shifts everything AFTER it. FY, PD, Proj Classification, Project ID and
  // Account Name all sit BEFORE that column, so reading them by index is safe.
  const fyIdx = colMap.get('fy') ?? 0;
  const pdIdx = colMap.get('pd') ?? 1;
  const projClassIdx = colMap.get('proj classification') ?? colMap.get('project classification') ?? 5;
  const projectIdIdx = colMap.get('project id') ?? 6;

  // Bug 1b: use ACCOUNT NAME (human-readable cost element), not Account ID. The
  // old detection `includes('account') && !includes('name')` matched Account ID.
  // Prefer the exact "account name" header; fall back to any account column.
  let accountIdx = colMap.get('account name') ?? -1;
  if (accountIdx === -1) {
    for (const [key, idx] of colMap.entries()) {
      if (key.includes('account') && key.includes('name')) { accountIdx = idx; break; }
    }
  }
  if (accountIdx === -1) {
    for (const [key, idx] of colMap.entries()) {
      if (key.includes('account')) { accountIdx = idx; break; }
    }
  }

  // Amount is read from the END of each row. It lives past the comma-containing
  // "Name" column, so a fixed start-index would be wrong on ragged rows. We find
  // Amount's offset from the end of the HEADER and apply the same offset to each
  // data row's end — robust to any left-shift caused by embedded commas.
  let amountIdx = -1;
  for (const [key, idx] of colMap.entries()) {
    if (key === 'amount') { amountIdx = idx; break; }
  }
  if (amountIdx === -1) {
    for (const [key, idx] of colMap.entries()) {
      if (key.includes('amount') || key.includes('amt')) { amountIdx = idx; break; }
    }
  }
  // Distance of Amount from the end of the header row (0 = last column).
  const amountFromEnd = amountIdx >= 0 ? headerCols.length - 1 - amountIdx : -1;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Bug 1: GL Detail files are YTD-cumulative (every posted period PD1..PDn is
  // present in one file). Emit rows for EVERY period found, each tagged with its
  // own period/fiscal_year/quarter derived from the PD column — do NOT collapse
  // to a single target period.
  // Aggregate by period (PD) + proj_classification (pool) + account (cost element).
  const aggregates = new Map<
    string,
    { period: string; fiscal_year: number; quarter: number; pool: string; costElement: string; actual: number }
  >();

  for (let i = effectiveHeaderIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 5) continue;

    // Filter by fiscal year if present (skip subtotal / label rows).
    const fyRaw = (cols[fyIdx] || '').trim();
    if (fyRaw && !/^\d{4}$/.test(fyRaw)) continue;

    const pdRaw = (cols[pdIdx] || '').trim();
    const pdNum = parseInt(pdRaw, 10);
    if (isNaN(pdNum) || pdNum < 1 || pdNum > 12) continue;

    const projClass = (cols[projClassIdx] || '').trim();
    const projectId = (cols[projectIdIdx] || '').trim();
    const account = accountIdx >= 0 && accountIdx < cols.length ? (cols[accountIdx] || '').trim() : '';

    // Read Amount from the END of the row using the header-derived offset.
    let amount = 0;
    if (amountFromEnd >= 0) {
      const ai = cols.length - 1 - amountFromEnd;
      if (ai >= 0 && ai < cols.length) amount = parseNum(cols[ai]);
    }

    if (!projClass && !account && !projectId) continue;
    if (amount === 0) continue;

    const fyNum = fyRaw ? parseInt(fyRaw, 10) : fallbackFy;
    if (!fyNum || Number.isNaN(fyNum)) continue;
    const period = `FY${String(fyNum).slice(2)} ${MONTHS[pdNum - 1]}`;
    const quarter = Math.ceil(pdNum / 3);

    const pool = projClass || 'UNCLASSIFIED';
    const costElement = account || projectId || 'UNKNOWN';
    const key = `${period}|||${pool}|||${costElement}`;

    const existing = aggregates.get(key);
    if (existing) {
      existing.actual += amount;
    } else {
      aggregates.set(key, { period, fiscal_year: fyNum, quarter, pool, costElement, actual: amount });
    }
  }

  const rows: CostDetailExtractOutput['rows'] = [];
  for (const v of aggregates.values()) {
    rows.push({
      period: v.period,
      fiscal_year: v.fiscal_year,
      quarter: v.quarter,
      cost_element: v.costElement,
      pool: v.pool,
      target_amount: 0,
      actual_amount: v.actual,
    });
  }

  if (rows.length === 0) return null;

  const periodsSeen = new Set(rows.map((r) => r.period)).size;
  return {
    is_cost_detail: true,
    rows,
    notes: `Deterministic parser: extracted ${rows.length} GL detail cost rows across ${periodsSeen} period(s) (aggregated by period × classification × account) from ${filename}`,
    model_used: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Parser: L2 / L1 ACTUAL & TARGET — sheet "DataSetLandTbl" (Bug 2)
// Company monthly P&L: sums per-project "Period" columns into one company row.
// ACTUAL -> financial_actuals (source l1_actual); TARGET -> financial_actuals
// (source l1_target) as well (BUG 5), so the trend/variance path can read target
// vs actual on the same natural key and the KPI/variance columns populate.
// ---------------------------------------------------------------------------

/**
 * Parse an "L2 - ACTUAL/TARGET" or "L1-ACTUAL/TARGET Proj Revenue Summary" file.
 *
 * These live on sheet DataSetLandTbl with 7 positional columns:
 *   0 Project | 1 Period Cost | 2 Period Profit | 3 Period Revenue |
 *   4 YTD Cost | 5 YTD Profit | 6 YTD Revenue
 * The header cells are ExcelJS RichText, so parseXlsx renders them as
 * "[object Object]" — column labels are unusable and we MUST read by position.
 *
 * ACTUAL vs TARGET is taken from the filename (the only reliable signal, since
 * the header text is lost). We sum the per-project PERIOD (single-month) figures
 * into one company row for the month inferred from the filename, skipping the
 * "Grand Total" line so the total is not double-counted.
 */
export function parseProjectActualsTargets(
  extractedText: string,
  filename: string,
): FinancialStatementExtractOutput | null {
  const lines = getSheetLinesByContent(
    extractedText,
    ['project', 'period', 'revenue'],
    ['DataSetLandTbl', 'Sheet1', 'Page1'],
  );
  if (!lines || lines.length < 2) return null;

  const periodInfo = inferPeriod(filename);
  if (!periodInfo) {
    logger.warn({ filename }, 'L2/L1 deterministic: cannot infer period from filename');
    return null;
  }

  // ACTUAL vs TARGET from the filename — header labels are lost to RichText.
  const isTarget = /target/i.test(filename);
  const kind: 'plan' | 'actual' = isTarget ? 'plan' : 'actual';
  const source: 'l1_actual' | 'l1_target' = isTarget ? 'l1_target' : 'l1_actual';

  // Header row is the first line mentioning "Project".
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (/project/i.test(lines[i])) { headerIdx = i; break; }
  }

  let sumRevenue = 0;
  let sumProfit = 0;
  let count = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    if (cols.length < 4) continue;
    const label = (cols[0] || '').trim();
    if (!label) continue;
    // Skip subtotal / grand-total lines so the company sum is not double-counted.
    if (/grand\s*total|^total\b|^subtotal\b/i.test(label)) continue;

    const profit = parseNum(cols[2]); // Period Profit
    const revenue = parseNum(cols[3]); // Period Revenue
    if (revenue === 0 && profit === 0) continue;
    sumRevenue += revenue;
    sumProfit += profit;
    count += 1;
  }

  if (count === 0) return null;

  const round2 = (v: number): number => Math.round(v * 100) / 100;

  return {
    is_financial: true,
    currency: 'USD',
    rows: [
      {
        period: periodInfo.period,
        fiscal_year: periodInfo.fiscal_year,
        quarter: periodInfo.quarter,
        kind,
        source,
        orders: null,
        sales: round2(sumRevenue),
        ebit: round2(sumProfit),
        gross_margin: null,
        ros: null,
      },
    ],
    notes: `Deterministic parser: aggregated ${count} project rows into one ${kind}/${source} company row for ${periodInfo.period} from ${filename}`,
    model_used: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Pillar 3: universal input sanitizer
// ---------------------------------------------------------------------------

/**
 * Normalize raw extracted text once, at the ingest entry point, before any
 * parser or the LLM sees it. This is the single place the whole pipeline relies
 * on for clean input:
 *   - strip the ExcelJS carriage-return marker (_x000D_) that splits header
 *     cells like "Vendor_x000D_Name",
 *   - fold \r\n and bare \r to \n so line splitting is consistent,
 *   - trim each cell and collapse internal runs of whitespace to one space
 *     (so " Total   Direct  Costs " keys the same as "Total Direct Costs"),
 *   - drop rows whose every cell is blank.
 * Sheet markers and the pipe delimiter are preserved so downstream sheet
 * selection and splitRow keep working unchanged.
 */
export function sanitizeExtractedText(text: string): string {
  if (!text) return '';
  const unified = text
    .replace(/_x000d_/gi, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const out: string[] = [];
  for (const line of unified.split('\n')) {
    if (line.includes('|')) {
      const cells = line.split('|').map((c) => c.replace(/\s+/g, ' ').trim());
      if (cells.every((c) => c.length === 0)) continue;
      out.push(cells.join(' | '));
    } else {
      const collapsed = line.replace(/[ \t]+/g, ' ').trim();
      // Keep sheet markers and non-empty label lines; drop fully blank lines.
      if (collapsed.length === 0) continue;
      out.push(collapsed);
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Parser: Trended Income Statement / Trended Balance Sheet
//
// WHY THIS EXISTS: the Trended Income Statement is the ONLY uploaded artifact
// that carries clean, reconcilable, per-MONTH Total Direct Costs and Total Cost
// of Operations. The YTD GL Detail is double-entry and its raw Amount column
// nets to zero, so it cannot yield Total Direct Costs without a brittle
// cost-account filter; the SIE trend carries RATES, not dollars. Both prior
// sources produced the ~$0 / cents figures the cure brief calls out. This
// parser reads the trended statement's month columns directly and emits:
//   - cost_detail rows (pool DIRECT), one per Direct-Cost line item per month,
//     summing to Total Direct Costs for that month;
//   - indirect rows (pool Fringe Benefits / Overhead / G&A), one per account per
//     month, summing to Total Cost of Operations for that month;
//   - one income_statement financial_actuals row per month carrying the F/S
//     subtotals so KPI/GM/EBIT recompute exactly.
// It also handles the Trended Balance Sheet (same Account Name | Jan..Jun grid)
// by matching the aggregate balance-sheet line labels per month.
//
// Columns are auto-detected by scanning the header for month tokens (Pillar 2):
// no fixed indices, tolerant of a leading Account ID column (DETAIL sheet) or
// not (SUMMARY sheet). A month column is only emitted when it carries at least
// one non-zero value, so a single-month upload never fabricates phantom future
// months of zeros.
// ---------------------------------------------------------------------------

const MONTH_LOOKUP: Array<{ re: RegExp; num: number; label: string }> = [
  { re: /^jan/, num: 1, label: 'Jan' },
  { re: /^feb/, num: 2, label: 'Feb' },
  { re: /^mar/, num: 3, label: 'Mar' },
  { re: /^apr/, num: 4, label: 'Apr' },
  { re: /^may/, num: 5, label: 'May' },
  { re: /^jun/, num: 6, label: 'Jun' },
  { re: /^jul/, num: 7, label: 'Jul' },
  { re: /^aug/, num: 8, label: 'Aug' },
  { re: /^sep/, num: 9, label: 'Sep' },
  { re: /^oct/, num: 10, label: 'Oct' },
  { re: /^nov/, num: 11, label: 'Nov' },
  { re: /^dec/, num: 12, label: 'Dec' },
];

interface MonthCol {
  col: number;
  num: number;
  label: string;
}

interface TrendGrid {
  monthCols: MonthCol[];
  labelCol: number;
  codeCol: number;
  headerIdx: number;
  fiscalYear: number;
}

/** True when a cell holds a parseable number (not merely blank, which parseNum maps to 0). */
function isNumericCell(s: string): boolean {
  if (!s) return false;
  const cleaned = s.replace(/[$,\s]/g, '').replace(/[()]/g, '');
  return cleaned.length > 0 && /^-?\d+(\.\d+)?$/.test(cleaned);
}

/** Locate the month-column header in a trended sheet and derive the label/code columns. */
function detectTrendGrid(lines: string[], filename: string): TrendGrid | null {
  const scan = Math.min(lines.length, 15);
  for (let i = 0; i < scan; i++) {
    const cols = splitRow(lines[i]);
    const monthCols: MonthCol[] = [];
    for (let c = 0; c < cols.length; c++) {
      const norm = cleanHeaderText(cols[c]).toLowerCase();
      const hit = MONTH_LOOKUP.find((m) => m.re.test(norm) && norm.length <= 12);
      if (hit && !monthCols.some((mc) => mc.num === hit.num)) {
        monthCols.push({ col: c, num: hit.num, label: hit.label });
      }
    }
    if (monthCols.length >= 3) {
      // Header row found. Derive label + optional code columns from the cells
      // that precede the first month column.
      let codeCol = -1;
      let labelCol = 0;
      for (let c = 0; c < monthCols[0].col; c++) {
        const norm = cleanHeaderText(cols[c]).toLowerCase();
        if (/account\s*id|account\s*code|^id$/.test(norm)) codeCol = c;
        else if (/account\s*name|description|^name$/.test(norm)) labelCol = c;
      }
      // Fallback: if a code column was found but no explicit name column, the
      // label is the cell right after the code (DETAIL: "Account ID | Account Name").
      if (codeCol >= 0 && labelCol === 0 && codeCol === 0 && monthCols[0].col >= 2) labelCol = 1;

      // Fiscal year: a bare 20xx line just above the header, else from filename.
      let fiscalYear = 0;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const ym = splitRow(lines[j]).map((s) => s.trim()).find((s) => /^20\d{2}$/.test(s));
        if (ym) fiscalYear = parseInt(ym, 10);
      }
      if (!fiscalYear) fiscalYear = inferPeriod(filename)?.fiscal_year ?? new Date().getUTCFullYear();

      return { monthCols, labelCol, codeCol, headerIdx: i, fiscalYear };
    }
  }
  return null;
}

function periodLabel(fiscalYear: number, label: string): string {
  return `FY${String(fiscalYear).slice(-2)} ${label}`;
}

type CostDetailRowT = CostDetailExtractOutput['rows'][number];
type SieRowT = SieExtractOutput['rows'][number];
type FinancialRowT = FinancialStatementExtractOutput['rows'][number];
type BalanceSheetRowT = BalanceSheetExtractOutput['rows'][number];

export interface TrendedStatementResult {
  kind: 'income_statement' | 'balance_sheet';
  periods: string[];
  costDetail: CostDetailRowT[];
  sie: SieRowT[];
  financial: FinancialRowT[];
  balanceSheet: BalanceSheetRowT[];
  notes: string;
}

const IS_SECTION_LABELS = new Set([
  'revenue', 'direct costs', 'gross profit', 'cost of operations',
  'operating income', 'other income', 'other expenses',
  'net income before taxes', 'net income',
]);

/** Normalized label -> financial_actuals subtotal key. */
function isTotalLabel(norm: string): 'total_revenue' | 'total_direct_costs' | 'cost_of_operations' | null {
  if (norm === 'total revenue') return 'total_revenue';
  if (norm === 'total direct costs') return 'total_direct_costs';
  if (norm === 'total cost of operations') return 'cost_of_operations';
  return null;
}

// The eight canonical Cost-of-Revenue (direct-cost) statement lines. These MUST
// match the frontend P2FinancialsTab detailKeys exactly (case-insensitive) or the
// Income Statement renders "—" for the line. Ordering is significant: the more
// specific "subcontractor materials/travel" and on/offsite labor tests run before
// the generic ones so a raw element is never mis-bucketed.
export const CANONICAL_DIRECT_COST_LINES = [
  'DL Onsite', 'DL Offsite', 'Subcontractor', 'Consultant',
  'Dir Travel', 'Sub Material', 'Direct Material', 'ODC',
] as const;

/**
 * Collapse a raw direct-cost element label (statement line item OR GL account
 * name) to one of the eight canonical Cost-of-Revenue lines, or null when the
 * element is not a direct cost-of-revenue line (indirect/OH/G&A account, an
 * account-code-only or balance-sheet junk row, a subtotal, etc.) and must be
 * dropped. Subcontractor Travel folds into the single Travel ("Dir Travel") line
 * so the eight lines reconcile exactly to the statement's Total Direct Costs.
 * The caller MUST restrict to the DIRECT pool first — e.g. "OH Labor - OFFSITE"
 * would otherwise match the offsite-labor test.
 */
export function canonicalDirectCostElement(raw: string): string | null {
  const s = (raw || '').toLowerCase();
  if (!s.trim()) return null;
  // Subtotals / totals are never line items.
  if (/^total\b/.test(s.trim())) return null;
  const hasLabor = /\blabor\b/.test(s);
  if (hasLabor && /offsite/.test(s)) return 'DL Offsite';
  if (hasLabor && /onsite/.test(s)) return 'DL Onsite';
  if (/subcontractor|subk|\bsub\b/.test(s) && /material/.test(s)) return 'Sub Material';
  if (/subcontractor|subk|\bsub\b/.test(s) && /travel/.test(s)) return 'Dir Travel';
  if (/subcontractor/.test(s)) return 'Subcontractor';
  if (/consultant/.test(s)) return 'Consultant';
  if (/travel/.test(s)) return 'Dir Travel';
  if (/material/.test(s)) return 'Direct Material';
  if (/other direct cost|^\s*odc\s*$/.test(s)) return 'ODC';
  return null;
}

/**
 * Collapse raw cost-detail rows (from any source doc) to the canonical, DIRECT-
 * only, deduplicated cost-of-revenue set: one row per (period, canonical line).
 * Non-DIRECT pools and non-cost-of-revenue elements are dropped; folded lines
 * (e.g. Subcontractor Travel into Travel) are SUMMED. Pure and DB-free so the
 * reconciliation guard is unit-testable: the eight lines for a month must sum to
 * that month's Total Direct Costs and no cost_element may appear twice.
 */
export function aggregateDirectCostRows(rows: CostDetailRowT[]): CostDetailRowT[] {
  const agg = new Map<string, CostDetailRowT>();
  for (const row of rows) {
    if (!row.period || !row.fiscal_year || !row.cost_element || !row.pool) continue;
    if (String(row.pool).trim().toLowerCase() !== 'direct') continue;
    const canonical = canonicalDirectCostElement(row.cost_element);
    if (!canonical) continue;
    const key = `${row.period}|||${canonical}`;
    const cur = agg.get(key);
    if (cur) {
      cur.target_amount = (Number(cur.target_amount) || 0) + (Number(row.target_amount) || 0);
      cur.actual_amount = (Number(cur.actual_amount) || 0) + (Number(row.actual_amount) || 0);
    } else {
      agg.set(key, {
        period: row.period,
        fiscal_year: row.fiscal_year,
        quarter: row.quarter,
        cost_element: canonical,
        pool: 'DIRECT',
        target_amount: Number(row.target_amount) || 0,
        actual_amount: Number(row.actual_amount) || 0,
      });
    }
  }
  return [...agg.values()];
}

/**
 * Parse a Trended Income Statement or Trended Balance Sheet. Returns null when
 * the document is not a recognizable trended grid.
 */
export function parseTrendedStatement(
  extractedText: string,
  filename: string,
): TrendedStatementResult | null {
  const text = sanitizeExtractedText(extractedText);
  const lower = text.toLowerCase();
  const looksBalanceSheet =
    /trended\s+balance\s+sheet/.test(lower) ||
    (/total\s+assets/.test(lower) && /total\s+(equity|liabilities)/.test(lower)) ||
    (/total\s+current\s+assets/.test(lower) && /total\s+current\s+liabilities/.test(lower)) ||
    /liabilities\s*&\s*equity/.test(lower);
  const looksIncomeStatement =
    /total\s+direct\s+costs/.test(lower) || /total\s+cost\s+of\s+operations/.test(lower) ||
    (/total\s+revenue/.test(lower) && /gross\s+profit/.test(lower));

  if (!looksBalanceSheet && !looksIncomeStatement) return null;

  if (looksIncomeStatement) {
    return parseTrendedIncomeStatement(text, filename);
  }
  return parseTrendedBalanceSheet(text, filename);
}

function parseTrendedIncomeStatement(text: string, filename: string): TrendedStatementResult | null {
  // Direct costs + F/S subtotals: prefer the SUMMARY sheet (one row per line
  // item); fall back to DETAIL subsection totals when SUMMARY is absent.
  const summaryLines =
    getSheetLines(text, 'SUMMARY') ??
    getSheetLinesByContent(text, ['account name', 'jan', 'feb', 'mar'], ['SUMMARY', 'Sheet1']);
  const detailLines = getSheetLines(text, 'DETAIL') ?? summaryLines;
  if (!summaryLines && !detailLines) return null;

  const dcSource = summaryLines ?? detailLines!;
  const grid = detectTrendGrid(dcSource, filename);
  if (!grid) return null;

  // Track which month columns carry any non-zero value so we never emit phantom
  // all-zero future months from a single-month upload.
  const monthHasData = new Map<number, boolean>();
  const costDetail: CostDetailRowT[] = [];
  const totals: Map<number, { total_revenue?: number; total_direct_costs?: number; cost_of_operations?: number }> =
    new Map();

  let section = '';
  for (let i = grid.headerIdx + 1; i < dcSource.length; i++) {
    const cols = splitRow(dcSource[i]);
    const label = (cols[grid.labelCol] ?? cols[0] ?? '').trim();
    if (!label) continue;
    const norm = cleanHeaderText(label).toLowerCase();

    // Section boundary — evaluated FIRST so number-bearing terminators like
    // "Gross Profit" / "Operating Income" switch section instead of being
    // captured as Direct-Cost line items.
    if (IS_SECTION_LABELS.has(norm)) {
      section = norm;
      continue;
    }

    const hasNumbers = grid.monthCols.some((mc) => isNumericCell(cols[mc.col] ?? ''));
    if (!hasNumbers) continue; // subsection header line

    const totalKey = isTotalLabel(norm);
    if (totalKey) {
      for (const mc of grid.monthCols) {
        const v = parseNum(cols[mc.col] ?? '');
        if (isNumericCell(cols[mc.col] ?? '') && v !== 0) monthHasData.set(mc.num, true);
        const t = totals.get(mc.num) ?? {};
        // First occurrence wins (SUMMARY lists Total Revenue twice).
        if (t[totalKey] === undefined) t[totalKey] = v;
        totals.set(mc.num, t);
      }
      continue;
    }
    // Direct-cost line items are NOT taken from the SUMMARY grid: it carries a
    // single combined "Direct Labor" line, but the statement needs the Onsite /
    // Offsite split, which only the DETAIL grid (account-level) provides. Here we
    // only note which months carry data so phantom all-zero months are dropped;
    // the cost_detail rows themselves are built from the DETAIL grid below.
    if (section === 'direct costs') {
      for (const mc of grid.monthCols) {
        const cell = cols[mc.col] ?? '';
        if (isNumericCell(cell) && parseNum(cell) !== 0) monthHasData.set(mc.num, true);
      }
    }
  }

  // Indirect (Cost of Operations) account-level rows from the DETAIL sheet.
  const sie: SieRowT[] = [];
  const detGrid = detailLines ? detectTrendGrid(detailLines, filename) : null;
  if (detailLines && detGrid) {
    let sec = '';
    let pool = '';
    for (let i = detGrid.headerIdx + 1; i < detailLines.length; i++) {
      const cols = splitRow(detailLines[i]);
      const label = (cols[detGrid.labelCol] ?? '').trim();
      const code = detGrid.codeCol >= 0 ? (cols[detGrid.codeCol] ?? '').trim() : '';
      const first = (cols[0] ?? '').trim();
      const norm = cleanHeaderText(label || first).toLowerCase();

      // Section boundary first (handles number-bearing terminators like
      // "Operating Income" / "Gross Profit" that end the Cost of Operations block).
      if (IS_SECTION_LABELS.has(norm)) {
        sec = norm;
        pool = '';
        continue;
      }

      const hasNumbers = detGrid.monthCols.some((mc) => isNumericCell(cols[mc.col] ?? ''));
      if (!hasNumbers) {
        if (sec === 'cost of operations' && norm) pool = label || first;
        continue;
      }
      // Direct-cost account rows (pool DIRECT). The account name (e.g. "Direct
      // Labor ONSITE", "Subcontractor Travel") is canonicalized to one of the
      // eight statement lines at ingest time; raw names are emitted here.
      if (sec === 'direct costs') {
        if (/^total\b/i.test(first) || /^total\b/i.test(label)) continue;
        const accountName = label || first;
        if (!accountName) continue;
        for (const mc of detGrid.monthCols) {
          const cell = cols[mc.col] ?? '';
          if (!isNumericCell(cell)) continue;
          const v = parseNum(cell);
          if (v !== 0) monthHasData.set(mc.num, true);
          costDetail.push({
            period: periodLabel(detGrid.fiscalYear, mc.label),
            fiscal_year: detGrid.fiscalYear,
            quarter: Math.ceil(mc.num / 3),
            cost_element: accountName,
            pool: 'DIRECT',
            target_amount: 0,
            actual_amount: v,
          });
        }
        continue;
      }
      if (sec !== 'cost of operations') continue;
      // Skip subtotal rows ("Total", "Total Cost of Operations").
      if (/^total\b/i.test(first) || /^total\b/i.test(label)) continue;
      if (!pool) continue;
      const accountName = label || first;
      const accountCode = /^[0-9]{3}-[0-9]{3}$/.test(code) || /^[A-Za-z]{2,3}-[A-Za-z]{2,3}$/.test(code) ? code : (code || null);
      for (const mc of detGrid.monthCols) {
        const cell = cols[mc.col] ?? '';
        if (!isNumericCell(cell)) continue;
        const v = parseNum(cell);
        if (v !== 0) monthHasData.set(mc.num, true);
        sie.push({
          period: periodLabel(detGrid.fiscalYear, mc.label),
          fiscal_year: detGrid.fiscalYear,
          quarter: Math.ceil(mc.num / 3),
          pool,
          account_code: accountCode,
          account_name: accountName,
          current_period_actual: v,
          current_period_budget: 0,
          ytd_actual: 0,
          ytd_budget: 0,
        });
      }
    }
  }

  // Keep only months that carry real data.
  const liveMonths = new Set([...monthHasData.entries()].filter(([, v]) => v).map(([k]) => k));
  const keepMonth = (num: number): boolean => liveMonths.has(num);
  const monthOf = (period: string): number =>
    MONTH_LOOKUP.find((m) => period.endsWith(' ' + m.label))?.num ?? -1;

  const financial: FinancialRowT[] = [];
  for (const mc of grid.monthCols) {
    if (!keepMonth(mc.num)) continue;
    const t = totals.get(mc.num);
    if (!t || t.total_revenue === undefined) continue;
    financial.push({
      period: periodLabel(grid.fiscalYear, mc.label),
      fiscal_year: grid.fiscalYear,
      quarter: Math.ceil(mc.num / 3),
      kind: 'actual',
      source: 'income_statement',
      orders: null,
      sales: t.total_revenue ?? null,
      ebit: null,
      gross_margin: null,
      ros: null,
      total_revenue: t.total_revenue ?? null,
      total_direct_costs: t.total_direct_costs ?? null,
      cost_of_operations: t.cost_of_operations ?? null,
    });
  }

  const filteredCost = costDetail.filter((r) => keepMonth(monthOf(r.period)));
  const filteredSie = sie.filter((r) => keepMonth(monthOf(r.period)));
  const periods = [...liveMonths].sort((a, b) => a - b).map((n) => periodLabel(grid.fiscalYear, MONTH_LOOKUP.find((m) => m.num === n)!.label));

  if (filteredCost.length === 0 && filteredSie.length === 0 && financial.length === 0) return null;

  return {
    kind: 'income_statement',
    periods,
    costDetail: filteredCost,
    sie: filteredSie,
    financial,
    balanceSheet: [],
    notes: `Deterministic Trended Income Statement: ${filteredCost.length} direct-cost rows, ${filteredSie.length} indirect rows, ${financial.length} P&L month rows across ${periods.join(', ')} from ${filename}`,
  };
}

const BS_LABEL_MAP: Array<{ re: RegExp; key: keyof BalanceSheetRowT }> = [
  { re: /^cash$/, key: 'cash' },
  { re: /^accounts\s+receivable/, key: 'accounts_receivable' },
  { re: /^billed\s+receivable/, key: 'accounts_receivable' },
  { re: /^total\s+current\s+assets/, key: 'total_current_assets' },
  { re: /^total\s+assets/, key: 'total_assets' },
  // Grand-total assets row on statements that label it just "Assets" (the
  // section header "Assets" carries no numbers, so only the numbered total hits).
  { re: /^assets$/, key: 'total_assets' },
  { re: /^accounts\s+payable/, key: 'accounts_payable' },
  { re: /^total\s+current\s+liabilities/, key: 'total_current_liabilities' },
  { re: /^total\s+liabilities$/, key: 'total_liabilities' },
  { re: /^total\s+(equity|stockholders.?\s*equity|net\s+worth)/, key: 'total_equity' },
];

function parseTrendedBalanceSheet(text: string, filename: string): TrendedStatementResult | null {
  const lines =
    getSheetLines(text, 'SUMMARY') ??
    getSheetLines(text, 'DETAIL') ??
    getSheetLinesByContent(text, ['account name', 'jan', 'feb', 'mar'], ['SUMMARY', 'Sheet1']);
  if (!lines) return null;
  const grid = detectTrendGrid(lines, filename);
  if (!grid) return null;

  const perMonth = new Map<number, Partial<Record<keyof BalanceSheetRowT, number>>>();
  const monthHasData = new Map<number, boolean>();

  for (let i = grid.headerIdx + 1; i < lines.length; i++) {
    const cols = splitRow(lines[i]);
    const label = (cols[grid.labelCol] ?? cols[0] ?? '').trim();
    if (!label) continue;
    const norm = cleanHeaderText(label).toLowerCase();
    const mapping = BS_LABEL_MAP.find((m) => m.re.test(norm));
    if (!mapping) continue;
    for (const mc of grid.monthCols) {
      const cell = cols[mc.col] ?? '';
      if (!isNumericCell(cell)) continue;
      const v = parseNum(cell);
      if (v !== 0) monthHasData.set(mc.num, true);
      const rec = perMonth.get(mc.num) ?? {};
      // First match per key wins so "total liabilities" is not overwritten by a
      // later "total liabilities and equity" style line.
      if (rec[mapping.key] === undefined) rec[mapping.key] = v;
      perMonth.set(mc.num, rec);
    }
  }

  const balanceSheet: BalanceSheetRowT[] = [];
  for (const mc of grid.monthCols) {
    if (!monthHasData.get(mc.num)) continue;
    const rec = perMonth.get(mc.num);
    if (!rec) continue;
    balanceSheet.push({
      period: periodLabel(grid.fiscalYear, mc.label),
      fiscal_year: grid.fiscalYear,
      quarter: Math.ceil(mc.num / 3),
      cash: rec.cash ?? 0,
      accounts_receivable: rec.accounts_receivable ?? 0,
      total_current_assets: rec.total_current_assets ?? 0,
      total_assets: rec.total_assets ?? 0,
      accounts_payable: rec.accounts_payable ?? 0,
      total_current_liabilities: rec.total_current_liabilities ?? 0,
      total_liabilities: rec.total_liabilities ?? 0,
      total_equity: rec.total_equity ?? 0,
    });
  }

  if (balanceSheet.length === 0) return null;

  return {
    kind: 'balance_sheet',
    periods: balanceSheet.map((r) => r.period),
    costDetail: [],
    sie: [],
    financial: [],
    balanceSheet,
    notes: `Deterministic Trended Balance Sheet: ${balanceSheet.length} month rows from ${filename}`,
  };
}
