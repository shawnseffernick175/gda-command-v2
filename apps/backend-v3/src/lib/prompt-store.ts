/**
 * Prompt Store — read-through helper for prompt_library table.
 *
 * Services call getStoredPrompt(key) to check the DB first,
 * falling back to the hard-coded default if the key doesn't exist
 * or is_active = false.
 */

import { pool } from './db.js';
import { logger } from './logger.js';

export interface StoredPrompt {
  system_prompt: string;
  user_prompt_template: string | null;
}

/**
 * Look up a prompt by key. Returns null if the key doesn't exist or is inactive.
 */
export async function getStoredPrompt(promptKey: string): Promise<StoredPrompt | null> {
  try {
    const { rows } = await pool.query<StoredPrompt>(
      `SELECT system_prompt, user_prompt_template
       FROM prompt_library
       WHERE prompt_key = $1 AND is_active = true`,
      [promptKey],
    );
    return rows[0] ?? null;
  } catch (err) {
    logger.warn({ err, promptKey }, 'prompt_store: failed to read prompt_library, using fallback');
    return null;
  }
}
