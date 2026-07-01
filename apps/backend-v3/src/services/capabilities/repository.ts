/**
 * Capability catalog — CRUD operations against the capabilities table.
 */

import { pool } from '../../lib/db.js';
import type {
  Capability,
  CapabilityCreateInput,
  CapabilityUpdateInput,
  OU,
} from './types.js';

const VALID_OUS: readonly string[] = ['envision', 'riverstone', 'pd_systems'];
const VALID_GRADES: readonly string[] = ['A', 'B', 'C'];

export async function listCapabilities(filters?: {
  ou?: OU;
  active?: boolean;
  category?: string;
}): Promise<Capability[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.ou) {
    conditions.push(`ou = $${idx++}`);
    params.push(filters.ou);
  }
  if (filters?.active !== undefined) {
    conditions.push(`active = $${idx++}`);
    params.push(filters.active);
  }
  if (filters?.category) {
    conditions.push(`category = $${idx++}`);
    params.push(filters.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await pool.query<Capability>(
    `SELECT * FROM capabilities ${where} ORDER BY ou, category, name`,
    params,
  );
  return res.rows;
}

export async function getCapabilityById(id: string): Promise<Capability | null> {
  const res = await pool.query<Capability>(
    `SELECT * FROM capabilities WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function createCapability(input: CapabilityCreateInput): Promise<Capability> {
  if (!VALID_OUS.includes(input.ou)) {
    throw new Error(`Invalid OU: ${input.ou}. Must be one of: ${VALID_OUS.join(', ')}`);
  }
  if (input.evidence_grade && !VALID_GRADES.includes(input.evidence_grade)) {
    throw new Error(`Invalid evidence_grade: ${input.evidence_grade}. Must be A, B, or C`);
  }

  const res = await pool.query<Capability>(
    `INSERT INTO capabilities (
      ou, name, category, description,
      naics_codes, psc_codes, agencies_strong_in,
      past_performance_doc_ids, key_personnel, certifications,
      evidence_grade
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      input.ou,
      input.name,
      input.category,
      input.description,
      input.naics_codes ?? [],
      input.psc_codes ?? [],
      input.agencies_strong_in ?? [],
      input.past_performance_doc_ids ?? [],
      input.key_personnel ?? [],
      input.certifications ?? [],
      input.evidence_grade ?? null,
    ],
  );
  return res.rows[0]!;
}

export async function updateCapability(
  id: string,
  input: CapabilityUpdateInput,
): Promise<Capability | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.name !== undefined) { sets.push(`name = $${idx++}`); params.push(input.name); }
  if (input.category !== undefined) { sets.push(`category = $${idx++}`); params.push(input.category); }
  if (input.description !== undefined) { sets.push(`description = $${idx++}`); params.push(input.description); }
  if (input.naics_codes !== undefined) { sets.push(`naics_codes = $${idx++}`); params.push(input.naics_codes); }
  if (input.psc_codes !== undefined) { sets.push(`psc_codes = $${idx++}`); params.push(input.psc_codes); }
  if (input.agencies_strong_in !== undefined) { sets.push(`agencies_strong_in = $${idx++}`); params.push(input.agencies_strong_in); }
  if (input.past_performance_doc_ids !== undefined) { sets.push(`past_performance_doc_ids = $${idx++}`); params.push(input.past_performance_doc_ids); }
  if (input.key_personnel !== undefined) { sets.push(`key_personnel = $${idx++}`); params.push(input.key_personnel); }
  if (input.certifications !== undefined) { sets.push(`certifications = $${idx++}`); params.push(input.certifications); }
  if (input.evidence_grade !== undefined) {
    if (!VALID_GRADES.includes(input.evidence_grade)) {
      throw new Error(`Invalid evidence_grade: ${input.evidence_grade}`);
    }
    sets.push(`evidence_grade = $${idx++}`); params.push(input.evidence_grade);
  }
  if (input.active !== undefined) { sets.push(`active = $${idx++}`); params.push(input.active); }
  if (input.last_reviewed_at !== undefined) { sets.push(`last_reviewed_at = $${idx++}`); params.push(input.last_reviewed_at); }

  if (sets.length === 0) return getCapabilityById(id);

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const res = await pool.query<Capability>(
    `UPDATE capabilities SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  return res.rows[0] ?? null;
}

export async function getCapabilityCount(ou?: OU): Promise<number> {
  const res = ou
    ? await pool.query<{ count: string }>('SELECT count(*) FROM capabilities WHERE ou = $1 AND active = true', [ou])
    : await pool.query<{ count: string }>('SELECT count(*) FROM capabilities WHERE active = true');
  return parseInt(res.rows[0]!.count, 10);
}
