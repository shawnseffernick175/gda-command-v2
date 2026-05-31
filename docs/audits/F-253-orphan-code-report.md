# F-253: Orphan Code Audit Report

**Audited:** 2026-05-31
**Scope:** `scripts/`, `tests/` (root), `qa-agent-starter/`, `db/` (non-v3)
**Rule:** If a file is actively referenced by `docker-compose.prod.yml`, `.github/workflows/`, root `package.json` scripts, or `apps/backend-v3` code → **KEEP**. Otherwise evaluate for ARCHIVE or DELETE.

---

## scripts/

| File | Verdict | Evidence |
|---|---|---|
| `scripts/README.md` | **KEEP** | Documents `check-visual-tokens.mjs` guardrail; last modified 2026-05-28. |
| `scripts/__tests__/deploy-prod-syntax.test.sh` | **KEEP** | Syntax/lint test for `deploy-prod.sh` + `deploy-prod.yml`; last modified 2026-05-26. Not invoked by CI, but validates the actively-used deploy script. Conservative: keep alongside `deploy-prod.sh`. |
| `scripts/backup.sh` | **ARCHIVE** | Last modified 2026-05-25. References V2 container name `gda-v2-postgres` (line 17 default). Not invoked by any workflow or `docker-compose.prod.yml`. V3 prod uses `gda-postgres` / `gda-postgres-staging`. Backup ops tooling may have historical value. |
| `scripts/backup-status.sh` | **ARCHIVE** | Last modified 2026-05-24. Companion to `backup.sh`. Referenced only in `README.md` (line 200, via `npm run db:backup-status` — a `packages/backend` script, now deleted per F-240b). No workflow or docker-compose reference. |
| `scripts/bootstrap-gda-runtime.sh` | **KEEP** | Last modified 2026-05-27. Creates `gda_runtime` / `gda_staging_rt` DB role used by V3 backend (`docker-compose.prod.yml` uses `gda_staging` user via runtime role grants). References `create-gda-runtime.sql` (same directory). VPS ops script — not CI but essential for prod DB provisioning. |
| `scripts/check-visual-tokens.mjs` | **KEEP** | Invoked by `.github/workflows/visual-guardrail.yml` line 28: `node scripts/check-visual-tokens.mjs`. Last modified 2026-05-28. Active CI guardrail. |
| `scripts/ci/forbidden-token-scan.sh` | **KEEP** | Invoked by `.github/workflows/v3-forbidden-tokens.yml` lines 45, 124. Last modified 2026-05-29. Active CI guardrail. |
| `scripts/create-gda-runtime.sql` | **KEEP** | Referenced by `bootstrap-gda-runtime.sh` (line 63). Creates least-privilege runtime role for V3 backend. Last modified 2026-05-30. Active prod DB provisioning. |
| `scripts/deploy-prod.sh` | **KEEP** | Invoked by `.github/workflows/deploy-prod.yml` line 67: `scp … scripts/deploy-prod.sh`. Last modified 2026-05-31. Active production deployment script. |
| `scripts/f026/step3-data-migration.sh` | **ARCHIVE** | Last modified 2026-05-22. F-026 one-time migration: n8n DB → `gda_command`. References `n8n-envision-postgres-1` (source) and `gda-postgres` (target). Migration is complete. No workflow reference. Historical value for audit trail. |
| `scripts/f026/step3b-data-migration.sh` | **ARCHIVE** | Last modified 2026-05-23. F-026 one-time migration: 30 n8n-only tables. Companion to step3. Migration is complete. No workflow reference. Historical value for audit trail. |
| `scripts/f026/step4-credential-cutover.sh` | **ARCHIVE** | Last modified 2026-05-26. F-026 one-time credential cutover: repoints n8n credential to `gda-postgres`. Cutover is complete. No workflow reference. Historical value (rollback instructions embedded). |
| `scripts/f026/step4b/migrate-orphans.sh` | **ARCHIVE** | Last modified 2026-05-23. F-026 one-time migration: 6 orphan tables. Migration is complete. No workflow reference. Historical value for audit trail. |
| `scripts/f040/rotate-phase1.sh` | **ARCHIVE** | Last modified 2026-05-25. F-040 one-time secret rotation of 5 in-cluster secrets. Rotation is complete. No workflow reference. Historical value (rollback procedures embedded). |
| `scripts/lint-jsx-entities.sh` | **KEEP** | Invoked by `.github/workflows/frontend-v3-ci.yml` line 144: `bash scripts/lint-jsx-entities.sh`. Last modified 2026-05-31. Active CI lint step. |
| `scripts/pinecone-backfill.py` | **DELETE** | Last modified 2026-05-28. Pinecone → pgvector historical backfill. References `PINECONE_API_KEY`, `PINECONE_HOST` — Pinecone is unused in V3 (replaced by pgvector). References V2 backend URL `http://172.22.0.3:3001` (line 26). The n8n triage doc (`docs/n8n-triage/my-triage.md` line 112) explicitly marks `GDA.ops.pinecone-backfill` as "dead V2." No workflow, no docker-compose, no backend-v3 reference. |
| `scripts/restore.sh` | **ARCHIVE** | Last modified 2026-05-24. Companion to `backup.sh`. References V2 container name `gda-v2-postgres` (line 15 default). No workflow or docker-compose reference. May be useful as a template for V3 restore procedures. |
| `scripts/rotate-gda-runtime-credential.sh` | **KEEP** | Last modified 2026-05-27. Rotates `gda_runtime` password + updates `DATABASE_URL` in `.env` + restarts backend. References `docker-compose.prod.yml` and `gda-backend` / `gda-postgres` containers. Companion to `bootstrap-gda-runtime.sh`. VPS ops script for ongoing credential rotation. |
| `scripts/setup-cron.sh` | **ARCHIVE** | Last modified 2026-05-24. Installs V2-era backup cron job. References `gda-v2-postgres` (line 10) and `gda-v2-backend` (line 13) — both V2 container names (dead). Referenced only in `README.md` line 188. No workflow or docker-compose reference. |
| `scripts/v3-schema-diff.ts` | **KEEP** | Invoked by `.github/workflows/v3-schema-drift.yml` lines 50, 191: `npx tsx scripts/v3-schema-diff.ts`. Last modified 2026-05-30. Active CI schema drift detector. |

### scripts/ Summary

| Verdict | Count | Files |
|---|---|---|
| **KEEP** | 10 | `README.md`, `__tests__/deploy-prod-syntax.test.sh`, `bootstrap-gda-runtime.sh`, `check-visual-tokens.mjs`, `ci/forbidden-token-scan.sh`, `create-gda-runtime.sql`, `deploy-prod.sh`, `lint-jsx-entities.sh`, `rotate-gda-runtime-credential.sh`, `v3-schema-diff.ts` |
| **ARCHIVE** | 8 | `backup.sh`, `backup-status.sh`, `f026/step3-data-migration.sh`, `f026/step3b-data-migration.sh`, `f026/step4-credential-cutover.sh`, `f026/step4b/migrate-orphans.sh`, `f040/rotate-phase1.sh`, `setup-cron.sh`, `restore.sh` |
| **DELETE** | 1 | `pinecone-backfill.py` |

> Note: ARCHIVE count includes `restore.sh` (9 total ARCHIVE, corrected from 8 above — `restore.sh` is the 9th).

---

## tests/

No root-level files exist in `tests/`. All 6 files reside under `tests/ci/fixtures/forbidden-tokens/`, which are test fixtures for the active `v3-forbidden-tokens` CI workflow.

| File | Verdict | Evidence |
|---|---|---|
| `tests/ci/fixtures/forbidden-tokens/fixture-legit-anti-token-test.test.ts` | **KEEP** | Referenced by `.github/workflows/v3-forbidden-tokens.yml` lines 55–56, 92–93. Last modified 2026-05-29. Active CI fixture. |
| `tests/ci/fixtures/forbidden-tokens/fixture-legit-openapi-violation.yaml` | **KEEP** | Referenced by `.github/workflows/v3-forbidden-tokens.yml` lines 99–100. Last modified 2026-05-29. Active CI fixture. |
| `tests/ci/fixtures/forbidden-tokens/fixture-legit-openapi.yaml` | **KEEP** | Referenced by `.github/workflows/v3-forbidden-tokens.yml` lines 96–97. Last modified 2026-05-29. Active CI fixture. |
| `tests/ci/fixtures/forbidden-tokens/fixture-legit-test.test.ts` | **KEEP** | Referenced by `.github/workflows/v3-forbidden-tokens.yml` lines 53–54, 89–90. Last modified 2026-05-29. Active CI fixture. |
| `tests/ci/fixtures/forbidden-tokens/fixture-violation-migration.sql` | **KEEP** | Referenced by `.github/workflows/v3-forbidden-tokens.yml` lines 85–86. Last modified 2026-05-29. Active CI fixture. |
| `tests/ci/fixtures/forbidden-tokens/fixture-violation-route.ts` | **KEEP** | Referenced by `.github/workflows/v3-forbidden-tokens.yml` lines 82–83. Last modified 2026-05-29. Active CI fixture. |

### tests/ Summary

| Verdict | Count |
|---|---|
| **KEEP** | 6 |
| **ARCHIVE** | 0 |
| **DELETE** | 0 |

---

## qa-agent-starter/

Standalone Playwright-based QA agent. Not an npm workspace (not in root `package.json` workspaces array). Not referenced by any `.github/workflows/` file, `docker-compose.prod.yml`, or `apps/backend-v3` code. All 8 files share a last-modified date of **2026-05-09**, predating the V3 rebuild. Only references found are in unrelated `All Perplexity/` files (old PowerShell import scripts) and stale zip archives at repo root.

| File | Verdict | Evidence |
|---|---|---|
| `qa-agent-starter/README.md` | **ARCHIVE** | Pre-V3 QA harness docs. Last modified 2026-05-09. No live reference from workflows, docker-compose, or backend-v3. |
| `qa-agent-starter/STEP_BY_STEP.md` | **ARCHIVE** | Pre-V3 setup guide. Last modified 2026-05-09. No live reference. |
| `qa-agent-starter/package-lock.json` | **ARCHIVE** | Lockfile for pre-V3 QA harness. Last modified 2026-05-09. No live reference. |
| `qa-agent-starter/package.json` | **ARCHIVE** | Defines scripts for n8n QA checks and Playwright tests targeting old infrastructure. Last modified 2026-05-09. Not an npm workspace. No live reference. |
| `qa-agent-starter/playwright.config.ts` | **ARCHIVE** | Playwright config for pre-V3 QA. Last modified 2026-05-09. No live reference. |
| `qa-agent-starter/setup-mac.sh` | **ARCHIVE** | Mac setup helper for pre-V3 QA. Last modified 2026-05-09. No live reference. |
| `qa-agent-starter/setup-windows.ps1` | **ARCHIVE** | Windows setup helper for pre-V3 QA. Last modified 2026-05-09. No live reference. |
| `qa-agent-starter/tsconfig.json` | **ARCHIVE** | TypeScript config for pre-V3 QA. Last modified 2026-05-09. No live reference. |

### qa-agent-starter/ Summary

| Verdict | Count |
|---|---|
| **KEEP** | 0 |
| **ARCHIVE** | 8 |
| **DELETE** | 0 |

---

## db/ (non-v3)

**No files exist outside `db/v3/`.** All 10 files under `db/` are within the `db/v3/` subdirectory (the active V3 migration framework). Nothing to audit.

| Verdict | Count |
|---|---|
| N/A | 0 files outside `db/v3/` |

---

## Overall Summary

| Directory | KEEP | ARCHIVE | DELETE | Total |
|---|---|---|---|---|
| `scripts/` | 10 | 9 | 1 | 20 |
| `tests/` | 6 | 0 | 0 | 6 |
| `qa-agent-starter/` | 0 | 8 | 0 | 8 |
| `db/` (non-v3) | 0 | 0 | 0 | 0 |
| **Total** | **16** | **17** | **1** | **34** |

### Key Findings

1. **Active CI/CD scripts (10 KEEP in `scripts/`):** `deploy-prod.sh`, `check-visual-tokens.mjs`, `forbidden-token-scan.sh`, `lint-jsx-entities.sh`, and `v3-schema-diff.ts` are all invoked by live GitHub Actions workflows. `bootstrap-gda-runtime.sh`, `create-gda-runtime.sql`, and `rotate-gda-runtime-credential.sh` are VPS ops scripts for prod DB role management. `deploy-prod-syntax.test.sh` validates the deploy script.

2. **F-026/F-040 migration scripts (5 ARCHIVE):** One-time runbook scripts whose migrations are complete. Valuable as historical audit trail and rollback documentation.

3. **V2-era backup/cron scripts (4 ARCHIVE):** `backup.sh`, `backup-status.sh`, `restore.sh`, and `setup-cron.sh` all reference the dead `gda-v2-postgres` / `gda-v2-backend` container names. No live references from CI or docker-compose.

4. **Pinecone backfill (1 DELETE):** `pinecone-backfill.py` references Pinecone (dead in V3), V2 backend URL, and is explicitly flagged as dead in `docs/n8n-triage/my-triage.md`.

5. **`qa-agent-starter/` (8 ARCHIVE):** Entire directory is a pre-V3 QA harness. Not in workspaces, not in CI, all files last modified 2026-05-09. Could be useful reference for future V3 QA tooling.

6. **`tests/` (6 KEEP):** All files are active CI fixtures for the `v3-forbidden-tokens` workflow. No orphan files.

7. **`db/` (non-v3):** Clean — no files outside the active `db/v3/` migration framework.
