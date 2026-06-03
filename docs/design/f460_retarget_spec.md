# F-460 RETARGET — Replace live `packages/frontend-v3` with the new Next.js app

## Mission
Replace the live Vite frontend at `shawnseffernick175/gda-command-v2` → `packages/frontend-v3`
with a **brand-new Next.js 16 App Router** application (100% new codebase), configured as a
**static export** so it deploys through the EXISTING Docker/nginx/Traefik path **unchanged**.

The new app source already exists in repo `shawnseffernick175/gda-frontend` @ commit `e74411c`
(PR #41, "F-460 Fresh Next.js App Router rebuild"). Use it as the base. Stack: Next 16 App
Router, TanStack Query, shadcn/base-ui, Tailwind, lucide-react.

## DEPLOY MODE — Static export + keep nginx (NON-NEGOTIABLE)
- Configure `next.config.ts` with `output: 'export'` (+ `images: { unimplemented: true }` or
  `unoptimized: true` as needed for static). App must build to a static `out/` directory.
- **Reuse the existing multi-stage Dockerfile pattern** currently at
  `packages/frontend-v3/Dockerfile`: node build stage → `npm run build` → copy static output →
  `nginx:1.27-alpine` serving on **port 80**. Update the COPY path from `dist/` (Vite) to
  `out/` (Next export). Keep `nginx.conf` for SPA-style routing (serve index, fallback).
- **DO NOT change** `docker-compose.prod.yml` service `frontend-v3`: container name
  `gda-frontend-v3`, all Traefik labels (Host `gda.csr-llc.tech` || `app.csr-llc.tech` ||
  `gda-v3-ui.csr-llc.tech`, tls certresolver `mytlschallenge`, loadbalancer port 80),
  networks `gda` + `traefik`, `n8n_default`.
- Build-time API URL: the Vite app baked `VITE_V3_API_URL=https://gda.csr-llc.tech`. Map this
  to `NEXT_PUBLIC_API_URL` as a build ARG/ENV in the Dockerfile so the compose `args:` block
  keeps working (rename the arg key in compose ONLY if required; prefer accepting both).
- This is an authenticated SPA calling the gda backend API. **No SSR, no Next API routes,
  no server actions.** Pure static.

## CARRY OVER FROM OLD frontend-v3 (must preserve)
- `design-tokens/` — the single design-token source. Port into the new app as the token source.
- `eslint-rules/` — the custom rules enforcing **font floor ≥11px** and **design-token usage**
  (no hardcoded colors/fonts). Wire these into the new app's eslint config; **build must fail**
  if a font <11px or a raw color is used.
- `nginx.conf` — reuse (adjust root to nginx html, SPA fallback).
- Keep workspace wiring: package name `@gda/frontend-v3`, npm workspace build command
  `npm run build --workspace=@gda/frontend-v3` must still work from repo root.

## WHAT TO BUILD — all 12 surfaces, broad in parallel
Scaffold the full app per the master design doc (committed alongside this spec at
`roadmap/gda_command_design_v1.md` — read it). Build ALL 12 surfaces with real nav from day one.
Every surface ships in one of 5 honest states (empty/loading-skeleton/error/partial/success).

### Global chrome (every page)
- Top bar: "Envision" OU badge · Cmd+K search · "+ Add" menu (Opportunity/Risk/Action) ·
  Approvals badge · user menu.
- **Persistent KPI header** (row 2, EVERY tab): Orders · Sales · EBIT · Gross Margin · ROS —
  value + delta vs plan (▲/▼ green/red) + sparkline; `?`/dropdown explainer per KPI. Pulls
  `/kpi/header` (Financial Bible). Single row, never wraps, monospace numerals.
- Left rail (persistent, never hamburger): Launchpad, Fast Track, Opportunities, Capture,
  Pipeline, Awards & Intel, Financial Bible, Action Items, Contacts, Competitors, Risks —
  spacer — Settings — Sentinel health chip pinned bottom.
- Right inspector on detail pages only (320–560px, resizable, persisted).

### Global behaviors (build as shared primitives, used everywhere)
- Lists: sortable (clickable headers, multi-sort Shift, state in `?sort=`), searchable
  (per-list live filter + Cmd+K global), filterable (chips, URL state). Compose together.
- Collapse memory: long lists/sections collapsed on first visit; open-state + scroll position
  remembered via **sessionStorage** (NOT localStorage); reset to collapsed on browser close.
- Source chips: every data point renders a clickable source chip (provenance). Real → real
  chip; heuristic/pending → honest label, NO fake chip.
- Scores: every score/grade/band/pwin has a `?` tooltip (meaning/scale/thresholds/drivers/
  real-vs-heuristic).
- Money: ONE shared `formatMoney()` → `$xxx.xB/M/K` (one decimal). Use everywhere.
- States: every surface handles all 5. Loading = skeleton, NEVER a spinner.
- Keyboard: Cmd+K palette, J/K nav, O open, P promote/advance, G-then-letter goto, `?` help, Esc.
- Flat surfaces, NO top sub-tabs. Exceptions: Settings (left section nav), Financial Bible
  (stacked collapsible sections).

### Stage model (tool-wide)
Active: Interest→Qualify→Pursue→Solicitation→Post-Submittal. Terminal: Won/Lost/No Bid/
Government Cancelled. Global **stage dropdown** wherever an opp appears (one-click, optimistic,
logged who/when/from→to). "Promotion = stage change." Days-in-stage tracked; stalled flagged.

### The 12 surfaces (see design doc §4 for full per-surface spec; summary)
1. **Launchpad** `/launchpad` — 3 stat cards → Top 5 Programs (by capture pwin) → What Needs Me
   Today (flags/approvals inline approve-reject/overdue/proposed-risks) → Recent Signals.
2. **Fast Track** `/fast-track` — discovery feed (academia/research first); 3-layer signal card
   (innovation / auto-suggested gov match / your angle). Backend = F-520 (NOT built yet) →
   PENDING honest state ("activates with the discovery engine").
3. **Opportunities** `/opportunities` + `/opp/:notice_id` — dense table (Title/Agency/Value/
   Grade-Band/Due/Source/stage dropdown), filter chips. Detail = canvas + **OODA inspector**
   (Observe/Orient/Decide/Act) + **Ask AI slide-in** + POC cards→Contacts. Auto Black Hat if
   top-scored. OODA/AskAI/BlackHat → call backend LLM router (`apps/backend-v3/src/lib/
   llm-router.ts` is LIVE).
4. **Capture** `/capture` + `/capture/:opp_id` — OWNS pwin (Shipley drivers), color reviews
   (Pink/Red/Gold/White), RFP shredder, black hat. Promote→Pipeline runs Sentinel gate.
5. **Pipeline** `/pipeline` — operational board, stage dropdown, days-in-stage (⚠ stalled),
   owner, pwin read-only ("—" if none). No separate detail (links to opp/capture).
6. **Awards & Intel** `/awards` — 3 collapsible: AI-generated GovCon news digest (from primary
   sources via LLM router; PENDING honest if not wired) / Our Awards (won-lost) / Competitor
   Activity (FPDS).
7. **Financial Bible** `/financials` — stacked collapsible sections: Summary (5 KPIs) / Contract
   Waterfall (Actual+Funded+pwin-weighted pipeline, Plan overlay) / Pipeline Breakdown /
   Program Table / Plan-vs-Actual. Owns KPI header math. Upload-driven (spreadsheet → parse →
   editable). Visible to everyone.
8. **Action Items** `/action-items` — task table; "Draft with AI" (editable, NEVER auto-sends).
9. **Settings** `/settings/:section` — sidecar: Sources/Partners/OU Tags/Sentinel Rules/Agent
   Preferences/Theme/Health/**User Guide**. User Guide = printable (Print/Export PDF, print
   stylesheet, page numbers), full TOC, leads with 1-page exec summary, explains every tab/tool/
   workflow incl. LIMITATIONS and real-vs-pending. Generated so it can't drift.
10. **Contacts** `/contacts` + `/:id` — auto-populating CRM. Fields: name/role/org/source/
    first-seen/needs-or-capabilities/linked/type/last-activity/notes.
11. **Competitors** `/competitors` + `/:id` — real intel ~10/day, your-space-first, sortable
    S/M/L. List + detail (key facts sourced, head-to-head, FPDS footprint). Feeds opp Orient.
12. **Risks** `/risks` + per-pursuit register — 5×5 cube heat-map, "If…then…" + mitigation
    (→Action Item), approve/disapprove AI risks, pursuit + strategic categories.

### Honesty Gate (CRITICAL — this is the brand)
Every element ships REAL+cited, HEURISTIC+labeled, or PENDING+honest-placeholder. NO BS
sentences, NO fabricated incumbents/competitors/headlines, NO cosmetic "healthy" lights.
Surfaces whose backend isn't built yet (Fast Track/F-520, parts of Awards news) render an
honest PENDING state — never empty, never fake.

### Charts (hard quality gate)
One themed dark-native chart lib. Flat/clean/restrained (Linear/Foundry grade). NO 3D, pie,
gradient fills, drop shadows, chartjunk, rainbow palettes. Honest axes. Visual QA before ship.
Key charts: Financial waterfall, stage funnel + aging, win/loss, 5×5 risk cube heat-map.

### Visual system
Dark theme default. bg #080c14/#0a1428. green #00ff88/#22c55e positive, amber #f59e0b warning,
red #ff4444 critical, cyan #38bdf8 info, purple #aa44ff accent. IBM Plex Mono (data) + IBM Plex
Sans (body). 8px grid, 4px radius, hairline borders (no zebra), 36px rows, ~18–22 rows/viewport.

## DELIVERY
- Work in `shawnseffernick175/gda-command-v2`, branch `f460-frontend-retarget`.
- Replace `packages/frontend-v3/` contents with the new Next.js static-export app (keep the
  workspace package name `@gda/frontend-v3`, the Dockerfile pattern, nginx.conf, design-tokens,
  eslint-rules carried over).
- Verify: `npm ci` at root works; `npm run build --workspace=@gda/frontend-v3` produces `out/`;
  `docker build -f packages/frontend-v3/Dockerfile .` succeeds; eslint font-floor rule trips on
  a <11px violation.
- Open ONE PR against default branch with a clear description + a checklist mapping the 12
  surfaces. Do NOT merge — leave for review.
- If anything is ambiguous, default to the design doc `roadmap/gda_command_design_v1.md`. Do
  not invent data; wire to real backend endpoints where they exist, PENDING-state where not.
