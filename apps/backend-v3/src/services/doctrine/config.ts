/**
 * Doctrine config service — CRUD for principles, exclusions, and rules config.
 */

import { pool } from '../../lib/db.js';

export interface DoctrinePrinciple {
  id: string;
  name: string;
  short_form: string;
  long_form: string;
  evaluation_prompt: string;
  display_order: number;
}

export interface DoctrineExclusion {
  id: string;
  name: string;
  description: string;
  trigger_logic_prompt: string;
  applies_to_ous: string[];
  is_hard_block: boolean;
  override_requires: string | null;
}

export interface DoctrineConfigRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export async function getPrinciples(): Promise<DoctrinePrinciple[]> {
  const res = await pool.query<DoctrinePrinciple>(
    'SELECT id, name, short_form, long_form, evaluation_prompt, display_order FROM doctrine_principles ORDER BY display_order ASC'
  );
  return res.rows;
}

export async function getExclusions(): Promise<DoctrineExclusion[]> {
  const res = await pool.query<DoctrineExclusion>(
    'SELECT id, name, description, trigger_logic_prompt, applies_to_ous, is_hard_block, override_requires FROM doctrine_exclusions ORDER BY id ASC'
  );
  return res.rows;
}

export async function getConfig(): Promise<DoctrineConfigRow[]> {
  const res = await pool.query<DoctrineConfigRow>(
    'SELECT key, value, description, updated_at FROM doctrine_rules_config ORDER BY key ASC'
  );
  return res.rows;
}

export async function getConfigValue(key: string): Promise<unknown | null> {
  const res = await pool.query<{ value: unknown }>(
    'SELECT value FROM doctrine_rules_config WHERE key = $1',
    [key]
  );
  return res.rows[0]?.value ?? null;
}

export async function updatePrincipleEvaluationPrompt(
  id: string,
  evaluation_prompt: string,
): Promise<DoctrinePrinciple | null> {
  const res = await pool.query<DoctrinePrinciple>(
    `UPDATE doctrine_principles SET evaluation_prompt = $2 WHERE id = $1
     RETURNING id, name, short_form, long_form, evaluation_prompt, display_order`,
    [id, evaluation_prompt]
  );
  return res.rows[0] ?? null;
}

export async function updateConfig(key: string, value: unknown): Promise<DoctrineConfigRow | null> {
  const res = await pool.query<DoctrineConfigRow>(
    `UPDATE doctrine_rules_config SET value = $2::jsonb, updated_at = now() WHERE key = $1
     RETURNING key, value, description, updated_at`,
    [key, JSON.stringify(value)]
  );
  return res.rows[0] ?? null;
}
