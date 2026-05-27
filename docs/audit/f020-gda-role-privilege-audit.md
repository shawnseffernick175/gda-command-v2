# F-020: `gda` Postgres Role Privilege Audit

**Date:** 2026-05-19 (EST)
**Author:** Devin (automated audit)
**Issue:** [#251](https://github.com/shawnseffernick175/gda-command-v2/issues/251)
**Status:** Migration written, staging tested, pending prod rollout

---

## Executive Summary

The `gda` Postgres role is the bootstrap superuser (created by `POSTGRES_USER` during
`initdb`). PostgreSQL 16 prevents demoting the bootstrap superuser — `ALTER ROLE gda
NOSUPERUSER` returns `ERROR: permission denied to alter role / The bootstrap user must
have the SUPERUSER attribute`.

**Solution:** Create a dedicated **runtime role** (`gda_runtime`) with NOSUPERUSER and
DML-only privileges. Application connection strings (`DATABASE_URL`) are updated to use
the runtime role. The bootstrap `gda` role is retained for admin/migration use only and
is no longer referenced by any application connection string.

---

## Role Architecture (Post-Migration)

| Role | Attributes | Purpose | Used By |
|------|-----------|---------|---------|
| `gda` | SUPERUSER (bootstrap) | Admin, emergency access | `MIGRATION_DATABASE_URL` fallback, manual `psql` |
| `gda_app` | NOSUPERUSER, LOGIN | Migration runner | `MIGRATION_DATABASE_URL` (prod only) |
| `gda_runtime` | NOSUPERUSER, LOGIN | App runtime + n8n | `DATABASE_URL` (prod) |
| `gda_staging` | SUPERUSER (bootstrap) | Admin, staging migrations | Manual `psql`, staging migrations |
| `gda_staging_rt` | NOSUPERUSER, LOGIN | App runtime (staging) | Staging `DATABASE_URL` |

---

## Privilege Audit

### Migration Runner (`gda_app` on prod, `gda`/`gda_staging` elsewhere)

| Operation | Required? | Source |
|-----------|-----------|--------|
| CREATE TABLE | Yes | `migrate.ts` runs `CREATE TABLE IF NOT EXISTS schema_migrations` |
| ALTER TABLE | Yes | Various migration files add columns, constraints |
| CREATE INDEX | Yes | Migration files create indexes |
| CREATE FUNCTION / TRIGGER | Yes | Migration 035 creates `fn_auto_version` |
| CREATE EXTENSION IF NOT EXISTS | Yes (first run) | Migrations 001, 004, 039b, 079 — `uuid-ossp`, `pgcrypto`, `vector` |
| DROP TABLE / ALTER TABLE DROP | Yes | Some migrations drop columns or tables |

**Note:** `CREATE EXTENSION vector` requires SUPERUSER because pgvector is NOT a trusted
extension. Extensions are already installed on prod/staging, so `IF NOT EXISTS` is a no-op.
In CI, migrations run as the SUPERUSER bootstrap user before the demotion migration applies.

### App Runtime (backend server)

| Operation | Required? | Source |
|-----------|-----------|--------|
| SELECT | Yes | All query routes |
| INSERT | Yes | Create operations |
| UPDATE | Yes | Update operations |
| DELETE | Yes | Delete operations |
| Sequence USAGE/SELECT | Yes | SERIAL/BIGSERIAL columns via `nextval()` |
| Function EXECUTE | Yes | `gen_random_uuid()`, `fn_auto_version` (triggers) |
| CREATE TABLE | **No** | Not used by runtime app code |
| ALTER TABLE | **No** | Not used by runtime app code |
| SUPERUSER | **No** | Not needed for any runtime operation |

### n8n Workflows (via GDA Postgres credential `HwronxMmGY5XDGEt`)

| Operation | Required? | Source |
|-----------|-----------|--------|
| SELECT | Yes | Read workflows |
| INSERT | Yes | Write workflows |
| UPDATE | Yes | Update workflows |
| DELETE | Yes | Cleanup workflows |
| CREATE TABLE IF NOT EXISTS | **No** | Shadow tables were migrated in F-026, no longer created by workflows |

---

## Grants Applied by Migration 123

```
gda_runtime receives:
  CONNECT ON DATABASE gda
  USAGE ON SCHEMA public
  SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  EXECUTE ON ALL FUNCTIONS IN SCHEMA public

DEFAULT PRIVILEGES (future objects):
  Tables created by gda     → gda_runtime gets SELECT, INSERT, UPDATE, DELETE
  Tables created by gda_app → gda_runtime gets SELECT, INSERT, UPDATE, DELETE
  Sequences created by either → gda_runtime gets USAGE, SELECT
  Functions created by either → gda_runtime gets EXECUTE
```

---

## Extensions

| Extension | Version | Trusted? | SUPERUSER Required? | Status |
|-----------|---------|----------|--------------------|---------| 
| uuid-ossp | 1.1 | Yes | No (PG16) | Already installed |
| pgcrypto | 1.3 | Yes | No (PG16) | Already installed |
| vector | 0.8.2 | **No** | **Yes** | Already installed |

`CREATE EXTENSION IF NOT EXISTS` is a no-op for installed extensions. Future extensions
must be installed by the bootstrap superuser (`gda`) before the migration runner can
reference them.

---

## Custom Functions

| Function | Owner | Used By |
|----------|-------|---------|
| `fn_auto_version()` | `gda` | Auto-versioning triggers on 8 tables |

---

## Table Ownership

| Owner | Count | Notes |
|-------|-------|-------|
| `gda` | 150 | All application tables |
| `gda_app` | 1 | `schema_migrations` (migration tracking) |

---

## Staging Test Report (2026-05-19)

| Test | Result | Detail |
|------|--------|--------|
| Migration applies cleanly | ✅ | `gda_staging_rt` created, grants applied |
| Runtime role attributes | ✅ | NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS |
| SELECT works | ✅ | `SELECT count(*) FROM opportunities` → 412 |
| UPDATE works | ✅ | No-op UPDATE succeeded |
| DELETE works | ✅ | No-op DELETE succeeded |
| Sequence access | ✅ | `has_sequence_privilege('gda_staging_rt', 'audit_log_id_seq', 'USAGE')` → true |
| DDL blocked | ✅ | `CREATE TABLE` → "permission denied for schema public" |
| Canaries green | ✅ | system-watchdog + change-detector both succeeded |
| Bootstrap user unchanged | ✅ | `\du gda_staging` still shows SUPERUSER |

---

## Rollback

```sql
-- To revert the runtime role (run as bootstrap superuser):
DROP ROLE IF EXISTS gda_runtime;     -- prod
DROP ROLE IF EXISTS gda_staging_rt;  -- staging
-- Then revert DATABASE_URL in .env to use gda/gda_staging.
```

---

## Deployment — Option A (Bootstrap + Auto-Deploy)

Migration 123 is auto-deploy safe (F-041f compatible). Two paths:

- **Bootstrap path** (runs as `gda`/`gda_staging`): Creates the runtime role and
  applies all grants. Used in CI and one-time admin setup.
- **Auto-deploy path** (runs as `gda_app`): Verifies the runtime role already exists
  with correct grants. RAISE EXCEPTION if role is missing.

### Pre-Deploy (one-time, on VPS)

```bash
# 1. Bootstrap the runtime role (creates role + generates password):
ssh root@100.100.80.78 'bash /root/gda-command-v2/scripts/bootstrap-gda-runtime.sh prod'

# 2. Wire up DATABASE_URL + restart backend:
ssh root@100.100.80.78 'bash /root/gda-command-v2/scripts/rotate-gda-runtime-credential.sh prod'
```

### Shawn's Manual Steps (after scripts run)

1. Copy password to n8n credential `HwronxMmGY5XDGEt`: `ssh root@VPS 'cat /tmp/gda-runtime-pw-shawn-readonly'`
2. Copy password to GitHub Actions secret (if needed)
3. Delete handoff file: `ssh root@VPS 'rm /tmp/gda-runtime-pw-shawn-readonly'`
4. Verify: App + canaries green for 30+ minutes

### Auto-Deploy (after bootstrap)

Once the runtime role exists, auto-deploy works normally:
- Migration 123 runs as `gda_app`, verifies role exists + grants correct → succeeds
- No manual intervention needed for future deploys
