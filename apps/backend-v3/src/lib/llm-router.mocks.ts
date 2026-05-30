/**
 * Mock mode for CI per D4 §9 and D5 §11.
 * Environment flag LLM_ROUTER_MODE=mock or request-level opts.mock=true.
 *
 * Reads fixture files from tests/fixtures/llm-mock/<task>.json.
 * Fixtures may include _simulate_timeout and _simulate_primary_fail flags.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Task, RouteResponseOk } from './llm-router.types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../tests/fixtures/llm-mock');

interface MockFixture<T = unknown> {
  _simulate_timeout?: boolean;
  _simulate_primary_fail?: boolean;
  output: T;
}

export function isMockMode(requestMock?: boolean): boolean {
  if (requestMock === true) return true;
  const envFlag = process.env['LLM_ROUTER_MODE'] ?? process.env['MOCK_LLM'];
  return envFlag === 'mock' || envFlag === '1';
}

export function loadFixture<T>(task: Task): MockFixture<T> {
  const taskFile = task.replace(/_/g, '-');
  const fixturePath = join(FIXTURE_DIR, `${taskFile}.json`);
  const raw = readFileSync(fixturePath, 'utf-8');
  return JSON.parse(raw) as MockFixture<T>;
}

export function shouldSimulateTimeout(task: Task): boolean {
  try {
    const fixture = loadFixture(task);
    return fixture._simulate_timeout === true;
  } catch {
    return false;
  }
}

export function shouldSimulatePrimaryFail(task: Task): boolean {
  try {
    const fixture = loadFixture(task);
    return fixture._simulate_primary_fail === true;
  } catch {
    return false;
  }
}

export function getMockOutput<T>(task: Task): T {
  const fixture = loadFixture<T>(task);
  return fixture.output;
}

export function buildMockResponse<T extends Task>(
  task: T,
  model: string,
  startTime: number,
): RouteResponseOk<T> {
  const output = getMockOutput(task);
  const latency = Date.now() - startTime;

  return {
    ok: true,
    task,
    model_used: model,
    output: output as RouteResponseOk<T>['output'],
    latency_ms: latency,
    tokens: { input: 100, output: 200 },
    cost_estimate_usd: 0,
    fallback_used: false,
    quality_flag: 'full',
    trace_id: `mock-${task}-${Date.now()}`,
  };
}
