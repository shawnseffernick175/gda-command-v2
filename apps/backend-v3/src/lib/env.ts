/**
 * Blank-safe environment variable readers.
 *
 * Deployment configs frequently declare a variable with an empty value
 * (e.g. `SAM_REQUEST_TIMEOUT_MS=` in a compose env block). The nullish
 * coalescing operator (`??`) only falls back on `null`/`undefined`, so a
 * blank string slips through — which caused real production breakage:
 *   - `parseInt('' , 10)` → `NaN` (broken timeouts / retry counts)
 *   - a blank `SAM_GOV_API_KEY` shadowed the `SAM_API_KEY` fallback
 *   - a blank `GOVWIN_OPP_SELECTION_DATE_FROM` sent an empty date → HTTP 422
 *
 * These helpers treat "unset" and "blank/whitespace-only" identically.
 */

/** Env string, treating unset OR blank/whitespace-only as "not provided". */
export function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw !== undefined && raw.trim() !== '' ? raw : fallback;
}

/**
 * First non-blank value among `names`, else `fallback`. Use for key chains
 * like `SAM_GOV_API_KEY` → `SAM_API_KEY` so a blank primary doesn't shadow a
 * populated secondary.
 */
export function envFirst(names: string[], fallback = ''): string {
  for (const name of names) {
    const raw = process.env[name];
    if (raw !== undefined && raw.trim() !== '') return raw;
  }
  return fallback;
}

/** Integer env, treating unset/blank as `fallback`; throws on a non-numeric value. */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be an integer, got: ${raw}`);
  return n;
}
