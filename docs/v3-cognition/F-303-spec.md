# F-303 — Doctrine Rules Engine

**Phase:** Cognition Layer — Track A / Track B (parallel)
**Depends on:** F-301 (uses RAG for doctrine canonical chunks)
**Required by:** F-300 (tool: `doctrine_check`), F-Opp-Auto-Analysis, F-Color-Team-Reviews (Green pass — executive/final), F-Capability-Matching, F-302 (margin floor check)

---

## Objective

Encode AJ's Operating Doctrine, the 6 Strategic Exclusions, the 8% margin floor, and the Evidence A/B/C rubric as **enforceable rules in the tool** — not wallpaper, not vibes. The agent checks every pursuit against these rules; UI flags violations; qualify-with-override requires written rationale that is logged forever.

---

## Rules encoded

### The 8 Doctrine Principles (each scored 1-5 with rationale)
1. **Alignment** — Does this pursuit serve a defined OU lane and the GDA enterprise direction?
2. **Ethics Always** — Are there integrity, regulatory, or representation risks?
3. **Teamwork** — Does this leverage cross-OU integration where appropriate (Digital-to-Dirt)?
4. **Data First, Then Debate** — Is the rationale grounded in [A] sources, or [C] hypothesis?
5. **Relentless Execution** — Do we have the delivery capacity (staffing, vehicle, past performance)?
6. **Relationships, Relationships, Relationships** — Do we have the customer relationship and history?
7. **Market, Mission, Brand Focus** — Does this fit "Boring Excellence" / Agile Integrator / Mission Assurance positioning?
8. **Customer Facing** — Is the customer pain well understood with documented engagement?

Each scored 1-5 by the agent based on RAG retrieval + opp features. Sum = `doctrine_alignment_score` (1-40).

### The 6 Strategic Exclusions (hard rules)
1. **Low-assurance non-classified cyber services** — block
2. **Commercial-only software development** — block
3. **Staff-augmentation-only pursuits** (no platform/mission ownership) — block
4. **<8% gross margin in core lanes** without executive override — block
5. **Non-cleared / purely commercial IT** — block
6. **OU2-specific:** mission lanes outside NSA, NGA, NRO, ODNI, CIA, USCYBERCOM — block (only enforced when pursuit is OU2-led)

A pursuit triggering any exclusion has the qualify button disabled. Override available only with written rationale logged to `agent_decisions.kind='exclusion_override'`.

### 8% margin floor
Triggered on the Capability Matching step and any pricing input (Capture pricing assumptions, Color Green review).

### Evidence A/B/C rubric
- **[A] Primary** — contracts, budgets, CPARs, FPDS/USASpending, SAM.gov, federal register, NIST, DoDI
- **[B] Secondary** — GovWin, trade press, FOIA reading rooms, public award notices
- **[C] Hypothesis** — customer conversation, tribal knowledge, "everyone knows"

Every fact the agent surfaces is tagged with one of these in the UI. Must-win decisions cannot use [C] without explicit override.

---

## Schema

```sql
CREATE TABLE doctrine_principles (
  id TEXT PRIMARY KEY,             -- 'alignment', 'ethics_always', 'teamwork', ...
  name TEXT NOT NULL,
  short_form TEXT NOT NULL,
  long_form TEXT NOT NULL,
  evaluation_prompt TEXT NOT NULL, -- the prompt the agent uses to score
  display_order INT NOT NULL
);

CREATE TABLE doctrine_exclusions (
  id TEXT PRIMARY KEY,             -- 'low_assurance_cyber', 'commercial_software_only', ...
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_logic_prompt TEXT NOT NULL,
  applies_to_ous TEXT[] DEFAULT ARRAY['gda','envision','riverstone','pds'],
  is_hard_block BOOLEAN DEFAULT TRUE,
  override_requires TEXT          -- 'executive_rationale'
);

CREATE TABLE doctrine_rules_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- seed:
-- 'margin_floor_pct' = 8
-- 'evidence_required_for_must_win' = ['A','B']
-- 'must_win_pursuits' = ['MAPS','63rd_BSB','IEW_S_SETA_recompete','BAMBOOTIGER']

CREATE TABLE doctrine_evaluations (
  id UUID PRIMARY KEY,
  entity_kind TEXT NOT NULL,       -- 'opportunity', 'capture', 'document'
  entity_id UUID NOT NULL,
  agent_run_id UUID,
  principle_scores JSONB NOT NULL, -- { alignment: {score: 4, rationale: '...'}, ethics_always: {...}, ... }
  alignment_total INT NOT NULL,    -- 1-40
  exclusion_triggers JSONB,        -- [{ id, triggered: true, evidence: ['...'] }]
  margin_check JSONB,              -- { passed: bool, margin_pct, threshold, source }
  evaluated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX doctrine_eval_entity ON doctrine_evaluations(entity_kind, entity_id, evaluated_at DESC);
```

Seed migrations populate `doctrine_principles` and `doctrine_exclusions` with canonical content sourced from AJ's Op Doctrine PDF + FY26-FY28 Business Plan.

---

## HTTP surface

```
POST /doctrine/check
  body: { entity_kind, entity_id, context? }
  response: DoctrineEvaluation (principles, alignment_total, exclusion_triggers, margin_check, recommendations)

GET /doctrine/evaluations?entity_kind=...&entity_id=...
  response: history of evaluations

GET /doctrine/principles
  response: 8 principles with full descriptions

GET /doctrine/exclusions
  response: 6 exclusions with full descriptions

GET /doctrine/config
  response: current rules config (margin floor, must-win pursuits, etc.)

PATCH /doctrine/config/:key (admin only)
  body: { value }
  response: updated config row
```

---

## Acceptance criteria

### Schema + seed
- [ ] All 4 tables created via versioned migration
- [ ] `doctrine_principles` seeded with all 8 principles + evaluation prompts
- [ ] `doctrine_exclusions` seeded with all 6 exclusions + trigger logic
- [ ] `doctrine_rules_config` seeded with `margin_floor_pct=8`, `evidence_required_for_must_win=['A','B']`, `must_win_pursuits=[...]`
- [ ] Migrations idempotent and reversible

### Doctrine check agent tool
- [ ] `POST /doctrine/check` with `{ entity_kind: 'opportunity', entity_id: <uuid> }` returns full evaluation within 5s
- [ ] Each of the 8 principles is scored 1-5 with a rationale that cites RAG chunks
- [ ] Exclusions are evaluated; each returns `triggered: bool` with evidence cited
- [ ] Margin check pulls from opp's expected margin (or pricing if available)
- [ ] `recommendations` array lists actionable next steps (e.g., "Identify teaming partner to meet OU2 clearance scope")

### Hard-block enforcement
- [ ] UI on opportunity detail: if any exclusion is `triggered: true`, the "Qualify" button is disabled with a clear message naming the exclusion
- [ ] An "Override" link opens a modal requiring written rationale (min 50 chars)
- [ ] Override writes `agent_decisions.kind='exclusion_override'` with rationale + evidence_refs
- [ ] Override unlocks the Qualify button for this opp only (audited)

### Margin floor
- [ ] When pricing assumptions are entered (Capture module / Green color review), margin < 8% triggers a red banner
- [ ] Banner cites the rule and links to the config row
- [ ] Margin override follows same pattern as exclusion override

### Evidence rubric in UI
- [ ] Every claim displayed in the tool has an [A]/[B]/[C] badge inline
- [ ] [C] hypotheses on must-win pursuits trigger a warning ("This decision relies on hypothesis-grade evidence. Upgrade to [A] or [B] before proposal submission.")
- [ ] Badges are color-coded: [A] green, [B] amber, [C] red

### Doctrine scorecard surface
- [ ] On every opportunity detail page: collapsible "Doctrine Alignment" panel
- [ ] Shows all 8 principles with score + rationale + RAG citations
- [ ] Total alignment score prominent (e.g., "32/40 — Strong alignment")
- [ ] Lowest-scoring principle highlighted with suggested action

### Admin config UI
- [ ] `/v3/settings/doctrine` admin page lists all principles + exclusions + config
- [ ] Inline edit on `description` and `evaluation_prompt` (audit logged)
- [ ] Margin floor adjustable (with audit + Shawn approval required)
- [ ] Must-win pursuits list manageable

### Agent integration
- [ ] `doctrine_check` tool is registered in F-300's tool registry
- [ ] When the agent runs an opp analysis, it calls `doctrine_check` exactly once and includes the result in its final output
- [ ] Color Team "Green" review uses `doctrine_check` as one of its primary inputs (Green absorbs what would have been Gold; Gold is removed)

### Container-level
- [ ] `curl http://gda-agent-v3:8001/doctrine/principles` returns 8 principles
- [ ] `curl http://gda-agent-v3:8001/doctrine/exclusions` returns 6 exclusions
- [ ] `curl http://gda-agent-v3:8001/doctrine/check` for a test opportunity returns a populated evaluation

### Test coverage
- [ ] Unit: each principle's evaluation prompt produces expected output on canned inputs
- [ ] Unit: each exclusion's trigger logic on canned inputs (positive + negative cases)
- [ ] Integration: opp triggers exclusion #3 (staff aug only) → UI blocks qualify → override writes decision
- [ ] Integration: margin < 8% blocks; override unblocks with audit
- [ ] Integration: doctrine evaluation history accumulates per opp; re-check after data change shows updated scores

---

## Non-negotiables

- Container-level verification
- No silent rule bypass — every override is written, evidenced, and discoverable
- Rules are version-controlled in code AND in DB seed — both must match
- Evidence rubric badges visible everywhere, not just in one panel
- Plain-language rationale on every score (no opaque numbers)

---

## Out of scope

- Cross-tenant rule overrides (single-tenant V3)
- A/B testing different rule sets (future)
- ML-learned rules (rules are CEO-authored, deterministic, auditable; learning lives in F-302 PWin)

---

## Deliverables

- PR titled `feat(F-303): Doctrine rules engine — 8 principles + 6 exclusions + margin floor + evidence rubric, with enforcement`
- New module: `services/gda-agent-v3/src/doctrine/`
- Migration: `migrations/v3_NNN_doctrine_rules.sql`
- UI: `apps/frontend-v3/src/components/DoctrineAlignment.tsx`, `EvidenceBadge.tsx`, admin `Settings/Doctrine.tsx`
- Seed content extracted from `/srv/gda-agent-v3/initial_corpus/3_-AJ-OP-Doctorine.pdf` + business plan
