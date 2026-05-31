/**
 * Cron scheduler — uses node-cron to schedule periodic ingest jobs.
 * Boots with the backend and logs registered jobs at startup.
 *
 * DIBBS + NECO crons are gated behind ENABLE_DIBBS_INGEST / ENABLE_NECO_INGEST
 * env flags (default OFF). Both .mil sites firewall commercial VPS IPs, so
 * crons fail with TCP connect timeouts from Hostinger. The ingest code is
 * correct — only the transport is blocked. Re-enable once egress proxy or
 * alternative infra is in place. See GitHub issue #513.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { runIngest, getRegisteredSources } from '../ingest/framework/registry.js';
import { registerSAMSource } from '../ingest/sam/index.js';
import { registerDIBBSSource } from '../ingest/dibbs/index.js';
import { registerNECOSource } from '../ingest/neco/index.js';
import { registerUSASpendingSource } from '../ingest/usaspending/index.js';
import { registerFederalRegisterSource } from '../ingest/federal_register/index.js';

const dibbsEnabled = process.env.ENABLE_DIBBS_INGEST === 'true';
const necoEnabled = process.env.ENABLE_NECO_INGEST === 'true';

const tasks: ScheduledTask[] = [];

interface CronJob {
  sourceKey: string;
  schedule: string;
  label: string;
}

const JOBS: CronJob[] = [
  { sourceKey: 'sam.gov', schedule: '0 */4 * * *', label: 'SAM.gov ingest (every 4 hours)' },
  { sourceKey: 'usaspending.gov', schedule: '0 7 * * *', label: 'USAspending daily awards ingest (03:00 ET)' },
  ...(dibbsEnabled
    ? [{ sourceKey: 'dibbs', schedule: '0 */6 * * *', label: 'DIBBS ingest (every 6 hours)' }]
    : []),
  ...(necoEnabled
    ? [{ sourceKey: 'neco', schedule: '30 */6 * * *', label: 'NECO ingest (every 6 hours, offset)' }]
    : []),
  { sourceKey: 'federalregister.gov', schedule: '15 */6 * * *', label: 'Federal Register ingest (every 6 hours)' },
];

export function startCronScheduler(): void {
  registerSAMSource();
  registerUSASpendingSource();
  // Source registration kept unconditionally so manual POST /v3/admin/ingest/run/dibbs|neco
  // still resolves. Only the cron schedule is gated by the env flags above.
  registerDIBBSSource();
  registerNECOSource();
  registerFederalRegisterSource();

  const registeredSources = getRegisteredSources();
  logger.info({ sources: registeredSources }, '[ingest] framework ready');

  for (const job of JOBS) {
    if (!registeredSources.includes(job.sourceKey)) {
      logger.warn({ sourceKey: job.sourceKey }, 'cron_source_not_found');
      continue;
    }

    const task = cron.schedule(job.schedule, async () => {
      try {
        await runIngest(job.sourceKey);
      } catch (err) {
        logger.error(
          {
            sourceKey: job.sourceKey,
            error: err instanceof Error ? err.message : String(err),
          },
          'cron_job_error',
        );
      }
    });

    tasks.push(task);
    const cronLabel = job.sourceKey === 'sam.gov' ? 'sam.4h'
      : job.sourceKey === 'usaspending.gov' ? 'usaspending.daily'
      : job.sourceKey === 'dibbs' ? 'dibbs.6h'
      : job.sourceKey === 'neco' ? 'neco.6h'
      : job.sourceKey === 'federalregister.gov' ? 'federal_register.6h'
      : job.sourceKey;
    logger.info(
      { sourceKey: job.sourceKey, schedule: job.schedule, label: job.label },
      `[cron] registered: ${cronLabel} (${job.schedule})`,
    );
  }
}

export function stopCronScheduler(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  logger.info('cron_scheduler_stopped');
}
