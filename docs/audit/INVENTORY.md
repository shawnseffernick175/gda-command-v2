# GDA Command v2 — Phase 1 Inventory

**Audit Tag:** `audit-2026-05`
**Date:** 2026-05-19
**Auditor:** Devin
**Repo:** `shawnseffernick175/gda-command-v2`
**Branch:** `main` @ commit `529702d`
**Production:** https://gda.csr-llc.tech

---

## Pre-Work Confirmation

### Documents Reviewed
- **v3 Sprint Brief** (`pasted-1779136999136.md`) — 8 workstreams, PR split, non-negotiables
- **v2 Capture Intelligence Brief** — referenced as still authoritative for BOE/PP/Doc ingestion
- **Book of Truths / Build Control** — GitHub as single source of truth, safety lanes
- **All conversation history** — 10+ prior sessions covering PRs #194–#206

### Prior PRs Reviewed (Last 90 Days — 352 commits)
| PR | Description | Key Takeaway |
|----|-------------|--------------|
| #194 | Add timeouts to AI chat calls | Fixed non-responsive chats; 60s timeouts added |
| #198 | Proposal Builder enhancements | Doc import, version history, compliance mapping |
| #199 | Capture stage + OpsTracker fixes | `capture_stage` field alignment |
| #201 | RFP Shredder + compliance matrix | AI-powered solicitation parsing |
| #202 | Address all 24 E2E production issues | Chart sizing, Pwin data flow, risk matrix, prompt CRUD |
| #205 | Multiple Devin Review rounds | Bug fixes from automated review |
| #206 | Sidebar search crash fix | Null safety on search results |
| (W1) | Procurement vehicle classification | `vehicle_type` enum + sub-pages |
| (W2) | Expanded opportunity sources | Source registry + admin UI |
| (W3) | Record versioning + soft-delete | `record_version` table, `deleted_at` columns, triggers |
| (W4) | Company entities + merger context | `company_entity` table, M&A tracking |
| (W5) | Opp detail upgrade | Tabbed navigation, analytics strip, activity timeline |
| (W6) | Capture discipline | Stage funnel, gate reviews, guardrail alerts |
| (W7) | Fix Launchpad vs Ops Tracker mismatch | Canonical views |
| (W8) | AI Gateway | Summarizer, bid/no-bid recommender, usage analytics |

### Constraints Honored
1. Do not touch the `gda-tg-notify` webhook without approval
2. No feature builds — audit and stabilization only
3. Preserve git history — no force pushes or rewrites
4. Stop and ask before changing user-facing behavior

---

## 1. Codebase Structure

### File Counts
| Area | Files |
|------|-------|
| Backend routes (`src/routes/`) | 48 `.ts` |
| Backend lib (`src/lib/`) | 17 `.ts` |
| Backend agents (`src/agents/`) | 6 `.ts` |
| Backend middleware | 3 `.ts` |
| Backend data (mock files) | 27 `.ts` |
| Backend tests | 3 `.ts` |
| Frontend pages (`src/pages/`) | 36 `.tsx` |
| Frontend components (`src/components/`) | 14 `.tsx/.ts` |
| Frontend hooks/utils/API | 4 `.ts` |
| Shared types | 1 `.ts` (1,772 lines) |
| Migrations | 46 `.sql` |
| **Total source files** | **~207** |

### Repo Root Clutter
**77 `.zip` files**, 14 `.xlsx` files, 6 `.docx`/`.pdf` files, and several legacy folders are committed to the repo root. These are build artifacts, old assessment spreadsheets, and legacy backups.

---

## 2. Database Schema Inventory

### Production Tables (85 tables)

#### Tables with Data
| Table | Rows | Notes |
|-------|------|-------|
| `users` | 3 | Production users |
| `refresh_tokens` | 70 | Active sessions |
| `opportunities` | 11 | Tracked opps |
| `sam_opportunities` | 6,746 | SAM.gov raw data |
| `fpds_awards` | 517 | FPDS contract awards |
| `procurement_vehicles` | 13 | Vehicle classifications |
| `company_entity` | 4 | Envision, PD, Riverstone, NewCo |
| `company_profile` | 1 | Main company profile |
| `financial_kpis` | 16 | KPI metrics |
| `monthly_financials` | 3 | Monthly financial data |
| `feature_flags` | 9 | Feature flags |
| `source_registry` | 9 | Data source configs |
| `intel_items` | 12 | Intelligence items |
| `knowledge_collections` | 6 | KB collections |
| `knowledge_documents` | 23 | Uploaded documents |
| `document_embeddings` | 1 | Only 1 document embedded |
| `capture_coach_results` | 10 | AI capture coach output |
| `approval_queue` | 17 | Pending approvals |
| `audit_log` | 62 | Audit trail |
| `agent_config` | 6 | Agent configs |
| `agent_runs` | 27 | Agent execution history |
| `bot_entities` | 27 | Bot/glossary entities |
| `bot_glossary` | 23 | Glossary terms |
| `bot_sources` | 15 | Bot data sources |
| `gov_source_feeds` | 6 | Government feed configs |
| `sam_scan_runs` | 24 | SAM.gov scan history |
| `anomaly_rules` | 5 | Anomaly detection rules |
| `escalation_rules` | 8 | Escalation configs |
| `mergers_acquisitions` | 5 | M&A records |
| `uploaded_files` | 26 | File uploads |
| `shred_jobs` | 1 | RFP shred jobs |
| `fix_proposals` | 1 | QA fix proposals |
| `schema_migrations` | 46 | Migration tracker |
| `_migrations` | 22 | Legacy migration tracker |

#### Empty Tables (0 rows) — 41 tables
`ai_usage_log`, `anomalies`, `approvals`, `bid_assessments`, `bid_recommendations`, `capture_activities`, `capture_gate_reviews`, `capture_guardrail_alerts`, `capture_plans`, `clause_references`, `color_reviews`, `competitor_movements`, `competitor_profiles`, `compliance_requirements`, `contacts`, `cpars_records`, `dashboard_layouts`, `deep_research_reports`, `discussion_messages`, `discussion_threads`, `doctrine_drafts`, `doctrine_publish_runs`, `email_log`, `escalations`, `export_jobs`, `extracted_requirements`, `fast_track_matches`, `feed_config`, `generated_reports`, `knowledge_chat_sessions`, `merger_opp_impacts`, `morning_briefings`, `notifications`, `pipeline_forecasts`, `prompts`, `proposal_compliance_map`, `proposal_section_versions`, `proposal_sections`, `proposals`, `pwin_models`, `record_version`, `report_templates`, `risk_register`, `scheduled_reports`, `source_sync_runs`, `user_invitations`, `win_loss_analyses`

### Opportunity Status Distribution
| Status | Count |
|--------|-------|
| `discovery` | 8 |
| `qualified` | 2 |
| `no_bid` | 1 |
| **Total** | **11** |

---

## 3. Migration Tracking

### Two Migration Tables
Production has **two** migration tracking tables:
- `_migrations` (22 rows, applied 2026-05-16) — used by an older migration runner
- `schema_migrations` (46 rows, applied 2026-05-12) — current runner

### Duplicate Migration Numbers
| Number | File 1 | File 2 |
|--------|--------|--------|
| 036 | `036_company_entities.sql` | `036_vehicle_classification.sql` |
| 038 | `038_ensure_intel_summary.sql` | `038_merger_context.sql` |
| 039 | `039_capture_discipline.sql` | `039_pgvector_safe.sql` |
| 040 | `040_ai_gateway.sql` | `040_seed_anomaly_rules.sql` |

### Missing Migration File
`024_seed_knowledge_collections.sql` is recorded as applied in `schema_migrations` but the file **does not exist** in `packages/backend/src/db/migrations/`.

---

## 4. Database Triggers & Views

### Versioning Triggers — DUPLICATED 3×
Every `trg_version_*` trigger exists **3 times** on each of 11 tables (33 total). Each UPDATE/INSERT/DELETE fires the trigger 3 times. Currently `record_version` has 0 rows (triggers fire correctly when tested manually, but no user-initiated edits have occurred on tracked tables since installation).

Affected tables: `opportunities`, `capture_plans`, `proposals`, `contacts`, `compliance_requirements`, `intel_items`, `color_reviews`, `risk_register`, `doctrine_drafts`, `cpars_records`, `knowledge_documents`

### Views
- `v_opportunity_active` — Excludes awarded/lost/no_bid + soft-deleted
- `v_opportunity_all_tracked` — All non-deleted opportunities

### Indexes
175 indexes across all tables.

---

## 5. Environment Variables

### Referenced in Code but Missing from `.env.production.example`
| Variable | Used In |
|----------|---------|
| `ANTHROPIC_API_KEY` | `lib/llm.ts` |
| `AUTH_REQUIRED` | `lib/auth.ts` |
| `BACKUP_DIR` | `routes/backup.ts` |
| `DATABASE_URL` | `lib/db.ts` |
| `GOVTRIBE_API_KEY` | `lib/gov-sources.ts` |
| `GOVWIN_API_KEY` | `routes/govwin.ts` |
| `LOG_LEVEL` | `lib/logger.ts` |
| `PORT` | `server.ts` |
| `QA_CHECK_TIMEOUT_MS` | `routes/qa.ts` |
| `QUALIFY_WRITES_ENABLED` | `routes/opportunities.ts` |
| `UPLOAD_DIR` | `lib/storage.ts` |

### In `.env.production.example` but Functional Coverage
All 16 vars in `.env.production.example` are referenced in code. However, 11 additional env vars are read in code but not documented in the example file.

---

## 6. Dependencies

### Backend (`packages/backend/package.json`)
| Dependency | Version | Status |
|-----------|---------|--------|
| `@anthropic-ai/sdk` | ^0.95.2 | Used in `lib/llm.ts` |
| `bcryptjs` | ^2.4.3 | Used in `routes/auth.ts` |
| `cors` | ^2.8.5 | Used in `server.ts` |
| `express` | ^4.21.0 | Core framework |
| `jsonwebtoken` | ^9.0.2 | Used in `lib/auth.ts` |
| `mammoth` | ^1.12.0 | Used in `lib/extract-text.ts` |
| `multer` | ^2.1.1 | Used in file upload routes |
| `nodemailer` | ^8.0.7 | Used in `lib/email.ts` |
| `officeparser` | ^5.1.1 | Used in `lib/extract-text.ts` |
| `openai` | ^6.37.0 | Used in `lib/llm.ts` + `lib/embeddings.ts` |
| `pdf-parse` | ^2.4.5 | Used in `lib/extract-text.ts` |
| `pg` | ^8.20.0 | Database driver |
| `xlsx` | ^0.18.5 | **HIGH vuln** — Prototype Pollution + ReDoS |

### Frontend (`packages/frontend/package.json`)
| Dependency | Version | Used? |
|-----------|---------|-------|
| `react` | ^18.3.0 | Yes, core |
| `react-dom` | ^18.3.0 | Yes, core |
| `react-router-dom` | ^6.26.0 | Yes, routing |
| `recharts` | ^3.8.1 | Only in `FinancialBible.tsx` (1 file) |

### npm audit Results
5 vulnerabilities (4 moderate, 1 high):
- **HIGH:** `xlsx` — Prototype Pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9). No fix available — library is unmaintained.
- **MODERATE:** `esbuild` (via vite) — dev server request bypass. Fix: upgrade vite to v8 (breaking).
- **MODERATE:** `file-type` (via multer) — infinite loop on malformed input.
- **MODERATE:** `multer` — stream handling issue.
- **MODERATE:** `nodemailer` — no details.

---

## 7. GitHub Actions

### Workflows
Single CI workflow: `.github/workflows/ci.yml`
- **Trigger:** Push to `main` + PRs targeting `main`
- **Jobs:** `test` (npm test) + `build` (tsc build)
- **Node version:** 22
- **Missing:** No lint job, no dependency audit, no secrets scan, no type checking as separate step

---

## 8. Frontend Route Map

### All Routes (42 pages)
| Route | Page Component | API Endpoints Called |
|-------|---------------|---------------------|
| `/` | `Home` | `/api/dashboard`, `/api/opportunities`, `/api/enrichments/search` |
| `/fast-track` | `FastTrack` | `/api/fast-track` |
| `/ops-tracker` | `OpsTracker` | `/api/opportunities` |
| `/pipeline` | `Pipeline` | `/api/opportunities` |
| `/vehicles` | `VehicleClassification` | `/api/vehicles` |
| `/approvals` | `Approvals` | `/api/approvals` |
| `/risk-register` | `RiskRegister` | `/api/risk-register` |
| `/proposal-center` | `ProposalCenter` | `/api/proposals` |
| `/rfp-shredder` | `RFPShredder` | `/api/rfp-shredder` |
| `/compliance` | `Compliance` | `/api/compliance` |
| `/proposals` | `ProposalBuilder` | `/api/proposals` |
| `/color-review` | `ColorReview` | `/api/color-review` |
| `/capture` | `Capture` | `/api/capture` |
| `/intel` | `Intel` | `/api/intel` |
| `/predictive` | `Predictive` | `/api/predictive` |
| `/anomaly` | `AnomalyDetection` | `/api/anomaly` |
| `/contacts` | `Contacts` | `/api/contacts` |
| `/knowledge` | `Knowledge` | `/api/knowledge` |
| `/govwin` | `GovWin` | `/api/govwin` |
| `/mergers` | `MergerContext` | `/api/mergers` |
| `/ai-gateway` | `AIGateway` | `/api/ai-gateway` |
| `/capture-discipline` | `CaptureDiscipline` | `/api/capture-discipline` |
| `/financial-bible` | `FinancialBible` | `/api/financials` |
| `/reports` | `Reports` | `/api/reports` |
| `/charts` | `Charts` | `/api/opportunities` |
| `/settings` | `Settings` | `/api/settings` |
| `/qa-center` | `QACenter` | `/api/qa` |
| `/workflows` | `Workflows` | `/api/workflows` |
| `/admin/users` | `UserManagement` | `/api/admin/users` |
| `/admin/audit` | `AuditLog` | `/api/audit` |
| `/admin/companies` | `AdminCompanies` | `/api/admin/companies` |
| `/admin/trash` | `AdminTrash` | `/api/versions` |
| `/doctrine` | `Doctrine` | `/api/doctrine` |
| `/book-of-truths` | `BookOfTruths` | `/api/book-of-truths` |
| `/prompts` | `PromptArchitect` | `/api/prompts` |
| `/help` | `UserManual` | (static) |
| `/sources` | `SourceManager` | `/api/sources` |
| `/opportunities/:id` | `OpportunityDetail` | `/api/opportunities/:id` |
| `/financial-bible/:key` | `FinancialBible` | `/api/financials` |
| `/login` | `Login` | `/api/auth/login` |
| `/cpars` | `CPARSBuilder` | `/api/cpars` |
| `*` | `NotFound` | (none) |

---

## 9. Backend Endpoint Inventory

### Route Modules (48 files)
All mounted under `/api/` with `authMiddleware` (JWT) except:
- `/health` — public, no auth
- `/health/detailed` — public, no auth
- `/api/auth` — rate-limited, no JWT (login/register)
- `/api/ingest` — rate-limited, key-based auth (no JWT)
- `/api/webhooks/registry` — public, read-only

### Security Observations
- **CORS:** `app.use(cors())` — allows **all origins** (wildcard). Should be restricted to production domain.
- **Rate Limiting:** Applied via `authLimiter`, `sessionLimiter`, `apiLimiter`, `ingestLimiter`
- **Audit Middleware:** Records all write operations to `audit_log`
- **Auth:** JWT-based with `authMiddleware` on all `/api/*` routes (except noted above)

---

## 10. Mock Data Assessment

### Mock Data Files: 27 files in `packages/backend/src/data/`
All mock data imports have been removed from route handlers. Mock data is now only imported by:
- `packages/backend/src/db/seed.ts` — seed script (not production)
- `packages/backend/src/data/opportunity-detail-mock.ts` — references `opportunities-mock.ts`

However, many route handlers still have **fallback-to-mock patterns** in their comments (e.g., "fall through to mock") even though the imports were removed. The actual code paths now fall through to empty responses or DB queries, which is correct behavior.

---

## 11. n8n Workflows

### Production n8n Instance
- URL: `https://n8n.csr-llc.tech`
- Reported: 159 workflows (156 active)
- Backend connects via `N8N_BASE_URL` + `N8N_API_KEY` + `GDA_WEBHOOK_KEY`

### Webhook Registry (from backend)
The backend maintains a `WEBHOOK_REGISTRY` in `lib/webhook-registry.ts` mapping webhook names to their purposes. This is exposed at `/api/webhooks/registry`.

---

## 12. Docker / Deployment

### Production Stack (`docker-compose.prod.yml`)
- `gda-frontend` — Nginx serving Vite-built React SPA
- `gda-backend` — Node.js Express API
- `gda-postgres` — PostgreSQL database
- Separate n8n stack with its own Postgres, Redis, MCP, and Traefik

### Container Health (as of 2026-05-19)
All containers healthy:
- `gda-frontend` — Up, healthy
- `gda-backend` — Up, healthy
- `gda-postgres` — Up 27h, healthy

---

## 13. Key Findings Summary (Pre-Analysis)

### Critical
1. **`record_version` has 0 rows** — versioning infrastructure exists but has never recorded a version
2. **Duplicate triggers (3×)** — each versioning trigger fires 3 times per operation
3. **41 empty tables** — nearly half the database tables have never been written to
4. **Only 1 of 23 documents embedded** — RAG/semantic search non-functional for 95% of KB

### High
5. **CORS wildcard** — `cors()` with no origin restriction on all endpoints
6. **`xlsx` high vulnerability** — Prototype Pollution + ReDoS, no fix available
7. **11 env vars undocumented** — referenced in code but missing from `.env.production.example`
8. **Duplicate migration numbers** — 4 pairs of colliding migration numbers
9. **Missing migration file** — `024_seed_knowledge_collections.sql` missing from repo
10. **Two migration tracking tables** — `_migrations` and `schema_migrations` coexist

### Medium
11. **77 zip files in repo root** — build artifacts committed to version control
12. **27 mock data files** — still in codebase but no longer imported by routes
13. **Recharts** — dependency used in only 1 of 36 frontend pages
14. **No lint CI job** — only build + test in GitHub Actions
