/**
 * Boots a Postgres testcontainer on a random port and exposes
 * the connection string as an env var for the rest of the suite.
 *
 * Called once via vitest globalSetup — container lifetime spans
 * the entire integration run.
 */

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

let container: StartedPostgreSqlContainer | null = null;

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('gda_command_test')
    .withUsername('gda')
    .withPassword('gda_test_password')
    .start();

  const url = container.getConnectionUri();
  process.env['DATABASE_URL'] = url;
  process.env['INTEGRATION_DB_URL'] = url;

  // Run migrations + seed once for the entire suite
  await runMigrations(url);
  const ids = await seed(url);

  // Write to files so vitest worker processes can pick them up
  const { writeFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  writeFileSync(
    resolve(import.meta.dirname, '.db-url'),
    url,
    'utf-8',
  );
  writeFileSync(
    resolve(import.meta.dirname, '.seed-ids'),
    JSON.stringify(ids),
    'utf-8',
  );
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
  }

  // Clean up temp files
  const { unlinkSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  for (const f of ['.db-url', '.seed-ids']) {
    try {
      unlinkSync(resolve(import.meta.dirname, f));
    } catch {
      // ignore
    }
  }
}
