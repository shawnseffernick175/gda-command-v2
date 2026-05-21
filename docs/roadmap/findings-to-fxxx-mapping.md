# FINDINGS.md ↔ F-XXX Mapping

**Purpose:** Before drafting the stabilization roadmap, reconcile the Phase 4 audit
(docs/audit/FINDINGS.md — 24 findings) against the Failure Inventory (F-001 through F-024).
Identify overlaps, gaps, and resolved items.

---

## Side-by-Side Mapping

| FINDINGS.md ID | Severity | Summary | F-XXX Mapping | Status |
|---|---|---|---|---|
| BROKEN-001 | P0 | Versioning triggers duplicated 3× | **F-009** (identical root cause: triggers fire 3× per write) | **Resolved** — PR #208 |
| STALE-001 | P0 | `record_version` has 0 rows | **No F-XXX.** Partially explained by BROKEN-001, but the deeper problem (n8n mutations bypass triggers, no retroactive snapshot) remains unaddressed. Needs new F-XXX or rolls into product work. | **Unaddressed** |
| RISK-001 | P0 | CORS allows all origins | **No F-XXX.** Security finding with no corresponding failure inventory entry. | **Unaddressed** — marked "Fix Now" in FINDINGS.md but no PR merged |
| BROKEN-002 / PERF-001 | P1 | SAM monitor returns 6,746 rows unpaginated | **No F-XXX.** Performance issue not in failure inventory. | **Unaddressed** |
| STALE-002 | P1 | 41 empty tables with UI pages built | **Explained by F-023.** The tables aren't empty — their data is in the wrong database (n8n-envision-postgres-1 instead of gda_command). The "41 empty tables" finding from Phase 4 is the same wound that F-023 diagnosed as the split-brain database problem. | **Superseded by F-023** |
| RISK-002 | P1 | `xlsx` dependency has HIGH vuln (prototype pollution) | **No F-XXX.** Security/dependency finding. | **Unaddressed** |
| DATA-001 | P1 | Duplicate migration numbers (036, 038, 039, 040) | **F-010** (exact match) | **Resolved** — PR #224 |
| DATA-002 | P1 | Missing migration file (024) | **F-011** (exact match) | **Resolved** — PR #227 |
| OBSERVE-001 | P1 | 42 catch blocks swallow errors silently | **F-012** (exact match) | **Resolved** — PR #208 |
| STALE-003 | P2 | Only 1/23 docs have embeddings | **No F-XXX.** RAG quality issue — not in failure inventory. Related to knowledge pipeline but no systematic fix tracked. | **Unaddressed** |
| STALE-004 / DOC-001 | P2 | 11 env vars undocumented | **No F-XXX.** Documentation gap. | **Unaddressed** |
| BROKEN-003 / DATA-003 | P2 | Two migration tracking tables (`_migrations` + `schema_migrations`) | **Partially addressed by F-019.** F-019's manifest verification and drift check scope only `schema_migrations`. The legacy `_migrations` table is documented but not dropped. | **Partially resolved** |
| RISK-003 | P2 | Webhook registry endpoint publicly accessible | **No F-XXX.** Security finding. | **Unaddressed** |
| PERF-002 | P2 | No code splitting (321 KB gzipped bundle) | **No F-XXX.** Frontend performance, not stability. | **Unaddressed** |
| OBSERVE-002 | P2 | No n8n workflow failure alerting | **Partially addressed by F-022/F-024.** F-022 classified which workflows matter. F-024 fixed the scheduler. But no automated alert mechanism exists — the weekly inventory GitHub Action proposed in F-021 §6 was never built. | **Partially resolved** |
| OBSERVE-003 | P2 | Health check doesn't cover n8n | **No F-XXX.** Observability gap. | **Unaddressed** |
| DEAD-001 | P3 | 27 mock data files no longer used in routes | **No F-XXX.** Dead code cleanup, low priority. | **Unaddressed** (marked "Document Only") |
| DEAD-002 | P3 | 77 zip files + legacy docs in repo root | **No F-XXX.** Repo hygiene. | **Unaddressed** (marked "Document Only") |
| RISK-004 | P3 | Health endpoints expose internal details | **No F-XXX.** Security hardening. | **Unaddressed** |
| PERF-003 | P3 | Recharts (80 KB gzipped) used in 1/36 pages | **No F-XXX.** Bundled under PERF-002. | **Unaddressed** |
| INCON-001 | P3 | Two charting approaches (Recharts + inline SVG) | **No F-XXX.** Design consistency. | **Unaddressed** (marked "Document Only") |
| DOC-002 | P3 | No API documentation | **No F-XXX.** Documentation. | **Unaddressed** (marked "Document Only") |

---

## Summary

| Category | Count |
|---|---|
| **Resolved by existing F-XXX** | 5 (BROKEN-001→F-009, DATA-001→F-010, DATA-002→F-011, OBSERVE-001→F-012, STALE-002→F-023) |
| **Partially resolved** | 3 (BROKEN-003/DATA-003→F-019, OBSERVE-002→F-022/F-024, STALE-001→no F-XXX) |
| **Unaddressed — no F-XXX exists** | 14 |

Of the 14 unaddressed findings:
- **3 are security (RISK-001, RISK-002, RISK-003)** — CORS, xlsx vuln, webhook registry exposure. These should roll into a single new F-XXX for "security hardening pass."
- **3 are observability (OBSERVE-002 partial, OBSERVE-003, STALE-004/DOC-001)** — n8n alerting, health check n8n coverage, env var documentation. These map naturally into the proposed "credential and configuration audit" F-XXX.
- **3 are performance (BROKEN-002/PERF-001, PERF-002, PERF-003)** — SAM pagination, code splitting, Recharts. Product-tier work.
- **3 are dead code / hygiene (DEAD-001, DEAD-002, INCON-001)** — all marked "Document Only." Low priority.
- **1 is RAG quality (STALE-003)** — embeddings pipeline. Product-tier.
- **1 is documentation (DOC-002)** — no API docs. Low priority.

### Key finding: STALE-002 is F-023

The Phase 4 audit's second-most-severe finding — "41 empty tables with full UI pages built" — is **the same problem** that F-023 diagnosed four months later as "workflows writing to the wrong database." The audit saw the symptom (empty tables); F-023 found the cause (split-brain database, credential misconfiguration). This connection was never made explicitly until now.

### Items that need new F-XXX numbers

1. **Security hardening pass** — RISK-001 (CORS), RISK-002 (xlsx), RISK-003 (webhook registry), RISK-004 (health endpoints)
2. **STALE-001 (record_version empty)** — versioning system exists but has never captured a single version. Related to triggers, n8n bypasses, and lack of retroactive snapshots. Not addressed by any existing F-XXX.
