# F-312: Partner Profiles — Riverstone + PD Systems Read-Only Teaming Context

## Status
**Queued** — depends on F-301. Do NOT add `devin-ready` until F-301 merges.

## Why this exists (Completion Plan item #14)
GDA's three OUs each pursue their own work, but Envision (OU3) often needs teaming intel: "what does Riverstone bring to this NSA opportunity?" "Does PD Systems have a relevant past performance for DLA?" Today this requires Shawn to chase context across emails and shared drives.

## Objective

Maintain **read-only** partner profiles for Riverstone (OU2) and PD Systems (OU1). The profiles surface as teaming context inside Envision opportunity/capture pages. They do NOT trigger qualification, do NOT carry pricing details, do NOT influence PWin scoring directly.

## Hard rules

1. **Read-only from Envision's perspective.** Envision cannot edit OU1/OU2 profile data. Profile data is curated by each OU lead (Tom Rogers OU1, Derrick Elliot OU2). Edits happen via a flagged workflow that surfaces back to the owning OU lead.
2. **No financial detail.** Capability summary, past performance summary, key personnel by name + clearance, certifications, agencies of strength — yes. Rates, fees, profit history — no.
3. **Teaming-context only.** Profiles appear on Envision opportunity detail (F-305) under "Teaming opportunities" — never as a primary qualification path.
4. **Source-cited per R1.** Every claim in a partner profile is backed by a CPAR, past contract, or signed capability statement in RAG (F-301).

## Schema

```sql
CREATE TABLE partner_profiles (
  ou text PRIMARY KEY CHECK (ou IN ('riverstone','pd_systems')),
  name text NOT NULL,
  owner uuid NOT NULL, -- OU lead
  overview text NOT NULL,
  agencies_of_strength text[] NOT NULL DEFAULT '{}',
  naics_codes text[] NOT NULL DEFAULT '{}',
  capabilities_summary jsonb NOT NULL DEFAULT '[]',
  past_performance_summary jsonb NOT NULL DEFAULT '[]', -- {agency, contract_id, value, period, evidence_doc_id}
  key_personnel jsonb NOT NULL DEFAULT '[]', -- {name, clearance, certifications}
  certifications text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  last_reviewed_at timestamptz NOT NULL DEFAULT now()
);
```

## Acceptance criteria

### Backend
- [ ] Migration: `partner_profiles` table
- [ ] Seed: load Riverstone + PD Systems profile starting data from existing CEO-doc corpus chunks (#536 RAG seed already has relevant chunks)
- [ ] `GET /v3/partners/:ou` — returns full profile
- [ ] `PATCH /v3/partners/:ou` — restricted to OU owner; from Envision context returns 403
- [ ] F-300 tool: `partners.teaming_fit(opportunity_id, ou) → {fit_score, reasons[], cited_evidence[]}`

### Frontend
- [ ] `/partners/riverstone` and `/partners/pd-systems` pages — read-only views from Envision
- [ ] On Envision `/opportunities/:id` → "Teaming opportunities" card lists top-fit partner with reasons + R1 citations
- [ ] Stale flag if `last_reviewed_at` > 90 days

## Tests
- [ ] Edit attempt from Envision session → 403
- [ ] Citation coverage: every fact in a profile is backed by an evidence_id resolvable in RAG

## Risks
- Stale data: enforce 90-day review with Sentinel handoff card
- Permission boundary: must hard-enforce read-only at API layer, not just UI

## Definition of done
- Open any Envision opportunity → see Riverstone or PD Systems fit card with cited evidence → cannot edit from Envision context → OU lead can edit from their own context
