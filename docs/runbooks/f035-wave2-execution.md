# F-035 Wave 2 — Execution Record

## Scope

Five deliverables in one PR addressing remaining hardcoded secrets from Wave 1 audit
plus a critical pre-existing auth bypass.

| # | Deliverable | Workflow | Status |
|---|-------------|----------|--------|
| D1 | Fix `debug_auth` auth bypass | GDA.controlled-fix-agent (`akvlbmdUBCgx58PC`) | DONE |
| D2 | Migrate `FIX_AGENT_KEY` → `GDA_FIX_AGENT_KEY` | GDA.controlled-fix-agent (`akvlbmdUBCgx58PC`) | DONE |
| D3 | Migrate `QA_AGENT_KEY` → `GDA_QA_AGENT_KEY` | GDA.qa.agent-runner (`TxcPdvx2Ld9rE9er`) | DONE |
| D4 | Migrate `WEBHOOK_HEADER_VALUE` → `GDA_WEBHOOK_HEADER_VALUE` | GDA.qa.computer-operator (`H6YKZDmLusvQqfIn`) + GDA.api.capture-plan (`QgperN6cuOpfnb09`) | DONE |
| D5 | Refactor GitHub PAT → credential reference | GDA GitHub Bridge — Production (`MqRUg1UglZqjAym1`) | DONE |

## Pre-State

| Item | Before |
|------|--------|
| Workflows with hardcoded FIX_AGENT_KEY | 1 (controlled-fix-agent) |
| Workflows with hardcoded QA_AGENT_KEY | 1 (qa.agent-runner) |
| Workflows with hardcoded WEBHOOK_HEADER_VALUE (old) | 2 (qa.computer-operator, api.capture-plan) |
| Workflows with hardcoded GitHub PAT | 1 (GitHub Bridge) |
| debug_auth bypass | YES — runs before auth check, leaks key metadata |
| Sentinel overall_status | degraded |
| Canary (system-watchdog) | success (id: 119017) |
| Canary (change-detector) | success (id: 119023) |

## Environment

- VPS: `root@100.100.80.78` (Tailscale)
- n8n container: `n8n-envision-n8n-1`
- .env: `/root/n8n-envision/.env`
- docker-compose: `/root/n8n-envision/docker-compose.yml`

## Env Var Setup

Added 3 new environment variables:

| Variable | Length | Added to .env | Added to compose |
|----------|--------|---------------|-----------------|
| `GDA_FIX_AGENT_KEY` | 26 chars | ✓ | ✓ |
| `GDA_QA_AGENT_KEY` | 49 chars | ✓ | ✓ |
| `GDA_WEBHOOK_HEADER_VALUE` | 21 chars | ✓ | ✓ |

Container recreated via `docker compose up -d n8n`. All 3 vars verified accessible
inside container.

## D1: debug_auth Auth Bypass Fix

**Before:** The `debug_auth` action branch (lines 63–80) ran BEFORE the auth check
(line 82). An unauthenticated caller could POST `{"action":"debug_auth"}` and receive:
```json
{
  "debug": {
    "providedFixKeyLength": 0,
    "expectedFixKeyLength": 26,
    "keysMatch": false
  }
}
```
This leaked key length and acted as a match oracle.

**After:** Auth check moved to run FIRST. `debug_auth` is only reachable after
successful auth and returns only:
```json
{"ok": true, "action": "debug_auth"}
```

**Verification:**

| Test | Expected | Actual |
|------|----------|--------|
| Unauthenticated `action=debug_auth` | 403, no key fields | 403, no key fields |
| Authenticated `action=debug_auth` | `{ok:true, action:"debug_auth"}` | `{ok:true, action:"debug_auth"}` |
| Unauthenticated `action=list_workflows` | 403 | 403 |

## D2: FIX_AGENT_KEY Migration

**Before:**
```js
const FIX_AGENT_KEY = '<REDACTED>';
```

**After:**
```js
const FIX_AGENT_KEY = env('GDA_FIX_AGENT_KEY');
if (!FIX_AGENT_KEY) throw new Error('GDA_FIX_AGENT_KEY env var not set');
```

Grep for literal in workflow JSON: **0 matches**.

## D3: QA_AGENT_KEY Migration

**Before (qa.agent-runner):**
```js
const QA_AGENT_KEY = 'qa-agent-test-2026-...';
```

**After:**
```js
const QA_AGENT_KEY = env('GDA_QA_AGENT_KEY');
if (!QA_AGENT_KEY) throw new Error('GDA_QA_AGENT_KEY env var not set');
```

Full audit of 158 workflows: literal found in **1 workflow only** (qa.agent-runner).
Grep for literal in workflow JSON: **0 matches**.

## D4: WEBHOOK_HEADER_VALUE Migration

Found in **2 workflows** (not just 1):

1. **GDA.qa.computer-operator** — `const WEBHOOK_HEADER_VALUE = '...'`
   → Replaced with `env('GDA_WEBHOOK_HEADER_VALUE')` + throw guard

2. **GDA.api.capture-plan** — Auth Check node used literal in multi-value comparison
   → Added `env()` helper, replaced literal with `webhookHeaderValue` variable + throw guard

Grep for literal in both workflow JSONs: **0 matches**.

**Note:** A newer webhook value (`gda-api-2027-...`) exists in 10 additional workflows.
These are out of scope for Wave 2 and flagged for Wave 3.

## D5: GitHub PAT Credential Refactor

**Before (GitHub Bridge — Production):**
```js
const PAT = 'ghp_...';
const HEADERS = { 'Authorization': `token ${PAT}`, ... };
// Uses this.helpers.httpRequest(opts)
```

**After:**
- Removed hardcoded PAT from code
- Added `httpHeaderAuth` credential reference to Code node (credential: "GDA GitHub Bridge PAT", ID: `TBzQR4MBiWOGoJmV`)
- Replaced `this.helpers.httpRequest()` with `this.helpers.httpRequestWithAuthentication('httpHeaderAuth', opts)`
- Authorization header now injected automatically by the credential

Grep for `ghp_<REDACTED>` in workflow JSON: **0 matches**.

## Post-State

| Item | After |
|------|-------|
| Workflows with hardcoded FIX_AGENT_KEY | 0 |
| Workflows with hardcoded QA_AGENT_KEY | 0 |
| Workflows with hardcoded WEBHOOK_HEADER_VALUE (old) | 0 |
| Workflows with hardcoded GitHub PAT | 0 |
| debug_auth bypass | FIXED — auth-first, minimal response |
| Sentinel overall_status | degraded (unchanged) |
| Canary (system-watchdog) | success (latest post-change) |
| Canary (change-detector) | success (latest post-change) |
| n8n env var count | +3 (GDA_FIX_AGENT_KEY, GDA_QA_AGENT_KEY, GDA_WEBHOOK_HEADER_VALUE) |

## Audit: Remaining Hardcoded Secrets

After Wave 2, the following patterns were scanned across all 158 workflows:

| Pattern | Matches | Status |
|---------|---------|--------|
| `<REDACTED_FIX_AGENT_KEY>` | 0 | Migrated |
| `<REDACTED_QA_AGENT_KEY>` | 0 | Migrated |
| `<REDACTED_WEBHOOK_HEADER_VALUE>` | 0 | Migrated |
| `ghp_<REDACTED>` | 0 | Migrated |
| `<REDACTED_WEBHOOK_HEADER_VALUE_V2>` (newer webhook value) | 10 workflows | **Wave 3** |
| `eyJhbGci` (n8n JWT) | 0 in scoped workflows | Migrated in Wave 1 |
