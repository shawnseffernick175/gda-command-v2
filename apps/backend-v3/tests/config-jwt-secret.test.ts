import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

function evalConfig(env: Record<string, string | undefined>): { code: number; stderr: string } {
  const filtered = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;
  if (env['JWT_SECRET'] === undefined) delete filtered['JWT_SECRET'];

  const script = `import('${projectRoot}/src/config/index.ts').then(() => process.exit(0)).catch((e) => { process.stderr.write(e.message); process.exit(1); })`;
  try {
    execSync(`npx tsx --eval "${script}"`, {
      env: filtered,
      cwd: projectRoot,
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status: number; stderr: Buffer };
    return { code: e.status, stderr: e.stderr?.toString() ?? '' };
  }
}

describe('config JWT_SECRET validation', () => {
  it('throws when JWT_SECRET is not set', () => {
    const result = evalConfig({ JWT_SECRET: undefined });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET must be set and at least 32 characters long');
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    const result = evalConfig({ JWT_SECRET: 'short-secret-only-20ch' });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET must be set and at least 32 characters long');
  });

  it('succeeds when JWT_SECRET is 32+ characters', () => {
    const result = evalConfig({ JWT_SECRET: 'a-valid-secret-that-is-at-least-32-chars-long' });
    expect(result.code).toBe(0);
  });
});
