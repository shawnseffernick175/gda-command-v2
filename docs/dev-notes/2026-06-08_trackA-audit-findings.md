# Track A "Make It Work" — Live Code Audit Findings
Date: 2026-06-08 | Auditor: orchestrator | main HEAD cc54f9f (VPS deployed)
Rule: take notes, do NOT hot-patch live. One consolidated Devin spec at the end.

---

## AUDIT AREA 1 — Stage Taxonomy (DONE) — ROOT CAUSE FOUND

### The user complaint
"I click Qualified and it doesn't send it there." Stage tabs look empty; cards don't move.

### What's actually live (verified in DB on VPS 2026-06-08)
- `opportunities`: **10,523 rows, status = 'discovery' for ALL of them** (single value).
- `pipeline_items`: **ONLY 1 row total** (stage='no_bid' — that's a leftover test write from a prior session).
- `opps_with_pipeline_row` = **1**. So 10,522 real opps have NO pipeline_items row.

### The THREE conflicting stage taxonomies (this is the core disease)
1. **`pipeline_items.stage`** enum: `qualifying, pursuit, proposal, submitted, evaluation, won, lost, no_bid`
   (lib/pipeline-stage.ts VALID_ENUMS). This is where the UI stage tabs + STAGE_DISPLAY read/write.
2. **`opportunities.status`**: free-string; ingest sets ALL to `'discovery'`. The `POST /v3/opportunities/:id/qualify` endpoint sets it to `'qualified'`. NOTHING reconciles status with pipeline_items.stage.
3. **`opportunities.lifecycle_stage`** enum: `signal, forecast, pre_sol, solicitation, awarded, post_award, closed` (db/types/opportunity.ts). Used by `/v3/opportunities/unified` (F-411), launchpad, ingest adapters, matching. Completely separate vocabulary from #1.

   → These map to the user's LOCKED canonical stages NOWHERE consistently. User's canonical = Interest → Qualify → Pursue → Solicitation → Post-Submittal (+Won/Lost/No Bid/Gov Cancelled).

### Label ↔ key ↔ enum chain (lib/pipeline-stage.ts)
- Frontend STAGE_TABS keys = raw enums: `qualifying→"Interest", pursuit→"Qualified", proposal→"Capture", submitted→"Proposal", won→"Won"`.
- Frontend STAGE_ACTIONS sends LABELS capitalized: Qualify→`stage:"Qualified"`, Start Capture→`"Capture"`, etc.
- Backend `normalizePipelineStage("Qualified")` → LABEL_TO_ENUM["qualified"] = **`pursuit`**. (So "Qualified" label maps to `pursuit` enum, displayed back as "Qualified". Confusing but internally consistent.)

### Why the WRITE works but the SCREEN looks broken
- PATCH `/v3/opportunities/:id` with `{stage}` → `updateOpportunity()` → normalizes → upserts a `pipeline_items` row. **This works** (verified 200 + DB write in prior session).
- BUT the list `stage` tab filter (services/opportunities/index.ts:472-476) is:
  `EXISTS(SELECT 1 FROM pipeline_items pi2 WHERE pi2.opportunity_id=o.id AND pi2.stage = $N)` — **raw `filters.stage`, NOT normalized.** Frontend tab keys are raw enums so this matches — OK for tabs. But because only 1 pipeline_items row exists in the whole DB, **every stage tab is empty.** Clicking a tab shows nothing → "it doesn't send it there."
- Detail view `currentStage` (page.tsx:978): `pipeline_stage ? STAGE_DISPLAY[pipeline_stage] : null ?? opp.stage ?? "Interest"`. Since pipeline_stage is null, it ALWAYS shows "Interest". After a qualify PATCH + invalidate it would flip — but the user perceives no movement because the LIST tab is still empty and there's no optimistic update.
- **DEAD CODE**: `POST /v3/opportunities/:id/qualify` (writes status='qualified', NO pipeline_items) is NEVER called by the frontend. The qualify service (services/opportunities/index.ts:718) is orphaned. So `status` and `pipeline_items.stage` permanently diverge.

### FIX DIRECTION (for spec, not applied)
1. Collapse to ONE stage model aligned to user's canonical stages. Recommend: make `pipeline_items.stage` (or a single `opportunities.stage` column) the single source of truth; deprecate the orphan `/qualify` status path OR make it ALSO write pipeline_items.
2. Backfill: every opportunity needs a default stage (Interest) so tabs aren't empty. Either (a) ingest creates a pipeline_items row at 'qualifying'/Interest, or (b) treat "no pipeline row" as Interest in the LIST query (LEFT JOIN + COALESCE), and add an "Interest/unstaged" tab that catches null.
3. Normalize `filters.stage` through normalizePipelineStage in the list query (defensive).
4. Add optimistic update on updateStage so the card visibly moves immediately.
5. Reconcile to canonical labels: Interest, Qualify, Pursue, Solicitation, Post-Submittal, Won, Lost, No Bid, Government Cancelled. Current enum is missing Pursue/Solicitation/Post-Submittal/Gov-Cancelled.

---

## AUDIT AREA 2 — Analysis Worker "spins forever / no analysis" (DONE) — ROOT CAUSE FOUND

### User complaint
"AI analysis running…" spins forever; "doesnt even show if it is thinking"; "just a search and putting results / zero analysis."

### Architecture (verified)
- Worker runs IN-PROCESS inside gda-backend-v3 (server.ts:25 `startWorker()`). NOT a separate compose service. So a backend restart restarts the worker AND re-runs the boot backfill (server.ts:50 backfillAnalysis — enqueues up to 500 missing/stale every boot).
- pg-boss queue ANALYSIS_OPPORTUNITY, batchSize 10 (analysis.ts:889-891).
- analyze route (opportunities.ts:774): enqueue → `waitForAnalysis(timeoutMs=20000, pollMs=100)` → if fresh return 200 detail, else 202 {queued:true}.

### LIVE state (DB on VPS 2026-06-08 ~18:00 UTC) — the smoking guns
- pgboss.job ANALYSIS_OPPORTUNITY: **created=19,883, active=30, completed=290.**
- The **30 `active` jobs are ZOMBIES** — stuck since 00:41–00:49 UTC (>17h). pg-boss `expireInHours:1` did not reclaim them; worker restart (GovTribe env restarts) orphaned them. They occupy worker slots / singletonKeys.
- **19,883 `created`** backlog (oldest 2026-06-07 19:55). Each boot adds 500 (backfill) + 6-hourly sweeps add 500 each. Queue grows faster than it drains.
- opps: total=10,523; analysis IS NOT NULL=**9,979**; grade NOT NULL=**1,595**; with real `llm_analysis`=**only 686**.
- `llm_error_kind` empty for all 9,979 — but logs over 15 min show ONLY deterministic pwin writes (no llm_analysis content, no LLM-fail lines). So the bulk path writes the **deterministic stub** (pwin + canned competitors/blackhat/wargame strings), NOT real agentic LLM analysis. THIS is "zero analysis / just search results."

### Root causes (distinct bugs)
1. **TIMEOUT TOO SHORT**: ANALYSIS_TIMEOUT_MS=20000 (config default 20s; compose default 20s) but config-guard.ts:29 itself warns real LLM latency is 24–47s. So manual Analyze almost ALWAYS times out → 202 queued. (Guard only errors below 15s, so 20s passes the guard but is still too short.)
2. **FRONTEND GIVES UP**: useAnalyzeOpportunity (use-opportunities.ts:202-209) on 202 invalidates ONCE after 5s, then stops. No spinner/"thinking" state, no repeated poll. With 25-40s real latency + 19,883-job backlog, the single 5s refetch shows nothing → spins forever silently.
3. **ZOMBIE ACTIVE JOBS**: 30 jobs stuck `active` 17h+. Need pg-boss expiration/reclaim or a startup sweep to reset orphaned active→created. They hold singletonKey `opp-<id>` so re-enqueue for same opp is suppressed.
4. **BACKLOG EXPLOSION**: every backend restart enqueues 500 backfill; sweeps add more; worker batchSize 10 can't keep up. A manual user Analyze sits behind 19,883 jobs (priority 1 for detail-endpoint helps, manual='manual' priority 5 — still behind 'created' high-priority backfill at priority 10? NOTE pg-boss priority: higher number = higher priority, so backfill priority:10 OUTRANKS manual priority:5 and detail priority:1 — user's manual click is LOWEST priority. BUG.)
5. **DETERMINISTIC-ONLY DOMINATES**: only 686/9,979 have real LLM analysis. Either LLM calls are being skipped, erroring silently (caught at analysis.ts:500), or auto-no-bid/auto-pass short-circuits the LLM (analysis.ts:464 skips LLM entirely for auto-No-Bid <30day). Many opps are auto-pass/no-bid → never get LLM. User perceives "no analysis."

### FIX DIRECTION (for spec)
1. Raise ANALYSIS_TIMEOUT_MS to ~50–60s (env + compose default), OR make analyze fully async: return 202 immediately + a job-status endpoint, and have the frontend POLL with a visible "Analyzing… (thinking)" state until done/failed.
2. Frontend: replace one-shot 5s refetch with a real poll loop (e.g., poll opportunity every 3s up to 90s) + show progress/thinking indicator + surface llm_error_kind on failure.
3. Fix pg-boss priority inversion: manual/detail user-triggered analyses must OUTRANK backfill/sweeps (give user actions the HIGHEST priority number; lower backfill to e.g. 1).
4. Startup reclaim: reset orphaned `active` jobs older than N min back to `created` (or rely on pg-boss expiry — verify expireInHours actually fires; it isn't).
5. Throttle backfill: don't re-enqueue 500 every boot if a large backlog already exists; or dedupe against existing `created` jobs.
6. Decide product intent: should auto-pass/no-bid opps still get LLM narrative? User wants analysis everywhere. Likely YES for ones the user manually opens, even if graded pass.


## AUDIT AREA 3 — Doctrine UUID-vs-Integer Hard Error (DONE) — ROOT CAUSE FOUND + MIGRATION INTEGRITY BUG

### User complaint
Doctrine check hard-errors: integer opportunity IDs wired into a UUID field → "invalid input syntax for type uuid".

### Confirmed LIVE (VPS DB 2026-06-08)
- `doctrine_evaluations.entity_id` = **uuid**
- `agent_decisions.entity_id` = **uuid**
- `agent_decisions.opportunity_id` = **uuid**
- opportunities.id is BIGSERIAL integer. So POST /v3/doctrine/check or /override with entity_id="73073" → INSERT into a uuid column → 500 hard error. CONFIRMED still broken.

### The fix EXISTS but was NEVER EXECUTED — and the tracker LIES
- `db/v3/migrations/v3_043_doctrine_integer_ids.sql` (F-602) does exactly the right thing: ALTER these 3 columns UUID→TEXT.
- v3_schema_migrations shows v3_043 RECORDED as applied (id 291, 2026-06-06 02:04:19) — **but the columns are still uuid.** The ALTER never ran; the row was seeded as "applied" without execution.

### WHY (the deeper migration-integrity bug)
- migrate.js (lib/migrate.ts:22) reads `MIGRATIONS_DIR = apps/backend-v3/migrations/` — that's the ONLY dir the runner executes.
- v3_043 does NOT exist in `apps/backend-v3/migrations/` (that dir's 04x range only has v3_048). It exists ONLY in `db/v3/migrations/`.
- **TWO divergent migration directories**: `apps/backend-v3/migrations/` (45 files, the runner's dir) vs `db/v3/migrations/` (60 files). **31 migrations live in db/v3/migrations that are NOT in the runner dir** (full list in audit notes), including v3_043. The bootstrap seed (migrate.ts:113-136) recorded historical filenames as already-applied into pgmigrations/v3_schema_migrations WITHOUT running their SQL — so the tracker shows them applied while the schema change never happened.
- Net: any migration that exists only in db/v3/migrations and was added after the canonical dir diverged is silently skipped, but may appear "applied."

### FIX DIRECTION (for spec)
1. **Immediate data fix** (orchestrator can apply directly, low-risk additive ALTER): run v3_043's 3 ALTER ... TYPE TEXT statements on the live DB so doctrine stops erroring. (ALTER TYPE TEXT is safe/idempotent.)
2. **Reconcile the two migration dirs**: make `apps/backend-v3/migrations/` the single source of truth (or symlink db/v3/migrations → it). Copy the 31 missing files in, verify each is either truly applied (schema matches) or run it.
3. **Trust-but-verify the tracker**: add a CI/startup assertion that spot-checks critical column types (e.g., doctrine entity_id is TEXT) rather than trusting the applied-row.
4. Confirm no OTHER "applied but not executed" migrations changed schema that the live DB lacks (audit the 31).


## AUDIT AREA 4 — Ingest Funnel (DONE) — ROOT CAUSE FOUND

### User complaints
"Irrelevant opps entering ingest; no NAICS/set-aside pre-filter." "Anything less than 30 [days] goes directly to pass."

### LIVE funnel numbers (VPS DB 2026-06-08, total 10,523 active opps)
- **in Envision NAICS: ONLY 497 (4.7%).** 95% of the DB is OFF-profile and entered anyway.
- naics NULL: **2,156** (can't be NAICS-filtered; `naics = ANY()` excludes NULLs so they're hidden from default list but still ingested + analyzed).
- due in <30 days (future): **5,880 (56%)** — should auto-pass per standing rule.
- past due: **1,059** — dead records still active.
- no due date: **2,931.**
- grade: null=8,928, F=940, D=472, C=159, B=24, A=0. (8,928 ungraded = analysis backlog hasn't reached them.)

### Root causes
1. **NO ingest-time relevance gate.** `ingest/framework/source_writer.ts` upserts EVERY record (ON CONFLICT on sam_notice_id / data_source+external_id). No NAICS check, no set-aside check, no deadline check before INSERT. (Verified: no relevance/naics/skip logic in source_writer before the INSERT.)
2. **Relevance filter is READ-time only.** services/opportunities/index.ts:287-291 + 458-459 apply `naics = ANY(ENVISION_NAICS)` only when listing with relevantOnly!=false. So junk is hidden from the default list but: (a) bloats the DB, (b) consumes the analysis worker (95% of the 19,883-job backlog is off-profile), (c) NULL-NAICS opps slip the filter logic entirely.
3. **30-day rule is applied at ANALYSIS time, not ingest.** workers/analysis.ts:445 AUTO_NO_BID_DAYS_THRESHOLD=30 → sets grade F + recommendation 'No Bid' + SKIPS LLM. Plus pwin band 'pass' for insufficient_lead_time (seen in logs: days_to_due 20/16/8 → band:pass, grade F). So <30-day items ARE auto-passed — but only AFTER being ingested and queued for analysis. The user wants them gated at the FRONT so they never clog the funnel.
4. ENVISION_NAICS (constants/envision-naics.ts) is the canonical 22+ code list from SAM CAGE 4JB87 — good single source of truth. set-aside fit list (ENVISION_SET_ASIDES in analysis.ts:64) is SEPARATE and smaller — should be unified.

### FIX DIRECTION (for spec)
1. Add an **ingest-time relevance gate** in source_writer (or per-adapter mapper): before upsert, evaluate NAICS ∈ ENVISION_NAICS (with NULL handling), set-aside fit, and deadline ≥30 days. Records failing → either (a) skip entirely, or (b) insert with status='auto_pass'/grade F and DO NOT enqueue analysis. (User intent: <30 days = directly pass, don't analyze.)
2. Don't enqueue analysis for auto-pass/off-profile opps — frees the worker to analyze the ~497 relevant ones well.
3. Handle NULL-NAICS explicitly (don't silently hide; either enrich NAICS or route to a review bucket).
4. Purge/archive 1,059 past-due active records.
5. Unify set-aside fit into one constant alongside ENVISION_NAICS.


## AUDIT AREA 5 — Federal Org Hierarchy (DONE) — ROOT CAUSE FOUND

### User complaint
Flat "DEPT OF DEFENSE" view. Wants Department → Agency → Office → Contracting Office hierarchy.

### LIVE schema + data (VPS DB 2026-06-08)
Columns on opportunities: `agency` (text), `department` (text), `sub_agency` (text), `agency_subtype` (text). NO office / contracting_office column. NO agency hierarchy/reference table (only *_agency_sources citation tables).

The columns are SEMANTICALLY SCRAMBLED, but the data is actually RICH:
- `department` = raw SAM numeric code (097, 017, 070, 036, 013…). 169 distinct "departments" incl. numeric codes + 'arXiv' (600). mapAgencyToDepartment (lib/departmentMap.ts, F-606) is NOT being applied to SAM rows — they keep the code.
- `agency` = the ACTUAL top-level Department NAME ("DEPT OF DEFENSE", "VETERANS AFFAIRS, DEPARTMENT OF", "HOMELAND SECURITY, DEPARTMENT OF"). Mislabeled — this column holds the Department.
- `sub_agency` = the FULL slash-delimited hierarchy path crammed into ONE string, e.g.:
  `DEFENSE LOGISTICS AGENCY / DLA MARITIME / DLA MARITIME COLUMBUS / DLA LAND AND MARITIME`
  `DEPT OF THE NAVY / NAVSUP / NAVSUP WEAPON SYSTEMS SUPPORT / NAVSUP WSS MECHANICSBURG / …`
  This already CONTAINS Agency → Office → Contracting Office — just unparsed.
- nulls: agency 156, department 309, sub_agency 913.

### Key insight
The hierarchy the user wants is ALREADY in the SAM ingest data — it's just dumped into a flat `sub_agency` string and the column meanings are wrong (department=code, agency=dept name). This is a normalization/parsing problem, not a missing-data problem.

### FIX DIRECTION (for spec)
1. Re-map columns to true semantics: Department (from agency name or code→name via departmentMap), Agency (1st segment of sub_agency path), Office (middle segments), Contracting Office (last segment). Parse the slash-delimited sub_agency into levels.
2. Add explicit columns: `department_name`, `agency_name`, `office`, `contracting_office` (keep raw `sub_agency` for provenance).
3. Fix departmentMap to translate SAM numeric codes (097→Dept of Defense, 070→DHS, 036→VA, 013→Commerce, 017/021/057 also DoD branches) — extend DEPARTMENT_RULES with a code map.
4. Frontend: render a drill-down tree (Department → Agency → Office → Contracting Office) instead of the flat agency string; make each level filterable/clickable (ties to Track B clickability).
5. Exclude non-federal sources (arXiv/NSF/NIH research) from the federal org tree or give them their own grouping.


## AUDIT AREA 6 — Clickability Gaps (DONE) — SCOPED FOR TRACK B (P1, lighter touch)

### User complaint
"Things that look clickable aren't." Sources, KPIs, agencies, entities should drill down/filter or open; many are dead.

### Confirmed dead clicks / missing drill-downs (verified in frontend-v3 src @ cc54f9f)

1. **SourceChip dead state** (components/shared/source-chip.tsx:21-22, 42-48): kind="real" ALWAYS renders `cursor-pointer` + hover styling, but only the `url && kind==="real"` branch (line 29) is an actual `<a>`. When `url` is null/missing, it falls through to a plain `<span>` (line 42) that STILL shows `cursor-pointer` → looks clickable, does nothing. FIX: only apply cursor-pointer/hover when url present; otherwise non-interactive style.

2. **Launchpad StatCard dead click** (app/launchpad/page.tsx:477-495, used at 101/108/115): the metric Card renders `cursor-pointer hover:border-gda-green/40` but has NO onClick and NO Link. Pure display dressed as interactive. FIX: either remove cursor-pointer/hover, or wire each StatCard to navigate to the filtered list it represents (e.g., "Signals" → /opportunities?stage=...).

3. **Agency / Department NOT clickable anywhere** (OpportunityCard.tsx:83-86 Badge; opportunities/page.tsx:727, 824, 1028 span/Badge): agency renders as plain text/Badge in card AND detail. There IS an agencyFilter on the list (opportunities/page.tsx:170,186,346), so a click-to-filter is trivially wireable but NOT wired. This is the org-hierarchy clickability the user wants (ties to Area 5): clicking Department→Agency→Office→Contracting Office should filter the list. Currently zero of these are clickable.

4. **Entity references in opp detail are not links** (opportunities/page.tsx — grep for contact/competitor/incumbent/awardee returned ZERO onClick/href/Link): incumbent/awardee, competitors, and contacts shown on an opportunity do not cross-link to their /competitors, /contacts, or USAspending pages. Dead text where the user expects navigation.

5. **CompetitorDetailPanel** (components/CompetitorDetailPanel.tsx): only the close button (88) and ONE USAspending external link (216) are interactive. The competitor's listed opportunities/contacts/NAICS are not clickable to drill into those entities.

### Surfaces that ARE correctly wired (no change needed — documented to avoid wasted work)
- KPI header numbers → Link to /financials (kpi-header.tsx:114-119) ✓; `?` info popover works ✓.
- Competitors table rows (competitors/page.tsx:135 onClick→setSelectedCompetitor) ✓.
- Contacts table rows (contacts/page.tsx:522 onClick→onToggleExpand) ✓.
- Awards filter buttons (awards/page.tsx:368 button+onClick) ✓ and award accordion (417 onToggle) ✓.
- OpportunityCard title → Link to /opportunities?id= ✓.
- SourceChip WITH url → real external `<a>` ✓.

### FIX DIRECTION (Track B spec — lighter than Track A)
1. SourceChip: gate cursor-pointer/hover on url presence; render dead sources as plainly non-interactive (or show "no link" affordance). Audit all SourceChip call sites for which sources legitimately have no URL.
2. StatCards (launchpad + any other metric tiles): either make them navigate to their filtered view, or strip the interactive styling. Prefer navigate (user wants drill-down).
3. Make agency/department/office/contracting-office CLICKABLE everywhere they appear (card Badge, detail) → set the list agencyFilter (or new org-level filters from Area 5 parsing) and route to /opportunities. This is the single highest-value clickability fix and pairs with Area 5.
4. Cross-link entity references in opp detail: incumbent/awardee → /competitors?name= or USAspending; contacts → /contacts?id=; competitors → competitor panel.
5. CompetitorDetailPanel: make listed opps/contacts/NAICS clickable to their respective views.
6. GLOBAL RULE for the spec: nothing should carry `cursor-pointer`/hover-affordance unless it has a real handler or href. Add a lint/convention so dead clicks don't reappear.

### Priority note
Area 6 is Track B (P1, post-Track-A). Items #1 (SourceChip) and #2 (StatCard) are trivial cosmetic-correctness fixes. Item #3 (agency/org clickable) is the high-value one and should be bundled with the Area 5 org-hierarchy work since it depends on the parsed columns.

---

## AUDIT COMPLETE — all 6 areas done. Next: consolidate to ONE Devin spec (Track A = areas 1-5 P0; Area 6 = Track B P1).
