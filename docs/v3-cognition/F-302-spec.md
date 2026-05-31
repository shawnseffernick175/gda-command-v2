# F-302 — Decision Memory + Learning Loop (Cognition Layer)

**Phase:** Cognition Layer — Track A
**Depends on:** F-300 (agent calls `pwin_score` + `decision_memory_lookup`)
**Can run parallel with:** F-301, F-303
**Required by:** F-Opp-Auto-Analysis (PWin), F-Capability-Matching, F-Launchpad (decision history), every agentic surface that should "remember"

---

## Objective

The "learns" part of the agentic AI. Capture every qualify/kill/win/loss/team decision with rationale and outcome, then close the loop by retraining the PWin scoring model on the accumulated data.

Without this, the agent has amnesia — every analysis is a fresh start, nothing improves from experience. With this, GDA Command compounds insight.

---

## Schema

```sql
-- Every decision Shawn (or the agent on his behalf) makes
CREATE TABLE agent_decisions (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL,                -- 'qualify', 'kill', 'pass', 'bid', 'no_bid', 'team_with', 'avoid_team', 'win', 'loss', 'withdraw', 'exclusion_override'
  entity_kind TEXT NOT NULL,         -- 'opportunity', 'pursuit', 'capture', 'partner', 'document', 'pipeline_item'
  entity_id UUID NOT NULL,
  rationale TEXT NOT NULL,           -- required, no empty rationales
  evidence_refs JSONB DEFAULT '[]',  -- [{ source_url, source_type, grade }]
  doctrine_alignment_score INT,      -- 1-40 (sum of 8 principles 1-5)
  exclusion_triggers JSONB,          -- [{ exclusion_id, override_rationale }] if any
  margin_check JSONB,                -- { passed: bool, margin_pct, threshold }
  made_by TEXT NOT NULL,             -- 'shawn' or 'agent:<surface>'
  made_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT,                      -- 'won', 'lost', 'withdrawn', 'no_award', null until resolved
  outcome_recorded_at TIMESTAMPTZ,
  outcome_evidence_refs JSONB,
  parent_decision_id UUID REFERENCES agent_decisions(id),  -- threading: kill follows qualify, win follows bid
  agent_run_id UUID REFERENCES agent_runs(id)              -- which agent run, if agent-initiated
);

CREATE INDEX agent_decisions_entity ON agent_decisions(entity_kind, entity_id);
CREATE INDEX agent_decisions_made_at ON agent_decisions(made_at DESC);
CREATE INDEX agent_decisions_outcome ON agent_decisions(outcome) WHERE outcome IS NOT NULL;

-- Feature vector for each scored opportunity
CREATE TABLE pwin_features (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL,
  features JSONB NOT NULL,           -- structured feature set
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pwin_features_opp ON pwin_features(opportunity_id, computed_at DESC);

-- Win/loss labels joined back to features for training
CREATE TABLE pwin_outcomes (
  id UUID PRIMARY KEY,
  opportunity_id UUID NOT NULL,
  feature_snapshot_id UUID REFERENCES pwin_features(id),
  outcome TEXT NOT NULL,             -- 'won', 'lost', 'no_award'
  outcome_value NUMERIC,             -- contract value if won
  decision_id UUID REFERENCES agent_decisions(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versioned PWin models
CREATE TABLE pwin_model_versions (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,      -- 'v1-rules', 'v2-logistic-2026-06-15', 'v3-xgb-2026-08-01'
  model_kind TEXT NOT NULL,          -- 'rules', 'logistic', 'xgboost'
  trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trained_on_outcomes_count INT,
  feature_schema JSONB NOT NULL,
  model_blob BYTEA,                  -- pickled model for ML versions; null for rules
  rules_config JSONB,                -- rules definition for rules version
  metrics JSONB,                     -- {auc, accuracy, calibration, ...}
  is_active BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- Index ensuring only one active version
CREATE UNIQUE INDEX pwin_one_active ON pwin_model_versions(is_active) WHERE is_active = TRUE;
```

---

## Feature schema (initial)

```python
PwinFeatures = {
  # Vehicle / vehicle access
  "vehicle": str,                     # 'rs3_sb', 'oasis_plus', 'seaport_nxg', 'cio_sp3', 'mda_shield', 'open_market', ...
  "has_vehicle_access": bool,
  "vehicle_set_aside": str,           # 'sb', 'sdvosb', '8a', 'unrestricted'

  # Customer
  "agency": str,                       # 'army', 'navy', 'usaf', 'nsa', 'mda', 'darpa', ...
  "sub_agency": str,                   # 'cecom', 'peo_stri', 'navsea', ...
  "is_existing_customer": bool,

  # Scope
  "naics": str,
  "ceiling_value_m": float,            # in $M
  "is_recompete": bool,
  "is_incumbent": bool,                # GDA / Envision is current contractor
  "incumbent_competitor": str,         # name if known
  "scope_match_score": float,          # 0-100 from F-Capability-Matching

  # Timing
  "days_to_rfp_release": int,
  "days_to_proposal_due": int,
  "is_under_continuing_resolution": bool,

  # Capability fit (from RAG over offerings)
  "core_offering_match": list,         # list of matched offerings
  "clearance_required": str,           # 'none', 'secret', 'ts', 'ts_sci', 'ts_sci_poly'
  "clearance_fit": bool,               # GDA has cleared staff

  # Doctrine / exclusions / margin
  "doctrine_alignment_score": int,     # 1-40
  "exclusion_triggered": bool,
  "exclusion_ids": list,
  "expected_margin_pct": float,
  "below_margin_floor": bool,

  # Teaming
  "needs_teaming_partner": bool,
  "candidate_partners": list,

  # Competitive
  "named_competitors_count": int,
  "competitor_incumbency_rate": float, # for incumbent recompetes: historical %

  # Pricing context (from USAspending similar awards)
  "similar_awards_count": int,
  "avg_similar_award_value_m": float
}
```

---

## PWin model evolution

**v1 — Rules-based (immediate)**
```
base = 30
+ incumbency_bonus = is_incumbent ? +30 : 0
+ capability_match = scope_match_score * 0.3
+ vehicle_access = has_vehicle_access ? +10 : -15
+ clearance_fit = clearance_fit ? +5 : -10
+ doctrine_bonus = (doctrine_alignment_score / 40) * 10
- margin_penalty = below_margin_floor ? -20 : 0
- exclusion_kill = exclusion_triggered ? CLAMP TO 0 : 0
+ teaming_bonus = needs_teaming_partner AND candidate_partners_count >= 1 ? +5 : (needs_teaming_partner ? -10 : 0)
clamped to [0, 100]
```
Every score returns the breakdown so the user sees exactly why.

**v2 — Logistic regression (after ≥20 resolved outcomes)**
- Trained nightly on `pwin_outcomes JOIN pwin_features`
- Calibrated probabilities via Platt scaling
- Sklearn pickle stored in `pwin_model_versions.model_blob`

**v3 — Gradient-boosted (after ≥100 resolved outcomes)**
- XGBoost classifier
- Feature importance exposed for explainability
- SHAP values returned with score so user sees which features pushed it up/down

Model promotion is **automatic** but flagged: every active-version swap writes a `pwin_model_versions` row with `is_active=true` and demotes the previous version.

---

## HTTP surface (extends gda-agent-v3)

```
POST /memory/decisions
  body: { kind, entity_kind, entity_id, rationale, evidence_refs?, doctrine_alignment_score?, exclusion_triggers?, margin_check?, made_by, parent_decision_id?, agent_run_id? }
  response: { decision_id }

GET /memory/decisions?entity_kind=...&entity_id=...&kind=...&since=...
  response: AgentDecision[]

PATCH /memory/decisions/:id/outcome
  body: { outcome, outcome_value?, outcome_evidence_refs? }
  response: 200 (triggers retrain check)

POST /pwin/features
  body: { opportunity_id, features }
  response: { feature_snapshot_id }

POST /pwin/score
  body: { opportunity_id, features? (computes if absent) }
  response: { score, model_version, feature_weights, top_drivers, confidence }

GET /pwin/model
  response: { active_version, trained_at, trained_on_outcomes_count, metrics }

POST /pwin/retrain (admin only)
  response: { new_version, promoted, metrics }
```

---

## Acceptance criteria

### Schema
- [ ] All 4 tables created via versioned migration
- [ ] Indices in place
- [ ] Migration idempotent + reversible
- [ ] Unique-active-version constraint enforced

### Decision capture
- [ ] Every qualify/kill/team button in the UI writes an `agent_decisions` row
- [ ] Rationale is required — UI does not allow submission with empty rationale
- [ ] Exclusion override writes a decision with `kind='exclusion_override'` and `exclusion_triggers` populated
- [ ] Outcomes can be recorded via `PATCH /memory/decisions/:id/outcome` from the UI when contract awards are detected (or manually)
- [ ] Decisions are immutable once written (no edit; only outcome can be added later via PATCH)

### Feature computation
- [ ] `POST /pwin/features` computes the full feature vector from opportunity + RAG + capability match + doctrine check
- [ ] Feature snapshot is versioned (recomputed on opp update; old snapshots preserved for training)
- [ ] If feature computation fails, returns explicit error (no silent default zeros)

### v1 rules scorer
- [ ] Rules definition lives in `pwin_model_versions` row with kind=`rules`, marked active
- [ ] `POST /pwin/score` returns score 0-100 with `feature_weights` showing each rule's contribution
- [ ] `top_drivers` is a list of strings: `["+30 incumbency", "+15 doctrine alignment", "-10 needs teaming partner, none identified"]`
- [ ] Score is deterministic given the same features

### v2 logistic upgrade
- [ ] Nightly cron job: `python -m pwin.train_if_ready`
- [ ] If `resolved_outcomes >= 20`, train logistic, evaluate via 5-fold CV, write new `pwin_model_versions` row
- [ ] Auto-promote if `AUC > 0.65` (configurable threshold)
- [ ] Promotion logs to `pwin_model_versions` + structured log
- [ ] If new model fails to beat baseline, keeps current active

### v3 XGB upgrade path
- [ ] At `>= 100` outcomes, training kind switches to XGBoost
- [ ] SHAP values computed and returned with each score
- [ ] Migration from logistic to XGB is one-way (no fallback unless XGB fails CV)

### Decision history UI
- [ ] On any opportunity page: "Decision History" panel showing every prior decision (qualify, kill, team, override, outcome) chronologically
- [ ] Each row: kind, date, made_by, rationale, doctrine score, evidence links
- [ ] On Launchpad: "Recent Decisions" summary (last 7 days)
- [ ] Filter: by entity_kind, kind, outcome

### PWin display
- [ ] On opportunity detail: PWin score displayed prominently with breakdown
- [ ] Breakdown is plain language: "72% — 9-year incumbency boosts you by 30 points, capability match adds 22, doctrine alignment adds 8, but margin pressure on recompete deducts 8"
- [ ] Model version is shown ("scored by v2-logistic-2026-06-15")
- [ ] Confidence interval shown when model supports it

### Agent integration (calls F-300)
- [ ] `pwin_score` tool returns the full breakdown for the agent to cite
- [ ] `decision_memory_lookup` tool lets the agent recall prior decisions on similar opps to inform new recommendations
- [ ] When agent recommends qualify/kill, it cites prior similar decisions and outcomes

### Container-level
- [ ] `curl http://gda-agent-v3:8001/pwin/model` returns 200 with active version
- [ ] `curl http://gda-agent-v3:8001/memory/decisions?entity_kind=opportunity&limit=5` returns recent decisions
- [ ] DB query `SELECT version, is_active, trained_on_outcomes_count FROM pwin_model_versions;` shows version history

### Test coverage
- [ ] Unit: rules scorer math, all branches
- [ ] Unit: logistic training pipeline (synthetic data)
- [ ] Integration: full flow — create opp → compute features → score → record decision → record outcome → check retrain trigger
- [ ] Integration: rationale-required validation
- [ ] Integration: outcome PATCH does not allow re-PATCH (immutable after first set)

---

## Non-negotiables

- Container-level verification on every AC
- No score without breakdown
- Decisions are immutable; outcomes append-only
- Model upgrades preserve history (old versions never deleted)
- Plain-language explanation always available — never just a number

---

## Out of scope

- ML platform (no Vertex / SageMaker — use Python + scikit + xgboost in-container)
- A/B testing different models simultaneously (future)
- External feature stores (Postgres is fine at our scale)

---

## Deliverables

- PR titled `feat(F-302): Decision Memory + Learning Loop — agent_decisions, pwin features/outcomes/models, v1 rules scorer, v2 training pipeline`
- New module: `services/gda-agent-v3/src/memory/` + `services/gda-agent-v3/src/pwin/`
- Migration: `migrations/v3_NNN_agent_decisions_and_pwin.sql`
- UI: `apps/frontend-v3/src/components/DecisionHistory.tsx`, `PwinBreakdown.tsx`
- Nightly cron: `docker-compose.prod.yml` cron service or systemd timer
