# GDA Command v2 — Phase 2 Static Analysis

**Audit Tag:** `audit-2026-05`
**Date:** 2026-05-19

---

## 1. TypeScript Compilation (`tsc --noEmit`)

### Backend: 0 errors (after shared rebuild)
After rebuilding `packages/shared`, the backend compiles cleanly. However, without the shared build step, 13 type errors appear because 4 route files import types that only exist in the shared package's `.ts` source, not in its compiled `.d.ts` output.

**Root cause:** The shared package's build output (`dist/index.d.ts`) was stale, missing types added in recent PRs (VehicleType, CompanyEntity, MergerAcquisition, etc.). The CI pipeline handles this correctly (`npm run build -w packages/shared` runs first), but local development can easily hit these errors.

### Frontend: 0 errors (after shared rebuild)
Clean after shared rebuild. Without it, 4 errors in `AdminCompanies.tsx` (missing `CompanyEntity`/`EntityStatus` imports + implicit `any` parameters).

---

## 2. Security Analysis

### 2.1 CORS Configuration — WIDE OPEN
**File:** `packages/backend/src/server.ts:77`
```typescript
app.use(cors());
```
**Risk:** Allows requests from **any origin**. Any website can make authenticated API calls if the user's JWT token is accessible. Should be restricted to `https://gda.csr-llc.tech` and development origins.

### 2.2 SQL Injection Assessment — LOW RISK
All SQL queries reviewed. Patterns found:
- **Parameterized queries with allowlist:** `proposals.ts` (lines 186, 198) uses hardcoded field name arrays for dynamic SET clauses — values are always parameterized. **Safe.**
- **Template literal with allowlist:** `ingest.ts:808` interpolates table names from a hardcoded array. **Safe.**
- **Versioning code:** `lib/versioning.ts` uses `format()` for column identifiers. Previously fixed for SQL injection (PR history shows `quote column identifiers` fix). **Safe after fix.**

No user-input string concatenation into SQL detected.

### 2.3 Authentication Coverage
All `/api/*` routes are behind `authMiddleware` except:
- `/health` (intentional — public health check)
- `/health/detailed` (intentional — public)
- `/api/auth/*` (intentional — login/register)
- `/api/ingest/*` (key-based auth via `GDA_WEBHOOK_KEY`)
- `/api/webhooks/registry` (intentional — read-only registry)

**Finding:** No routes without auth handle write operations, but the `/api/webhooks/registry` endpoint exposes the full list of webhook URLs and their purposes, which could be used for reconnaissance.

### 2.4 Role-Based Authorization
18 route files use `requireRole("admin")` for sensitive operations (user management, backups, feature flags, etc.). The remaining routes are accessible to any authenticated user — appropriate for a 3-user system but worth revisiting if user count grows.

### 2.5 Secret Scanning — CLEAN
- No hardcoded API keys, passwords, or tokens in source code
- No `.env` files with secrets in git history (only `.env.production.example`)
- All secrets accessed via `process.env.*`

### 2.6 Dynamic Code Execution — CLEAN
No `eval()`, `new Function()`, or similar patterns found.

### 2.7 Rate Limiting
Rate limiters applied:
- `authLimiter` — login/register endpoints
- `sessionLimiter` — `/api/auth/me` (generous)
- `apiLimiter` — all other API routes
- `ingestLimiter` — ingest endpoints

---

## 3. Dependency Vulnerabilities (`npm audit`)

| Package | Severity | Issue | Fix Available? |
|---------|----------|-------|---------------|
| `xlsx` | **HIGH** | Prototype Pollution + ReDoS | **No** — library unmaintained |
| `esbuild` (via vite) | Moderate | Dev server request bypass | Yes — upgrade vite to v8 (breaking) |
| `file-type` (via multer) | Moderate | Infinite loop on malformed ASF input | Yes — upgrade file-type |
| `multer` | Moderate | Stream handling issue | Pending |
| `nodemailer` | Moderate | Unspecified | Pending |

**`xlsx` is the highest risk.** The SheetJS library is unmaintained and has known prototype pollution. It's used in `lib/extract-text.ts` for spreadsheet parsing in document upload flows.

---

## 4. Dead Code Analysis

### 4.1 Mock Data Files (27 files)
`packages/backend/src/data/` contains 27 mock data files. These are only imported by:
- `db/seed.ts` — seed script (development only)
- `data/opportunity-detail-mock.ts` — self-referential mock

**These files are dead code for production** but useful for development seeding. They should be documented as dev-only.

### 4.2 Swallowed Errors (42 catch blocks)
42 `catch` blocks in route handlers swallow errors without logging. Examples:
- `ai-gateway.ts:46`, `ai-gateway.ts:262`
- `mergers.ts:62`, `mergers.ts:416`
- `govwin.ts:16,46,87,104` (4 empty catches)
- `color-review.ts:390`
- `opportunities.ts:660,671,871`
- `sam-monitor.ts:51,90`
- `dashboard.ts:258`

These represent **observability gaps** where errors are silently ignored. In many cases, this was intentional (fall-through to mock data or graceful degradation), but without logging, failures are invisible.

### 4.3 Unused Frontend Dependencies
- `recharts` (^3.8.1) — imported in only 1 of 36 pages (`FinancialBible.tsx`). All other charts use custom SVG/HTML.

### 4.4 `console.log` / `debugger` Statements
Only 1 `console.error` in shipping code: `ExportButton.tsx:27` — appropriate error logging.

### 4.5 TODO/FIXME Comments
Only 1 match: `FinancialKPIStrip.tsx:87` — comment `// DB key aliases (fin-XXX format)` using "XXX" as a format example, not a TODO.

---

## 5. Bundle Analysis

### Frontend Bundle
| Asset | Raw Size | Gzipped |
|-------|----------|---------|
| `index-DnnxxEid.js` | 1.3 MB | 321 KB |
| `index-B8e4-653.css` | 1.8 KB | ~600 B |

The JS bundle is a single chunk (no code splitting). At 321 KB gzipped, it's acceptable but could benefit from route-based code splitting given the 42 pages.

### Key Bundle Composition
- React + React DOM: ~45 KB gzipped
- React Router: ~12 KB gzipped
- Recharts (used in 1 page): ~80 KB gzipped — **significant dead weight**
- Application code: ~180 KB gzipped

---

## 6. Database Analysis

### 6.1 Duplicate Migration Numbers (Finding from Phase 1)
4 pairs of colliding migration numbers (036, 038, 039, 040). The migration runner processes these in filesystem sort order, which works currently but is fragile.

### 6.2 Two Migration Tracking Tables
`_migrations` (22 rows from 2026-05-16) and `schema_migrations` (46 rows from 2026-05-12). The `_migrations` table appears to be from a legacy runner. Both track different subsets of the same migrations.

### 6.3 Duplicate Triggers
11 versioning triggers × 3 copies = 33 triggers. Each write operation generates 3 version rows instead of 1. Root cause: migration `034_versioning_softdelete.sql` was applied 3 times to production (likely during different deploy cycles).

### 6.4 Empty Tables
41 out of 85 tables have 0 rows. Many correspond to features that have been built (UI pages exist, routes exist) but never used in production. This suggests either:
1. Features deployed but not yet adopted (expected for new features)
2. Features that silently fail on data write and users see empty states
3. Features backed by n8n workflows that haven't run

---

## 7. Observability Analysis

### Structured Logging
The backend uses a custom `log` utility (`lib/logger.ts`) with structured JSON logging and correlation IDs via `requestLogger` middleware. This is well-implemented.

### Error Reporting
Frontend error boundary at `components/ErrorBoundary.tsx` POSTs to `/api/errors` with stack traces and component stacks. The backend logs these with `log.error("client_error", ...)`.

### Gaps
1. **42 swallowed errors** in route handlers
2. **No alerting** on n8n workflow failures
3. **No alerting** on cron job failures  
4. **No health check for n8n** — the `/health` endpoint checks DB but not n8n connectivity
5. **No correlation ID propagation** to n8n workflows
