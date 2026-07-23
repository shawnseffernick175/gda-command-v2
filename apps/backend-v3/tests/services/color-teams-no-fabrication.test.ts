import { beforeEach, describe, expect, it, vi } from 'vitest';

// config reads JWT_SECRET at import time; provide one before importing.
process.env['JWT_SECRET'] = 'test-secret-at-least-32-characters-long-xx';
delete process.env['COLOR_TEAM_AGENT_RUNTIME_ENABLED'];

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

interface FakeQuery {
  sql: string;
  params: unknown[];
}

function makePool() {
  const queries: FakeQuery[] = [];
  const pool = {
    query: vi.fn((sql: string, params: unknown[] = []) => {
      queries.push({ sql: String(sql), params });
      // getRun → return a queued green run.
      if (String(sql).includes('SELECT * FROM color_team_runs')) {
        return Promise.resolve({ rows: [{ id: 'run-1', colors: ['green'], status: 'queued' }] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
  return { pool, queries };
}

describe('executeColorTeamRun — never fabricates findings (R1)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['COLOR_TEAM_AGENT_RUNTIME_ENABLED'];
  });

  it('inserts no findings and marks the run error honestly when runtime is disabled', async () => {
    const { pool, queries } = makePool();
    const { executeColorTeamRun } = await import('../../src/services/color-teams/index.js');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await executeColorTeamRun(pool as any, 'run-1');

    const inserts = queries.filter((q) => q.sql.includes('INSERT INTO color_team_findings'));
    expect(inserts).toHaveLength(0);

    const statusUpdate = queries.find((q) => q.sql.includes('UPDATE color_team_runs SET status'));
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate!.params[0]).toBe('error');
    expect(String(statusUpdate!.params[1])).toMatch(/not yet available|F-300/i);

    // Guard: none of the previously-fabricated literals leak into any query.
    const allText = JSON.stringify(queries);
    expect(allText).not.toContain('6.5');
    expect(allText).not.toContain('EXCL-004');
  });
});
