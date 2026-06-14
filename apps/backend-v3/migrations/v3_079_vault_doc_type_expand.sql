-- Expand vault_documents doc_type CHECK constraint to match the 17-value
-- canonical bucket list used by the frontend and backend VALID_DOC_TYPES.
BEGIN;

ALTER TABLE vault_documents DROP CONSTRAINT IF EXISTS vault_documents_doc_type_check;

ALTER TABLE vault_documents ADD CONSTRAINT vault_documents_doc_type_check
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
  ]::text[]));

-- Remap legacy values that no longer exist in the new constraint
UPDATE vault_documents SET doc_type = 'subcontract_teaming' WHERE doc_type = 'teaming_agreement';
UPDATE vault_documents SET doc_type = 'financial' WHERE doc_type = 'invoice';
UPDATE vault_documents SET doc_type = 'other' WHERE doc_type IN (
  'far','dfars','dfars_pgi','ndaa','executive_order','gao_decision',
  'dod_policy','cmmc','cui_policy','itar_ear','usd_policy','other_regulatory'
);

COMMIT;
