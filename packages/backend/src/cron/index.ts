/**
 * Cron scheduler — uses node-cron to schedule periodic ingest jobs.
 * Boots with the backend and logs registered jobs at startup.
 */

import cron, { type ScheduledTask } from "node-cron";
import { log } from "../lib/logger";
import { runIngest, getRegisteredSources } from "../ingest/framework/registry";
import { registerSAMSource } from "../ingest/sam";

const tasks: ScheduledTask[] = [];

interface CronJob {
  sourceKey: string;
  schedule: string;
  label: string;
}

const JOBS: CronJob[] = [
  { sourceKey: "sam.gov", schedule: "0 */4 * * *", label: "SAM.gov ingest (every 4 hours)" },
];

export function startCronScheduler(): void {
  // Register all ingest sources
  registerSAMSource();

  const registeredSources = getRegisteredSources();
  log.info("cron_sources_registered", { sources: registeredSources });

  for (const job of JOBS) {
    if (!registeredSources.includes(job.sourceKey)) {
      log.warn("cron_source_not_found", { sourceKey: job.sourceKey });
      continue;
    }

    const task = cron.schedule(job.schedule, async () => {
      try {
        await runIngest(job.sourceKey);
      } catch (err) {
        log.error("cron_job_error", {
          sourceKey: job.sourceKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    tasks.push(task);
    log.info("cron_job_scheduled", {
      sourceKey: job.sourceKey,
      schedule: job.schedule,
      label: job.label,
    });
  }
}

export function stopCronScheduler(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  log.info("cron_scheduler_stopped");
}
