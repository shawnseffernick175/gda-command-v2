# F-307: Risks as First-Class Objects Across Lifecycle (Launchpad Roll-Up)

## Status
**Queued** — depends on F-300, F-301, F-302, F-303. Do NOT add `devin-ready` until those merge.

## Why this exists (verbatim from Shawn — Completion Plan item #10)
> "Risks as first-class objects across lifecycle, rolling up to Launchpad"

Today risks are buried inside opportunity detail pages, capture color reviews, and proposal critiques. There's no single place to see "what is on fire across the whole pipeline." Risks aren't tracked over time — same risk gets re-identified weekly with no memory of mitigation.

## Objective

Promote **Risk** to a first-class entity (like Opportunity, Capture, Action Item). Every risk has its own page, its own lifecycle (open → mitigating → resolved → accepted), its own mitigation owner, and rolls up to a single Launchpad "what's at risk" panel.

## Schema

```sql
CREATE TABLE risks (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'doctrine_violation','margin','compliance','past_performance','teaming',
    'incumbent_advantage','schedule','staffing','certification','price','technical','other'
  )),
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status text NOT NULL CHECK (status IN ('open','mitigating','resolved','accepted')),
  owner uuid REFERENCES users(id),
  related_opportunity_id uuid,
  related_capture_id uuid,
  related_pipeline_item_id uuid,
  related_action_item_id uuid,
  source_event jsonb NOT NULL, -- what triggered this risk (e.g. doctrine rule fire, color review finding, sentinel flag)
  mitigation_plan text,
  mitigation_doc_ids uuid[] NOT NULL DEFAULT '{}', -- evidence of mitigation
  evidence_grade text CHECK (evidence_grade IN ('A','B','C')),
  identified_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  due_at timestamptz,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX risks_status_severity_idx ON risks (status, severity);
CREATE INDEX risks_related_opp_idx ON risks (related_opportunity_id) WHERE related_opportunity_id IS NOT NULL;
```

## Hard rules

1. **Risks are not duplicates.** When a similar risk fires twice on the same opportunity, the second fire creates a `risk_event` log entry, not a new risk row. Use vector similarity (F-301) on description to detect.
2. **Doctrine rule fires create risks.** Every F-303 rule violation auto-creates an open risk with category derived from rule type. Resolution requires either fix-the-condition OR Shawn's recorded override.
3. **Color review findings create risks.** Each finding from any color review (F-Color-Team-Reviews #539) becomes a risk row linked to the source doc + section.
4. **Sentinel flags create risks.** Plumbing/ingest/credit failures fire risks tagged `category=compliance` or `technical`.
5. **Risks have owners.** Critical/high risks must have an owner before they can leave `open` status.

## Acceptance criteria

### Backend
- [ ] Migration: `risks` + `risk_events` tables
- [ ] CRUD: `POST/GET/PATCH /v3/risks`
- [ ] `GET /v3/risks?status=open&severity=critical|high` — Launchpad roll-up query
- [ ] `GET /v3/opportunities/:id/risks` — per-entity risks
- [ ] Hooks: F-303 rule fire, color review finding, Sentinel flag → all create risks via internal API
- [ ] Dedup worker: similar-description risks on same entity within 7 days are merged with new event

### Frontend
- [ ] `/risks` page — list all risks with filters (status, severity, category, owner, related entity)
- [ ] `/risks/:id` — risk detail with timeline, mitigation plan editor, evidence doc upload
- [ ] Launchpad "What's at risk" panel — top 5 critical/high open risks across all entities, with one-click to risk detail
- [ ] Risks tab on Opportunity/Capture/Pipeline detail pages
- [ ] Color review output (F-539) shows each finding with "create risk" button (pre-filled)

### Decision Memory hook
- [ ] Resolved/accepted risks feed F-302 — improves future PWin calibration on risk-weighted features

### Tests
- [ ] Dedup test: identical-description risks on same opp within 7 days collapse to event log not new row
- [ ] Doctrine hook test: F-303 fire creates risk with correct category
- [ ] Owner-required test: cannot move critical risk out of `open` without owner

## Risks
- Risk inflation: too many noise risks dilute Launchpad. Auto-archive `low` severity risks after 30 days if untouched. Severity must be justified — F-302 reviews severity calibration monthly.
- Owner bottleneck: if Shawn owns 80% of critical risks, Launchpad becomes a Shawn-only panel. Sentinel must alert on owner concentration > 70%.

## Definition of done
- Doctrine rule fires on an opportunity → risk auto-created → visible on opp page + Launchpad → Shawn assigns owner + mitigation plan → owner uploads mitigation doc → risk moves to resolved → F-302 ingests resolution for PWin retraining
- Color review on uploaded doc surfaces 5 findings → each becomes a clickable risk → Launchpad reflects all 5
- Same risk firing twice within 7 days does NOT duplicate, creates event log entry on existing risk
