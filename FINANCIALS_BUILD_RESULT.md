# Vault financial-statement extraction + Financials tab integration - Build Result

Branch: feat/vault-financials-extract (off main, committed, NOT pushed)

## Files changed

### apps/backend-v3/package.json
- Added dependency adm-zip ^0.5.16.
- Added devDependency @types/adm-zip ^0.5.7.
- exceljs ^4.4.0 already present (verified).

### package-lock.json
- Updated by npm install at repo root (adm-zip + @types/adm-zip resolved).

### apps/backend-v3/src/routes/vault.ts
- extractTextFromBuffer: added xlsx branch (exceljs - load workbook from buffer,
  serialize each sheet as "## Sheet: <name>" with pipe-joined non-empty rows,
  cap total ~200k chars) and zip branch (adm-zip - recurse into pdf/xlsx/csv/txt/docx
  entries, concatenate as "## File: <entryName>", skip __MACOSX and directories).
- POST /v3/vault/upload: best-effort financial extraction hook. When the filename
  matches /financ|p&l|income|balance|budget|forecast/i OR docTypeConfirmed === 'invoice',
  routes task financial_statement_extract; on is_financial with rows, calls
  ingestFinancialRows and writes a vault_audit_trail 'financials_ingested' entry with
  plan/actual counts. Wrapped in try/catch so financial ingest never fails the upload.
- Added import of ingestFinancialRows from ../services/financials/ingest.js.

### apps/backend-v3/src/lib/llm-router.types.ts
- Added 'financial_statement_extract' to the Task union.
- Added FinancialStatementExtractInput and FinancialStatementExtractOutput interfaces.
- Registered the task in TaskInputMap and TaskOutputMap.

### apps/backend-v3/src/lib/llm-router.table.ts
- Added routing entry: provider anthropic, model claude-sonnet-4-5, timeout_ms 30_000,
  fallback { provider anthropic, model claude-haiku-4-5, min_remaining_budget_ms 500 }.

### apps/backend-v3/src/lib/providers/anthropic.ts
- Added FinancialStatementExtractInput to the type import.
- Added financial_statement_extract system prompt (mapping rules, dollar/percent
  normalization, plan vs actual, is_financial=false guard, never fabricate, JSON only).
- Added buildFinancialStatementExtractPrompt (emits filename + extracted_text + schema).
- Wired the builder into the task->prompt selector ternary.

### apps/backend-v3/src/lib/llm-router.mocks.ts
- Imported FinancialStatementExtractOutput.
- Added financial_statement_extract default mock (is_financial true, one plan + one
  actual row for FY26 Q1, model_used 'mock-model').

### apps/backend-v3/src/services/financials/ingest.ts (NEW)
- ingestFinancialRows(rows): UPSERTs each row with quarter != null into financial_plan
  (plan_* columns) or financial_actuals (actual_* columns), keyed on (fiscal_year, quarter).
  Only non-null values are written; ON CONFLICT DO UPDATE uses
  COALESCE(EXCLUDED.col, table.col) so partial uploads do not zero existing columns,
  and always sets period = EXCLUDED.period. Clears is_seed=true rows before upserting
  (replaces seed/demo data on first real ingest; no-op thereafter). Returns {plan, actual} counts.

### docker-compose.prod.yml
- backend-v3 service: added volume mount - vaultdata:/app/data.
- Top-level volumes: added vaultdata:.

## New migration
apps/backend-v3/migrations/v3_068_financials_seed_flag.sql
- ALTER TABLE adds is_seed BOOLEAN NOT NULL DEFAULT false to financial_plan and
  financial_actuals (IF NOT EXISTS, idempotent).
- Marks existing FY26 seed rows is_seed=true in both tables.

## Verification
- Backend typecheck: PASS (tsc --noEmit exit 0).
- Forbidden-token scan on full diff: CLEAN (no em/en dashes, smart quotes, or emoji).
- ESM/NodeNext: all new relative imports end in .js.
