# Ingest Source Status

Last updated: 2026-05-31

| Source | Status | Cron | Notes |
|--------|--------|------|-------|
| sam.gov | **ACTIVE** | `0 */4 * * *` (every 4 h) | Primary opportunity feed |
| fpds.gov | **ACTIVE** | `0 7 * * *` (daily 03:00 ET) | Federal awards ingest |
| dibbs | **DISABLED** | — | DoD network blocks Hostinger VPS; gated by `ENABLE_DIBBS_INGEST` env flag. See [#513](https://github.com/shawnseffernick175/gda-command-v2/issues/513) |
| neco | **DISABLED** | — | DoD network blocks Hostinger VPS; gated by `ENABLE_NECO_INGEST` env flag. See [#513](https://github.com/shawnseffernick175/gda-command-v2/issues/513) |

## Re-enabling DIBBS / NECO

Set the env flag to `true` and restart the backend:

```bash
ENABLE_DIBBS_INGEST=true
ENABLE_NECO_INGEST=true
```

The ingest code under `apps/backend-v3/src/ingest/dibbs/` and `.../neco/` is correct.
The `.mil` sites firewall non-residential / cloud IP space. An egress proxy on a
US-residential or business IP, or a third-party data API, is required before these
sources will succeed from production.

Manual triggers (`POST /v3/admin/ingest/run/dibbs` and `/neco`) remain registered
and will attempt the request (and fail with a timeout until transport is resolved).
