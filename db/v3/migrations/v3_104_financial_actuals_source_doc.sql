-- v3_104: Track source vault document on income-statement actuals.
--
-- financial_actuals (income_statement / l1_actual series) previously had NO
-- link back to the vault document it was ingested from. As a result the
-- Financials "source documents" footer and the ingestion-status counter could
-- not credit income-statement docs (e.g. Trend Income Stmt, L1-Actual Revenue
-- Summary, Income Statement FS Detail) even though their numbers were live.
--
-- Adding source_doc_id closes that traceability gap. Nullable: existing rows
-- and seed rows have no known source. ON DELETE SET NULL so deleting a vault
-- doc never destroys financial history -- it just drops the attribution.

ALTER TABLE financial_actuals
  ADD COLUMN IF NOT EXISTS source_doc_id BIGINT
  REFERENCES vault_documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_financial_actuals_source_doc_id
  ON financial_actuals (source_doc_id)
  WHERE source_doc_id IS NOT NULL;
