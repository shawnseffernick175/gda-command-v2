# CI Gates Reference

Quick-reference for every CI check that runs on PRs, what it enforces, and how to fix it when it trips.

---

## Compose Drift Check

**Workflow:** `.github/workflows/ci.yml` → job `compose-drift`

**What it enforces:**
1. **Hash guard** — `docker-compose.prod.yml` SHA-256 must match `.github/expected-compose-hashes.txt`. Prevents accidental compose changes from slipping through without acknowledgment.
2. **Connector env-var parity** — every `GOVTRIBE_*` / `GOVWIN_*` / `ENABLE_GOVTRIBE_*` env var read in `apps/backend-v3/src/` or `apps/gda-agent-v3/src/` must have a passthrough entry in the corresponding service's `environment:` block in `docker-compose.prod.yml`.

**When it trips:**
- You modified `docker-compose.prod.yml` (or it was modified in a merged PR) and the hash file is stale.
- You added a new connector env var in backend/agent code but forgot the compose passthrough.

**How to fix:**

```bash
# 1. Refresh the hash file after an intentional compose change:
sha256sum docker-compose.prod.yml | awk '{print $2, $1}' > .github/expected-compose-hashes.txt

# 2. Add missing env var to the correct service block in docker-compose.prod.yml:
#    environment:
#      NEW_VAR: ${NEW_VAR:-}
```

---

## Build + Bundle Size + Lighthouse

**Workflow:** `.github/workflows/frontend-v3-ci.yml` → job `build-and-bundle`

**What it enforces:**
- Frontend (`packages/frontend-v3`) must build cleanly via `next build`.
- Total gzipped JS bundle must stay under the budget (`MAX_MAIN_KB`, currently **400 KB**).
- Lighthouse performance audit runs (currently `continue-on-error`; warns but does not block).

**When it trips:**
- New pages/components pushed the bundle past the budget cap.
- A build error in the frontend code.

**How to fix:**

```bash
# Check current bundle size locally:
cd packages/frontend-v3
npx next build
find out/_next/static -name '*.js' -exec cat {} + | gzip -c | wc -c | awk '{print int($1/1024) "KB"}'

# If over budget, either:
#   a) Tree-shake: lazy-load heavy components, remove unused deps
#   b) Raise the cap in .github/workflows/frontend-v3-ci.yml (MAX_MAIN_KB=...)
#      Only raise after confirming the growth is intentional feature work.
```

---

## Dependency Audit

**Workflow:** `.github/workflows/ci.yml` → job `audit`

**What it enforces:**
- `npm audit --audit-level=high` must exit 0 — no **high** or **critical** advisories in the dependency tree.
- Moderate/low advisories are tolerated.

**When it trips:**
- A new or upgraded transitive dependency introduced a high/critical CVE.

**How to fix:**

```bash
# 1. See what's vulnerable:
npm audit --audit-level=high

# 2. Preferred: upgrade the direct dep that pulls in the vulnerable package
#    e.g. tsx pulls esbuild — upgrade tsx to a version using the patched esbuild.

# 3. If no upstream fix exists, add an override in the root package.json:
#    "overrides": { "vulnerable-pkg": ">=fixed-version" }

# 4. If the advisory is not applicable (e.g., Windows-only, Deno-only),
#    document why and consider continue-on-error or an .npmrc audit exception.
```

---

## Other CI Jobs (non-ambient, informational)

| Job | What it checks |
|---|---|
| **Build & Typecheck** | `npm run build` across all workspaces |
| **Test** | Unit tests in `packages/shared` |
| **V3 Contract Tests** | Backend API contract + integration tests (testcontainer Postgres) |
| **Migration Parity Check** | Legacy→V3 migration runs without regressions |
| **Schema Drift Check** | Applied migrations match expected schema snapshot |
| **LLM Router Gates** | SDK drift + routing table completeness |
| **MCP Server resolve** | `@gda/backend-v3` modules resolve from MCP server |
| **Frontend V3 Build & Lint** | ESLint + TypeScript strict + unit/integration/contract tests |
| **Forbidden Token Scan** | Blocks banned color hex codes, fonts, inline styles |
| **Integration Tests** | Full Postgres testcontainer integration suite |

---

## General Triage Steps

1. Check if the failure is **ambient** (same failure on every PR) or **PR-specific**.
2. For ambient failures: fix on `main` in a dedicated gate-cleanup PR, then re-run CI on stuck PRs.
3. For PR-specific failures: fix in the feature branch itself.
4. After merging a gate fix, trigger re-runs on stuck PRs via the GitHub Actions UI or `gh workflow run`.
