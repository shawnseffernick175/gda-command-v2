# GDA Command V3 — Unified Opportunity Architecture (Design Doc)

**Status:** DRAFT — awaiting Shawn approval before F-400 epic is filed
**Author:** Perplexity Computer (with Shawn Seffernick, CSR LLC)
**Date:** June 1, 2026
**Supersedes:** Implicit "data_source-per-row" model in current V3 schema

---

## 1. Problem statement

GDA Command V3 today treats each external data source (SAM.gov, GovTribe, GovWin) as a separate ingest path that lands rows in the `opportunities` table with a `data_source` column. There is no first-class concept of "this row from SAM and that row from GovTribe describe the same real-world opportunity." There is also no concept of leading-indicator signals (academic grants, SBIR awards, RFIs, agency strategy docs) that surface 6–24 months *before* a formal solicitation appears.

This causes three concrete problems:

1. **Duplicate work for users.** The same opportunity appears as separate rows from each source. Analysts manually correlate them in their heads or in spreadsheets.
2. **Conflicts are hidden.** When SAM and GovTribe disagree on a due date or NAICS code, only one wins — the user doesn't know there's a conflict and can't verify.
3. **Fast Track is structurally impossible.** The system has no place for signals that haven't yet become formal opportunities. By the time GovTribe forecasts something, it's already late.

This document proposes a unified architecture that solves all three.

## 2. Decisions already locked

From the Jun 1 2026 conversation with Shawn:

| Decision | Choice |
|---|---|
| Data model | **Option B** — unified `opportunities` table with `lifecycle_stage` field. Fast Track is a filtered view, not a separate object class. |
| Lineage | **Preserved end-to-end** — a signal tracked 18 months before solicitation links forward to the eventual SAM record. |
| Signal→formal matching | **Machine-suggests, human-confirms** for low/medium confidence. Auto-link only for very high confidence (exact program name / notice ID). |
| Fast Track source list | **TBD via research** — Shawn doesn't know where signals live yet; subagent task in flight. |
| Process | **Design doc first, then file F-400 epic** with concrete sub-tickets. |

## 3. Critical implementation finding — GovTribe is MCP, not REST

**Discovered during today's smoke test:** GovTribe deprecated their REST API in 2023. The current code in `apps/backend-v3/src/ingest/govtribe/client.ts` targets `https://api.govtribe.com/v1` — that hostname doesn't exist anymore. The smoke test produced `getaddrinfo ENOTFOUND api.govtribe.com` on every attempt; the credit-aware client correctly halted, no credits burned.

The real GovTribe integration is **MCP protocol over Streamable HTTP**:
- Server URL: `https://govtribe.com/mcp`
- Auth: `Authorization: Bearer <API_KEY>` (same JWT, scope `mcp:use`)
- Transport: JSON-RPC framing over HTTP
- Tools (per docs): opportunities, awards, IDVs, vehicles, vendors, forecasts, contacts, pipelines, saved searches, pursuits, GovExec media coverage
- Tool names and per-call credit cost are **discovered at runtime** via MCP `tools/list`, not hardcoded

**Impact on this architecture:** Minimal. We were going to need a source-adapter abstraction anyway (different sources have wildly different APIs). The GovTribe adapter becomes an MCP client; SAM adapter is a REST client; GovWin adapter is a CAS-portal scraper. The architecture above the adapters doesn't care.

This finding spawns a follow-on ticket: **F-323 — Rewrite GovTribe client around MCP protocol.** Acceptance criteria captured in `govtribe_mcp_finding.md`. F-323 blocks F-318 (live smoke test) and F-320 (agent tool); does not block GovWin or the rest of the V3 cutover.

## 4. Core data model

### 4.1 The `opportunities` table (revised)

The existing table stays, but a few key columns are added and the semantics of `data_source` change.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | unchanged |
| `link_id` | uuid | **NEW** — groups all per-source records of the same real-world opp. Multiple opportunities rows share the same `link_id` when they describe the same opp from different sources. |
| `data_source` | text | unchanged (sam, govtribe, govwin, nsf, sbir, fedreg, etc.) — but now describes the *source of this specific row*, not the canonical source |
| `lifecycle_stage` | text | **NEW** — one of: `signal`, `forecast`, `pre_sol`, `solicitation`, `awarded`, `post_award`, `closed` |
| `lifecycle_stage_changed_at` | timestamptz | **NEW** — when stage last advanced |
| `source_record_id` | text | unchanged — primary key in the source system (notice ID for SAM, GovTribe entity ID, etc.) |
| existing fields (title, agency, naics, due_date, etc.) | as-is | values reflect what *this source* says, not a merged value |
| `ingested_at` | timestamptz | unchanged |
| `last_refreshed_at` | timestamptz | unchanged |
| `deleted_at` | timestamptz | unchanged (soft delete) |

Key insight: **each row in `opportunities` continues to represent one source's view.** The merge is logical (via `link_id`), not physical. This preserves provenance, makes conflicts inspectable, and allows independent refresh schedules per source.

### 4.2 The `opportunity_links` table (new)

Optional table — only needed if we want to track the matching metadata (confidence, who matched it, when, etc.) separately. Otherwise `link_id` on `opportunities` is enough.

| Column | Type | Notes |
|---|---|---|
| `link_id` | uuid | PK |
| `created_at` | timestamptz | when the link group was first created |
| `created_by` | text | `matcher_v1` / `user:<id>` / `import` |
| `primary_data_source` | text | which source created this link first (informational) |
| `member_count` | int | denormalized — number of rows in `opportunities` sharing this link_id |
| `confidence` | text | `high` / `medium` / `low` — confidence in the link grouping itself |
| `last_resolved_at` | timestamptz | when matcher last reviewed |
| `notes` | text | optional human notes (e.g. "manually merged by Shawn 6/15") |

### 4.3 Lifecycle stages — definitions and transitions

| Stage | Meaning | Typical source(s) | Example |
|---|---|---|---|
| `signal` | Leading indicator — not yet a formal opp. May or may not become one. | NSF/NIH grants, SBIR Phase I/II, RFIs, agency strategy docs, news, arXiv | "NSF funded a Lehigh lab to research X — likely to produce a Phase III opp in 18 months" |
| `forecast` | Agency has stated intent to issue a solicitation but hasn't | GovTribe forecasts, USAspending obligation patterns, posture statements | "Army CDAO posted a FY26 forecast for AI/ML capture training contract" |
| `pre_sol` | Sources sought, draft RFP, industry day announced — solicitation imminent | GovTribe pre-sol, GovWin tracked opps, Federal Register | "Sources sought issued for the contract, responses due in 30 days" |
| `solicitation` | Formal RFP/RFQ/SS posted — bidding window open | SAM.gov | "RFP 70RTAC25R00012345 posted, proposals due Aug 15" |
| `awarded` | Award announced, contract executed | SAM.gov, USAspending, DoD daily contract announcements | "Award to ACME Corp announced 9/15, $4.2M, 12 months" |
| `post_award` | Contract executing — relevant for follow-on / re-compete tracking | USAspending obligation history, FPDS | "Year 2 obligation just hit USAspending, contract running healthy" |
| `closed` | Lost, cancelled, no-bid, expired, or completed | derived | "Award went to competitor — closed lost" |

**Transitions are append-only.** A row's `lifecycle_stage` can advance forward; a link group's *effective* stage is the most-advanced stage across all its member rows. We never delete or rewrite history — when a Fast Track signal becomes a solicitation, we *add* a new row in `opportunities` (with `data_source=sam`, `lifecycle_stage=solicitation`) and link it to the existing signal row.

### 4.4 Example: a real opp's lineage

```
link_id: 7f8a-...

Row 1: 2024-01-15
  data_source: nsf
  lifecycle_stage: signal
  title: "NSF Award #2412345 - Adversarial ML Robustness"
  agency: National Science Foundation
  pi_name: Dr. Jane Smith (Lehigh University)
  naics: (none in NSF)

Row 2: 2024-09-03
  data_source: sbir
  lifecycle_stage: signal
  title: "SBIR Topic AF254-D023 - Adversarial ML for SAR"
  agency: Air Force
  topic_number: AF254-D023
  naics: 541715

Row 3: 2025-06-20
  data_source: govtribe
  lifecycle_stage: forecast
  title: "AFRL adversarial ML capture training - FY26 forecast"
  agency: AFRL/RY
  estimated_value: $8M
  estimated_release: 2025-Q4

Row 4: 2025-11-08
  data_source: fedreg
  lifecycle_stage: pre_sol
  title: "Sources sought - adversarial ML SAR capability"
  due_date: 2025-12-08

Row 5: 2026-02-14
  data_source: sam
  lifecycle_stage: solicitation
  title: "Adversarial ML for Synthetic Aperture Radar"
  notice_id: FA8650-26-R-1234
  agency: AFRL/RY
  due_date: 2026-04-15
  attachments: [PWS.pdf, RFP.pdf, ...]
```

Five rows, one `link_id`. The unified view shows the user: "We've been tracking this opp for 2 years and 1 month before SAM posted it. Here's the lineage." Effective stage for the group: `solicitation` (most-advanced).

## 5. Matching engine

### 5.1 Goal

When a new row enters `opportunities` from any source, decide:
- Does it match an existing link group? → assign that `link_id`
- Or is it a new opp? → mint a new `link_id`

This must work across all source pairs — SAM↔GovTribe, SAM↔GovWin, GovTribe↔GovWin, Signal↔Forecast, etc.

### 5.2 Matching rules (in order of confidence)

**HIGH confidence — auto-link, no human review:**
1. **Notice ID / Solicitation # exact match** — when both rows have a notice ID and they're identical (e.g. `FA8650-26-R-1234`). Only SAM issues these, but GovTribe and GovWin often carry them through once a solicitation drops.
2. **Source cross-reference field** — e.g. GovTribe's `sam_notice_id` field referring back to a SAM record. Some sources explicitly link.
3. **NSF/NIH grant number ↔ SBIR Phase III reference** — when an SBIR Phase III explicitly cites an upstream grant.

**MEDIUM confidence — auto-link but flag for review:**
4. **Agency + NAICS + title fuzzy ≥ 0.85 + due-date proximity (±14 days)** — when notice ID isn't present but all other fields strongly agree.
5. **Agency + topic/program identifier + PI/POC name match** — e.g. SBIR topic ↔ NSF grant via shared PI.

**LOW confidence — surface as suggestion, do NOT auto-link:**
6. **Title fuzzy ≥ 0.75 + same agency only** — title overlap but no other anchors. UI shows "possible match — confirm?"
7. **Same NAICS + same agency + close geography** — too weak to act on alone.

**No match:**
8. Everything else → new `link_id`.

### 5.3 Confidence storage

Each row in `opportunities` gets `matched_via` (text) and `match_confidence` (text) columns recording how it got its `link_id`. Examples:
- `matched_via=notice_id_exact, match_confidence=high`
- `matched_via=fuzzy_title+naics+agency+due_date, match_confidence=medium`
- `matched_via=human_confirm:user_42, match_confidence=high`
- `matched_via=initial_ingest, match_confidence=high` (single-source, no candidates to match against)

### 5.4 Suggestion queue

When matcher computes a LOW-confidence candidate, it writes to a new `opportunity_match_suggestions` table:

| Column | Type |
|---|---|
| `suggestion_id` | uuid |
| `new_opportunity_id` | uuid (FK to opportunities) |
| `candidate_link_id` | uuid |
| `score` | numeric |
| `match_features` | jsonb (which rules fired, fuzzy scores per field) |
| `status` | text — `pending`, `confirmed`, `rejected` |
| `resolved_by` | text |
| `resolved_at` | timestamptz |

The UI surfaces this queue in a "Review matches" tab. Each suggestion shows side-by-side comparison + a Confirm/Reject/New button.

### 5.5 Backfill

When the matcher's rules change (e.g. we add a new high-confidence rule), a backfill job re-evaluates existing rows. Backfill never *un-merges* — it only proposes additional links. Un-merges require human action.

## 6. Field-level merge (the unified view)

When the UI shows opp detail for a `link_id`, it merges fields across all member rows using a precedence table.

### 6.1 Precedence

| Field | Primary | Secondary | Tertiary | Rationale |
|---|---|---|---|---|
| Notice ID / Solicitation # | SAM | GovTribe | GovWin | Only SAM issues it |
| Title | SAM | GovTribe | GovWin | SAM is canonical text |
| Agency / Sub-agency | SAM | GovTribe | GovWin | SAM hierarchy is ground truth |
| NAICS | SAM | GovTribe | GovWin | SAM legally binds |
| Set-aside | SAM | GovTribe | — | SAM legally binds |
| Response due date | SAM | GovTribe | GovWin | SAM legally binds, but show drift |
| Attachments | SAM | — | — | Only SAM hosts them |
| POCs / contacts | **GovTribe** | SAM | GovWin | GovTribe has real human names + emails |
| Forecasted value | **GovTribe** | GovWin | — | Pre-sol intel |
| Incumbent / past awards | **GovTribe** | USAspending | GovWin | GovTribe's awards data |
| Vehicle / IDIQ context | **GovTribe** | GovWin | — | GovTribe's strength |
| Capture status | **GovWin** | — | — | Internal pipeline state |
| Analyst notes | **GovWin** | — | — | Only GovWin has these |
| Competitive landscape | **GovWin** | GovTribe | — | GovWin's editorial |
| Win probability | **GovWin** | — | — | GovWin's call |
| PI / lab / institution | **NSF/NIH** | SBIR | — | Only academic sources |
| Topic number | **SBIR** | — | — | Only SBIR has these |
| Patent references | **USPTO** | — | — | Only patent sources |

### 6.2 Conflict surfacing

For every field, the merged view shows:
- **Primary value** — from the highest-precedence source that has a value
- **Conflict indicator** — if a secondary source has a *different* value, badge it ⚠
- **Per-field hover** — show all source values, last-refreshed time per source, and a "promote this source" override

Example UI:
```
Response due date:  Aug 15, 2026 [SAM]  ⚠
                    ▼ also seen:
                    Aug 22, 2026 [GovTribe, refreshed 2 days ago]
                    Aug 15, 2026 [GovWin, refreshed 6 hours ago]
```

### 6.3 Manual overrides

A user can mark "for this `link_id`, prefer GovTribe over SAM for due date" — stored in a `link_field_overrides` table. Rare, but real (e.g. when SAM has stale data after an amendment GovTribe caught first).

## 7. UI architecture

### 7.1 Tab structure

| Tab | Filter | Purpose |
|---|---|---|
| **All Opportunities** | none | Master view, all stages, all sources |
| **Active** | `lifecycle_stage = solicitation` AND not closed | Things you can bid on right now |
| **Pipeline** | `lifecycle_stage IN (forecast, pre_sol)` | Things coming soon |
| **Fast Track** | `lifecycle_stage = signal` | Leading indicators — what's on the horizon |
| **Awarded** | `lifecycle_stage IN (awarded, post_award)` | Closed loop — including yours and competitors' |
| **Review Matches** | suggestions queue | Human-in-the-loop matching |

All tabs are filters on the same underlying table. Switching tabs doesn't change the data — only the slice.

### 7.2 Opp detail page — "Say something" surfaces

The single most important "say something" principle, applied:

**At the top of every opp detail page, within the first 200 vertical pixels, the user must see:**

1. **Source badge strip** — one badge per `data_source` represented in this `link_id`. Example: `📋 SAM • 🔵 GovTribe • 🟢 GovWin`. Click a badge → jump to that source's raw row.
2. **Lifecycle stage chip** — `🟡 Pre-Sol` / `🟢 Solicitation` / `⚫ Awarded` etc.
3. **Lineage trail** — small horizontal timeline: `Signal · Forecast · Pre-Sol · Solicitation` with filled-in dots for stages this opp has hit, hollow dots for stages it hasn't.
4. **Conflict count** — `⚠ 2 fields conflict across sources` — clickable, opens conflict drawer.
5. **Last refresh** — most recent `last_refreshed_at` across all member rows + per-source breakdown on hover.
6. **Days-to-due countdown** — if `solicitation` stage with a due date, big visible countdown.

### 7.3 Fast Track-specific surfaces

For `lifecycle_stage = signal` rows, the detail page shows extra panels:

- **Signal strength** — how many independent signal sources point to this opp (1 source = weak, 3+ = strong)
- **Estimated formal-emergence window** — derived from historical signal→solicitation lead times for similar opps
- **Suggested doctrine matches** — uses existing `doctrine_to_doors_map` to highlight which company capabilities align
- **"Watch" toggle** — bookmark for analyst follow-up
- **Conversion forecast** — "23% of NSF signals like this become DoD solicitations within 24 months" (computed from historical data once we have any)

### 7.4 Color rules (per Shawn's lock)

6 colors only — Pink, Red, Black, Blue, White, Green. **No gold anywhere.**

Stage colors:
- `signal` — Pink (early, attention-grabbing)
- `forecast` — Blue (calm, planning)
- `pre_sol` — Pink (action approaching)
- `solicitation` — Red (act now)
- `awarded` — Black (closed loop)
- `post_award` — Black
- `closed` — White/grey

Source badges:
- SAM — Black on White
- GovTribe — Blue
- GovWin — Green
- Fast Track signal sources — Pink

Conflicts — Red ⚠ icon, never gold.

## 8. Fast Track source catalog

Full research catalog lives in `fast_track_sources.md` — this section summarizes the Day 1 set and the signal-pipeline model that drives it.

### 8.1 The signal pipeline

Federal procurement has a predictable upstream pipeline. Every stage leaves a digital footprint:

```
Basic Research Grant   SBIR Topic Opens   Budget Exhibit   RFI/Sources Sought   Formal RFP
    (T-18 to T-24 mo)   (T-12 to T-18)   (T-12 to T-18)   (T-3 to T-12)         (T-0)
         ↓                    ↓                  ↓                  ↓                ↓
NSF/NIH/DOE Awards       SBIR.gov API       OUSD Budget       SAM.gov (r/p)     SAM.gov (o)
NIH RePORTER             DoD BAAs           USAspending       Fed Register      GovTribe
NTRS / arXiv             ONR/AFRL BAA       GovInfo CHRG      DARPA BAA         GovWin
```

Fast Track ingests the leftmost columns; the existing SAM/GovTribe/GovWin pipeline catches the rightmost.

### 8.2 Day 1 priority sources (8 total — all free, all public APIs)

Selection criteria: free + no registration barriers + highest defense relevance + non-redundant with SAM/GovTribe/GovWin + meaningful lead time.

| # | Source | Lead time | Auth | Why Day 1 |
|---|---|---|---|---|
| 1 | **SBIR.gov Awards + Topic APIs** | 6-24 mo | None | Direct DoD topic-code linkage. Phase II awards = single highest-fidelity 12-18mo signal. [API docs](https://www.sbir.gov/api) |
| 2 | **SAM.gov Sources Sought + Pre-Sol (ptype=r,p)** | 3-12 mo | SAM key (already have) | Zero new infra — we already ingest SAM. Just expand the filter. [API docs](https://open.gsa.gov/api/get-opportunities-public-api/) |
| 3 | **NIH RePORTER v2 + NSF Awards** | 18-24 mo | None | High-volume research grants, filter by agency=DOD. [NIH](https://api.reporter.nih.gov) / [NSF](https://www.research.gov/common/webapi/awardapisearch-v1.htm) |
| 4 | **USAspending obligation trends** | 6-18 mo | None | Spending ramp-ups in a NAICS/PSC code predict re-competes. [API](https://api.usaspending.gov) |
| 5 | **DARPA + ONR BAA monitoring via SAM.gov** | 6-18 mo | SAM key | BAAs = canonical mid-stage signal. Filter SAM by organizationName=DARPA/ONR/AFRL/ARL + ptype=k. |
| 6 | **DoD Contract Announcements RSS** ($7.5M+ daily) | terminal/re-compete | None | Reading awards intelligently → feeds re-compete calendar. [Feed](https://www.defense.gov/news/rss/) |
| 7 | **arXiv API** — cs.AI, cs.RO, quant-ph, eess.SP | 18-36 mo | None | Daily preprints in defense-adjacent categories filtered by OUSD(R&E) CTAs. [Docs](https://info.arxiv.org/help/api/user-manual.html) |
| 8 | **GovInfo CHRG + Congress.gov NDAA** | 12-24 mo | api.data.gov key (free, instant) | HASC/SASC testimony reveals priorities before NDAA, NDAA before solicitations. |

### 8.3 Phase 2 sources (after Day 1 lands)

Full catalog has detail; ranking summary:

- **OUSD(R&E) Critical Technology Areas** (web scrape, 6 CTAs) — strategic alignment overlay
- **DoD R-1 / P-1 Budget Books** (annual XML, comptroller.defense.gov) — Program Element matching
- **AFWERX / SpaceWERX / SOFWERX OTAs** — fast-award innovation calls
- **DOE OSTI**, **NASA NTRS**, **DTIC** — full-text research enrichment
- **BreakingDefense / DefenseScoop RSS** — industry intel narrative
- **GAO + IG reports** — agency posture / oversight signals
- **Federal Register NOTICE type** — agency rulemakings affecting acquisition
- **NIST CSRC** — standards forcing functions
- **DoD Issuances portal** — DODI/DODD changes shaping requirements

### 8.4 Deferred / blocked sources

- **FPDS-NG real-time integration** — $2,500 paid tier; defer indefinitely. Free FPDS Atom Feed works for batch.
- **LexisNexis / Bloomberg Government** — paid subscription; defer
- **Patent databases** — heavy normalization work; defer
- **Conference attendee lists** — gray-area / paid; defer

### 8.5 Match-to-formal feasibility (per-source)

| Source | Strong match field(s) | Match confidence to SAM solicitation |
|---|---|---|
| SBIR Awards | `solicitation_number`, `topic_code`, `uei` | HIGH when solicitation_number present; MEDIUM via topic/UEI |
| SBIR Topics | `topic_code` | MEDIUM — topic → eventual award → eventual SAM |
| SAM ptype=r/p | `solicitation_number` | HIGH — same field as ptype=o |
| NIH RePORTER | Opportunity number, CFDA code, PI | MEDIUM — Opportunity Number directly links when present |
| NSF Awards | Program code, PI institution | LOW-MEDIUM — keyword + PI affiliation match |
| USAspending | Award ID, UEI, PSC, NAICS | HIGH for re-compete prediction (same UEI + same PSC) |
| DARPA/ONR BAAs | `solicitation_number` | HIGH — direct SAM linkage |
| DoD RSS | Contract number, contractor name, program | MEDIUM — extract via AI, link by contract # |
| arXiv | None structural — keyword/topic only | LOW — informational overlay only |
| GovInfo / Congress | Bill number, hearing ID | LOW — narrative match only, doctrine alignment |

This matrix drives matcher rule weights in Section 5. Sources with HIGH structural match feasibility (SBIR, SAM-pre-sol, DARPA BAAs, USAspending re-competes) get auto-link; LOW-feasibility sources (arXiv, congressional testimony) stay as informational overlays that suggest doctrine matches, not opp linkages.

### 8.6 CRITICAL: SAM.gov entity registration — start TODAY

The SAM.gov public API key gets 10 requests/day. The **entity-registered key** gets 1,000/day, and **entity registration takes 10-15 business days**.

**Recommendation: file the SAM.gov entity registration today** (independent of any code work). It's a long-lead requirement that gates the Day 1 set — without 1,000/day we cannot run BAA monitoring + ptype=r/p + ptype=o + ptype=k against the API on the cadence we need.

File this as **F-440 — SAM.gov entity registration**, status `blocked_external` until SAM responds. Total effort: ~1 hour of paperwork, then waiting.

### 8.7 Day 1 implementation sketch

Each source gets a `SourceAdapter` implementation per Section 9. n8n workflows (Shawn's preferred orchestration) handle scheduling. All signals land in `opportunities` with `lifecycle_stage=signal` and `data_source=<source_key>`, then the matcher (Section 5) attempts to link them to existing `link_id`s or mint new ones.

Proposed cadences:
- SBIR.gov (awards + topics): daily
- SAM.gov ptype=r/p: daily (piggybacks existing SAM workflow)
- NIH RePORTER + NSF Awards: weekly (lower velocity)
- USAspending trend deltas: weekly
- SAM BAA sweep (DARPA/ONR/AFRL/ARL): weekly
- DoD RSS: daily
- arXiv: 3x weekly
- GovInfo CHRG / Congress NDAA: weekly

## 9. Source adapter pattern

To support N sources without each one being a snowflake, all source ingest paths conform to a common interface:

```
interface SourceAdapter {
  source_key: string;                  // 'sam' | 'govtribe' | 'govwin' | 'nsf' | ...
  default_lifecycle_stage: Stage;      // what stage rows from this source default to
  cost_model: 'free' | 'metered' | 'subscription';

  // Discovery / ingest
  list_records(cursor?: Cursor): Promise<{ records: RawRecord[], next_cursor?: Cursor }>;
  get_record(id: string, opts?: { critical?: boolean }): Promise<RawRecord | null>;

  // Normalization — source-specific → common Opportunity shape
  normalize(raw: RawRecord): NormalizedOpportunity;

  // Optional — credit guard hooks
  estimate_cost(operation: string): number;
  on_call_complete(operation: string, actual_cost: number, success: boolean): void;
}
```

Existing implementations:
- `SamAdapter` — REST, free, rate-limited
- `GovtribeAdapter` — **MCP over Streamable HTTP** (rewrite via F-323), metered
- `GovwinAdapter` — CAS portal scrape, subscription

New implementations to build (Phase 2+):
- `NsfAdapter` — REST `research.gov`, free
- `SbirAdapter` — REST `sbir.gov`, free (rate-limited; existing flag `ENABLE_SBIR_INGEST` currently off due to VPS egress 429s — needs investigation)
- `FederalRegisterAdapter` — REST `federalregister.gov/api/v1`, free
- `GaoAdapter` — RSS / REST, free
- `NewsAdapter` — RSS aggregator, free
- `ArxivAdapter` — REST `export.arxiv.org/api`, free

Each adapter is a self-contained module under `apps/backend-v3/src/ingest/<source>/`. The matching engine and unified view code don't know or care which adapter produced a row.

## 10. Phased rollout

### Phase 1 — Foundation (Sprint after current V3 hardening)
Goal: schema + matching engine + adapter refactor, no UI changes yet.

- **F-401** Add `link_id`, `lifecycle_stage`, `matched_via`, `match_confidence` columns to `opportunities` table. Migration. Backfill existing rows with `link_id = id` (each row its own group) and `lifecycle_stage` derived from `data_source`.
- **F-402** Create `opportunity_links`, `opportunity_match_suggestions`, `link_field_overrides` tables.
- **F-403** Refactor existing SAM/GovTribe/GovWin ingest paths to the `SourceAdapter` interface. Pull out shared credit-guard, caching, retry logic.
- **F-404** Build the matching engine v1 — implement HIGH and MEDIUM confidence rules only (notice ID exact, cross-ref, agency+NAICS+title+date fuzzy). Run on every ingest. LOW-confidence rules deferred to Phase 2.
- **F-405** Backfill job — re-evaluate existing `opportunities` rows under new rules.

### Phase 2 — Unified view API (UI still on old single-source detail page)
- **F-410** `GET /v3/opportunities/:link_id` — returns merged Opp object with `sources[]`, `merged_fields{}`, `conflicts[]`, `lineage[]`.
- **F-411** Add `lifecycle_stage` to existing `GET /v3/opportunities` list endpoints + filtering.
- **F-412** Suggestion queue API — `GET/POST /v3/match-suggestions`.
- **F-413** Field override API — `PUT /v3/opportunities/:link_id/field-override`.

### Phase 3 — UI cutover
- **F-420** New opp detail page with source badges, lineage trail, conflict drawer, per-field provenance hover.
- **F-421** New tab structure — All / Active / Pipeline / Fast Track / Awarded / Review Matches.
- **F-422** Match suggestions UI — Confirm / Reject / New per suggestion.
- **F-423** Decommission old single-source detail page.

### Phase 4 — Fast Track adapters
- **F-430** NSF adapter
- **F-431** SBIR adapter (also fix VPS egress 429 issue)
- **F-432** Federal Register adapter
- **F-433** DoD contract announcements adapter
- **F-434** GAO RSS adapter
- **F-435** News / arXiv adapters (lower priority)
- **F-436** Signal-strength scoring + estimated-emergence-window logic
- **F-437** Doctrine match suggestions in Fast Track detail page (uses existing `doctrine_to_doors_map`)

### Phase 5 — Polish
- **F-440** LOW-confidence matching rules (title-only fuzzy etc.) + suggestion queue surfacing
- **F-441** Conversion-rate analytics — "X% of NSF signals become DoD solicitations within Y months"
- **F-442** Audit log — every match decision, every field override, every stage transition is logged
- **F-443** Bulk match-review UI for batch confirm/reject

## 11. Open questions / risks

| # | Question / Risk | Mitigation |
|---|---|---|
| 1 | Bad auto-matches that silently merge unrelated opps would destroy trust in the data | Phase 1 ships HIGH+MEDIUM confidence only; everything else is human-confirm. Backfill is dry-run-first. |
| 2 | GovTribe MCP per-tool credit costs unknown until runtime | F-323 includes a "first run captures actual costs into ledger" step before any production cron runs |
| 3 | Matching across signal→formal (e.g. NSF→SAM) is genuinely hard — different schemas, different key fields | Phase 4 problem, not Phase 1. Phase 1 ships matching across SAM/GovTribe/GovWin only, where field overlap is high. |
| 4 | Schema migration on a live `opportunities` table is risky | Migration uses `ADD COLUMN ... DEFAULT NULL`, then backfill in a separate job, then `SET NOT NULL` in a third step. Standard online-migration pattern. |
| 5 | Field-override table could become a "shadow database" with users diverging from sources | Override UI surfaces this clearly — "you've overridden 3 fields on this opp" badge — and tracks who/when. |
| 6 | SBIR ingest blocked by VPS egress 429s | Investigate Hostinger egress IP reputation; consider Cloudflare Workers proxy or Tailscale-routed egress |
| 7 | Fast Track sources we don't yet know about | Subagent research feeding section 8 |
| 8 | "Closed" stage assignment is editorial — when do we mark an opp closed-lost? | Defer to Phase 5. For now, manual UI toggle only. |

## 12. Acceptance criteria for F-400 epic (the parent)

The epic is "done" when:

1. ✅ Schema has `link_id` + `lifecycle_stage` on `opportunities`, fully backfilled
2. ✅ Matching engine v1 (HIGH+MEDIUM rules) running on every ingest
3. ✅ All three current adapters (SAM, GovTribe-MCP, GovWin) refactored to `SourceAdapter` interface
4. ✅ Unified `GET /v3/opportunities/:link_id` returns merged view with conflicts and lineage
5. ✅ New UI shows source badges, lineage trail, per-field provenance
6. ✅ At least 3 Fast Track adapters live (recommended: SBIR, Federal Register, NSF — pending subagent ranking)
7. ✅ At least 1 cross-stage signal→formal match demonstrated end-to-end (a Fast Track signal we tracked links forward to a real SAM solicitation)

## 13. Out of scope (explicitly NOT in F-400)

- ML-based matching (transformers, embeddings) — Phase 5+ if needed, but rule-based should get us most of the way
- Cross-tenant data sharing — single-tenant for now
- API for external consumers — internal-only
- Realtime ingest (webhooks vs polling) — polling is fine for Phase 1; revisit after we have load data
- Multi-language opp text — English only
- FOIA-driven enrichment — Phase 6 wishlist

## 14. Recommendation

**Approve this doc, then file F-400 epic with sub-tickets F-401 through F-405 (Phase 1 only).** Hold filing Phase 2+ tickets until Phase 1 lands — too easy to over-commit on architecture before the foundation is real.

**Hard prerequisite:** F-323 (GovTribe MCP rewrite) must land before any Phase 1 work touches the GovTribe adapter. F-323 should be filed today as part of this same approval.

**Estimated effort (rough):**
- Phase 1: 2-3 weeks (one engineer or 2-3 parallel Devin sessions)
- Phase 2: 1-2 weeks
- Phase 3: 2-3 weeks (UI is the biggest single block)
- Phase 4: 2-4 weeks (depends on number of Fast Track adapters)
- Phase 5: ongoing

Total to ship F-400 fully: ~8-12 weeks. Phase 1+2 alone (foundation + API, no new UI yet) is ~3-5 weeks — that's the minimum to start showing internal value.

---

## Sources

- GovTribe REST API deprecation: [API License Agreement](https://docs.govtribe.com/user-guide/terms-of-use/api-license-agreement)
- GovTribe MCP server: [MCP Inspector docs](https://docs.govtribe.com/user-guide/integrations/govtribe-mcp/advanced-developer/mcp-inspector)
- GovTribe MCP capabilities: [User Guide](https://docs.govtribe.com/user-guide/integrations/govtribe-mcp)
- MCP protocol spec: [Anthropic MCP](https://modelcontextprotocol.io)
- (Fast Track source citations to be added when section 8 is complete)
