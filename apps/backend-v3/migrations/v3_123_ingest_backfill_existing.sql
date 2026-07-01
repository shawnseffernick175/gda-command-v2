-- F-304: Backfill existing Capture/Action Item uploads into ingest_jobs table
-- with status=routed and original target_entity_id preserved.

INSERT INTO ingest_jobs (id, filename, file_path, file_size_bytes, source, source_surface, status, target_surface, entity_type, target_entity_id, vault_document_id, owner, created_at, updated_at, completed_at)
SELECT
  gen_random_uuid(),
  vd.filename,
  vd.file_path,
  COALESCE(vd.file_size_bytes::bigint, 0),
  'backfill'::ingest_source,
  CASE
    WHEN vd.linked_capture_id IS NOT NULL THEN 'capture'
    WHEN vd.linked_opportunity_id IS NOT NULL THEN 'opportunities'
    ELSE 'vault'
  END,
  'routed'::ingest_job_status,
  CASE
    WHEN vd.linked_capture_id IS NOT NULL THEN 'capture'::ingest_target_surface
    WHEN vd.linked_opportunity_id IS NOT NULL THEN 'opportunities'::ingest_target_surface
    WHEN vd.doc_type = 'financial' THEN 'financials'::ingest_target_surface
    WHEN vd.doc_type = 'policy_regulatory' THEN 'regulatory'::ingest_target_surface
    WHEN vd.doc_type = 'contract' THEN 'vehicles'::ingest_target_surface
    WHEN vd.doc_type = 'subcontract_teaming' THEN 'vault'::ingest_target_surface
    ELSE 'vault'::ingest_target_surface
  END,
  CASE
    WHEN vd.linked_capture_id IS NOT NULL THEN 'capture_doc'::ingest_entity_type
    WHEN vd.linked_opportunity_id IS NOT NULL THEN 'opportunity'::ingest_entity_type
    WHEN vd.doc_type = 'financial' THEN 'financial_doc'::ingest_entity_type
    WHEN vd.doc_type = 'policy_regulatory' THEN 'regulatory_notice'::ingest_entity_type
    WHEN vd.doc_type = 'contract' THEN 'vehicle_doc'::ingest_entity_type
    WHEN vd.doc_type = 'past_performance' THEN 'cpar'::ingest_entity_type
    ELSE 'other'::ingest_entity_type
  END,
  COALESCE(vd.linked_capture_id::text, vd.linked_opportunity_id::text, vd.id::text),
  vd.id,
  vd.uploaded_by,
  vd.uploaded_at,
  vd.uploaded_at,
  vd.uploaded_at
FROM vault_documents vd
WHERE vd.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM ingest_jobs ij WHERE ij.vault_document_id = vd.id
  );
