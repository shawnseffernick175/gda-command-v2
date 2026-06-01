/**
 * Cron scheduler — uses node-cron to schedule periodic ingest jobs.
 * Boots with the backend and logs registered jobs at startup.
 *
 * DIBBS + NECO crons are gated behind ENABLE_DIBBS_INGEST / ENABLE_NECO_INGEST
 * env flags (default OFF). Both .mil sites firewall commercial VPS IPs, so
 * crons fail with TCP connect timeouts from Hostinger. The ingest code is
 * correct — only the transport is blocked. Re-enable once egress proxy or
 * alternative infra is in place. See GitHub issue #513.
 *
 * SBIR cron is gated behind ENABLE_SBIR_INGEST (default OFF).
 * api.www.sbir.gov returns HTTP 429 for all requests from VPS egress IP.
 * See GitHub issue #527.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { runIngest, getRegisteredSources } from '../ingest/framework/registry.js';
import { registerSAMSource } from '../ingest/sam/index.js';
import { registerDIBBSSource } from '../ingest/dibbs/index.js';
import { registerNECOSource } from '../ingest/neco/index.js';
import { registerUSASpendingSource } from '../ingest/usaspending/index.js';
import { registerFederalRegisterSource } from '../ingest/federal_register/index.js';
import { registerSBIRSource } from '../ingest/sbir/index.js';
import { registerGovTribeSource } from '../ingest/govtribe/index.js';
import { registerGovWinSource } from '../ingest/govwin/index.js';
import { trainIfReady } from '../services/pwin/index.js';

const dibbsEnabled = process.env.ENABLE_DIBBS_INGEST === 'true';
const necoEnabled = process.env.ENABLE_NECO_INGEST === 'true';
const sbirEnabled = process.env.ENABLE_SBIR_INGEST === 'true';
const govtribeEnabled = process.env.ENABLE_GOVTRIBE_INGEST !== 'false';
const govwinEnabled = process.env.GOVWIN_CONNECTOR_V1 === 'true';

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
  ...(sbirEnabled
    ? [{ sourceKey: 'sbir.gov', schedule: '45 */12 * * *', label: 'SBIR/STTR awards + open topics (twice daily)' }]
    : []),
  ...(govtribeEnabled
    ? [
        { sourceKey: 'govtribe', schedule: '0 10 * * 1,4', label: 'GovTribe opps poll (Mon+Thu 6am ET / 10:00 UTC)' },
        { sourceKey: 'govtribe.contacts', schedule: '0 9 * * 1', label: 'GovTribe contacts poll (weekly Mon 09:00 UTC)' },
        { sourceKey: 'govtribe.vehicles', schedule: '0 6 1 * *', label: 'GovTribe vehicles poll (monthly)' },
        { sourceKey: 'govtribe.budget', schedule: '55 3 * * *', label: 'GovTribe budget rollup (nightly 23:55 ET)' },
      ]
    : []),
  ...(govwinEnabled
    ? [
        { sourceKey: 'govwin', schedule: '0 */6 * * *', label: 'GovWin IQ opps poll (every 6 hours)' },
      ]
    : []),
];

export function startCronScheduler(): void {
  registerSAMSource();
  registerUSASpendingSource();
  // Source registration kept unconditionally so manual POST /v3/admin/ingest/run/dibbs|neco
  // still resolves. Only the cron schedule is gated by the env flags above.
  registerDIBBSSource();
  registerNECOSource();
  registerFederalRegisterSource();
  registerSBIRSource();
  registerGovTribeSource();
  if (govwinEnabled) {
    registerGovWinSource();
  }

  const registeredSources = getRegisteredSources();
  logger.info({ sources: registeredSources }, '[ingest] framework ready');

  if (!sbirEnabled) {
    logger.info({ flag: 'ENABLE_SBIR_INGEST' }, '[cron] sbir.12h skipped — gated behind env flag (default off due to api.www.sbir.gov 429 block on VPS egress)');
  }
  if (!govwinEnabled) {
    logger.info({ flag: 'GOVWIN_CONNECTOR_V1' }, '[cron] govwin.6h skipped — gated behind feature flag');
  }

  // PWin nightly retrain — runs at 02:00 UTC (10 PM ET)
  const pwinRetrainTask = cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('[cron] pwin.retrain starting');
      const result = await trainIfReady();
      if (result) {
        logger.info({ version: result.new_version, promoted: result.promoted, metrics: result.metrics }, '[cron] pwin.retrain completed');
      } else {
        logger.info('[cron] pwin.retrain — no retraining needed');
      }
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_pwin_retrain_error');
    }
  });
  tasks.push(pwinRetrainTask);
  logger.info({ schedule: '0 2 * * *' }, '[cron] registered: pwin.retrain (0 2 * * *)');

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
      : job.sourceKey === 'sbir.gov' ? 'sbir.12h'
      : job.sourceKey === 'govtribe' ? 'govtribe.opps.mon_thu'
      : job.sourceKey === 'govtribe.contacts' ? 'govtribe.contacts.weekly'
      : job.sourceKey === 'govtribe.vehicles' ? 'govtribe.vehicles.monthly'
      : job.sourceKey === 'govtribe.budget' ? 'govtribe.budget.nightly'
      : job.sourceKey === 'govwin' ? 'govwin.6h'
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
