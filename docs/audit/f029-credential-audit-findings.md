# F-029: Credential and Configuration Audit — Detailed Findings

**Audit date:** 2026-05-21
**Auditor:** Devin
**Scope:** All credentials in n8n, backend `.env`, n8n `.env`, and Docker
compose environment across the production VPS (`187.77.206.105`).

---

## 1. API Key Drift — Backend vs. n8n

Keys that should be identical between the backend and n8n but are not.
This means the backend and n8n are potentially using different API
accounts, rate limits, or billing.

### 1a. SAM.gov API Key — DIFFERENT

| Location | Env Var | Value (prefix) | Notes |
|---|---|---|---|
| Backend `.env` | `SAM_API_KEY` | `SAM-3d0fbb8e-...` | Used by `packages/backend/src/services/sam.ts` |
| n8n `.env` | `SAM_GOV_API_KEY` | `SAM-c189c47d-...` | Used by n8n workflow SQL/HTTP nodes; different env var name too |

**Impact:** Backend SAM sync and n8n SAM workflows may be hitting different
API keys with different rate limits. If one key is rotated or revoked,
the other side keeps working — creating silent divergence.

**Remediation:** Determine which key is canonical. Align both to a single
key. After F-034 (LiteLLM), all API keys centralize there, but SAM is
not an LLM key — this needs manual alignment.

**Sequencing:** Before F-026 cutover. After consolidation, n8n workflows
write directly to `gda-postgres` via the same data path. Key drift means
different data quality depending on which caller fetches.

**Owner:** Shawn (determine canonical key). Devin (apply).

### 1b. OpenAI API Key — DIFFERENT

| Location | Env Var | Value (prefix) | Notes |
|---|---|---|---|
| Backend `.env` | `OPENAI_API_KEY` | `sk-proj-Gnr33...` → `...sCwA` | Used by backend LLM routes |
| n8n credential | `OpenAi account` (ID=unLYjAN4H9MFrJ0u) | `sk-proj-bt2a...` → `...RgoA` | Used by 6 n8n workflows |
| n8n `.env` | `OPENAI_API_KEY` | `sk-proj-bt2a...` → `...RgoA` | Same as credential |

**Impact:** Backend and n8n use different OpenAI project keys. Spend
tracking, rate limits, and billing are split across two keys. If one
is rotated, the other still works silently.

**Remediation:** After F-034 Deliverable 1 (LiteLLM), both callers route
through LiteLLM with separate virtual keys. Upstream OpenAI key lives
only in LiteLLM. Until then, document which key maps to which OpenAI
project.

**Sequencing:** Before F-034 start. F-034 resolves this structurally.

**Owner:** Shawn (determine which OpenAI project/org each key belongs to).
Devin (apply after F-034).

### 1c. Anthropic API Key — MATCH ✓

| Location | Value (prefix) | Notes |
|---|---|---|
| Backend `.env` | `sk-ant-api03-aDWn...` → `...6wAA` | |
| n8n credential (ID=d92MU0tRK7bEGV83) | `sk-ant-api03-aDWn...` → `...6wAA` | Same key |
| n8n `.env` | `sk-ant-api03-aDWn...` → `...6wAA` | Same key |

**No action required.** Keys are aligned.

---

## 2. Unused n8n Credentials (6)

Six credentials with **zero workflow references**. All appear to be
abandoned from earlier development.

| # | Credential | ID | Type | Target | Recommendation | Priority |
|---|---|---|---|---|---|---|
| 1 | GDA GitHub Bridge PAT | TBzQR4MBiWOGoJmV | httpHeaderAuth | GitHub API (`ghp_grzU...`) | **Delete** — PAT may still be valid on GitHub; revoke PAT first, then delete credential | Before F-034 |
| 2 | GDA GitHub Bridge Webhook Secret | 8fS9ihGIWT6gUpio | httpHeaderAuth | Webhook auth (`gda-bridge-k9x2mq7r4n8v`) | **Delete** — no webhook consumer exists | Before F-034 |
| 3 | gda Google Gemini E2E Test | IbQJuYuO5D9w9Af4 | googlePalmApi | Google Gemini (`AIzaSyBD...`) | **Delete** — test credential, no production use | Before F-034 |
| 4 | Postgres account | yK1VVsSN3tn0baVm | postgres | `n8n-envision-postgres-1` / `n8n` DB | **Keep for now** — this is n8n's own internal DB credential. Though zero *workflow* nodes reference it, n8n may use it internally. Safe to delete only after confirming n8n doesn't use it for internal operations. | Independent |
| 5 | QA Webhook Auth | 3pU3F6Su9mpJ9nei | httpHeaderAuth | `x-gda-key: gda-webhook-secret-2026` | **Delete** — identical value to "GDA Webhook Auth" and "GDA Webhook Auth v2". Redundant. | Before F-034 |
| 6 | Redis account | F6aCGUnktFFSwjS8 | redis | `n8n-envision-redis-1` | **Keep for now** — Redis is configured via env var (`QUEUE_BULL_REDIS_HOST`), but this credential may be used by community packages or future workflows. Low risk to keep. | Independent |

**Action:** Delete credentials #1, #2, #3, #5. Revoke the GitHub PAT
(`ghp_grzU...`) on GitHub before deleting the credential. Keep #4 and
#6 pending further investigation.

---

## 3. "GDA Postgres" Credential Misconfiguration

| Field | Current Value | Expected Value (post-F-026) |
|---|---|---|
| Host | `n8n-envision-postgres-1` | `gda-postgres` |
| Database | `n8n` | `gda_command` |
| User | `n8n` | `gda_app` |
| Password | (n8n DB password) | (gda_app password) |

**Impact:** This is the root misconfiguration that F-026 exists to fix.
134 n8n workflows use this credential. They all write to the `n8n`
database on `n8n-envision-postgres-1`, creating the 76 shadow tables
that should be in `gda_command`.

**Remediation:** F-026 Step 4 (workflow repoint). After schema migration
(Step 3) and network bridge (Step 2), update this credential to point
at `gda-postgres` as `gda_app`.

**Sequencing:** F-026 Step 4. Do NOT modify before Step 3 completes.

**Owner:** Devin (per F-026 plan).

---

## 4. Undocumented Environment Variables in n8n

### 4a. FIRECRAWL_API_KEY

| Location | Value | Notes |
|---|---|---|
| n8n `.env` | `fc-34d13...5304` | Not in any n8n credential entity. Not referenced in any workflow node via credential. |

**Impact:** Unclear. Firecrawl is a web scraping API. May have been used
during initial development for content extraction. No active consumer
found.

**Remediation:** Remove from n8n `.env`. If a workflow needs it later,
it gets added as a proper credential.

**Sequencing:** Before F-034 (clean env before adding new services).

**Owner:** Devin (remove). Shawn (confirm no active use).

### 4b. PINECONE_API_KEY and PINECONE_HOST

| Location | Env Var | Value |
|---|---|---|
| n8n `.env` | `PINECONE_API_KEY` | `01dedd34...b627` |
| n8n `.env` | `PINECONE_HOST` | `ai-assistant-ezysp85.svc.aped-4627-b74a.pinecone.io` |
| n8n credential | `PineconeApi account 2` (ID=wRjQmgKElTHbBf5J) | `pcsk_3V1...cn1r` (different key!) |

**Impact:** Two different Pinecone API keys exist — one in `.env`, one
in the n8n credential. The credential is used by 2 workflows. The `.env`
key is a different key entirely.

**Remediation:** Per F-034 spec, Pinecone is rejected (pgvector is the
vector store). Remove both env vars and the credential after confirming
no active embedding pipeline depends on them. The 2 workflows using the
credential need to be identified and migrated to pgvector as part of
F-033.

**Sequencing:** Before F-034. Pinecone cleanup is a gate for F-034's
"no external SaaS dependencies for embeddings" requirement.

**Owner:** Devin (identify the 2 workflows, remove env vars). Shawn
(confirm Pinecone account can be closed).

### 4c. SAM_GOV_API_KEY (different name from backend)

| Location | Env Var | Notes |
|---|---|---|
| Backend `.env` | `SAM_API_KEY` | Backend code references this name |
| n8n `.env` | `SAM_GOV_API_KEY` | Different name AND different value (see §1a) |

**Impact:** n8n Code nodes that access `process.env.SAM_GOV_API_KEY`
use a different key than the backend. Name inconsistency makes it
easy to miss during rotation.

**Remediation:** Covered by §1a remediation (align to single key).

---

## 5. Security Configuration Issues

### 5a. N8N_CORS_ALLOWED_ORIGINS — RESOLVED ✓

| Before (pre Tier 0) | After (current) |
|---|---|
| `*` (any origin) | `https://gda.csr-llc.tech,https://app.csr-llc.tech,http://localhost:5173,http://localhost:3000` |

**Resolved** in Tier 0 pre-flight (2026-05-21). n8n restarted and
verified. No further action needed.

### 5b. NODE_FUNCTION_ALLOW_EXTERNAL=*

| Location | Current | Risk |
|---|---|---|
| n8n compose env | `*` | Allows any npm package import in n8n Code nodes |

**Impact:** Low immediate risk (n8n is not publicly accessible for
arbitrary code execution), but violates principle of least privilege.
A compromised workflow could import malicious packages.

**Remediation:** Restrict to specific packages actually used by Code
nodes. Requires inventory of Code node imports across all workflows.

**Sequencing:** Independent. Low priority. Can be done alongside or
after F-026.

**Owner:** Devin (inventory Code node imports, propose allowlist).

### 5c. N8N_ENCRYPTION_KEY format

| Location | Value pattern | Notes |
|---|---|---|
| n8n `.env` | `eyJhbGci...` (JWT format) | This is a JWT token being used as an encryption key |

**Impact:** Functionally works — n8n uses it as a symmetric key for
credential encryption. But if this JWT was issued by another system,
it could expire or be revoked, breaking n8n's ability to decrypt
stored credentials.

**Remediation:** Generate a proper random encryption key and re-encrypt
n8n credentials. This is a high-risk operation (botched re-encryption
= all credentials lost) and should be done only with a full backup.

**Sequencing:** Independent. Medium priority. Not a blocker for F-026
or F-034.

**Owner:** Shawn (approve approach). Devin (execute with backup).

---

## 6. Webhook Auth Credential Proliferation

Three credentials with identical purpose and value:

| Credential | ID | Value | Workflows |
|---|---|---|---|
| GDA Webhook Auth v2 | F4J3vYsPrJrYiO49 | `x-gda-key: gda-webhook-secret-2026` | 127 |
| GDA Webhook Auth | 1pNPY36DDz49OtKL | `x-gda-key: gda-webhook-secret-2026` | 11 |
| QA Webhook Auth | 3pU3F6Su9mpJ9nei | `x-gda-key: gda-webhook-secret-2026` | 0 |

All three have identical header name and value. "v2" is the active one
(127 workflows). The original has 11 workflows still referencing it.
QA Webhook Auth has zero references.

**Remediation:**
1. Delete "QA Webhook Auth" (zero references, covered in §2).
2. Migrate the 11 workflows from "GDA Webhook Auth" to "GDA Webhook Auth v2".
3. Delete "GDA Webhook Auth" after migration.

**Sequencing:** Independent. Can be done alongside F-026 Step 4
(workflow JSON edits).

**Owner:** Devin.

---

## 7. GitHub PAT Exposure Risk

Two GitHub PATs found in n8n credentials:

| Credential | PAT Prefix | Status |
|---|---|---|
| GDA GitHub Bridge PAT | `ghp_grzU...` | **Unused** (0 workflows). Possibly valid on GitHub. |
| GitHub Gist PAT | `ghp_TNqz...` | Active (3 workflows). |

**Remediation:**
1. Revoke `ghp_grzU...` on GitHub immediately (unused, exposure risk).
2. Verify `ghp_TNqz...` scope and expiration (active, 3 workflows depend on it).

**Sequencing:** Revoke unused PAT immediately (before F-026). Audit
active PAT independently.

**Owner:** Shawn (revoke on GitHub). Devin (delete credential after revocation).

---

## Remediation Summary — Sequencing Matrix

### Must close BEFORE F-026 cutover (Steps 3-4)

| # | Item | Section | Action | Owner |
|---|---|---|---|---|
| R-1 | SAM API key drift | §1a | Align to single canonical key | Shawn decides, Devin applies |
| R-2 | Revoke unused GitHub PAT | §7 | Revoke `ghp_grzU...` on GitHub, delete credential | Shawn revokes, Devin deletes |

### Must close BEFORE F-034 start

| # | Item | Section | Action | Owner |
|---|---|---|---|---|
| R-3 | Delete 4 unused credentials | §2 | Delete #1, #2, #3, #5 from n8n | Devin |
| R-4 | Remove FIRECRAWL_API_KEY | §4a | Remove from n8n `.env`, restart n8n | Devin |
| R-5 | Remove Pinecone env vars + credential | §4b | Remove env vars, identify 2 workflows, delete credential | Devin (identify), Shawn (confirm Pinecone close) |
| R-6 | OpenAI key alignment | §1b | F-034 resolves structurally via LiteLLM | Devin (via F-034) |
| R-7 | Migrate 11 workflows off legacy webhook auth | §6 | Repoint to "GDA Webhook Auth v2", delete old | Devin |

### Independent (no blocker)

| # | Item | Section | Action | Owner |
|---|---|---|---|---|
| R-8 | NODE_FUNCTION_ALLOW_EXTERNAL restriction | §5b | Inventory Code node imports, propose allowlist | Devin |
| R-9 | N8N_ENCRYPTION_KEY format | §5c | Generate proper key, re-encrypt (with backup) | Shawn approves, Devin executes |
| R-10 | Audit active GitHub Gist PAT scope | §7 | Verify scope and expiration | Shawn |
| R-11 | "Postgres account" credential investigation | §2 (#4) | Confirm whether n8n uses internally | Devin |
| R-12 | "Redis account" credential investigation | §2 (#6) | Confirm whether community packages use | Devin |

### Already resolved

| # | Item | Section | Resolution |
|---|---|---|---|
| R-0 | N8N_CORS_ALLOWED_ORIGINS=* | §5a | Restricted in Tier 0 pre-flight (2026-05-21) |
