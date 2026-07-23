import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['JWT_SECRET'] = 'test-secret-at-least-32-characters-long-xx';

vi.mock('../../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const runAnalysisMock = vi.fn();
vi.mock('../../src/services/color-teams/runtime.js', () => ({
  runColorTeamAnalysis: (...args: unknown[]) => runAnalysisMock(...args),
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
      if (String(sql).includes('SELECT * FROM color_team_runs')) {
        return Promise.resolve({ rows: [{ id: 'run-1', document_id: 'doc-1', colors: ['green'], status: 'queued' }] });
      }
      if (String(sql).includes('INSERT INTO color_team_findings')) {
        return Promise.resolve({ rows: [{ id: 'f-1' }] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
  return { pool, queries };
}

describe('executeColorTeamRun — enabled runtime wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    runAnalysisMock.mockReset();
    process.env['COLOR_TEAM_AGENT_RUNTIME_ENABLED'] = 'true';
  });

  it('transitions queued → running → complete and persists validated findings', async () => {
    runAnalysisMock.mockResolvedValue([
      { color: 'green', severity: 'info', section_ref: 'Exec', finding: 'ok', citations: [{ source: 's', url: '/documents/doc-1', grade: 'A' }] },
    ]);
    const { pool, queries } = makePool();
    const { executeColorTeamRun } = await import('../../src/services/color-teams/index.js');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await executeColorTeamRun(pool as any, 'run-1');

    const statuses = queries
      .filter((q) => q.sql.includes('UPDATE color_team_runs SET status'))
      .map((q) => q.params[0]);
    expect(statuses).toEqual(['running', 'complete']);
    expect(queries.filter((q) => q.sql.includes('INSERT INTO color_team_findings'))).toHaveLength(1);
  });

  it('marks the run error and inserts nothing when the runtime throws', async () => {
    runAnalysisMock.mockRejectedValue(new Error('Document text is empty or unreadable'));
    const { pool, queries } = makePool();
    const { executeColorTeamRun } = await import('../../src/services/color-teams/index.js');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await executeColorTeamRun(pool as any, 'run-1');

    const lastStatus = queries.filter((q) => q.sql.includes('UPDATE color_team_runs SET status')).pop();
    expect(lastStatus!.params[0]).toBe('error');
    expect(String(lastStatus!.params[1])).toMatch(/empty or unreadable/i);
    expect(queries.filter((q) => q.sql.includes('INSERT INTO color_team_findings'))).toHaveLength(0);
  });
});
