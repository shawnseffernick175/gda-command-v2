#!/usr/bin/env node
/**
 * Migration Orchestrator — CLI entry point.
 *
 * Usage:
 *   npx tsx src/migration/run.ts                          # dry-run, all entities
 *   npx tsx src/migration/run.ts --commit                 # write, all entities
 *   npx tsx src/migration/run.ts --entity opportunity     # dry-run, opportunities only
 *   npx tsx src/migration/run.ts --commit --entity all    # write, all entities
 *   npx tsx src/migration/run.ts --report-only            # generate parity report from existing V3 data
 */

import { extractAll, extractCounts } from './extract.js';
import { transformAll } from './transform.js';
import { loadAll } from './load.js';
import { generateParityReport } from './parity-report.js';
import type { MigrationCounts, MigrationOptions } from './types.js';

function parseArgs(argv: string[]): MigrationOptions & { reportOnly: boolean } {
  const args = argv.slice(2);

  let commit = false;
  let entity: MigrationOptions['entity'] = 'all';
  let reportOnly = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--commit') {
      commit = true;
    } else if (arg === '--entity' && i + 1 < args.length) {
      const val = args[++i];
      if (val === 'opportunity' || val === 'capture' || val === 'action_item' || val === 'all') {
        entity = val;
      } else {
        console.error(`Invalid --entity value: ${val}. Use: opportunity | capture | action_item | all`);
        process.exit(1);
      }
    } else if (arg === '--report-only') {
      reportOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Migration Orchestrator — V2 legacy → V3

Usage:
  npx tsx src/migration/run.ts [options]

Options:
  --commit              Actually write to V3 (default: dry-run)
  --entity <type>       Migrate a single entity type (opportunity|capture|action_item|all)
  --report-only         Generate parity report from existing V3 data
  --help, -h            Show this help
      `);
      process.exit(0);
    }
  }

  const legacyDatabaseUrl = process.env['LEGACY_DATABASE_URL'];
  const v3DatabaseUrl = process.env['DATABASE_URL']
    ?? 'postgresql://gda:gda_dev_password@localhost:5432/gda_command';

  if (!legacyDatabaseUrl && !reportOnly) {
    console.error('Error: LEGACY_DATABASE_URL environment variable is required');
    console.error('Set it to the connection string for the legacy V2 database.');
    process.exit(1);
  }

  return {
    commit,
    entity,
    reportOnly,
    legacyDatabaseUrl: legacyDatabaseUrl ?? '',
    v3DatabaseUrl,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  console.log('=== GDA Command V2 → V3 Migration ===');
  console.log(`Mode: ${options.commit ? 'COMMIT (writes enabled)' : 'DRY-RUN (no writes)'}`);
  console.log(`Entity: ${options.entity}`);
  console.log();

  if (options.reportOnly) {
    console.log('Report-only mode — generating parity report from existing V3 data...');

    const dummyCounts: MigrationCounts = {
      opportunities: { v2: 0, v3: 0 },
      captures: { v2: 0, v3: 0 },
      action_items: { v2: 0, v3: 0 },
      sources: { v2: 0, v3: 0 },
      partners: { v2: 0, v3: 0 },
    };

    const report = await generateParityReport({
      v2Counts: dummyCounts,
      v3DatabaseUrl: options.v3DatabaseUrl,
      gaps: [],
    });

    console.log(report.markdown);
    process.exit(report.passed ? 0 : 1);
  }

  console.log('Phase 1: Extract — reading from legacy V2 tables...');
  const extracted = await extractAll(options.legacyDatabaseUrl);
  const v2Counts = await extractCounts(options.legacyDatabaseUrl);

  console.log(`  Opportunities: ${extracted.opportunities.length}`);
  console.log(`  Captures:      ${extracted.captures.length}`);
  console.log(`  Action Items:  ${extracted.actionItems.length}`);
  console.log(`  Sources:       ${extracted.sources.length}`);
  console.log(`  Partners:      ${extracted.partners.length}`);
  console.log();

  console.log('Phase 2: Transform — mapping V2 rows to V3 schema...');
  const transformed = transformAll(extracted);

  console.log(`  V3 Opportunities: ${transformed.opportunities.length}`);
  console.log(`  V3 Captures:      ${transformed.captures.length}`);
  console.log(`  V3 Action Items:  ${transformed.actionItems.length}`);
  console.log(`  V3 Sources:       ${transformed.sources.length}`);
  console.log(`  V3 Partners:      ${transformed.partners.length}`);
  console.log(`  Pre-warm Jobs:    ${transformed.preWarmJobs.length}`);
  console.log(`  Gaps:             ${transformed.gaps.length}`);
  console.log();

  if (!options.commit) {
    console.log('DRY-RUN complete. Use --commit to write to V3.');
    console.log();

    const migrationCounts: MigrationCounts = {
      opportunities: { v2: v2Counts.opportunities, v3: transformed.opportunities.length },
      captures: { v2: v2Counts.captures, v3: transformed.captures.length },
      action_items: { v2: v2Counts.action_items, v3: transformed.actionItems.length },
      sources: { v2: v2Counts.sources, v3: transformed.sources.length },
      partners: { v2: v2Counts.partners, v3: transformed.partners.length },
    };

    const report = await generateParityReport({
      v2Counts: migrationCounts,
      v3DatabaseUrl: options.v3DatabaseUrl,
      gaps: transformed.gaps,
    });

    console.log(report.markdown);
    return;
  }

  console.log('Phase 3: Load — writing to V3 database...');

  const filterData = (entity: MigrationOptions['entity']) => ({
    opportunities: entity === 'all' || entity === 'opportunity' ? transformed.opportunities : [],
    captures: entity === 'all' || entity === 'capture' ? transformed.captures : [],
    actionItems: entity === 'all' || entity === 'action_item' ? transformed.actionItems : [],
    sources: entity === 'all' ? transformed.sources : [],
    partners: entity === 'all' ? transformed.partners : [],
    preWarmJobs: entity === 'all'
      ? transformed.preWarmJobs
      : transformed.preWarmJobs.filter((j) =>
          (entity === 'opportunity' && j.entityType === 'opportunity') ||
          (entity === 'capture' && j.entityType === 'capture'),
        ),
  });

  const loadResult = await loadAll(options.v3DatabaseUrl, filterData(options.entity));

  console.log(`  Loaded Opportunities: ${loadResult.opportunities}`);
  console.log(`  Loaded Captures:      ${loadResult.captures}`);
  console.log(`  Loaded Action Items:  ${loadResult.action_items}`);
  console.log(`  Loaded Sources:       ${loadResult.sources}`);
  console.log(`  Loaded Partners:      ${loadResult.partners}`);
  console.log(`  Pre-warm Jobs:        ${loadResult.pre_warm_jobs_enqueued}`);
  console.log();

  console.log('Phase 4: Parity Report — generating...');

  const migrationCounts: MigrationCounts = {
    opportunities: { v2: v2Counts.opportunities, v3: 0 },
    captures: { v2: v2Counts.captures, v3: 0 },
    action_items: { v2: v2Counts.action_items, v3: 0 },
    sources: { v2: v2Counts.sources, v3: 0 },
    partners: { v2: v2Counts.partners, v3: 0 },
  };

  const report = await generateParityReport({
    v2Counts: migrationCounts,
    v3DatabaseUrl: options.v3DatabaseUrl,
    gaps: transformed.gaps,
  });

  console.log(report.markdown);

  if (!report.passed) {
    console.error('MIGRATION PARITY CHECK FAILED');
    process.exit(1);
  }

  console.log('Migration complete. Parity check passed.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
