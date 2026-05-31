# F-Govtribe — GovTribe Connector (paid API, company-paid, credit-aware)

**Phase:** Track B (Plumbing) — runs parallel with Cognition Layer
**Depends on:** F-301 RAG (sink for GovTribe docs), F-302 Decision Memory (consumer of GovTribe contact + agency intel)
**Blocks:** F-Opp-Auto-Analysis (incumbent + agency intel sections), F-Sentinel (credit budget visibility)

---

## Objective

Stand up the GovTribe connector as a first-class V3 ingest source with **credit-budget awareness**. V3 schema already has `govtribe_cache`, `govtribe_credit_ledger`, `govtribe_credit_monthly` — this ticket wires them properly.

A V1/V2 GovTribe poll workflow existed (`GDA.ingest.govtribe-cron`, superseded by PR #237 direct-poll, ultimately deleted in Cat D cleanup). This ticket builds the V3-native replacement.

---

## Credentials

- `GOVTRIBE_API_KEY` — Shawn pastes at deploy
- API base: `https://api.govtribe.com/v1/` (verify against current GovTribe docs)
- Auth: `Authorization: Bearer {api_key}` (standard; verify per docs)

---

## Schema (V3) — already exists, this ticket wires it

```sql
-- ALREADY IN V3 SCHEMA per session history:
-- govtribe_cache          : raw API responses keyed by endpoint+id
-- govtribe_credit_ledger  : per-call credit cost log
-- govtribe_credit_monthly : aggregated monthly burn

-- Confirm columns; add missing ones via migration if needed:
ALTER TABLE govtribe_cache ADD COLUMN IF NOT EXISTS evidence_grade text DEFAULT 'B';
ALTER TABLE govtribe_credit_ledger ADD COLUMN IF NOT EXISTS request_id uuid;

-- `opportunities` rows from GovTribe:
-- kind = 'govtribe'
-- source_uri = 'https://www.govtribe.com/opportunity/{slug}' (deep-link to web UI)
```

`govtribe_credit_monthly` columns expected (per V1 history):
- `month` (yyyy-mm)
- `credits_used`
- `credits_budget` (configurable; e.g. 5000/month)
- `last_call_at`

---

## Endpoints to consume (priority order)

1. **`GET /opportunities`** — federal opps, paginated. Poll every 8h (less frequent than GovWin to conserve credits).
2. **`GET /opportunities/{id}`** — full detail (contacts, prior awards). Fetched on-demand when opp opened in V3.
3. **`GET /agencies/{id}/contacts`** — CO/COR/PM contact moves. Poll weekly per agency in OU3 target list.
4. **`GET /vehicles/{id}`** — contract-vehicle info (CIO-SP3, RS3, MAPS, etc.). Poll monthly.

Deduplication against SAM + GovWin: match on `solicitation_number` first, then `(agency, title, due_date)` triple. GovTribe row supplements; does NOT replace.

---

## Credit-budget awareness (this is the differentiator)

Every API call:
1. **Pre-check:** `SELECT credits_used, credits_budget FROM govtribe_credit_monthly WHERE month = to_char(now(),'YYYY-MM')`
2. **If burn > 80% of budget:** log to `govtribe_credit_ledger` with `decision='skipped_low_budget'` and return cached data only
3. **If burn > 95%:** halt all non-critical polls; only on-demand opp detail allowed; Sentinel raises CRITICAL
4. **Post-call:** insert row into `govtribe_credit_ledger` with `cost_credits`, `endpoint`, `request_id`, `decision='called'`
5. **End of day:** roll up day's credits into `govtribe_credit_monthly`

Credits per call (defaults; tune from real burn data):
- `GET /opportunities` (list) = 1 credit per page
- `GET /opportunities/{id}` (detail) = 1 credit
- `GET /agencies/.../contacts` = 2 credits
- `GET /vehicles/{id}` = 1 credit

---

## Cron schedule

| Job | Cadence | Function | Credit cost |
|---|---|---|---|
| `govtribe.opps.poll` | every 8h | Pull modified opps since last run | ~3-5 credits |
| `govtribe.contacts.poll` | weekly Mon 05:00 ET | Per-agency contact moves (OU3 target list) | ~20 credits |
| `govtribe.vehicles.poll` | monthly | Vehicle metadata refresh | ~5 credits |
| `govtribe.budget.rollup` | nightly 23:55 ET | Roll day's ledger into monthly aggregate | 0 credits |

All jobs use V3 cron, NOT n8n.

---

## API surface (V3 backend)

- `GET /v3/govtribe/health` — `{ api_reachable, last_poll_at, last_error, credits: { used, budget, pct } }`
- `GET /v3/govtribe/credits` — `{ this_month: {...}, last_3_months: [...], top_endpoints: [...] }` for Sentinel UI
- `POST /v3/govtribe/sync?endpoint=opportunities` — manual trigger (admin only; credit-budget enforced)
- `GET /v3/govtribe/opp/:govtribe_id` — proxy to live GovTribe detail with caching (used by Opp-Auto-Analysis)

---

## Sentinel integration

- "GovTribe at 64% of monthly credit budget — pacing on track. Last opps poll 38 min ago."
- "GovTribe at 87% of budget — 8 days left in month. Restricting to on-demand calls only."
- "GovTribe at 95% of budget — STOPPED auto-polling. Only opp detail on user request."
- "GovTribe API returned 401 on last poll — credentials may have rotated."

All four states render in Launchpad status pill with appropriate severity colors.

---

## Acceptance Criteria

### Auth
- [ ] `GOVTRIBE_API_KEY` reads from env, never logged
- [ ] Failed auth surfaces to `govtribe_cache.last_error` AND Sentinel
- [ ] No key ever serialized to JSON or returned by any endpoint

### Data
- [ ] First `govtribe.opps.poll` run pulls federal opps and persists to `opportunities` with `kind='govtribe'`
- [ ] Every GovTribe opp has `source_uri` deep-linking to govtribe.com
- [ ] Deduplication against SAM + GovWin works (test fixture: same opp in all 3 sources, single row with multi-source attribution)
- [ ] Contact data populates `intel_items` or `gda_contacts` (whichever V3 standardizes on)
- [ ] `govtribe_cache` retained for 30 days (rolling delete)

### Credit-budget enforcement (the critical AC)
- [ ] Every API call writes a `govtribe_credit_ledger` row
- [ ] When `credits_used > 0.8 * credits_budget`, non-critical polls log `decision='skipped_low_budget'` and skip
- [ ] When `credits_used > 0.95 * credits_budget`, all auto-polls halt; only on-demand allowed
- [ ] Daily rollup populates `govtribe_credit_monthly` correctly
- [ ] Sentinel renders credit pct on Launchpad without hitting the API (uses local aggregate)

### Container-level
- [ ] From inside docker network: `curl http://gda-backend-v3:4000/v3/govtribe/health` returns valid JSON with credit pct
- [ ] `curl http://gda-backend-v3:4000/v3/govtribe/sync?endpoint=opportunities&dry_run=true` returns row count without writing or burning credits
- [ ] Cron jobs registered and visible in `cron_runs` table
- [ ] Sentinel `/v3/sentinel/sources` includes a `govtribe` entry with live `credits` block

### Cognition integration
- [ ] F-301 RAG ingests GovTribe opp narratives + contact intel with `doc_kind='govtribe'` and `evidence_grade='B'`
- [ ] F-302 Decision Memory uses GovTribe contact-move signals as a recompete-likelihood feature
- [ ] F-300 Agent Runtime has a `govtribe_search` tool (in-DB; does NOT burn credits)
- [ ] F-300 Agent Runtime has a `govtribe_fetch_live` tool with explicit credit cost annotation that the agent must reason about before calling

### Standing rules
- [ ] No symptom patches; root cause only
- [ ] Source link on every GovTribe row, clickable to govtribe.com
- [ ] No `browser_task` to GovTribe — API only
- [ ] No V2 code changes

---

## Non-goals
- No GovTribe user provisioning (single service account)
- No GovTribe write operations (read-only)
- No GovTribe Pro features unless explicitly in the subscription tier (confirm with Shawn before adding endpoint that costs >5 credits/call)

---

## Devin instructions
- Build behind feature flag `govtribe_connector_v1`
- Read `docs/v3-cognition/GDA_V3_Completion_Plan.md` Section 2 (F-Govtribe block) for full context
- Tool registry calls go through F-300 — do NOT make govtribe_search a stand-alone module
- All findings persist to DB; no in-memory only state
- Open PR with: schema migration (only ADD COLUMN — tables already exist), API client, ingest job, credit-budget logic, health endpoint, Sentinel wiring, integration test
- Integration test must hit a sandbox or use a small live test budget (≤10 credits); document burn in PR description
- Do NOT merge until Shawn says "go"
