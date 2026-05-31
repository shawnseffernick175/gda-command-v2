# F-311: Financial Bible — Manual Upload, PD-SYS 4-File Format, Envision-OU Scoped

## Status
**Queued** — depends on F-300, F-301, F-303. Do NOT add `devin-ready` until those merge.

## Why this exists (Completion Plan item #13)
Pricing decisions today happen outside the tool — in spreadsheets that Shawn maintains manually. The tool can't enforce the 8% margin floor (F-303) because it doesn't know the numbers. **Financial Bible** is the canonical financial source: rates, indirects, allowable costs, escalation, profit, history of priced pursuits. Envision-scoped (OU3).

## Source format (binding)
Shawn maintains financials in **PD Systems 4-file format**:
1. `01_Rates.xlsx` — labor categories × rates × clearance levels
2. `02_Indirects.xlsx` — fringe, OH, G&A, fee bands per contract type
3. `03_ODCs_Escalation.xlsx` — other direct costs + annual escalation tables
4. `04_History_Priced.xlsx` — past priced pursuits with outcomes (won/lost/no-bid) + final pricing details

V3 ingests these 4 files via manual upload (not automated — Shawn controls when to refresh) and exposes them through Financial Bible APIs.

## Hard rules

1. **Manual upload only.** No automated sync. Shawn uploads → tool versions the upload → tool re-validates → tool flags any breaking changes.
2. **PD-SYS 4-file format is the contract.** Schema validation rejects files that don't match the expected sheet names + columns.
3. **Envision-OU scoped.** Riverstone + PD Systems financials are NOT loaded here. (Their pricing happens elsewhere — partner profiles F-312 carries summary fit only.)
4. **8% margin floor enforced (F-303).** Every pricing scenario built from Bible inputs is auto-checked against margin floor. Below 8% = doctrine violation = risk + disqualification path.
5. **Version history.** Every upload preserved as a snapshot. Rollback supported.

## Schema

```sql
CREATE TABLE financial_bible_versions (
  id uuid PRIMARY KEY,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT false,
  source_files jsonb NOT NULL -- { rates_xlsx, indirects_xlsx, odcs_xlsx, history_xlsx } with object storage refs
);

CREATE TABLE financial_rates (
  version_id uuid NOT NULL,
  labor_category text NOT NULL,
  clearance text NOT NULL,
  rate numeric NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  PRIMARY KEY (version_id, labor_category, clearance, effective_from)
);

CREATE TABLE financial_indirects (
  version_id uuid NOT NULL,
  contract_type text NOT NULL,
  fringe_pct numeric NOT NULL,
  overhead_pct numeric NOT NULL,
  ga_pct numeric NOT NULL,
  fee_band_low numeric NOT NULL,
  fee_band_high numeric NOT NULL,
  PRIMARY KEY (version_id, contract_type)
);

CREATE TABLE financial_history (
  version_id uuid NOT NULL,
  pursuit_id text NOT NULL,
  agency text,
  outcome text CHECK (outcome IN ('won','lost','no_bid','withdrew')),
  bid_price numeric,
  winner_price numeric,
  notes text,
  PRIMARY KEY (version_id, pursuit_id)
);
```

## Acceptance criteria

### Backend
- [ ] Migration: 4 tables above + financial_odc_escalation table
- [ ] `POST /v3/financial-bible/upload` — multipart accepts 4 xlsx files → validates schema → versions
- [ ] `GET /v3/financial-bible/active` — returns active version metadata + summary stats
- [ ] `POST /v3/financial-bible/activate/:version_id` — promote a version to active (atomic switch)
- [ ] `GET /v3/financial-bible/rates?labor_category=&clearance=&date=` — query rates
- [ ] `POST /v3/pricing-scenarios` — build a priced scenario for an opportunity using active version → returns margin + doctrine check
- [ ] F-303 hook: pricing scenario below 8% margin → creates risk (F-307)

### Frontend
- [ ] `/financials` page — upload 4 files at once, see active version, version history, diff against previous
- [ ] On `/opportunities/:id` and `/captures/:id` → "Build pricing scenario" surface using active Bible
- [ ] Margin gauge visible on every pricing scenario with doctrine pass/fail badge

## Tests
- [ ] Schema validation: malformed xlsx files rejected with clear error
- [ ] Version isolation: activating a new version doesn't mutate prior scenarios — they pin to their original version
- [ ] Margin floor: scenario at 7.99% → doctrine fail → risk auto-created

## Risks
- File format drift: PD-SYS changes their templates. Strict schema validation with versioned schemas; allow Shawn to declare format version on upload.
- Confidential data: Financial Bible carries sensitive pricing — must be encrypted at rest, access logged, no LLM exposure of raw rates without explicit Shawn flag.

## Definition of done
- Shawn uploads 4 xlsx → tool validates → activates → opens any opportunity → builds pricing scenario → margin gauge shows result → if <8% doctrine violation risk appears in Launchpad.
