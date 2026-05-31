# F-Govwin — GovWin IQ Connector (OAuth2, company-paid $1.2k/yr)

**Phase:** Track B (Plumbing) — runs parallel with Cognition Layer
**Depends on:** F-301 RAG (sink for GovWin docs), F-302 Decision Memory (consumer of GovWin competitor history)
**Blocks:** F-Opp-Auto-Analysis (incumbent ID + competitive landscape sections), Track D outputs

---

## Objective

Stand up the GovWin IQ connector as a first-class V3 ingest source. Pull opportunities, recompete forecasts, competitor history, and incumbent data. Persist to V3 schema. Feed RAG + Opportunities + Decision Memory. Surface to Sentinel on health.

The codebase already has a GovWin integration skeleton (`apps/backend-v3/src/routes/govwin.ts`, `gov-sources.ts`) and `GOVWIN_CLIENT_ID` in secrets. The prior attempt used `X-Api-Key` header and got HTML back — that's wrong. GovWin IQ uses **OAuth2 client-credentials flow**.

---

## Credentials

- `GOVWIN_CLIENT_ID` — already in VPS secrets
- `GOVWIN_CLIENT_SECRET` — Shawn pastes at deploy. Generated from GovWin IQ → Integration Administration → Authorization Administration.
- Token endpoint: `https://services.govwin.com/neo/v1/auth/token` (verify against Deltek docs at runtime)
- API base: `https://services.govwin.com/neo/v1/` (NOT `iq.govwin.com` — that's the web UI)

Auth flow (client-credentials):
```
POST {token_url}
Content-Type: application/x-www-form-urlencoded
Body: grant_type=client_credentials&client_id=...&client_secret=...
→ { access_token, expires_in, token_type: "Bearer" }
```

Cache token until 60s before `expires_in`; refresh proactively.

---

## Schema (V3)

```sql
-- Existing `opportunities` table gets GovWin-sourced rows with kind='govwin'
-- (kind enum already includes 'govwin' per F-213 canonical list)

-- New: GovWin-specific cache for raw payloads (debugging + reprocessing)
CREATE TABLE govwin_cache (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  govwin_id       text NOT NULL,                      -- Deltek's opp ID
  endpoint        text NOT NULL,                      -- 'opportunities', 'awards', 'forecasts'
  raw_payload     jsonb NOT NULL,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(govwin_id, endpoint)
);
CREATE INDEX govwin_cache_fetched_at ON govwin_cache(fetched_at DESC);

-- New: auth state (single row; tracks current token)
CREATE TABLE govwin_auth_state (
  id              integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token_hash      text,                               -- sha256 of token (never store plaintext)
  expires_at      timestamptz,
  last_refresh_at timestamptz,
  last_error      text,
  CONSTRAINT govwin_auth_singleton CHECK (id = 1)
);
```

`opportunities` rows from GovWin:
- `kind = 'govwin'`
- `source_uri = 'https://iq.govwin.com/neo/opportunity/{govwin_id}'` (deep-link to web UI)
- `agency`, `title`, `naics`, `set_aside`, `due_date`, `posted_date` extracted from payload
- `incumbent` populated from GovWin's incumbent field
- `meta_json` holds the full structured opp (competitors, prior awards, contact moves)

---

## Endpoints to consume (priority order)

1. **`GET /opportunities?modifiedSince=...`** — federal opps, paginated. Poll every 6h.
2. **`GET /opportunities/{id}`** — full detail (competitors, prior awards, contacts). Fetched on-demand when opp is opened in V3.
3. **`GET /awards?modifiedSince=...`** — historical award data for recompete signals. Poll daily.
4. **`GET /forecasts?modifiedSince=...`** — pre-RFP forecasts. Poll daily.
5. **`GET /opportunities/{id}/competitors`** — competitor list per opp (if not in detail response).

Deduplication against SAM.gov: match on `solicitation_number` first, then `(agency, title, due_date)` triple. Govwin row supplements SAM row (incumbent, competitors); does NOT replace.

---

## Cron schedule

| Job | Cadence | Function |
|---|---|---|
| `govwin.opps.poll` | every 6h | Pull modified opps since last run, upsert to `opportunities` + `govwin_cache` |
| `govwin.awards.poll` | daily 03:00 ET | Pull modified awards, upsert to `usaspending_awards` mirror table (or new `govwin_awards` if schema differs) |
| `govwin.forecasts.poll` | daily 04:00 ET | Pull forecasts, upsert to `opportunities` with `stage='forecast'` |
| `govwin.token.refresh` | every 50 min | Refresh access token proactively |

All jobs use V3 cron, NOT n8n. Per Completion Plan: n8n is webhook-only, no agent logic.

---

## API surface (V3 backend)

- `GET /v3/govwin/health` — returns `{ token_valid, expires_in_minutes, last_poll_at, last_error }`
- `POST /v3/govwin/sync?endpoint=opportunities&since=...` — manual trigger (admin only)
- `GET /v3/govwin/opp/:govwin_id` — proxy to live GovWin detail (used by Opp-Auto-Analysis for fresh competitor data)

---

## Sentinel integration

Surfaces in plain language on Launchpad status pill:
- "GovWin auth healthy. Token refreshes in 47 min. Last opps poll 14 min ago."
- "GovWin auth expired 4 hours ago — fix needed." → auto-escalates to Action Item
- "GovWin returned 401 on last poll — credentials may have rotated." → auto-escalates

---

## Acceptance Criteria

### Auth
- [ ] OAuth2 client-credentials flow works against the live API (NOT a mock)
- [ ] Token cached; refreshed at 50min mark
- [ ] Failed auth surfaces to `govwin_auth_state.last_error` AND Sentinel
- [ ] No client_secret ever logged, ever serialized to JSON, ever returned by any endpoint

### Data
- [ ] First `govwin.opps.poll` run pulls ≥100 federal opps and persists to `opportunities` with `kind='govwin'`
- [ ] Every GovWin opp has `source_uri` deep-linking back to iq.govwin.com
- [ ] Deduplication against SAM works: opps existing in both surface once with both `kind` markers visible in detail
- [ ] Incumbent field is populated for ≥80% of GovWin opps (Deltek has this; SAM often doesn't)
- [ ] Competitor list available on `/v3/govwin/opp/:id` detail endpoint
- [ ] `govwin_cache` retained for 30 days (rolling delete)

### Container-level
- [ ] From inside docker network: `curl http://gda-backend-v3:4000/v3/govwin/health` returns valid JSON with `token_valid=true`
- [ ] `curl http://gda-backend-v3:4000/v3/govwin/sync?endpoint=opportunities&dry_run=true` returns row count without writing
- [ ] Cron jobs registered and visible in `cron_runs` table (or whatever V3 uses for cron tracking)
- [ ] Sentinel `/v3/sentinel/sources` includes a `govwin` entry with live `last_run_at` + `health`

### Cognition integration
- [ ] F-301 RAG ingests GovWin opp descriptions (competitor narratives, win themes from prior awards) with `doc_kind='govwin'` and `evidence_grade='B'`
- [ ] F-302 Decision Memory uses GovWin competitor data as a feature in PWin scoring
- [ ] F-300 Agent Runtime has a `govwin_search` tool (query passes through to `/v3/govwin/sync?...` or in-DB search)

### Standing rules
- [ ] No symptom patches; root cause only — if Deltek docs are wrong, file an issue and fix the underlying call
- [ ] Source link on every GovWin row, clickable to iq.govwin.com
- [ ] No `browser_task` to GovWin web UI — API only
- [ ] No V2 code changes

---

## Non-goals
- No GovWin user provisioning (single service account)
- No GovWin write operations (read-only; we don't push data back)
- No GovWin Vision / iAccess layer (just the NEO REST API)

---

## Open question (must answer before merge)
GovWin's API contract docs aren't in our repo. **Devin: before writing code, attempt a real authentication round-trip from the VPS to `services.govwin.com/neo/v1/auth/token` using existing `GOVWIN_CLIENT_ID` + a placeholder secret to validate the endpoint shape. Surface findings in the PR description.** If the endpoint differs (e.g., `iq.govwin.com/oauth/token` vs `services.govwin.com/neo/v1/auth/token`), fix the URL in your implementation before going further.

---

## Devin instructions
- Build behind feature flag `govwin_connector_v1`
- Read `docs/v3-cognition/GDA_V3_Completion_Plan.md` Section 2 (F-Govwin block) for full context
- Tool registry call goes through F-300 — do NOT make govwin_search a stand-alone module
- All findings persist to DB; no in-memory only state
- Open PR with: schema migration, OAuth2 service, opportunity ingest job, health endpoint, Sentinel wiring, integration test
- Integration test must hit the LIVE API with a sandbox credential if Deltek provides one; otherwise document the manual smoke test step in PR description
- Do NOT merge until Shawn says "go"
