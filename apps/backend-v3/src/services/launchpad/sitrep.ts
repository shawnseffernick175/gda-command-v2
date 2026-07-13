/**
 * Launchpad SITREP service — F-SITREP
 *
 * Produces and persists a per-day Situation Report for the top of the
 * Launchpad page: an AI-generated numbered list of concise bullets plus the
 * documents folded into that day's report. Records are keyed by date so a
 * given day's SITREP (bullets + attached docs) is retrievable later.
 *
 * The AI bullet generation reuses the shared llmRouter (task 'launchpad_sitrep')
 * — the same client the rest of the launchpad/door-summaries surface uses.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../../lib/db.js';
import { llmRouter } from '../../lib/llm-router.js';
import { logger } from '../../lib/logger.js';
import { parseBuffer } from '../rag/parser.js';
import { getDoorSummaries } from './door-summaries.js';

const UPLOAD_DIR = join(process.cwd(), 'data', 'sitrep');

export interface SitrepDocument {
  id: number;
  filename: string;
  file_size_bytes: number | null;
  uploaded_at: string;
}

export interface SitrepResult {
  date: string;
  bullets: string[];
  documents: SitrepDocument[];
  generated_at: string;
}

interface SitrepRow {
  sitrep_date: string;
  bullets: string[];
  generated_at: string;
}

/** Today's date (YYYY-MM-DD) in Eastern Time — the canonical SITREP timezone. */
export function todayEastern(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(date: string): boolean {
  return ISO_DATE.test(date);
}

/** Build a plain-English context block describing the day's platform state. */
async function buildDayContext(): Promise<string> {
  try {
    const { summaries } = await getDoorSummaries();
    if (summaries.length === 0) return 'No platform activity recorded for today.';
    return summaries.map((s) => `${s.door_label}: ${s.summary}`).join('\n');
  } catch (err) {
    logger.warn({ err }, 'SITREP: failed to build day context');
    return 'No platform activity recorded for today.';
  }
}

/** Normalize an unknown LLM output into a clean string[] of bullets. */
function normalizeBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => (typeof b === 'string' ? b.trim() : ''))
    .filter((b) => b.length > 0)
    .slice(0, 8);
}

/**
 * Deterministic fallback when the LLM is unavailable: keep the existing
 * bullets, seed from the day context if empty, and note any added document.
 */
function fallbackBullets(
  existing: string[],
  context: string,
  newDocumentName?: string,
): string[] {
  const bullets = [...existing];
  if (bullets.length === 0) {
    for (const line of context.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length > 0) bullets.push(trimmed);
      if (bullets.length >= 6) break;
    }
  }
  if (newDocumentName) {
    bullets.push(`Document added to today's SITREP: ${newDocumentName}.`);
  }
  return bullets;
}

/** Generate (or re-fold) the day's SITREP bullets via the shared llmRouter. */
async function generateBullets(args: {
  date: string;
  existing: string[];
  context: string;
  newDocumentName?: string;
  newDocumentText?: string;
}): Promise<string[]> {
  try {
    const result = await llmRouter.route({
      task: 'launchpad_sitrep',
      input: {
        sitrep_date: args.date,
        existing_bullets: args.existing,
        context: args.context,
        new_document_name: args.newDocumentName,
        new_document_text: args.newDocumentText,
      },
    });
    if (result.ok) {
      const bullets = normalizeBullets(result.output.bullets);
      if (bullets.length > 0) return bullets;
    }
  } catch (err) {
    logger.warn({ err, date: args.date }, 'SITREP: bullet generation failed');
  }
  return fallbackBullets(args.existing, args.context, args.newDocumentName);
}

async function fetchRecord(date: string): Promise<SitrepRow | null> {
  const res = await pool.query<SitrepRow>(
    `SELECT sitrep_date::text, bullets, generated_at::text
     FROM launchpad_sitreps
     WHERE sitrep_date = $1`,
    [date],
  );
  return res.rows[0] ?? null;
}

async function fetchDocuments(date: string): Promise<SitrepDocument[]> {
  const res = await pool.query<{
    id: number;
    filename: string;
    file_size_bytes: string | null;
    uploaded_at: string;
  }>(
    `SELECT id, filename, file_size_bytes::text, uploaded_at::text
     FROM launchpad_sitrep_documents
     WHERE sitrep_date = $1
     ORDER BY uploaded_at DESC`,
    [date],
  );
  return res.rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    file_size_bytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
    uploaded_at: r.uploaded_at,
  }));
}

async function upsertBullets(date: string, bullets: string[]): Promise<string> {
  const res = await pool.query<{ generated_at: string }>(
    `INSERT INTO launchpad_sitreps (sitrep_date, bullets, generated_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (sitrep_date)
     DO UPDATE SET bullets = $2::jsonb, updated_at = NOW()
     RETURNING generated_at::text`,
    [date, JSON.stringify(bullets)],
  );
  return res.rows[0]?.generated_at ?? new Date().toISOString();
}

/**
 * Return the saved SITREP for a day, generating and persisting an initial one
 * from the day's platform context when none exists yet.
 */
export async function getSitrep(date: string): Promise<SitrepResult> {
  const existing = await fetchRecord(date);
  if (existing) {
    const documents = await fetchDocuments(date);
    return {
      date,
      bullets: normalizeBullets(existing.bullets),
      documents,
      generated_at: existing.generated_at,
    };
  }

  const context = await buildDayContext();
  const bullets = await generateBullets({ date, existing: [], context });
  const generatedAt = await upsertBullets(date, bullets);
  const documents = await fetchDocuments(date);
  return { date, bullets, documents, generated_at: generatedAt };
}

/**
 * Upload a document, parse its text, fold the salient content into the day's
 * SITREP bullets, and persist both the document and the updated bullets.
 */
export async function addSitrepDocument(args: {
  date: string;
  filename: string;
  buffer: Buffer;
}): Promise<SitrepResult> {
  const { date, filename, buffer } = args;

  let extractedText = '';
  try {
    const parsed = await parseBuffer(buffer, filename);
    extractedText = parsed.text ?? '';
  } catch (err) {
    logger.warn({ err, filename }, 'SITREP: document text extraction failed');
  }

  // Persist the original file to disk (best-effort — extracted text is the
  // authoritative record and is always stored in the DB).
  let filePath: string | null = null;
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const storedName = `${Date.now()}_${filename}`;
    await writeFile(join(UPLOAD_DIR, storedName), buffer);
    filePath = `sitrep/${storedName}`;
  } catch (err) {
    logger.warn({ err, filename }, 'SITREP: file persistence failed');
  }

  await pool.query(
    `INSERT INTO launchpad_sitrep_documents
       (sitrep_date, filename, file_size_bytes, file_path, extracted_text)
     VALUES ($1, $2, $3, $4, $5)`,
    [date, filename, buffer.length, filePath, extractedText || null],
  );

  const existingRecord = await fetchRecord(date);
  const existingBullets = existingRecord ? normalizeBullets(existingRecord.bullets) : [];
  const context = await buildDayContext();
  const bullets = await generateBullets({
    date,
    existing: existingBullets,
    context,
    newDocumentName: filename,
    newDocumentText: extractedText || undefined,
  });
  const generatedAt = await upsertBullets(date, bullets);
  const documents = await fetchDocuments(date);

  return { date, bullets, documents, generated_at: generatedAt };
}
