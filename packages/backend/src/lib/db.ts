/**
 * Postgres connection pool. Uses DATABASE_URL from env.
 * Returns null if not configured — callers should fall back gracefully.
 */

import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // Pool-level errors (e.g. idle client disconnect) must be caught here
  // to prevent an unhandled 'error' event from crashing the process.
  pool.on("error", (err) => {
    process.stderr.write(`[db] pool error (non-fatal): ${err.message}\n`);
  });
  return pool;
}

/**
 * Wait for Postgres to become reachable. Useful at startup when the DB
 * container may still be booting. Returns true once a connection succeeds,
 * or false after all retries are exhausted.
 */
export async function waitForDB(
  retries = 10,
  delayMs = 2000,
): Promise<boolean> {
  for (let i = 1; i <= retries; i++) {
    try {
      const p = getPool();
      if (!p) return false;
      await p.query("SELECT 1");
      return true;
    } catch {
      process.stderr.write(
        `[db] waiting for postgres (${i}/${retries})...\n`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

export function dbConfig(): { configured: boolean; missing: string[] } {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return { configured: false, missing: ["DATABASE_URL"] };
  return { configured: true, missing: [] };
}

export async function healthCheck(): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const p = getPool();
  if (!p) return { ok: false, latencyMs: 0, error: "DATABASE_URL not set" };
  const start = Date.now();
  try {
    await p.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    return { ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}
