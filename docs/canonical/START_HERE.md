# START HERE — GDA Command Bootstrap

**If you are an AI assistant in a new chat: read this whole file first. It loads you with everything you need. Do NOT re-ask the user for any of this.**

Last verified: June 1, 2026. Owner: Shawn Seffernick, CTO, Envision-IS (emerging defense / DoD contracting), Alexandria VA.

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

---

## 4. What's NEXT (the build order)

- **Phase 2 — Unified API (✅ COMPLETE):** ✅ F-410 unified detail (`GET /v3/opportunities/unified/:internal_id`) · ✅ F-411 stage filter (`GET /v3/opportunities/unified?stage=`) · ✅ F-412 suggestion queue (`GET/POST /v3/match-suggestions`) · ✅ F-413 field override + audit (`PUT /v3/opportunities/:internal_id/field-override`). All live on backend-v3.
- **Phase 3 — Unified UI (IN PROGRESS):** ✅ F-420 unified detail page (route `/unified/:internal_id`, PR #637, live) → ✅ F-420a connect-the-data (per-field source URLs in F-410 + unified analyze endpoint, clickable SourceLinks + auto-analysis for R1/R2, PR #639, live) → ✅ F-421 tab structure (say-something surfaces) — tabbed unified list at `/unified`, stage-group filters, R1 source links on every value, PR #641, live → **F-422 suggestion review UI sidebar = NEXT** → F-423 decommission old per-source pages.
- **Phase 4 — Fast Track adapters:** F-430 NSF, F-431 SBIR, F-432 SAM Sources Sought/Pre-Sol, F-433 DoD RSS, F-434 NIH RePORTER, F-435 arXiv+USAspending, F-436 signal scoring, F-437 doctrine badge.
- **Phase 5 — Hardening + analytics:** F-440 LOW-confidence matcher, F-441 conversion funnel, F-442 audit log, F-443 bulk review.

**The single canonical roadmap lives at `docs/canonical/north_star_roadmap_v3.md`.** That file has the full master task list with done/todo status. Read it after this one.

---

## 5. Shawn's only recurring manual step

DNS for new subdomains. `gda-mcp.csr-llc.tech` is already done. If a new subdomain is stood up, he adds a Hostinger DNS A record → `187.77.206.105`. Everything else is on autopilot.

---

## 6. Credentials available to the assistant

Custom credentials (use `api_credentials=["custom-cred:<host>"]`):
- Devin API — `api.devin.ai` (bearer). NOTE: Devin can't reach the VPS; don't route VPS work through it.
- Voyage embeddings — `api.voyageai.com`
- LegiScan — `api.legiscan.com`

Connected services: GitHub, Google Calendar, Google Drive, Finance.

---

## 7. Key canonical docs in `docs/canonical/`

- `north_star_roadmap_v3.md` — the roadmap + master task list (read after this)
- `unified_opportunity_architecture_v1.md` — full F-400 design
- `v3_completion_plan_v4_1.md` — V3 tactical completion plan
- `product_rules.md` — product/UI rules (6-color palette: Pink, Red, Black, Blue, White, Green — NO gold)
- `aesthetics_canonical_v1.md`, `doctrine_to_doors_map.md`, `fast_track_sources_v1.md`, `gda_company_profile_v1.md`

---

**Bottom line for a new chat:** SSH in (Section 1), read `north_star_roadmap_v3.md`, pick up at the next open ticket (Phase 2 is COMPLETE — next is **Phase 3 Unified UI — F-420 detail page + F-420a connect-the-data + F-421 tab structure DONE+live; next is F-422 suggestion review sidebar**), do the work, open a clean PR, wait for Devin Review to post, fix any legit findings, merge when Devin is resolved and CI is green. End with a recommendation. Don't make Shawn do anything but approve.
