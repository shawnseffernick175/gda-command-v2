# Phase 0 — Scope Correction: GDA Command is Envision-Only

**Date:** 2026-05-29
**Decided by:** Shawn Seffernick (verbatim: "We are not putting anything in here from the other ou unless we are teaming with them")
**Supersedes:** All multi-OU schema and code patterns from F-100 through F-105
**Locked in memory:** Yes

---

## The correction

GDA Command is a **single-tenant Envision tool**. Riverstone and PD Systems are **not co-equal operating units** in the tool. They appear only as **teaming attachments** on Envision-owned opportunities when Envision is actively pursuing the deal jointly with them.

There is no standalone Riverstone view. There is no standalone PD Systems view. There is no `gda_rollup` cross-OU dashboard. There is no partner pipeline browsing. There is no partner intel news feed in the navigation.

## What changes in V3 design (binding for Phase 1)

### Schema changes

| Element | F-100 era plan | V3 corrected plan |
|---|---|---|
| `ou_tag` enum | `envision \| riverstone \| pd_systems \| teaming \| gda_rollup` | **REMOVED** — every record is Envision by definition |
| `opportunities.ou_tag` column | Required | **REMOVED** |
| `pipeline_items.ou_tag` column | Required | **REMOVED** |
| `captures.ou_tag` column | Required | **REMOVED** |
| `action_items.ou_tag` column | Required | **REMOVED** |
| `launchpad_flags.ou_tag` column | Required | **REMOVED** |
| `ou_registry` table | 5 OU rows | **REMOVED ENTIRELY** |
| `partner_intel_profiles` table | Three peer profiles, browsable | **DEMOTED** to read-only lookup of partner facts (cert list, vehicles, contact info) used to enrich teaming context inside Envision opportunities. Not browsable as its own page. |
| `partner_awards` table | Standalone partner awards feed | **REMOVED** — not in Envision's workflow |
| `partner_news_items` table | Standalone partner news feed | **REMOVED** — not in Envision's workflow |
| `teaming_flags` table | Suggestion system for which partner to bring in | **KEPT** — this is the only legitimate use of partner data in the tool. Lives as `opportunity.teaming_partners` array referencing partner lookup IDs. |

### Frontend changes

| Page | F-100 era plan | V3 corrected plan |
|---|---|---|
| Launchpad | Today-actionable across all OUs | Today-actionable for Envision only |
| Opportunities | Filterable by `ou_tag` | No OU filter. All records are Envision. Filter by status, agency, NAICS, etc. |
| Pipeline | OU-scoped view | Envision pipeline only |
| Capture | OU-scoped view | Envision captures only |
| Action Items | OU-scoped view | Envision action items only |
| **Partner Intel page** | Browse Riverstone + PD Systems profiles, awards, news | **REMOVED ENTIRELY from navigation.** Partner facts surface as a side panel inside an Envision opportunity when the opportunity has teaming partners attached. |
| Settings | OU configuration | No OU settings — single-tenant |

### API changes

- `GET /api/v3/opportunities?ou_tag=...` — `ou_tag` query parameter **removed**
- `GET /api/v3/partner-intel/*` — **endpoint group removed** except `GET /api/v3/partners/:id` (read-only lookup for teaming enrichment)
- `GET /api/v3/partner-awards` — **removed**
- `GET /api/v3/partner-news` — **removed**
- `GET /api/v3/launchpad?ou_tag=...` — `ou_tag` parameter **removed**

### Data migration changes (Phase 4)

- `sam_opportunities` (n8n sync, 20,062 rows) — eligible for import into V3 Envision opportunities **only if Envision is actually pursuing them** (qualification gate enforced)
- `gda_opportunity_tracker` (n8n shadow, 1,924 rows) — triage required: rows that represent Envision pursuits migrate; rows from partner sources do not
- `opportunities` (legacy backend, 658 rows) — all migrate as Envision-owned by default
- Any data in 63 `gda_*` shadow tables tagged for Riverstone or PD Systems as primary owner — **does not migrate**

## What this saves us

1. Roughly **6 tables removed** from V3 schema (`ou_registry`, `partner_awards`, `partner_news_items`, and OU-scoping columns on every fact table)
2. Roughly **3 frontend pages removed** (Partner Intel browse, Riverstone view, PD Systems view)
3. **Entire `ou_tag` enum and propagation logic** — removed from API contracts, route handlers, query filters, frontend filters
4. **No `gda_rollup` reporting layer** to build
5. **No cross-OU permissions model** to design

V3 is meaningfully smaller than the F-100 era plan envisioned. Faster to build. Less to test. Less to break.

## What this does NOT change

1. Production is still broken in the same way (migrations 127–134 never landed)
2. The dual migration tracker root cause still must be fixed in V3
3. The R1 and R2 canonical product rules still apply unchanged
4. The 9-phase program structure (Phase 0 → Phase 5) is unchanged
5. The cutover plan (single env var flip, 30-day soak, legacy decommission) is unchanged

## Phase 1 design tickets (binding scope)

When F-201, F-202, F-203, F-204 are filed:

- F-201 (Architecture): **MUST NOT** include `ou_tag`, `ou_registry`, multi-tenant patterns, or rollup concepts
- F-202 (API Contract): **MUST NOT** expose OU filtering on any endpoint
- F-203 (Data Migration): **MUST** include a qualification gate filtering non-Envision rows out of legacy data
- F-204 (Test Strategy): **MUST** include a test case asserting absence of `ou_tag` and partner browsing routes

## Memory and canonical anchors

This decision is stored in:
- Persistent memory (agent-side) under `gda_command.partner_profiles_access`
- This document (`docs/architecture/v3/phase-0-scope-correction.md`)
- Will be referenced from `docs/canonical/product_rules.md` once that file is updated in Phase 1

## Sign-off conditions

- [x] User decision captured verbatim
- [x] Schema impact mapped
- [x] Frontend impact mapped
- [x] API impact mapped
- [x] Data migration impact mapped
- [ ] Human approval to merge this addendum + close Phase 0
