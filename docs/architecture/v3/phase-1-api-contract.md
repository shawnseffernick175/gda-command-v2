# Phase 1 — V3 API Contract

**Program:** Backend V3 rebuild — F-V3-PROGRAM tracker (#384)
**Phase:** 1 — Design
**Date:** 2026-05-29
**Author:** Devin (automated design)
**Status:** Draft — awaiting human sign-off before Phase 2

> **Gate:** No Phase 2 code may be written until this document and its companion
> `openapi-v3.yaml` receive explicit sign-off from @shawnseffernick175.

---

## 1. Conventions

### 1.1 Binding scope

GDA Command is **Envision-only** (single-tenant). There is no `ou_tag` query
parameter on any V3 endpoint. All records are implicitly scoped to Envision.
Partners (Riverstone, PD Systems) appear only as teaming attachments on
Envision-owned records — they are not browsable entities.

### 1.2 Response envelopes

V3 preserves the **GDA Envelope** from V2. The frontend currently consumes
`success`, `data`, `meta`, and `error` — V3 keeps those four fields and drops
`workflow`, `action`, and `dryRun` (legacy gateway fields that the frontend
never reads). This is the only shape change.

#### Success envelope

```jsonc
{
  "success": true,
  "data": { /* endpoint-specific payload */ },
  "meta": {
    "generatedAt": "2026-05-29T16:00:00.000Z",
    "source": "v3",
    "requestId": "req_abc123"
  }
}
```

#### Error envelope

```jsonc
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title is required",
    "detail": null
  },
  "meta": {
    "generatedAt": "2026-05-29T16:00:00.000Z",
    "requestId": "req_abc123"
  }
}
```

#### Standard error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Request body or query params invalid |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT / webhook key |
| `FORBIDDEN` | 403 | Valid auth but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate or state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unhandled server error |
| `DB_UNAVAILABLE` | 503 | Database not reachable |

### 1.3 Authentication

All endpoints except `/api/v3/health`, `/api/v3/ready`, and `/api/v3/version`
require a **JWT Bearer token** in the `Authorization` header:

```
Authorization: Bearer <jwt>
```

Webhook endpoints (`/api/v3/webhooks/*`) authenticate via the
`x-gda-key` header (shared secret from `GDA_WEBHOOK_KEY` env var),
matching the V2 pattern.

### 1.4 Pagination

All list endpoints use **cursor-based** pagination:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | 50 | Items per page (max 200) |
| `cursor` | string | — | Opaque cursor from previous response |

Response includes pagination metadata:

```jsonc
{
  "data": {
    "items": [ /* ... */ ],
    "pagination": {
      "limit": 50,
      "cursor": "eyJpZCI6MTAwfQ==",
      "hasMore": true
    }
  }
}
```

**Compatibility note:** V2 uses offset-based pagination (`page` / `per_page`).
The frontend will switch to cursor-based at cutover. Until then, the V3 gateway
can accept `page` + `per_page` and translate internally, returning both
`pagination` (new) and `total` + `page` + `per_page` (legacy) in `data`.

### 1.5 R1 — Source citations

**Product Rule R1:** every data point has a searchable source.

For every sourced field `<field>`, the response includes a sibling
`<field>_sources` array:

```jsonc
{
  "title": "Army RS3 Task Order 47",
  "title_sources": [
    {
      "kind": "sam_gov",
      "title": "SAM.gov Opportunity W52P1J-26-R-0047",
      "url": "https://sam.gov/opp/abc123/view",
      "retrieved_at": "2026-05-29T10:00:00.000Z"
    }
  ]
}
```

**Acceptable source kinds:** `sam_gov`, `fpds`, `usaspending`, `govwin`,
`news`, `doctrine`, `partner_site`, `internal`.

Fields without a valid source are **omitted** from the response per R1.
Meta fields (`id`, `created_at`, `updated_at`, `status`) are always preserved.

### 1.6 R2 — Auto-analysis

**Product Rule R2:** analysis is automatic on opportunity open.

Every **detail** endpoint (e.g. `GET /api/v3/opportunities/:id`) automatically
triggers full analysis (pwin, incumbent, competitors, blackhat, wargame,
timeline). There is **no** separate `/analyze` or `/run-analysis` endpoint.

Results are cached on `(record_id, record.updated_at)`. Re-analysis is
silent and runs in the background when the cached analysis is stale.

The detail response includes an `analysis` block:

```jsonc
{
  "data": {
    "id": "opp_123",
    "title": "Army RS3 TO 47",
    "title_sources": [ /* ... */ ],
    "analysis": {
      "pwin": 0.72,
      "pwin_sources": [ /* ... */ ],
      "incumbent": "CACI International",
      "incumbent_sources": [ /* ... */ ],
      "competitors": [ /* ... */ ],
      "competitors_sources": [ /* ... */ ],
      "timeline": { /* ... */ },
      "timeline_sources": [ /* ... */ ],
      "generated_at": "2026-05-29T10:05:00.000Z",
      "stale": false
    }
  }
}
```

### 1.7 Rate limits

| Endpoint group | Limit | Window |
|---------------|-------|--------|
| List / detail endpoints | 120 req | 1 min |
| Mutation endpoints (POST/PATCH) | 30 req | 1 min |
| Webhook endpoints | 60 req | 1 min |
| System endpoints (health/ready/version) | 300 req | 1 min |

Rate limit headers are returned on every response:

```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 117
X-RateLimit-Reset: 1748535660
```

---

## 2. Endpoint summary table

| # | Method | Path | Purpose | R1 sources | R2 auto-analysis |
|---|--------|------|---------|------------|------------------|
| 1 | GET | `/api/v3/opportunities` | List opportunities (filterable, paginated) | Yes — all fields | — |
| 2 | GET | `/api/v3/opportunities/:id` | Opportunity detail | Yes — all fields | Yes |
| 3 | POST | `/api/v3/opportunities` | Create opportunity (manual entry) | — | — |
| 4 | PATCH | `/api/v3/opportunities/:id` | Update opportunity | — | — |
| 5 | POST | `/api/v3/opportunities/:id/qualify` | Qualification action | — | — |
| 6 | GET | `/api/v3/pipeline` | List active captures with win prob | Yes — all fields | — |
| 7 | POST | `/api/v3/pipeline` | Promote opportunity to pipeline | — | — |
| 8 | PATCH | `/api/v3/pipeline/:id` | Update win prob, milestones, teaming | — | — |
| 9 | GET | `/api/v3/captures` | List captures | Yes — all fields | — |
| 10 | GET | `/api/v3/captures/:id` | Capture detail with compliance matrix | Yes — all fields | Yes |
| 11 | POST | `/api/v3/captures` | Create capture from pipeline item | — | — |
| 12 | PATCH | `/api/v3/captures/:id` | Update stage, notes, pricing | — | — |
| 13 | GET | `/api/v3/action-items` | List action items (filterable) | Yes — all fields | — |
| 14 | POST | `/api/v3/action-items` | Create action item | — | — |
| 15 | PATCH | `/api/v3/action-items/:id` | Update action item | — | — |
| 16 | POST | `/api/v3/action-items/:id/drafts` | Request LLM draft | — | — |
| 17 | GET | `/api/v3/launchpad/summary` | Today-actionable counts | — | — |
| 18 | GET | `/api/v3/launchpad/flags` | Active flags list | Yes — all fields | — |
| 19 | GET | `/api/v3/partners/:id` | Partner facts for teaming context | Yes — all fields | — |
| 20 | GET | `/api/v3/sources/:id` | Resolve source by ID | — | — |
| 21 | POST | `/api/v3/webhooks/sam-opportunity` | n8n posts SAM.gov findings | — | — |
| 22 | POST | `/api/v3/webhooks/fpds-award` | n8n posts FPDS award data | — | — |
| 23 | POST | `/api/v3/webhooks/email-action-item` | n8n posts email-derived action items | — | — |
| 24 | GET | `/api/v3/health` | Liveness probe | — | — |
| 25 | GET | `/api/v3/ready` | Readiness probe (DB connectivity) | — | — |
| 26 | GET | `/api/v3/version` | Build info | — | — |

**Total: 26 endpoints** (5 Opportunities, 3 Pipeline, 4 Captures, 4 Action Items, 2 Launchpad, 1 Partners, 1 Sources, 3 Webhooks, 3 System)

---

## 3. Per-endpoint detail

> Full request/response schemas with examples are defined in `openapi-v3.yaml`.
> This section provides design rationale and V2 compatibility notes per endpoint.

### 3.1 Opportunities

#### `GET /api/v3/opportunities`

List opportunities with filters and cursor-based pagination. R1 source
siblings are returned on every field.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (`discovery`, `qualified`, `pipeline`, `lost`, `won`) |
| `agency` | string | Case-insensitive substring match on agency |
| `naics` | string | Case-insensitive substring match on NAICS code |
| `grade` | string | Filter by grade (`A`, `B`, `C`) |
| `due_before` | ISO date | Opportunities due before this date |
| `due_after` | ISO date | Opportunities due after this date |
| `set_aside` | string | Filter by set-aside type |
| `hot` | `1` | Grade A or win prob ≥ 70% |
| `limit` | integer | Page size (default 50, max 200) |
| `cursor` | string | Pagination cursor |

**V2 compatibility:** V2 uses `page`/`per_page` and includes `naics`,
`agency`, `set_aside`, `min_value`, `max_value`, `due_before`, `due_after`,
`grade`, `qualified`, `hot` filters. V3 preserves all filter names and adds
`status`. The `ou_tag` and `qualified` params are removed (Envision-only scope;
use `status=qualified` instead). V3 adds `min_value` and `max_value` to the
OpenAPI spec for parity.

#### `GET /api/v3/opportunities/:id`

Return full opportunity detail. Automatically triggers R2 analysis
(pwin, incumbent, competitors, blackhat, wargame, timeline). The response
includes R1 source siblings on every field plus an `analysis` block.

**V2 compatibility:** V2 returns a flat opportunity row. V3 adds the
`analysis` block and `<field>_sources` siblings. The flat fields themselves
are unchanged.

#### `POST /api/v3/opportunities`

Create a new opportunity via manual entry. Requires `title` and `source`.
The `ou_tag` field is removed — all records are Envision-scoped.

**Request body fields:** `title`, `source`, `sam_notice_id`, `naics`,
`agency`, `sub_agency`, `description`, `set_aside`, `response_due_at`,
`posted_at`, `value_min`, `value_max`.

Teaming flag evaluation fires asynchronously after creation (same as V2).

#### `PATCH /api/v3/opportunities/:id`

Update an existing opportunity. Only provided fields are updated.
Returns the full updated record.

#### `POST /api/v3/opportunities/:id/qualify`

Mark an opportunity as qualified. Sets `qualified_at` and `qualified_by`.
Returns the updated opportunity plus synchronous teaming flag evaluation.

**Request body:** `qualified_by` (string, optional — defaults to current user).

### 3.2 Pipeline

#### `GET /api/v3/pipeline`

List active pipeline items with joined opportunity data and R1 source
siblings. No `ou_tag` filter — all items are Envision-scoped.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `capture_owner` | string | Filter by capture owner (substring match) |
| `limit` | integer | Page size (default 50, max 200) |
| `cursor` | string | Pagination cursor |

**V2 compatibility:** V2 returns `items` array with joined
`opportunity_*` prefixed fields. V3 preserves the same flat shape with
`opportunity_title`, `opportunity_agency`, etc. Source siblings like
`opportunity_title_sources` are already present in V2.

#### `POST /api/v3/pipeline`

Promote a qualified opportunity to the pipeline.

**Request body:** `opportunity_id` (required), `capture_owner` (required),
`milestones`, `win_prob_pct`, `win_prob_evidence` (required if `win_prob_pct`
is set), `teaming_partners`.

#### `PATCH /api/v3/pipeline/:id`

Update pipeline item fields. If `win_prob_pct` is being set,
`win_prob_evidence` is required (Data First doctrine enforcement).

**Request body:** `capture_owner`, `milestones`, `win_prob_pct`,
`win_prob_evidence`, `teaming_partners`.

### 3.3 Captures

#### `GET /api/v3/captures`

List captures with joined pipeline and opportunity data.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `stage` | string | Filter by color review stage |
| `behind` | `1` | Captures past due but not submitted |
| `limit` | integer | Page size (default 50, max 200) |
| `cursor` | string | Pagination cursor |

**V2 compatibility:** V2 returns `items` array with `pipeline_capture_owner`,
`opportunity_title`, `opportunity_agency`. V3 preserves these.

#### `GET /api/v3/captures/:id`

Return full capture detail with compliance matrix, pricing assumptions, and
teaming worksheet. Automatically triggers R2 analysis.

#### `POST /api/v3/captures`

Create a capture from a pipeline item.

**Request body:** `pipeline_item_id` (required).

#### `PATCH /api/v3/captures/:id`

Update capture stage, notes, pricing. If `pricing_assumptions.margin_pct`
is provided, pricing guardrails are checked and the result is included in
the response as `pricing_guardrail`.

**Request body:** `color_review_notes`, `pricing_assumptions`,
`teaming_worksheet`.

### 3.4 Action Items

#### `GET /api/v3/action-items`

List action items with R1 source siblings. Defaults to `status != 'done'`.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (`open`, `in_progress`, `done`) |
| `owner` | string | Filter by owner email |
| `source` | string | Filter by source (`manual`, `email`, `system`) |
| `linked_record_type` | string | Filter by linked record type |
| `limit` | integer | Page size (default 50, max 200) |
| `cursor` | string | Pagination cursor |

**V2 compatibility:** V2 uses `owner_email` param. V3 renames to `owner`
for brevity; the backend accepts both during the transition period.
The `ou_tag` param is removed.

#### `POST /api/v3/action-items`

Create an action item. Doctrine enforcement: individual `owner` is required —
team names (`team`, `all`, `everyone`, `committee`, `group`) are rejected
with a validation error (Relentless Execution — individual ownership).

**Request body:** `title` (required), `detail`, `owner` (required),
`source`, `source_id`, `due_date`, `linked_record_type`, `linked_record_id`.

#### `PATCH /api/v3/action-items/:id`

Update an action item. Setting `status` to `done` auto-sets `completed_at`.

**Request body:** `status`, `owner`, `due_date`, `linked_record_type`,
`linked_record_id`.

#### `POST /api/v3/action-items/:id/drafts`

Request an LLM-generated draft (reply, research brief, or milestone plan).

**Request body:** `kind` (required — `reply` | `research` | `milestone`).

Returns the generated draft. The draft is not auto-approved; the user must
explicitly approve it via the existing approve-draft flow.

### 3.5 Launchpad

#### `GET /api/v3/launchpad/summary`

Return today-actionable counts for the summary grid.

**Response shape:**

```jsonc
{
  "data": {
    "action_items_due_today": 3,
    "opportunities_hot": 7,
    "capture_behind": 1,
    "partner_new_awards_7d": 2
  }
}
```

**V2 compatibility:** Identical shape to V2 `fetchLaunchpadSummary`.

#### `GET /api/v3/launchpad/flags`

Return active (non-dismissed) flags ordered by severity.

**Response shape:**

```jsonc
{
  "data": {
    "flags": [
      {
        "id": "flag_001",
        "flag_key": "cmmi_expiring",
        "severity": "critical",
        "title": "CMMI ML3 expires Aug 7, 2026",
        "detail": "Schedule assessment before expiration",
        "due_date": "2026-08-07",
        "doctrine_anchor": "Ethics Always",
        "source_url": "https://sam.gov/...",
        "source_url_sources": [
          {
            "kind": "sam_gov",
            "title": "SAM.gov Envision Profile",
            "url": "https://sam.gov/entity/VNMLXFMQD976",
            "retrieved_at": "2026-05-29T06:00:00.000Z"
          }
        ],
        "created_at": "2026-05-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 3.6 Partners (lookup only)

#### `GET /api/v3/partners/:id`

Fetch partner facts for teaming context. The `:id` parameter is a partner
tag (`riverstone` or `pd_systems`).

**There is no list endpoint.** Partners are not browsable. This endpoint
exists solely to provide teaming context when Envision evaluates whether to
team on a specific opportunity.

**Response includes:** identity, capabilities, certifications, vehicles,
recent awards, teaming history with Envision — all with R1 source siblings.

**V2 compatibility:** V2 exposes `GET /api/partner-intel/profiles` (list)
and `GET /api/partner-intel/profiles/:ou_tag` (detail). V3 removes the list
endpoint and renames the path to `/api/v3/partners/:id`.

### 3.7 Sources

#### `GET /api/v3/sources/:id`

Resolve a source record by ID. Returns the source URL, metadata, and
recent sync runs. Used by the `SourceBadge` frontend component to render
clickable source citations.

**Response shape:**

```jsonc
{
  "data": {
    "source": {
      "id": "src_001",
      "name": "SAM.gov",
      "source_type": "api",
      "category": "opportunities",
      "base_url": "https://sam.gov",
      "enabled": true,
      "last_sync_at": "2026-05-29T06:00:00.000Z",
      "last_sync_status": "success"
    },
    "recent_runs": [ /* ... */ ]
  }
}
```

**V2 compatibility:** Identical to V2 `GET /api/sources/:id`.

---

## 4. Webhook contracts

Webhooks are **machine-to-machine** endpoints called by n8n workflow
automations. They authenticate via the `x-gda-key` header (shared secret
from `GDA_WEBHOOK_KEY` env var). No JWT is used.

### 4.1 `POST /api/v3/webhooks/sam-opportunity`

n8n posts SAM.gov opportunity findings from its scheduled crawl.

**Auth:** `x-gda-key` header.

**Request body:**

```jsonc
{
  "opportunities": [
    {
      "sam_notice_id": "W52P1J-26-R-0047",
      "title": "Army RS3 Task Order 47",
      "agency": "Department of the Army",
      "department": "Army Sustainment Command",
      "naics": "541330",
      "set_aside": "SBA",
      "response_due_at": "2026-07-15T17:00:00.000Z",
      "posted_at": "2026-05-20T00:00:00.000Z",
      "value_min": 5000000,
      "value_max": 15000000,
      "raw_source_url": "https://sam.gov/opp/abc123/view",
      "solicitation_number": "W52P1J-26-R-0047"
    }
  ]
}
```

**Response:** Standard success envelope with upsert counts.

```jsonc
{
  "success": true,
  "data": {
    "upserted": 1,
    "errors": 0
  }
}
```

### 4.2 `POST /api/v3/webhooks/fpds-award`

n8n posts FPDS award data from its scheduled crawl.

**Auth:** `x-gda-key` header.

**Request body:**

```jsonc
{
  "awards": [
    {
      "contract_number": "W56KGZ-26-F-0001",
      "vendor_name": "Envision Innovative Solutions",
      "vendor_cage": "4JB87",
      "agency": "Department of the Army",
      "award_date": "2026-05-01",
      "obligated_amount": 2500000,
      "base_and_all_options": 8500000,
      "naics": "541330",
      "psc": "R425",
      "fpds_url": "https://www.fpds.gov/ezsearch/search.do?q=W56KGZ-26-F-0001"
    }
  ]
}
```

**Response:** Standard success envelope with upsert counts.

### 4.3 `POST /api/v3/webhooks/email-action-item`

n8n posts email-derived action items. The backend uses an LLM to extract
the action, due date, and owner from the email body, then creates the
action item and an initial draft.

**Auth:** `x-gda-key` header.

**Request body:**

```jsonc
{
  "from": "shawn@envision-is.com",
  "to": "gda-actions@envision-is.com",
  "subject": "Follow up on RS3 TO47 pricing",
  "body_text": "Need to finalize pricing assumptions by Friday. Shawn to send margin targets to Angela."
}
```

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "action_item": {
      "id": "ai_001",
      "title": "Finalize RS3 TO47 pricing assumptions",
      "owner": "shawn",
      "due_date": "2026-06-06",
      "source": "email",
      "status": "open"
    },
    "draft": {
      "id": "draft_001",
      "kind": "reply",
      "draft_text": "Hi Angela, ..."
    }
  }
}
```

---

## 5. Compatibility notes

### 5.1 Envelope shape change

| Field | V2 | V3 | Frontend impact |
|-------|----|----|-----------------|
| `success` | ✓ | ✓ | None |
| `data` | ✓ | ✓ | None |
| `meta` | ✓ | ✓ | None (`meta.source` changes from `"gateway"` to `"v3"`) |
| `error` | ✓ | ✓ | None |
| `workflow` | ✓ | Removed | None — frontend never reads this |
| `action` | ✓ | Removed | None — frontend never reads this |
| `dryRun` | ✓ | Removed | None — frontend never reads this |

**Bridge strategy:** If the frontend reads `workflow`/`action`/`dryRun`,
V3 can re-add them as static strings during a transition period. Current
audit shows the frontend only destructures `{ success, data, meta, error }`.

### 5.2 Pagination change

| Aspect | V2 | V3 |
|--------|----|----|
| Strategy | Offset (`page`/`per_page`) | Cursor (`limit`/`cursor`) |
| Response | `total`, `page`, `per_page` | `pagination.limit`, `pagination.cursor`, `pagination.hasMore` |

**Bridge strategy:** V3 accepts both parameter styles during transition.
When `page`/`per_page` are provided, V3 translates internally and returns
both pagination styles in the response. The frontend migration removes
`page`/`per_page` usage and switches to `cursor`/`limit`.

### 5.3 Path changes

| V2 path | V3 path | Notes |
|---------|---------|-------|
| `/api/v2/opportunities` | `/api/v3/opportunities` | Base URL env var swap only |
| `/api/v2/pipeline` | `/api/v3/pipeline` | Base URL env var swap only |
| `/api/captures` | `/api/v3/captures` | Prefix change |
| `/api/action-items` | `/api/v3/action-items` | Prefix change |
| `/api/launchpad/*` | `/api/v3/launchpad/*` | Prefix change |
| `/api/partner-intel/profiles/:ou_tag` | `/api/v3/partners/:id` | Path rename, no list |
| `/api/sources/:id` | `/api/v3/sources/:id` | Prefix change |
| `/api/ingest/opportunities` | `/api/v3/webhooks/sam-opportunity` | Webhook consolidation |
| `/api/action-items/ingest-email` | `/api/v3/webhooks/email-action-item` | Webhook consolidation |

**Bridge strategy:** The frontend changes only the `VITE_API_BASE` env var
from `/api` to `/api/v3`. Path segment changes (`captures` → `v3/captures`)
are handled by the new base URL. The only exception is `partner-intel/profiles/:ou_tag`
→ `partners/:id`, which requires a one-line path update in the frontend.

### 5.4 Removed parameters

| Param | V2 endpoints | V3 | Reason |
|-------|-------------|-----|--------|
| `ou_tag` | All list endpoints | Removed | Envision-only scope |
| `qualified` | `GET /api/v2/opportunities` | Use `status=qualified` | Cleaner filter model |

### 5.5 Added features

| Feature | V2 | V3 |
|---------|----|----|
| R1 source siblings on list endpoints | Partial (pipeline, action-items) | Universal |
| R2 auto-analysis on detail endpoints | Not present | Universal |
| Cursor-based pagination | Not present | All list endpoints |
| `requestId` in meta | Not present | All responses |
| Rate limit headers | Not present | All responses |

---

## 6. Open questions for Phase 1 review

1. **Transition period duration.** How long should V3 accept V2 pagination
   params (`page`/`per_page`) before requiring cursor-based only? Proposal:
   accept both until the frontend migration PR is merged, then deprecate.

2. **`workflow` / `action` / `dryRun` removal.** The audit shows the
   frontend never reads these. Confirm safe to remove, or keep as static
   values during transition?

3. **Partner browse removal.** V2 exposes `GET /api/partner-intel/profiles`
   (list all partners). V3 removes this per the tool ownership model. Confirm
   the frontend Partner Intel page will switch to direct-link access only
   (e.g. from teaming flags on opportunities).

4. **Webhook consolidation.** V2 has `POST /api/ingest/opportunities` for
   SAM.gov data, `POST /api/ingest/fpds-awards` for FPDS, and
   `POST /api/action-items/ingest-email` for email actions. V3 consolidates
   under `/api/v3/webhooks/*`. Confirm n8n workflows will be updated to
   call the new paths.

5. **Action item `owner` field rename.** V2 uses `owner_email`. V3 proposes
   `owner` for brevity. The backend will accept both during transition. Confirm
   this is acceptable or if `owner_email` should be preserved.

6. **Rate limit thresholds.** Proposed limits (§1.7) are based on current
   usage patterns. Review and adjust as needed.

7. **Analysis caching strategy.** R2 auto-analysis caches on
   `(record_id, updated_at)`. Should stale analysis be served immediately
   while re-analysis runs in the background, or should the response wait
   for fresh analysis? Proposal: serve stale + background refresh, with a
   `stale: true` flag in the response.

---

## Out of scope

- **Schema design** → F-201
- **Data migration** → F-203
- **Test strategy** → F-204
