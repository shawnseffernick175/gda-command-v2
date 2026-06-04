# START HERE — GDA Command Bootstrap

**If you are an AI assistant in a new chat: read this whole file first. It loads you with everything you need. Do NOT re-ask the user for any of this.**

Last verified: June 4, 2026 (AM). Owner: Shawn Seffernick, CTO, Envision-IS (emerging defense / DoD contracting), Alexandria VA.

---

## 0. How to treat the user (READ FIRST — non-negotiable)

- Shawn has cancer and is in active chemo/radiation, traveling constantly. He **cannot easily copy/paste or use a terminal.** Minimize manual steps. Do the work for him.
- **Never tell him to stop, pause, or take a break.** Keep working.
- **End every response with a clear recommendation.**
- **Do not attach/dump documents after chat replies** unless he asks. (A "Document" chip sometimes auto-appears from loading past sessions — it's a UI bug, not something you attached. Avoid extra past-session lookups that trigger it.)
- **You are NOT searching the web or aggregating sources.** Everything comes from HIS OWN VPS and repo over SSH. Be explicit about that.
- Explain infrastructure in plain English. He is technically advanced but exhausted — be direct and action-oriented, not verbose.
- **Standing merge rule:** a clean, CI-green, rebased PR → merge it automatically. Anything risky (table drops, secret rotation, infra teardown) still needs an explicit go.

---

## 1. How to get into the server (SSH access is already set up)

A dedicated key for the assistant is authorized on the VPS (comment `pplx-computer` in `~/.ssh/authorized_keys`).

```
ssh -i /home/user/workspace/.ssh/pplx_access \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/home/user/workspace/.ssh/known_hosts \
  -o ConnectTimeout=20 -o BatchMode=yes \
  root@187.77.206.105
```

- **VPS:** Hostinger, `187.77.206.105`. Project dir: `/root/gda-command-v2`. Compose file: `docker-compose.prod.yml`.
- Reachable from the assistant sandbox over SSH/HTTPS (ports 22/80/443 open).
- **Do NOT use Devin's VM to reach the VPS** — Devin's egress is blocked at its own gateway. That route is dead; don't retry it.
- Revoke assistant access later with: `sed -i '/pplx-computer/d' ~/.ssh/authorized_keys`

---

## 2. What the project IS (the North Star)

GDA Command = Shawn's operating system for emerging defense / DoD business development. End state: **one detail page per opportunity, regardless of source, with doctrine-aware scoring and human-confirmed cross-source matching.** Goal: predict DoD contract opportunities BEFORE they post on SAM.gov.

**Stack:** backend-v3 + agent-v3 + frontend-v3 (React), Postgres-staging, Traefik reverse proxy, Docker Compose, GitHub Actions CI. All live on the VPS.

**Repo:** `shawnseffernick175/gda-command-v2`, branch `main`. Use GitHub via gh CLI with `api_credentials=["github"]`.

---

## 3. Where we are RIGHT NOW (state)

- **Phase 1 (Unified Opportunity Foundation): DONE.** Schema, SourceAdapter, Matcher v1, backfill, field merge — all complete.
- **MCP server: LIVE and verified.** `https://gda-mcp.csr-llc.tech`, container `gda-mcp-server`, port 4100, healthy. `/health` returns `{"status":"ok","service":"gda-mcp","version":"0.1.0"}`.
  - **13 tools live:** gda_search_opportunities, gda_get_opportunity, gda_score_doctrine, gda_get_pwin, gda_query_rag, gda_list_action_items, gda_get_pipeline, gda_run_color_team, gda_get_launchpad_summary, gda_recall_decisions, gda_search_bills (LegiScan), gda_company_financials (SEC EDGAR), gda_company_awards (USAspending.gov).
  - `gda_query_rag` fix VERIFIED: `@gda/backend-v3` loads with 17 exports.
  - Auth: `/mcp` needs `Authorization: Bearer <JWT>` (HS256 via `JWT_SECRET`). Raw curl gives "Server not initialized" because MCP needs an initialize handshake first — real clients (Claude Desktop/Cursor) do this automatically, so that is NOT a failure.
  - Mint a test JWT in-container:
    `docker exec gda-mcp-server node -e "console.log(require('jsonwebtoken').sign({sub:'verify',role:'admin'}, process.env.JWT_SECRET, {algorithm:'HS256', expiresIn:'10m'}))"`
- **`.env.production` keys confirmed present:** LEGISCAN_API_KEY, VOYAGE_API_KEY, JWT_SECRET, STAGING_POSTGRES_PASSWORD. (ANTHROPIC_API_KEY not needed.)
- **GovTribe ingest: FIXED ✅ (June 3, 2026).** PR #678 fixed 0-rows bug — `fetchOppDetailBatches` only handled `{ results: [] }` shape; GovTribe MCP returns `{ data: [] }`, `{ rows: [] }`, and bare arrays too. Added `extractResultsArray<T>()` helper in `apps/backend-v3/src/ingest/govtribe/job.ts`. Verified: run_id=57 → 349 rows inserted.
- **GovWin ingest: FIXED ✅ (June 3, 2026).** GovWin uses OAuth2 **password grant** (NOT client_credentials). Working token endpoint: `https://services.govwin.com/neo-ws/oauth/token`. Three bugs fixed across PRs #679 and #680:
  1. `oauth2_auth.ts` — switched to `grant_type=password` + username + password + `scope=read`; fixed column names `tgt_hash`/`last_refresh_at` (not `token_hash`/`authenticated_at`).
  2. `api_client.ts` — sort param `updatedDate` (not `updated_at`), pagination `max` (not `per_page`), added `oppSelectionDateFrom=-30D`.
  - Credentials: `sseffernick@pd-sys.net` / `AUR_nka3arb_vbn0pzv`, client_id `DJTCSO5JOVG94UIQIV9KQ9NMLELV01HIAEBIHB83E0VQ4`, secret in `.env`. Verified: run_id=61 → 50 rows inserted.
- **F-215 D4 Real LLM Router: DONE ✅ (June 4, 2026).** PR #682 merged (squash, commit `9814e6c`). Real Anthropic + OpenAI providers implemented. Routing table: 8 tasks, 1 entry each (CI-enforced). Retry/fallback/wall-clock per D4 spec. `llm_calls` table created (migration `v3_033_llm_calls.sql`). `GET /v3/llm-cost-rollup` live. PERPLEXITY_API_KEY optional at startup. SDK drift detector in CI. Mock mode (MOCK_LLM=1) for zero real API calls in CI. Backend rebuilt and running healthy. **AI panels (OODA Inspector, Ask AI, Competitive Intel) are now unblocked** — wire them in F-453 or next frontend ticket.
- **F-460 Frontend Rewire: DONE ✅ (June 4, 2026).** PR #681 merged (squash, commit `add6dcc`). Frontend rebuilt and redeployed to VPS. All routes 200. Pipeline → `/v3/opportunities` (band filter, score sort, top_drivers chips). OpportunityDetail → REAL tier only (Doctrine panel 0–40, Timeline, Capture Pwin). Approvals → `/v3/match-suggestions`. Launchpad → lifecycle funnel from `/v3/reports/funnel`. Honesty gate enforced — heuristic panels hidden with "coming soon".
- **nginx SPA routing fix: DONE ✅ (June 4, 2026).** Commit `06d28ea` — added `try_files $uri $uri.html` so Next.js static export `/page.html` paths route correctly without 403.
- **Devin API: FIXED ✅ (June 3, 2026).** New API key saved to vault (`api.devin.ai`, bearer). Duplicate entries cleaned.

---

## 4. What's NEXT (the build order)

- **Phase 2 — Unified API (✅ COMPLETE):** ✅ F-410 unified detail (`GET /v3/opportunities/unified/:internal_id`) · ✅ F-411 stage filter (`GET /v3/opportunities/unified?stage=`) · ✅ F-412 suggestion queue (`GET/POST /v3/match-suggestions`) · ✅ F-413 field override + audit (`PUT /v3/opportunities/:internal_id/field-override`). All live on backend-v3.
- **Phase 3 — Unified UI (IN PROGRESS):** ✅ F-420 unified detail page (route `/unified/:internal_id`, PR #637, live) → ✅ F-420a connect-the-data (per-field source URLs in F-410 + unified analyze endpoint, clickable SourceLinks + auto-analysis for R1/R2, PR #639, live) → ✅ F-421 tab structure (say-something surfaces) — tabbed unified list at `/unified`, stage-group filters, R1 source links on every value, PR #641, live → ✅ F-422 suggestion review UI (Review Matches tab, human-in-the-loop confirm/reject queue, PR #643, live) → **F-423 decommission old per-source detail routes = NEXT** (Devin blocked at 403 — queue this when Devin comes back online).
- **Phase 4 — Fast Track adapters:** F-430 NSF, F-431 SBIR, F-432 SAM Sources Sought/Pre-Sol, F-433 DoD RSS, F-434 NIH RePORTER, F-435 arXiv+USAspending, F-436 signal scoring, F-437 doctrine badge.
- **Phase 5 — Hardening + analytics:** F-440 LOW-confidence matcher, F-441 conversion funnel, F-442 audit log, F-443 bulk review.

**The single canonical roadmap lives at `docs/canonical/north_star_roadmap_v3.md`.** That file has the full master task list with done/todo status. Read it after this one.

---

## 5. Shawn's only recurring manual step

DNS for new subdomains. `gda-mcp.csr-llc.tech` is already done. If a new subdomain is stood up, he adds a Hostinger DNS A record → `187.77.206.105`. Everything else is on autopilot.

---

## 6. Credentials available to the assistant

Custom credentials (use `api_credentials=["custom-cred:<host>"]`):
- Devin API — `api.devin.ai` (bearer). Drives the orchestrator workflow (see Section 8). NOTE: Devin's own VM can't reach the VPS, so don't ask Devin to SSH/deploy to the VPS — the assistant does VPS/deploy steps; Devin does code+PR.
- Voyage embeddings — `api.voyageai.com`
- LegiScan — `api.legiscan.com`

Connected services: GitHub, Google Calendar, Google Drive, Finance.

---

## 8. Working with Devin (the orchestrator workflow)

**Shawn is cut out of this loop entirely.** The assistant is the ORCHESTRATOR. Devin writes the code. Shawn only gets involved for risky changes (table drops, secret rotation, infra teardown).

### The loop

1. Assistant writes spec → creates a **Session** (`POST /v1/sessions`)
2. Devin works → assistant monitors, sends follow-up messages to unblock
3. Devin opens a PR
4. CI completes → assistant reviews the diff
5. **All CI green + diff is scope-correct → assistant merges automatically.** No Shawn approval needed.
6. Assistant deploys to VPS, verifies live, updates roadmap.

**No approval step. If it's green and clean, merge it.**

### How to talk to Devin (REST API, confirmed working)

Auth: `api_credentials=["custom-cred:api.devin.ai"]` on the `bash`/`curl` call
(bearer key injected automatically). Base: `https://api.devin.ai/v1`.

- **Always create a Session. Never use Review.**
- **Create a session:**
  ```
  curl -s -X POST https://api.devin.ai/v1/sessions \
    -H "Content-Type: application/json" \
    --data @payload.json
  ```
  `payload.json` = `{"prompt":"<full spec>","idempotent":true,"tags":["fNNN"],"title":"..."}`.
  Returns `{session_id, url, is_new_session}`.
- **Check status:** `curl -s https://api.devin.ai/v1/session/<session_id>`
  → read `status_enum` (`working` | `blocked` | `finished`), `pull_request.url`.
- **Send a follow-up:** `POST https://api.devin.ai/v1/session/<session_id>/message`
  with `{"message":"..."}` — use to unblock or correct.
- **List sessions:** `curl -s "https://api.devin.ai/v1/sessions?limit=N"`.

### What every Devin spec MUST include

1. **Repo + base branch** — `shawnseffernick175/gda-command-v2`, `main` (+ current HEAD).
2. **Exact files/routes to touch** and explicit **OUT OF SCOPE** list.
3. **Definition of done** — exact check commands from `packages/frontend-v3` using DIRECT binaries (NOT npx):
   `node ../../node_modules/typescript/bin/tsc --noEmit`,
   `node ../../node_modules/eslint/bin/eslint.js . --max-warnings 0`,
   `node ../../node_modules/vitest/vitest.mjs run` (+ `--config vitest.contract.config.ts`),
   `npm run build`, and all GitHub CI checks green.
4. **Constraints (house rules):** R1 (every user-facing value carries a clickable SourceRef/SourceLink); R2 forbidden-token scan (no `running`/`pending`/`not_yet_analyzed`/`analysis_status`/`"stale":bool`/`analysis:null`); color lock (6 tokens only, NO gold, no raw hex/box-shadow/gradients/emoji/JetBrains Mono); no nested-heredoc file edits; clean PR off `main`, stage only changed paths.
5. **A report-back request:** branch, PR number, key decisions, files deleted, CI status.

---

## 7. Key canonical docs in `docs/canonical/`

- `north_star_roadmap_v3.md` — the roadmap + master task list (read after this)
- `unified_opportunity_architecture_v1.md` — full F-400 design
- `v3_completion_plan_v4_1.md` — V3 tactical completion plan
- `product_rules.md` — product/UI rules (6-color palette: Pink, Red, Black, Blue, White, Green — NO gold)
- `aesthetics_canonical_v1.md`, `doctrine_to_doors_map.md`, `fast_track_sources_v1.md`, `gda_company_profile_v1.md`

---

**Bottom line for a new chat:** SSH in (Section 1), read `north_star_roadmap_v3.md`, pick up at the next open ticket. Current state as of June 4, 2026 AM: **All 5 phases COMPLETE. F-460 frontend live. F-215 D4 LLM router live.** Frontend at `https://gda.csr-llc.tech` — all pages hit backend-v3 v3 endpoints. Honesty gate enforced (AI panels say "coming soon" until frontend wires them up). GovTribe ✅ (349 rows). GovWin ✅ (50 rows). Devin API ✅. `llm_calls` table exists. Real Claude calls working. **Next: F-453** (tunable Pwin weights UI + wire AI panels to real LLM router — has a DB migration for `pwin_scoring_config`). When sending to Devin: write spec (Section 8), hand off via `POST /v1/sessions` (Session, not Review), monitor, QA, merge when CI green. Assistant does VPS/deploy. Devin writes code. End with a recommendation. Don't make Shawn do anything.
