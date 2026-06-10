-- v3_072: Vault redesign — 17 unified buckets
-- 2026-06-10

BEGIN;

-- 1) Drop the old constraint
ALTER TABLE vault_documents
  DROP CONSTRAINT IF EXISTS vault_documents_doc_type_check;

-- 2) High-confidence auto-migration (pure value rewrites)
UPDATE vault_documents SET doc_type = 'financial'
  WHERE doc_type = 'invoice';

UPDATE vault_documents SET doc_type = 'subcontract_teaming'
  WHERE doc_type = 'teaming_agreement';

UPDATE vault_documents SET doc_type = 'policy_regulatory'
  WHERE doc_type IN (
    'far', 'dfars', 'dfars_pgi', 'ndaa',
    'executive_order', 'gao_decision', 'dod_policy',
    'cmmc', 'cui_policy', 'itar_ear', 'usd_policy',
    'other_regulatory'
  );

-- 3) Confidence-based reclassification of 'other' rows
--    Only applied where the filename STRONGLY signals the bucket.
UPDATE vault_documents SET doc_type = 'financial'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(invoice|p&l|pnl|balance.?sheet|income.?stmt|indirect.?rate|ar.aging|ap.aging|trial.?balance|audit|tax|w-?9|1099|financial|budget|forecast)'
  );

UPDATE vault_documents SET doc_type = 'capability_statement'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(capability.?statement|marketing.?slick|one.?pager|cap.?stmt|company.?overview)'
  );

UPDATE vault_documents SET doc_type = 'correspondence'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(email|letter|memo|correspondence|reply)'
  );

UPDATE vault_documents SET doc_type = 'personnel'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(resume|cv|org.?chart|key.?person|personnel|training.?record)'
  );

UPDATE vault_documents SET doc_type = 'technical_artifact'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(architecture|tech.?spec|whitepaper|white.?paper|technical.?design|sdd|srs)'
  );

UPDATE vault_documents SET doc_type = 'training_material'
  WHERE doc_type = 'other' AND (
    LOWER(filename) ~ '(sop|runbook|training|tutorial|guide.*deck|playbook)'
  );

-- 4) Apply the new constraint (17 buckets, alphabetical)
ALTER TABLE vault_documents
  ADD CONSTRAINT vault_documents_doc_type_check
  CHECK (doc_type = ANY (ARRAY[
    'bid_protest',
    'capability_statement',
    'certificate',
    'color_review',
    'contract',
    'correspondence',
    'financial',
    'market_research',
    'past_performance',
    'personnel',
    'policy_regulatory',
    'proposal',
    'rfp',
    'subcontract_teaming',
    'technical_artifact',
    'training_material',
    'other'
  ]));

-- 5) Update doc_category semantics
UPDATE vault_documents
  SET doc_category = 'regulatory'
  WHERE doc_type = 'policy_regulatory';

UPDATE vault_documents
  SET doc_category = 'work_product'
  WHERE doc_type != 'policy_regulatory';

-- 6) Audit log entry for migrated rows (match by new bucket values that
--    could only exist after auto-migration, excluding pre-existing types)
INSERT INTO vault_audit_trail (document_id, action, actor, detail, created_at)
SELECT
  id,
  'auto_migrated',
  'system:v3_072',
  'Reclassified during vault-buckets-v2 migration',
  NOW()
FROM vault_documents
WHERE doc_type IN (
  'financial', 'subcontract_teaming', 'policy_regulatory',
  'capability_statement', 'correspondence', 'personnel',
  'technical_artifact', 'training_material'
);

COMMIT;
