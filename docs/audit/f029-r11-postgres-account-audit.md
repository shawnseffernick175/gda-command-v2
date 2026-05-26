# F-029 R-11: "Postgres account" Credential Audit

**Date:** 2026-05-26
**Credential:** Postgres account (`yK1VVsSN3tn0baVm`, type: `postgres`)
**Owner:** Shawn Seffernick (shawn.seffernick175@gmail.com)
**Created:** 2026-02-24T18:31:59Z
**Updated:** 2026-04-30T21:44:23Z

## Workflow References

**Zero.** No workflow in the n8n instance references credential `yK1VVsSN3tn0baVm`.

## Analysis

This credential is a Postgres connection stored in n8n's credential store. It is distinct from:

- **GDA Postgres** (`HwronxMmGY5XDGEt`) — the primary credential used by all GDA workflows to connect to the `gda` database. This one IS actively used.
- **n8n internal DB connection** — configured via `DB_POSTGRESDB_*` env vars in `/root/n8n-envision/.env`, pointing to `n8n-envision-postgres-1`. This is NOT a stored credential — it's n8n's own database config.

The "Postgres account" credential was likely created during initial setup (Feb 2026) to connect to `n8n-envision-postgres-1` for manual querying or testing. It was updated on 2026-04-30 (possibly during the F-026 database consolidation), but no workflow ever adopted it.

## Recommendation

**Delete in Wave 2.** Zero references, not the primary GDA Postgres credential, and not the n8n internal DB config. Safe to remove after confirming with Shawn that he doesn't use it for manual n8n Execute Command nodes or one-off queries.
