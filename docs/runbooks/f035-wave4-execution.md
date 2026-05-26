# F-035 Wave 4 Execution Record

> Executed: 2026-05-26 21:25 UTC
> Operator: Devin (automated)
> Status: **COMPLETE — ZERO hardcoded secrets remaining in workflow layer**

## Pre-State

| Metric | Value |
|---|---|
| Total workflows | 158 |
| Env vars in .env | 36 |
| Canary watchdog | success (id:119472) |
| Canary change-detector | success (id:119473) |
| Sentinel | degraded (baseline) |

### Audit Findings (Pre-Migration)

| Secret Pattern | Matches | Workflows |
|---|---|---|
| `$env.SAM_API_KEY` (broken, missing GDA_ prefix) | 4 | 2 |
| `gda-api-2026-secure` | 290 | 83 |
| `gda-deploy-2026-secure` | 102 | 51 |
| `gda-webhook-secret-2026` | 110 | 52 |
| `gda-deploy-2027-AWqjhbxDYNcyV1mr` | 2 | 1 |
| `gda-deploy-2027-a4zslQ79hn9A9UIi` | 2 | 1 |
| `tvly-*` (Tavily API key) | 10 | 3 |
| **Total** | **520** | **90 unique** |

## Deliverables

### D1: SAM_API_KEY Hotfix

**Problem:** 2 workflows referenced `$env.SAM_API_KEY` (without `GDA_` prefix). This env var does not exist — `GDA_SAM_API_KEY` (set in Wave 3) is the correct name.

| Workflow | ID | Refs Fixed |
|---|---|---|
| GDA.cron.on-ramp-scanner | b3PJhbe4cSADjzcz | 2 |
| GDA.sched.dept-opp-sweep | JRnWGEH9cesb8f3w | 2 |

**Fix:** `$env.SAM_API_KEY` → `$env.GDA_SAM_API_KEY` (regex-safe, does not touch existing GDA_SAM_API_KEY refs)

### D2: Tavily API Key Migration

**New env var:** `GDA_TAVILY_API_KEY` (58 chars)

| Workflow | ID | Refs Fixed |
|---|---|---|
| GDA.api.capture-intel | JiIiq2uxRaKUob0d | 2 |
| GDA.api.competitor-watchlist | yhJHrha9QYwUIoPc | 2 |
| GDA.api.sitrep 2 | G9US1e01oY1cgJIF | 6 |

**Pattern:** Replaced `'tvly-*'` literal in jsonBody expressions with `$env.GDA_TAVILY_API_KEY`. Added throw guard in Code nodes.

### D3: Deploy-2027 Keys Migration

**New env vars:**
- `GDA_DEPLOY_KEY_V2` (32 chars) — used in GDA.dev.deploy
- `GDA_DEPLOY_KEY_V2_CP` (32 chars) — used in GDA.api.capture-plan

| Workflow | ID | Refs Fixed |
|---|---|---|
| GDA.dev.deploy | 8GnGxnBL9TJjj1i2 | 2 |
| GDA.api.capture-plan | QgperN6cuOpfnb09 | 2 |

**Note:** Two distinct deploy-2027 values with different suffixes — kept separate per D4 option (a) rationale.

### D4: 2026 Auth Keys Migration

**Decision:** Option (a) — THREE separate env vars. These are used together in `validKeys` arrays for webhook authentication but represent distinct auth credentials for different consumers.

**New env vars:**
- `GDA_API_KEY_2026` (19 chars)
- `GDA_DEPLOY_KEY_2026` (22 chars)
- `GDA_WEBHOOK_SECRET_2026` (23 chars)

**Scope:** 502 total occurrences across 83+ workflows.

**Patterns replaced:**

1. **jsCode `validKeys` arrays:**
   ```javascript
   // Before:
   const validKeys = ["gda-deploy-2026-secure", "gda-api-2026-secure", "gda-webhook-secret-2026"];
   // After:
   const validKeys = [$env.GDA_DEPLOY_KEY_2026, $env.GDA_API_KEY_2026, $env.GDA_WEBHOOK_SECRET_2026];
   ```

2. **IF node conditions (rightValue):**
   ```json
   // Before: "rightValue": "gda-api-2026-secure"
   // After:  "rightValue": "={{ $env.GDA_API_KEY_2026 }}"
   ```

3. **jsCode outgoing call bodies:**
   ```javascript
   // Before: auth_key: 'gda-api-2026-secure'
   // After:  auth_key: $env.GDA_API_KEY_2026
   ```

4. **Throw guard added to all Code nodes using 2026 env vars:**
   ```javascript
   if (!$env.GDA_API_KEY_2026 || !$env.GDA_DEPLOY_KEY_2026 || !$env.GDA_WEBHOOK_SECRET_2026)
     throw new Error('2026 auth env vars not set');
   ```

### D5: Full Final Audit

Post-migration scan of all 158 workflows using 17 regex patterns:

| Pattern | Matches |
|---|---|
| `sk-*` API keys | 0 |
| `pk-*` API keys | 0 |
| `tvly-*` Tavily | 0 |
| `ghp_*` GitHub PAT | 0 |
| `gho_*` GitHub OAuth | 0 |
| `ghs_*` GitHub Server | 0 |
| `AKIA*` AWS keys | 0 |
| `AIza*` Google keys | 0 |
| SAM API key literal | 0 |
| `gda-api-2027-*` webhook | 0 |
| `gda-deploy-2027-*` deploy | 0 |
| `gda-api-2026-secure` | 0 |
| `gda-deploy-2026-secure` | 0 |
| `gda-webhook-secret-2026` | 0 |
| `gda-api-2026-f584dae2` | 0 |
| `gda-fix-agent-2026-private` | 0 |
| `qa-agent-test-2026-*` | 0 |
| **Total** | **0** |

### D6: Inventory Update

Added 6 new entries to `docs/audit/secret-expiry-inventory.md`:
- GDA_API_KEY_2026, GDA_DEPLOY_KEY_2026, GDA_WEBHOOK_SECRET_2026
- GDA_DEPLOY_KEY_V2, GDA_DEPLOY_KEY_V2_CP
- GDA_TAVILY_API_KEY

All marked as "Never (app-defined)" expiry, auto-monitored via inventory.

## Post-State

| Metric | Value |
|---|---|
| Total workflows | 158 |
| Workflows modified | 90 |
| Env vars in .env | 42 (+6) |
| Hardcoded secrets remaining | **0** |
| Canary watchdog | success |
| Canary change-detector | success |
| Sentinel | degraded (unchanged from baseline) |
| All workflows active | Yes (90/90 confirmed) |

## Migration Script

Used Python script (`wave4-migrate-v2.py`) with:
- Parsed workflow JSON structure (not raw string replacement)
- Context-aware replacement: jsCode vs IF conditions vs HTTP params
- Throw guards injected into Code nodes
- PUT payload restricted to writable fields only
- 0.1s rate limiting between API calls
- Dry-run mode for validation before live execution

## Env Var Verification

```
GDA_API_KEY_2026=19 chars
GDA_DEPLOY_KEY_2026=22 chars
GDA_WEBHOOK_SECRET_2026=23 chars
GDA_TAVILY_API_KEY=58 chars
GDA_DEPLOY_KEY_V2=32 chars
GDA_DEPLOY_KEY_V2_CP=32 chars
GDA_SAM_API_KEY=40 chars (already set in Wave 3)
```

## Sanitized Audit Files

10 representative workflow JSONs exported post-migration:
- `docs/audit/f035-wave4/workflow-*-after-sanitized.json`
- All secrets redacted to `<REDACTED_*>` placeholders
- Covers D1 (2), D2 (3), D3 (2), D4 (3)
