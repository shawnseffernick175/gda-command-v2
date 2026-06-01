# Connector Secrets Runbook

**Created:** F-321 (#587)
**Purpose:** Checklist for adding a new external connector (GovTribe, GovWin, etc.) so env vars are wired end-to-end and CI catches drift.

---

## Adding a New Connector — Checklist

### 1. Add env reads in connector code

Place env reads (`process.env['MY_VAR']` or `os.environ['MY_VAR']`) in the
connector code under `apps/backend-v3/src/` or `apps/gda-agent-v3/src/`.

Use the `${VAR:-default}` pattern in code (e.g., `process.env['MY_VAR'] ?? ''`)
so missing vars degrade gracefully rather than hard-crashing.

### 2. Add `${VAR:-}` lines in compose for both backend-v3 and agent-v3

In `docker-compose.prod.yml`, add the new env vars to the `environment:` block
of **both** `backend-v3` and `gda-agent-v3` services:

```yaml
  backend-v3:
    environment:
      # ... existing ...
      MY_CONNECTOR_KEY: ${MY_CONNECTOR_KEY:-}

  gda-agent-v3:
    environment:
      # ... existing ...
      MY_CONNECTOR_KEY: ${MY_CONNECTOR_KEY:-}
```

Use the `${VAR:-}` defaulting pattern (empty default) for secrets, and
`${VAR:-sensible_default}` for non-secret config like base URLs or caps.

### 3. Add to `.env.production.example`

Add commented documentation and blank values so operators know what to fill in:

```bash
# --- External Data Sources: MyConnector ---
# MyConnector API key (required for ingest)
MY_CONNECTOR_KEY=
```

### 4. Update compose hash file

After modifying `docker-compose.prod.yml`, regenerate the hash:

```bash
sha256sum docker-compose.prod.yml | awk '{print $2, $1}' > .github/expected-compose-hashes.txt
```

### 5. Verify CI passes

The `Compose Drift Check` CI job enforces two things:

1. **Hash parity** — the compose file matches the committed hash.
2. **Env-name parity** — every `GOVTRIBE_*` / `GOVWIN_*` / `ENABLE_GOVTRIBE_*`
   env var read in connector code appears in the compose `environment:` blocks.

If CI fails on the env-name parity step, a connector env var is read in code
but not wired through compose — exactly the bug this runbook prevents.

---

## Current Connector Env Vars

### GovTribe (PRs #557, #565)

| Variable | Service(s) | Default | Purpose |
|---|---|---|---|
| `GOVTRIBE_API_KEY` | backend-v3, agent-v3 | (empty) | API auth token |
| `GOVTRIBE_API_BASE` | backend-v3, agent-v3 | `https://api.govtribe.com/v1` | API base URL |
| `GOVTRIBE_CYCLE_CREDIT_CAP` | backend-v3, agent-v3 | `150` | Per-cycle credit cap |
| `GOVTRIBE_MONTHLY_CREDIT_CAP` | backend-v3, agent-v3 | `1200` | Monthly credit budget |
| `ENABLE_GOVTRIBE_INGEST` | backend-v3, agent-v3 | `true` | Feature flag for ingest cron |

### GovWin IQ (PR #561)

| Variable | Service(s) | Default | Purpose |
|---|---|---|---|
| `GOVWIN_USERNAME` | backend-v3, agent-v3 | (empty) | CAS auth username |
| `GOVWIN_PASSWORD` | backend-v3, agent-v3 | (empty) | CAS auth password |
| `GOVWIN_CONNECTOR_V1` | backend-v3, agent-v3 | `false` | Feature flag — must be `true` to enable |

---

## Why This Runbook Exists

PR #557 added GovTribe connector code reading `process.env['GOVTRIBE_API_KEY']`
but the compose was never updated to pass it through. PR #561 (GovWin) did the
same. The compose-drift CI check only verified file hashes, not env-name parity,
so the gap shipped silently. Setting vars in `.env` on the VPS did nothing
because compose only passes explicitly enumerated vars to containers.

F-321 (#587) fixed the gap and added the env-name parity CI check to prevent
recurrence.
