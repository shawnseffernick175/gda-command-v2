import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${key} must be an integer, got: ${raw}`);
  return n;
}

function loadGitSha(): string {
  if (process.env['GIT_SHA']) return process.env['GIT_SHA'];
  try {
    const headPath = resolve(process.cwd(), '.git/HEAD');
    if (!existsSync(headPath)) return 'unknown';
    const head = readFileSync(headPath, 'utf-8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = resolve(process.cwd(), '.git', head.slice(5));
      if (existsSync(refPath)) return readFileSync(refPath, 'utf-8').trim().slice(0, 7);
    }
    return head.slice(0, 7);
  } catch {
    return 'unknown';
  }
}

export const config = {
  port: envInt('PORT', 4000),
  host: env('HOST', '0.0.0.0'),

  databaseUrl: env('DATABASE_URL', 'postgresql://gda:gda_dev_password@localhost:5432/gda_command'),

  jwtSecret: env('JWT_SECRET', 'dev-jwt-secret-change-in-production'),
  jwtAlgorithm: 'HS256' as const,

  webhookKey: env('GDA_WEBHOOK_KEY', 'dev-webhook-key'),

  gitSha: loadGitSha(),
  version: '3.0.0',

  analysisVersion: env('ANALYSIS_VERSION', 'v1.0.0'),
  analysisTimeoutMs: envInt('ANALYSIS_TIMEOUT_MS', 20_000),
  analysisPollIntervalMs: envInt('ANALYSIS_POLL_INTERVAL_MS', 100),

  logLevel: env('LOG_LEVEL', 'info'),

  nodeEnv: env('NODE_ENV', 'development'),

  agentV3Url: env('AGENT_V3_URL', 'http://gda-agent-v3:8001'),
  agentServiceToken: env('AGENT_SERVICE_TOKEN', ''),

  fpdsApiBaseUrl: env('FPDS_API_BASE_URL', 'https://www.fpds.gov/ezsearch/fpdsportal'),

  samApiKey: env('SAM_API_KEY', ''),
} as const;
