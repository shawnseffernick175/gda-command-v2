# F-306: Capability Matching + Auto-Qualify Against OU3 (Envision) Offerings

## Status
**Queued** — depends on F-300, F-301, F-303. Do NOT add `devin-ready` until those merge.

## Why this exists (Shawn qualifies for Envision)
The tool's primary user is the OU3 (Envision) owner. Every opportunity needs to be matched against Envision's offerings catalog before it can be qualified. Today this is manual and inconsistent. Result: time wasted on bad-fit pursuits + good-fit pursuits missed.

## Objective

Maintain an **Envision capability catalog** as a first-class entity. Every opportunity (after F-305 analysis) gets auto-matched against the catalog with a per-capability score and an overall qualify/disqualify recommendation. Riverstone (OU2) and PD Systems (OU1) catalogs are read-only context for teaming — they do NOT trigger qualification.

## Capability catalog schema

```sql
CREATE TABLE capabilities (
  id uuid PRIMARY KEY,
  ou text NOT NULL CHECK (ou IN ('envision','riverstone','pd_systems')),
  name text NOT NULL,
  category text NOT NULL, -- e.g. 'training_simulation', 'digital_readiness', 'systems_engineering'
  description text NOT NULL,
  naics_codes text[] NOT NULL DEFAULT '{}',
  psc_codes text[] NOT NULL DEFAULT '{}',
  agencies_strong_in text[] NOT NULL DEFAULT '{}',
  past_performance_doc_ids uuid[] NOT NULL DEFAULT '{}', -- FK to RAG corpus
  key_personnel uuid[] NOT NULL DEFAULT '{}',
  certifications text[] NOT NULL DEFAULT '{}', -- CMMI, ISO, clearance tier
  evidence_grade text CHECK (evidence_grade IN ('A','B','C')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE opportunity_capability_matches (
  opportunity_id uuid NOT NULL,
  capability_id uuid NOT NULL,
  match_score numeric NOT NULL CHECK (match_score >= 0 AND match_score <= 1),
  match_reasons jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, capability_id)
);
```

## Hard rules

1. **OU3 catalog is the only qualification gate.** OU1/OU2 catalogs surface as teaming context only. A pursuit cannot be qualified into the Envision pipeline if zero OU3 capabilities score ≥ 0.5.
2. **Evidence-graded.** Every capability entry carries A/B/C per F-303 rubric. C-graded capabilities cannot be the sole basis for qualification.
3. **Past performance backed.** A capability must link to at least one past-performance doc in RAG (F-301) to be evidence-grade A. No invented capabilities.
4. **Auto-disqualify on exclusion hit.** Even with high capability match, if F-303 fires any of the 6 strategic exclusions, the opportunity is disqualified regardless of capability score.

## Acceptance criteria

### Backend
- [ ] Migration: `capabilities` + `opportunity_capability_matches` tables
- [ ] Seed: load Envision capability catalog from CEO-doc corpus + Shawn's confirmed list (UI to edit after seed)
- [ ] `POST /v3/capabilities` / `GET /v3/capabilities` / `PATCH /v3/capabilities/:id`
- [ ] `GET /v3/opportunities/:id/capability-matches` — returns sorted matches with reasons
- [ ] F-300 agent tool: `capabilities.match(opportunity_id) → matches[]`
- [ ] Capability match worker runs after F-305 analysis playbook completes
- [ ] `POST /v3/opportunities/:id/qualify` — checks capability matches + doctrine before allowing qualification

### Frontend
- [ ] `/capabilities` page — list, edit, deactivate Envision capabilities; OU1/OU2 read-only sections
- [ ] On `/opportunities/:id` — capability match card showing top 3 matches with score + reasons + "qualify into pipeline" button (disabled if no match ≥0.5 or doctrine excludes)
- [ ] Capability hover-card shows past-performance doc citations

### Tests
- [ ] Seed test: capability count > 0, every Envision capability has at least one past-perf doc link, no orphan capabilities
- [ ] Match test: fixture opportunity matches expected capabilities at expected scores within tolerance ±0.05

## Risks
- Catalog drift: capabilities must be reviewed by Shawn quarterly. Add `last_reviewed_at` + Sentinel alert at 90 days stale.
- Over-matching: tune scoring weights so generic capabilities don't match everything. NAICS exact match should weight higher than description similarity.

## Definition of done
- Envision catalog seeded with ≥15 capabilities, each evidence-grade A or B, each backed by past-performance doc
- Open any active opportunity → capability match card renders top matches → "Qualify into pipeline" button reflects doctrine + capability gating correctly
- Riverstone + PD Systems catalogs visible as teaming context, cannot be used to qualify
