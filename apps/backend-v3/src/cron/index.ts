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
 * Source: DoD DSIP API (dodsbirsttr.mil). Orchestrator flips flag after
 * deploy verification.
 */

import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { runIngest, getRegisteredSources } from '../ingest/framework/registry.js';
import { listAdapters } from '../ingest/adapter/registry.js';
import { registerSAMSource } from '../ingest/sam/index.js';
import { registerUSASpendingSource } from '../ingest/usaspending/index.js';
import { registerFederalRegisterSource } from '../ingest/federal_register/index.js';
import { registerSBIRSource } from '../ingest/sbir/index.js';
import { registerNSFSource } from '../ingest/nsf/index.js';
import { registerDoDRSSSource } from '../ingest/dod_rss/index.js';
import { registerNIHSource } from '../ingest/nih/index.js';
import { registerArxivSource } from '../ingest/arxiv/index.js';
import { registerGovTribeSource } from '../ingest/govtribe/index.js';
import { registerGovWinSource } from '../ingest/govwin/index.js';
import { registerGrantsGovSource } from '../ingest/grants_gov/index.js';
import { trainIfReady } from '../services/pwin/index.js';
import { batchScoreOpportunities } from '../services/pwin/batch-score.js';
import { generateActionItems } from '../jobs/generateActionItems.js';
import { runDigestRefresh } from './digest-refresh.js';
import { runDailyBriefingCron } from './daily-briefing.js';
import { runAnalyzerSelfCheck } from '../workers/self-check.js';
import { discoverCompetitorContacts } from '../services/contacts/competitor-discovery.js';
import { discoverPartnerContacts } from '../services/contacts/partner-discovery.js';
import { enrichContactsBatch } from '../services/contacts/enrich-batch.js';
import { pool } from '../lib/db.js';

const sbirEnabled = process.env.ENABLE_SBIR_INGEST === 'true';
const govtribeEnabled = process.env.ENABLE_GOVTRIBE_INGEST !== 'false';
const govwinEnabled = process.env.GOVWIN_CONNECTOR_V1 === 'true';
const grantsGovEnabled = process.env.ENABLE_GRANTS_GOV_INGEST !== 'false';

const tasks: ScheduledTask[] = [];

interface CronJob {
  sourceKey: string;
  schedule: string;
  label: string;
}

const JOBS: CronJob[] = [
  { sourceKey: 'sam.gov', schedule: '0 */4 * * *', label: 'SAM.gov ingest (every 4 hours)' },
  { sourceKey: 'usaspending.gov', schedule: '0 7 * * *', label: 'USAspending daily awards ingest (03:00 ET)' },
  { sourceKey: 'federalregister.gov', schedule: '15 */6 * * *', label: 'Federal Register ingest (every 6 hours)' },
  ...(sbirEnabled
    ? [{ sourceKey: 'sbir', schedule: '0 9 * * *', label: 'DoD SBIR/STTR open topics via DSIP (daily 05:00 ET)' }]
    : []),
  { sourceKey: 'nsf', schedule: '0 8 * * *', label: 'NSF research awards ingest (daily 04:00 ET)' },
  { sourceKey: 'dod_rss', schedule: '30 22 * * *', label: 'DoD contract announcements RSS ingest (daily 18:30 ET, after 5pm ET feed publish)' },
  { sourceKey: 'nih', schedule: '0 7 * * 1', label: 'NIH RePORTER research awards ingest (weekly Mon 03:00 ET)' },
  { sourceKey: 'arxiv', schedule: '0 6 * * 1', label: 'arXiv defense/tech papers ingest (weekly Mon 02:00 ET)' },
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
  ...(grantsGovEnabled
    ? [{ sourceKey: 'grants.gov', schedule: '0 11 * * *', label: 'Grants.gov open opportunities (daily 07:00 ET)' }]
    : []),
];

export function startCronScheduler(): void {
  registerSAMSource();
  registerUSASpendingSource();
  registerFederalRegisterSource();
  registerSBIRSource();
  registerNSFSource();
  registerDoDRSSSource();
  registerNIHSource();
  registerArxivSource();
  registerGovTribeSource();
  if (govwinEnabled) {
    registerGovWinSource();
  }
  registerGrantsGovSource();

  const registeredSources = getRegisteredSources();
  const registeredAdapters = listAdapters();
  logger.info({ sources: registeredSources, adapters: registeredAdapters }, '[ingest] framework ready');

  if (!sbirEnabled) {
    logger.info({ flag: 'ENABLE_SBIR_INGEST' }, '[cron] sbir.daily skipped — gated behind env flag (default off)');
  }
  if (!govwinEnabled) {
    logger.info({ flag: 'GOVWIN_CONNECTOR_V1' }, '[cron] govwin.6h skipped — gated behind feature flag');
  }

  // Daily briefing auto-delivery — 6:00 AM ET (11:00 UTC) on weekdays
  const briefingDeliveryTask = cron.schedule('0 11 * * 1-5', async () => {
    try {
      logger.info('[cron] briefing.delivery starting');
      await runDailyBriefingCron();
      logger.info('[cron] briefing.delivery completed');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_briefing_delivery_error');
    }
  });
  tasks.push(briefingDeliveryTask);
  logger.info({ schedule: '0 11 * * 1-5' }, '[cron] registered: briefing.delivery (0 11 * * 1-5)');

  // PWin batch scoring — daily at 01:00 UTC (before retrain at 02:00 and action-items at 06:30)
  const pwinBatchScoreTask = cron.schedule('0 1 * * *', async () => {
    try {
      logger.info('[cron] pwin.batch-score starting');
      await batchScoreOpportunities();
      logger.info('[cron] pwin.batch-score completed');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_pwin_batch_score_error');
    }
  });
  tasks.push(pwinBatchScoreTask);
  logger.info({ schedule: '0 1 * * *' }, '[cron] registered: pwin.batch-score (0 1 * * *)');

  // Action items auto-generation — every 6 hours
  const actionItemsGenTask = cron.schedule('30 */6 * * *', async () => {
    try {
      logger.info('[cron] action-items-gen starting');
      await generateActionItems();
      logger.info('[cron] action-items-gen completed');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_action_items_gen_error');
    }
  });
  tasks.push(actionItemsGenTask);
  logger.info({ schedule: '30 */6 * * *' }, '[cron] registered: action-items-gen (30 */6 * * *)');

  // Digest lead story refresh — daily at 11:00 UTC (6:00 AM ET)
  const digestRefreshTask = cron.schedule('0 11 * * *', async () => {
    await runDigestRefresh();
  });
  tasks.push(digestRefreshTask);
  logger.info({ schedule: '0 11 * * *' }, '[cron] registered: digest.refresh (0 11 * * *)');

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

  // Analyzer self-check canary — every 30 minutes
  const analyzerSelfCheckTask = cron.schedule('*/30 * * * *', async () => {
    try {
      logger.info('[cron] analyzer.selfcheck starting');
      await runAnalyzerSelfCheck(pool);
      logger.info('[cron] analyzer.selfcheck completed');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_analyzer_selfcheck_error');
    }
  });
  tasks.push(analyzerSelfCheckTask);
  logger.info({ schedule: '*/30 * * * *' }, '[cron] registered: analyzer.selfcheck (*/30 * * * *)');

  // Competitor contact discovery — daily at 03:00 UTC (after pwin 01:00 + retrain 02:00)
  const competitorContactTask = cron.schedule('0 3 * * *', async () => {
    try {
      logger.info('[cron] competitor-contact-discovery starting');
      const result = await discoverCompetitorContacts({ limit: 25, max_contacts: 5 });
      logger.info(
        { companies: result.companies_processed, contacts: result.contacts_written, skipped: result.companies_skipped_no_results },
        '[cron] competitor-contact-discovery completed',
      );
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_competitor_contact_discovery_error');
    }
  });
  tasks.push(competitorContactTask);
  logger.info({ schedule: '0 3 * * *' }, '[cron] registered: competitor-contact-discovery (0 3 * * *)');

  // Partner contact discovery \u2014 daily at 04:00 UTC (one hour after competitor discovery)
  const partnerContactTask = cron.schedule('0 4 * * *', async () => {
    try {
      logger.info('[cron] partner-contact-discovery starting');
      const result = await discoverPartnerContacts({ limit: 25, max_contacts: 5 });
      logger.info(
        { companies: result.companies_processed, contacts: result.contacts_written, skipped: result.companies_skipped_no_results },
        '[cron] partner-contact-discovery completed',
      );
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_partner_contact_discovery_error');
    }
  });
  tasks.push(partnerContactTask);
  logger.info({ schedule: '0 4 * * *' }, '[cron] registered: partner-contact-discovery (0 4 * * *)');

  // Contact enrichment batch -- daily at 05:00 UTC (one hour after partner discovery)
  const contactEnrichBatchTask = cron.schedule('0 5 * * *', async () => {
    try {
      logger.info('[cron] contact-enrich-batch starting');
      const result = await enrichContactsBatch({
        categories: ['competitor', 'teaming_partner'],
        only_unenriched: true,
      });
      logger.info(
        { considered: result.contacts_considered, enriched: result.contacts_enriched, failed: result.contacts_failed },
        '[cron] contact-enrich-batch completed',
      );
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_contact_enrich_batch_error');
    }
  });
  tasks.push(contactEnrichBatchTask);
  logger.info({ schedule: '0 5 * * *' }, '[cron] registered: contact-enrich-batch (0 5 * * *)');

  // Soak telemetry materialized view refresh — daily at 02:30 UTC (offset from pwin retrain at 02:00)
  const soakMetricsRefreshTask = cron.schedule('30 2 * * *', async () => {
    try {
      logger.info('[cron] soak-metrics-refresh starting');
      await pool.query('REFRESH MATERIALIZED VIEW soak_metrics;');
      logger.info('[cron] soak_metrics materialized view refreshed');
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'cron_soak_metrics_refresh_error');
    }
  });
  tasks.push(soakMetricsRefreshTask);
  logger.info({ schedule: '30 2 * * *' }, '[cron] registered: soak-metrics-refresh (30 2 * * *)');

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
      : job.sourceKey === 'federalregister.gov' ? 'federal_register.6h'
      : job.sourceKey === 'sbir' ? 'sbir.daily'
      : job.sourceKey === 'govtribe' ? 'govtribe.opps.mon_thu'
      : job.sourceKey === 'govtribe.contacts' ? 'govtribe.contacts.weekly'
      : job.sourceKey === 'govtribe.vehicles' ? 'govtribe.vehicles.monthly'
      : job.sourceKey === 'govtribe.budget' ? 'govtribe.budget.nightly'
      : job.sourceKey === 'govwin' ? 'govwin.6h'
      : job.sourceKey === 'dod_rss' ? 'dod_rss.daily'
      : job.sourceKey === 'nih' ? 'nih.weekly'
      : job.sourceKey === 'arxiv' ? 'arxiv.weekly'
      : job.sourceKey === 'grants.gov' ? 'grants.daily'
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
