/**
 * Mock registry for CI per D4 §9 and D5 §11.
 *
 * When MOCK_LLM=1 or opts.mock=true, every handler reads from
 * fixture files instead of calling real providers.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Task, TaskOutputMap } from './llm-router.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FIXTURE_DIR = resolve(__dirname, '../../tests/fixtures/llm-mock');

interface MockFixture<T extends Task> {
  output: TaskOutputMap[T];
  _simulate_timeout?: boolean;
  _simulate_primary_fail?: boolean;
}

const fixtureCache = new Map<Task, MockFixture<Task>>();

export function isMockMode(optsMock?: boolean): boolean {
  return optsMock === true || process.env['MOCK_LLM'] === '1' || process.env['LLM_ROUTER_MODE'] === 'mock';
}

export function loadMockFixture<T extends Task>(task: T): MockFixture<T> {
  if (fixtureCache.has(task)) {
    return fixtureCache.get(task)! as MockFixture<T>;
  }

  const taskFileName = task.replace(/_/g, '-');
  const filePath = resolve(FIXTURE_DIR, `${taskFileName}.json`);

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const fixture = JSON.parse(raw) as MockFixture<T>;
    fixtureCache.set(task, fixture as MockFixture<Task>);
    return fixture;
  } catch (err) {
    throw new Error(
      `Mock fixture not found for task "${task}" at ${filePath}: ${(err as Error).message}`,
    );
  }
}

export function shouldSimulateTimeout<T extends Task>(task: T): boolean {
  const fixture = loadMockFixture(task);
  return fixture._simulate_timeout === true;
}

export function shouldSimulatePrimaryFail<T extends Task>(task: T): boolean {
  const fixture = loadMockFixture(task);
  return fixture._simulate_primary_fail === true;
}

export function clearMockCache(): void {
  fixtureCache.clear();
}
