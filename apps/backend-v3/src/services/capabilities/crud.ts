/**
 * Capabilities CRUD — list, get, create, update.
 */

import { pool } from '../../lib/db.js';

export interface Capability {
  id: string;
  ou: 'envision' | 'riverstone' | 'pd_systems';
  name: string;
  category: string;
  description: string;
  naics_codes: string[];
  psc_codes: string[];
  agencies_strong_in: string[];
  past_performance_doc_ids: string[];
  key_personnel: string[];
  certifications: string[];
  evidence_grade: 'A' | 'B' | 'C' | null;
  active: boolean;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapabilityCreateInput {
  ou: 'envision' | 'riverstone' | 'pd_systems';
  name: string;
  category: string;
  description: string;
  naics_codes?: string[];
  psc_codes?: string[];
  agencies_strong_in?: string[];
  past_performance_doc_ids?: string[];
  key_personnel?: string[];
  certifications?: string[];
  evidence_grade?: 'A' | 'B' | 'C';
}

export type CapabilityUpdateInput = Partial<Omit<CapabilityCreateInput, 'ou'>> & {
  active?: boolean;
  last_reviewed_at?: string;
};

export async function listCapabilities(filters?: {
  ou?: string;
  active_only?: boolean;
  category?: string;
}): Promise<Capability[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.ou) {
    params.push(filters.ou);
    conditions.push(`ou = $${params.length}`);
  }

  if (filters?.active_only !== false) {
    conditions.push('active = true');
  }

  if (filters?.category) {
    params.push(filters.category);
    conditions.push(`category = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM capabilities ${where} ORDER BY ou, category, name`;

  const res = await pool.query<Capability>(sql, params);
  return res.rows;
}

export async function getCapability(id: string): Promise<Capability | null> {
  const res = await pool.query<Capability>(
    'SELECT * FROM capabilities WHERE id = $1',
    [id],
  );
  return res.rows[0] ?? null;
}

export async function createCapability(input: CapabilityCreateInput): Promise<Capability> {
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

  const fields: Array<[keyof CapabilityUpdateInput, string]> = [
    ['name', 'name'],
    ['category', 'category'],
    ['description', 'description'],
    ['naics_codes', 'naics_codes'],
    ['psc_codes', 'psc_codes'],
    ['agencies_strong_in', 'agencies_strong_in'],
    ['past_performance_doc_ids', 'past_performance_doc_ids'],
    ['key_personnel', 'key_personnel'],
    ['certifications', 'certifications'],
    ['evidence_grade', 'evidence_grade'],
    ['active', 'active'],
    ['last_reviewed_at', 'last_reviewed_at'],
  ];

  for (const [key, col] of fields) {
    if (input[key] !== undefined) {
      params.push(input[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }

  if (sets.length === 0) return getCapability(id);

  sets.push('updated_at = now()');
  params.push(id);

  const sql = `UPDATE capabilities SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`;
  const res = await pool.query<Capability>(sql, params);
  return res.rows[0] ?? null;
}
