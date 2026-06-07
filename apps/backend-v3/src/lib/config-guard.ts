import { config } from '../config/index.js';
import { logger } from './logger.js';

/**
 * Startup config guard — fails fast in production if the analyzer is misconfigured.
 * Call immediately after validateKeys() in server.ts main().
 */
export function assertAnalysisConfig(): void {
  const isStub = /stub/i.test(config.analysisVersion);

  if (isStub) {
    if (config.nodeEnv === 'production') {
      logger.fatal(
        { analysisVersion: config.analysisVersion },
        'ANALYSIS_VERSION is set to a stub value in production — analyzer will not produce real output. Check ANALYSIS_VERSION env / docker-compose.prod.yml.',
      );
      process.exit(1);
    } else {
      logger.warn(
        { analysisVersion: config.analysisVersion, nodeEnv: config.nodeEnv },
        'ANALYSIS_VERSION is set to a stub value — analyzer will not produce real output (non-production, continuing).',
      );
    }
  }

  if (config.analysisTimeoutMs < 15_000) {
    logger.warn(
      { analysisTimeoutMs: config.analysisTimeoutMs },
      'ANALYSIS_TIMEOUT_MS is below 15 000 ms — real LLM latency is typically 24-47 s; spurious timeouts are likely.',
    );
  }
}
