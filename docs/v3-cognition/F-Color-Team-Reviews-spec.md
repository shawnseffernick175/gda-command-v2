# F-Color-Team-Reviews — Multi-Color Review on Any Uploaded Doc

**Phase:** Track D (Output Generators) — gated on Cognition Layer (F-300/F-301/F-302/F-303) being live
**Depends on:** F-300 (Agent Runtime), F-301 (RAG corpus), F-303 (Doctrine Rules Engine)
**Supersedes:** narrower F-209 (Black Hat only, capture-only scope)

---

## Objective

Upload any document (RFP draft, capture plan, white paper, proposal section). Hit "Run Color Team." Select one or more colors, or "Run All." Get a structured, source-linked, doctrine-graded review per color. Results render in the UI and export as PDF.

**Six colors ship. No Gold.** Green is the executive/final pass.

---

## The Six Colors

| Color | What it does | Primary inputs |
|---|---|---|
| **Pink** | Storyboard / outline review — compliance matrix against the RFP, win-theme placement, ghost-competitor positioning, structural gaps | uploaded doc + RFP (if linked) + RAG (win-theme library, past capture plans) |
| **Red** | Draft proposal review — score each section as a government evaluator would, identify weak claims, scoring risk, evidence gaps | uploaded doc + Section L/M (if RFP linked) + RAG (past CPARs, scoring rubrics) |
| **Black** | Adversarial competitor simulation — for each named competitor, what they will bid, price, themes, attack angles, discriminator counters | uploaded doc + GovWin + GovTribe + USAspending + RAG (competitor history) |
| **Blue** | Customer perspective — read as the CO / COR / PM would; pain points addressed; risk tolerance matched; past-performance relevance to *this* customer | uploaded doc + RAG (agency history, customer touchpoints, prior CPARs at this agency) |
| **White** | Compliance-only sweep — Section L/M crosswalk, FAR clauses, page / font / format limits, mandatory submittals | uploaded doc + RFP (if linked) + FAR ref store |
| **Green** | Executive / final pass — pricing review (labor mix, margin vs. competitor history, USAspending pricing data, FFP risk), **8% margin floor check, exclusion check, full doctrine alignment scorecard, signature-ready verdict**. Green absorbs what would have been Gold. | uploaded doc + F-303 `doctrine_check` + F-302 pricing model + USAspending + RAG |

**Gold is intentionally not included.** Per user instruction May 31, 2026: drop Gold; Green is the executive/final pass.

---

## User flow

1. User uploads a doc on any door (or from a global "+ Upload" action). Universal Ingestion classifies it (RFP, proposal draft, capture plan, white paper, etc.).
2. On the doc detail view, "Run Color Team" button.
3. Modal: checkboxes for Pink / Red / Black / Blue / White / Green + "Run All" toggle. User can attach a linked RFP / opportunity / past-performance set if relevant.
4. Submit. UI shows live progress per color (status pill: queued → running → complete → with finding count).
5. Per-color result view: structured findings (severity, citation, recommended fix, doctrine score where applicable).
6. **Diff mode:** if the doc has prior versions, re-running shows diff against the prior review (new findings, resolved findings, regressed findings).
7. **Actions:** every finding has a one-click "Send to Action Item Tracker" button.
8. **Export:** PDF + UI view; version history preserved.

---

## Architecture

```
upload → F-Universal-Ingestion (classify) → doc record in `documents` table
                                          ↓
                            "Run Color Team" → ColorTeamRun record
                                          ↓
                       F-300 Agent Runtime spawns 1 sub-agent per selected color
                                          ↓
                  each sub-agent calls tools (RAG search, doctrine_check, govwin_search,
                  govtribe_search, usaspending_search, pricing_lookup) and returns
                  structured findings
                                          ↓
                     findings persisted → UI render → PDF generator
```

### Tables (new in V3)

```sql
-- A single "Run Color Team" invocation
CREATE TABLE color_team_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES documents(id),
  linked_rfp_id   uuid REFERENCES opportunities(id),  -- optional
  colors          text[] NOT NULL,                    -- subset of {pink,red,black,blue,white,green}
  status          text NOT NULL DEFAULT 'queued',     -- queued | running | complete | error
  triggered_by    uuid NOT NULL REFERENCES users(id),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  agent_trace_id  uuid REFERENCES agent_traces(id)   -- ties to F-300 trace
);

-- Per-color findings inside a run
CREATE TABLE color_team_findings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES color_team_runs(id) ON DELETE CASCADE,
  color           text NOT NULL,                      -- pink | red | black | blue | white | green
  severity        text NOT NULL,                      -- info | warning | critical | blocker
  section_ref     text,                               -- "Section L.4.2", "Vol II p.13", etc.
  finding         text NOT NULL,
  recommended_fix text,
  citations       jsonb NOT NULL DEFAULT '[]',        -- [{source, url, grade A/B/C}]
  doctrine_score  jsonb,                              -- only on green; from doctrine_check
  exclusion_hits  text[],                             -- only on green; exclusion ids triggered
  margin_check    jsonb,                              -- only on green; {projected_margin, floor, pass/fail}
  action_item_id  uuid REFERENCES action_items(id),   -- set when user sends to tracker
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX color_team_findings_run_color ON color_team_findings(run_id, color);
CREATE INDEX color_team_runs_doc ON color_team_runs(document_id);
```

### API

- `POST /v3/color-teams/run` — body `{ document_id, colors[], linked_rfp_id? }` → returns `{ run_id, agent_trace_id }`. Kicks off async; returns immediately.
- `GET /v3/color-teams/runs/:run_id` — status + per-color counts + completion timestamps
- `GET /v3/color-teams/runs/:run_id/findings?color=green` — findings list
- `GET /v3/color-teams/runs/:run_id/diff?against=:prior_run_id` — diff view
- `GET /v3/color-teams/runs/:run_id/export.pdf` — PDF export
- `POST /v3/color-teams/findings/:finding_id/to-action-item` — push to Action Item Tracker

### Frontend

- Doc detail view: "Run Color Team" button + modal
- Run-in-progress view with per-color status pills
- Run-complete view: 6 collapsible color sections (only the colors that were run)
- Finding card: severity chip, finding text, citation chips (clickable to source), "Send to Action Items" button
- **Green section adds:** doctrine alignment scorecard (8 rows from F-303), exclusion banner (red if any hit), margin gauge (projected vs. 8% floor)
- Diff mode toggle when prior run exists
- PDF export button (renders the same content as a brand-styled PDF)

---

## Acceptance Criteria

### Functional
- [ ] User can upload a 30-page RFP draft, select all 6 colors, and complete the full review in ≤5 minutes
- [ ] Each color returns structured findings with severity, section ref, recommended fix, and citations
- [ ] Every citation is clickable to the source (URL or in-app doc/page reference)
- [ ] Every citation has an evidence grade (A primary / B secondary / C hypothesis) per F-303 rubric
- [ ] Gold is NOT a selectable color anywhere in the UI, API, or DB enum
- [ ] Green review includes the doctrine alignment scorecard (8 rows), exclusion check, and 8% margin-floor check
- [ ] If Green finds an exclusion hit, the doc is flagged "executive override required" and Action Item is auto-created
- [ ] Diff mode renders new / resolved / regressed findings against the prior run
- [ ] PDF export matches the UI view 1:1 (no fields lost in export)
- [ ] Every finding can be one-click sent to Action Item Tracker

### Container-level
- [ ] `POST /v3/color-teams/run` with a sample doc + colors=[green] from inside the docker network returns a run_id within 1s
- [ ] Polling `GET /v3/color-teams/runs/:id` shows status transitions queued → running → complete
- [ ] `curl ... /findings?color=green` returns non-empty findings within 5min on a 30-page test doc
- [ ] `agent_traces` table has a row for the run with `tool_calls` populated (proves F-300 ran)
- [ ] `doctrine_check` tool was called exactly once per Green run (proves F-303 wired)

### Tests
- [ ] Unit: each color's prompt + tool registry validated against a golden doc
- [ ] Unit: Gold is rejected at the API layer (400 with "Gold not supported; use Green")
- [ ] Integration: full run end-to-end on a fixture RFP draft (Green finds 8% margin violation, exclusion #4)
- [ ] Contract: PDF export hash stable for a fixture run (no nondeterminism in layout)

### UI
- [ ] Dark mode primary, light opt-in
- [ ] Severity chips use restrained palette (Hydra Teal accents; red only for blocker/exclusion)
- [ ] Citations render as `[A]`, `[B]`, `[C]` chips inline next to claims
- [ ] No cartoon icons; no decorative illustrations
- [ ] Loading states for each color show real progress, not a spinner

### Doctrine guardrails (per standing rules)
- [ ] No symptom patches; root-cause only
- [ ] Source link on every data point
- [ ] Nothing displayed >5h old without staleness warning (for cached RAG / GovWin / GovTribe pulls used during the run)

---

## Non-goals (explicit)
- No Gold review (removed per user instruction)
- No auto-submit of findings as a finished proposal — every finding is a recommendation, Shawn decides
- No multi-user concurrent editing of a single run — runs are immutable once complete; re-run for changes
- No real-time streaming of findings to the UI — batched per-color delivery is fine (sub-5min target)

---

## Build sequencing
1. Schema + API skeleton (`color_team_runs`, `color_team_findings`, endpoints)
2. Sub-agent prompts per color (6 prompts, each with its tool budget from F-300 registry)
3. UI: run modal + status view + finding cards
4. Green-only additions: doctrine scorecard + exclusion banner + margin gauge
5. Diff mode
6. PDF export
7. Action Item integration

---

## Devin instructions
- Build behind feature flag `color_team_reviews_v1`
- Use `documents` table from F-Universal-Ingestion; if not yet live, stub the upload path with a direct file upload
- Tool registry calls go through F-300 — do NOT bypass the runtime
- All findings persist to DB; no in-memory only state
- Render Green's doctrine scorecard using the exact 8 principle names from F-303 (no paraphrasing)
- PDF export uses the existing brand template (Hydra Teal #01696F, dark default)
- Open PR with: schema migration, backend routes, frontend pages, sub-agent prompts, integration test
- Do NOT merge until Shawn says "go"
