#!/usr/bin/env tsx
/**
 * Initial corpus ingestion script for F-301 RAG Knowledge Base.
 *
 * Reads files from a corpus directory and ingests them into the knowledge base.
 * Idempotent: re-running does NOT duplicate documents (SHA256 dedup).
 *
 * Usage:
 *   CORPUS_DIR=/srv/gda-agent-v3/initial_corpus npx tsx scripts/ingest_initial_corpus.ts
 *   npx tsx scripts/ingest_initial_corpus.ts /path/to/corpus
 *
 * Environment:
 *   DATABASE_URL  — Postgres connection string (defaults to local dev)
 *   OPENAI_API_KEY — Required for embedding generation
 *   CORPUS_DIR    — Directory containing files to ingest (or pass as argv[2])
 */

import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { ingestFromPath } from '../src/services/rag/store.js';
import type { DocType, OuTag, EvidenceGrade } from '../src/services/rag/types.js';

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf', '.docx', '.pptx', '.xlsx', '.md', '.txt', '.eml', '.msg',
]);

interface FileMapping {
  pattern: RegExp;
  doc_type: DocType;
  ou_tag?: OuTag;
  evidence_grade?: EvidenceGrade;
  title?: string;
}

const CEO_MAPPINGS: FileMapping[] = [
  { pattern: /1_AJ_Insight/i, doc_type: 'ceo_doctrine', ou_tag: 'gda', evidence_grade: 'A', title: 'AJ Insight Into Future' },
  { pattern: /2_AJ.?Strat/i, doc_type: 'ceo_doctrine', ou_tag: 'gda', evidence_grade: 'A', title: 'AJ Strategic Operating Plan' },
  { pattern: /3_.*AJ.*Doctorine/i, doc_type: 'ceo_doctrine', ou_tag: 'gda', evidence_grade: 'A', title: 'AJ Operational Doctrine' },
  { pattern: /4_Meeting.*Doctrine/i, doc_type: 'meeting_transcript', ou_tag: 'gda', evidence_grade: 'B', title: 'Operational Doctrine Meeting Transcript' },
  { pattern: /5_AJ.*Business.?Plan/i, doc_type: 'business_plan', ou_tag: 'gda', evidence_grade: 'A', title: 'AJ Business Plan Slides' },
  { pattern: /6_GDA.*Business.*Plan.*FY26/i, doc_type: 'business_plan', ou_tag: 'gda', evidence_grade: 'A', title: 'GDA Business Plan FY26-FY28 (PPTX)' },
  { pattern: /7_GDA.*Business.*Plan.*FY26/i, doc_type: 'business_plan', ou_tag: 'gda', evidence_grade: 'A', title: 'GDA Business Plan FY26-FY28 (DOCX)' },
];

const WORKFLOW_PATTERN = /\.(md|txt)$/i;

function classifyFile(filename: string, parentDir: string): {
  doc_type: DocType;
  ou_tag?: OuTag;
  evidence_grade?: EvidenceGrade;
  title?: string;
} {
  for (const mapping of CEO_MAPPINGS) {
    if (mapping.pattern.test(filename)) {
      return {
        doc_type: mapping.doc_type,
        ou_tag: mapping.ou_tag,
        evidence_grade: mapping.evidence_grade,
        title: mapping.title,
      };
    }
  }

  if (parentDir.includes('feb_apr_uploads') || parentDir.includes('workflow')) {
    if (WORKFLOW_PATTERN.test(filename)) {
      return {
        doc_type: 'workflow_spec',
        ou_tag: 'envision',
        evidence_grade: 'B',
        title: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
      };
    }
  }

  return {
    doc_type: 'other',
    evidence_grade: 'C',
  };
}

async function findFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await findFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

async function main(): Promise<void> {
  const corpusDir = process.argv[2] || process.env['CORPUS_DIR'] || '/srv/gda-agent-v3/initial_corpus';

  console.log(`=== F-301 RAG Initial Corpus Ingestion ===`);
  console.log(`Corpus directory: ${corpusDir}`);

  try {
    await stat(corpusDir);
  } catch {
    console.error(`Error: Corpus directory does not exist: ${corpusDir}`);
    console.error('Set CORPUS_DIR or pass the path as an argument.');
    process.exit(1);
  }

  const files = await findFiles(corpusDir);
  console.log(`Found ${files.length} files to ingest`);

  let created = 0;
  let existing = 0;
  let errors = 0;

  for (const filePath of files) {
    const filename = filePath.split('/').pop() ?? filePath;
    const parentDir = filePath;
    const classification = classifyFile(filename, parentDir);

    console.log(`  [${classification.doc_type}] ${filename}...`);

    try {
      const result = await ingestFromPath(filePath, {
        source_filename: filename,
        ...classification,
      });

      if (result.status === 'existing') {
        console.log(`    -> EXISTING (${result.chunk_count} chunks)`);
        existing++;
      } else {
        console.log(`    -> CREATED (${result.chunk_count} chunks)`);
        created++;
      }
    } catch (err) {
      console.error(`    -> ERROR: ${(err as Error).message}`);
      errors++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Created: ${created}`);
  console.log(`  Existing (dedup): ${existing}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total files: ${files.length}`);

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
