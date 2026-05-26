# F-029 R-10: GitHub Gist PAT Audit

**Date:** 2026-05-26
**Credential:** GitHub Gist PAT (`sKJFLNzetK86JnvO`, type: `httpHeaderAuth`)
**Token prefix:** `ghp_TNqz...` (classic PAT)

## Workflow References (4 active)

| Workflow | ID | Active | Node | Node Type |
|----------|----|--------|------|-----------|
| GDA.auto.gist-update | djgOV2vX3PIv9cvm | Yes | PATCH Gist | httpRequest |
| GDA.util.gist-update | PoOofuf0OgaYJCBN | Yes | Patch Gist | httpRequest |
| GDA.ops.gist-session-update | 4bhVvKvVgLXcX6AZ | Yes | Update GitHub Gist | httpRequest |
| GDA.util.gist-update | t2209zk3c9x0OS9S | Yes | PATCH Gist | httpRequest |

All 4 workflows use the PAT as an HTTP header auth to PATCH GitHub Gist content. Two workflows share the name `GDA.util.gist-update` (different IDs) — one may be a duplicate.

## Token Scope & Expiration

- **Type:** Classic personal access token (ghp_ prefix)
- **Scopes:** Cannot be queried programmatically for classic tokens. The `gist` scope is the minimum required for PATCH operations on Gists.
- **Expiration:** Classic tokens do not expose expiration via API. Must be checked manually at [GitHub Settings → Tokens](https://github.com/settings/tokens).
- **Associated user:** Owner of the token (likely @shawnseffernick175).

## Recommendations

1. **Check expiration** at https://github.com/settings/tokens — if set to "No expiration", consider rotating to a fine-grained PAT with `gist:write` scope and 90-day expiry.
2. **Consolidate duplicate workflows** — two `GDA.util.gist-update` workflows exist. Verify if one is stale.
3. **Migrate to fine-grained PAT** (Wave 2/3) — fine-grained tokens support `gist` permission with repository-scoped access, improving auditability.
4. **Do NOT delete** this credential — 4 active workflows depend on it.
