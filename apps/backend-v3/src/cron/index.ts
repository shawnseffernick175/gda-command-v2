/**
 * Cron scheduler — uses node-cron to schedule periodic ingest jobs.
 * Boots with the backend and logs registered jobs at startup.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { runIngest, getRegisteredSources } from '../ingest/framework/registry.js';
import { registerSAMSource } from '../ingest/sam/index.js';

const tasks: ScheduledTask[] = [];

interface CronJob {
  sourceKey: string;
  schedule: string;
  label: string;
}

const JOBS: CronJob[] = [
  { sourceKey: 'sam.gov', schedule: '0 */4 * * *', label: 'SAM.gov ingest (every 4 hours)' },
];

export function startCronScheduler(): void {
  registerSAMSource();

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
    logger.info(
      { sourceKey: job.sourceKey, schedule: job.schedule, label: job.label },
      `[cron] registered: ${job.sourceKey === 'sam.gov' ? 'sam.4h' : job.sourceKey}`,
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
