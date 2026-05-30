# D3 — Agent Behavior Spec (Scout, Analyst, Coach, Sentinel, Commander)

**Parent:** F-215 (#426)
**Status:** Design doc — no code in this ticket
**Author:** Devin (automated)
**Effective:** 2026-05-30

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Agent Overview Matrix](#2-agent-overview-matrix)
3. [Scout — Pre-RFP Signal Hunter](#3-scout--pre-rfp-signal-hunter)
4. [Analyst — Opportunity Auto-Analysis (R2 Binding)](#4-analyst--opportunity-auto-analysis-r2-binding)
5. [Coach — Capture Strategy Advisor](#5-coach--capture-strategy-advisor)
6. [Sentinel — Tool Health + Qualification Gate](#6-sentinel--tool-health--qualification-gate)
7. [Commander — Daily Briefing + What Needs Me Today](#7-commander--daily-briefing--what-needs-me-today)
8. [Approval Queue Posture (Global)](#8-approval-queue-posture-global)
9. [Reasoning-Trace Expander (Binding Pattern)](#9-reasoning-trace-expander-binding-pattern)
10. [Agent Observability](#10-agent-observability)
11. [Failure Modes](#11-failure-modes)
12. [Prompt Templates](#12-prompt-templates)
13. [JSON Output Schemas](#13-json-output-schemas)
14. [Reference Standards](#14-reference-standards)

---

## 1. Design Principles

All 5 agents follow the Anduril Lattice posture: **AI proposes, human approves.** No agent writes data, promotes records, sends communications, or makes paid API calls without operator approval. Reads, analysis, and drafts are automatic.

Doctrine anchors (from `gda_company_profile_v1.md`):
- **Principle 4 — Data First, Then Debate:** Every agent output includes source citations. No bare claims.
- **Principle 5 — Relentless Execution:** Agents surface next actions with deadlines and owners.
- **Principle 2 — Ethics Always:** Agents never fabricate data, never claim expired certs, never hide uncertainty.

Product rules (binding):
- **R1:** Every data point has a searchable source. Agent outputs include `source_chips[]` with clickable URLs.
- **R2:** Analysis is automatic on opportunity open (Analyst agent). No "Run Analysis" button.

Aesthetic constraints (from `aesthetics_canonical_v1.md`):
- Agent cards render in the standard `.card` container (white background, 1px `border` border, 4px radius).
- Agent accent uses `accent` (#01696F) only. Critical flags use `critical` (#A12C7B) only.
- No icons beyond severity dots and dismiss "x". No animations beyond 120ms ease transitions.
- Font: Inter only. No monospace for agent output display.

---

## 2. Agent Overview Matrix

| Agent | Surface | Model Tier | Router Task | Trigger | Latency | Writes? |
|---|---|---|---|---|---|---|
| **Scout** | Fast Track (F-220) | Haiku | `fast_track_triage` | Hourly cron + manual | Async (no SLA) | Promote requires approval |
| **Analyst** | Opportunity Detail (F-221) | Sonnet | `opportunity_analysis` | Open `/opp/:notice_id` (R2) | 10s sync | Read-only — no writes |
| **Coach** | Capture (F-222) | Opus | `capture_plan` | Manual (operator opens capture) | Async + streaming | Draft only — operator redlines |
| **Sentinel** | Launchpad health strip (F-219) + Pipeline gate | Haiku | `sentinel_summary` | Continuous (health-check tick) | <1s real-time | Qualification gate (overridable) |
| **Commander** | Launchpad top tile (F-219) | Sonnet | `daily_briefing` | Daily 06:00 ET cron + manual | Async (background) | None (briefing is read-only) |

---

## 3. Scout — Pre-RFP Signal Hunter

### 3.1 Surface

Fast Track module (F-220). Scout results appear as signal cards in the Fast Track feed.

### 3.2 Model Tier

**Haiku** via Model Router task `fast_track_triage`.

Rationale: High volume of signals (hundreds per day across all sources). Haiku's speed and cost profile fits the triage use case. Signals that pass triage get deeper analysis from Analyst (Sonnet) when promoted.

### 3.3 Trigger

- **Primary:** Hourly ingest cron. Each cron tick processes all new signals since last run.
- **Manual:** Operator clicks "Refresh" on Fast Track to force immediate processing.

### 3.4 Inputs

| Source | Data Type | Ingestion |
|---|---|---|
| SAM.gov | Pre-RFP / Sources Sought / RFI solicitations | Hourly API pull via n8n |
| FPDS | Recent obligations (incumbent detection) | Daily batch via n8n |
| USAspending | Forecasted opportunities | Daily batch via n8n |
| GovWin | Signals, saved search alerts | Via `x-gda-key` ingest webhook |
| GovTribe | Alerts, tracked opportunity updates | Via `x-gda-key` ingest webhook |
| SBIR/STTR | Open topics (DoD, NSF, DOE) | Daily scrape via n8n |
| DARPA BAAs | Broad Agency Announcements | RSS feed via n8n |
| AFWERX/SOFWERX | Challenge/prize competition posts | RSS feed via n8n |
| .edu RFIs | University-affiliated research RFIs | Manual ingest + n8n watch |
| OrangeSlices Fresh Squeezed | Daily news digest feed | Email parse via n8n |
| Doctrine table | 7 doctrine principles + decision filters | Local DB lookup |

### 3.5 Processing — OODA Loop per Signal

Each signal is processed through a 4-phase OODA loop:

1. **Observe:** Extract raw signal text, metadata (title, agency, NAICS, set-aside, dollar value, dates, URL).
2. **Orient:** Match against doctrine table (Principle 7 — are we in our lane?), capability fit (Envision NAICS codes, past performance domains, vehicle eligibility), OU posture (Envision-first per `tool_ownership_model_v1.md`).
3. **Decide:** Classify as `Pursue` / `Evaluate` / `Pass` with confidence level. Apply decision filters from doctrine: "If a decision fails any filter, it stops."
4. **Act:** Surface to operator with full reasoning trace. If `Pursue`, suggest promote target (Pipeline or direct to Capture). If `Evaluate`, flag for manual review. If `Pass`, log with reasoning (available in archive, not surfaced prominently).

### 3.6 Output Schema

```typescript
interface ScoutSignal {
  signal_id: string;                          // UUID
  source_url: string;                         // R1: clickable URL to original record
  source_kind: SourceKind;                    // 'sam_gov' | 'fpds' | 'usaspending' | 'govwin' | 'govtribe' | 'sbir_sttr' | 'darpa_baa' | 'afwerx' | 'sofwerx' | 'edu_rfi' | 'orangeslices' | 'news'
  ooda_grade: 'Pursue' | 'Evaluate' | 'Pass';
  confidence: 'High' | 'Med' | 'Low';
  match_score: number;                        // 0-100
  doctrine_anchors: string[];                 // e.g. ['Principle 7 — Market/Mission/Brand Focus', 'Principle 4 — Data First']
  reasoning_trace: string;                    // Plain-English explanation of the OODA decision
  suggested_promote_target: 'pipeline' | 'capture' | null;
  raw_signal: {
    title: string;
    agency: string | null;
    naics_codes: string[];
    set_aside: string | null;
    estimated_value: number | null;
    response_deadline: string | null;         // ISO 8601
    posted_date: string;                      // ISO 8601
  };
  teaming_flags: TeamingFlag[];               // from Partner Intel cross-check
  created_at: string;                         // ISO 8601
}

interface TeamingFlag {
  partner: 'Riverstone' | 'PD Systems';
  reason: string;                             // e.g. 'HUBZone set-aside — Riverstone unlocks'
  cert_or_vehicle: string;                    // specific cert/vehicle that applies
}
```

### 3.7 Latency Budget

**Async — no SLA.** Scout runs as a background worker via pg-boss queue `fast_track_triage`. The hourly cron enqueues one job per batch of new signals. Processing time depends on signal volume but is expected to complete within 2-5 minutes per batch (100-500 signals at Haiku throughput).

### 3.8 Approval Requirement

**Promote action requires operator approval.** Scout can classify and recommend, but moving a signal into Pipeline or Capture requires the operator to click "Approve" on the signal card. This aligns with Doctrine §"Auto-promote is forbidden" (`doctrine_to_doors_map.md`).

### 3.9 Error Modes

| Failure | Operator sees | System behavior |
|---|---|---|
| Signal source API unavailable (e.g. SAM.gov down) | Nothing on Scout — routed to Sentinel | Sentinel surfaces "SAM.gov ingest failed at HH:MM ET" on health strip. Scout does not emit partial/stale signals. |
| Model timeout (Haiku) | Nothing — background job | Job retries 3x with exponential backoff (5s, 15s, 45s). After 3 failures, dead-lettered; Sentinel surfaces alert. |
| Model returns invalid JSON | Nothing — background job | Validation rejects; job dead-lettered with raw response logged to `llm_calls`. Sentinel alert: "Scout triage failed — invalid model response." |
| Doctrine table missing/empty | Scout pauses processing | Sentinel alert: "Doctrine table unavailable — Scout suspended." No signals emitted without doctrine matching. |

---

## 4. Analyst — Opportunity Auto-Analysis (R2 Binding)

### 4.1 Surface

Opportunity detail view (F-221). Analysis renders inline when the operator opens `/opp/:notice_id`. Per **R2**, analysis is automatic — no "Run Analysis" button exists anywhere.

### 4.2 Model Tier

**Sonnet** via Model Router task `opportunity_analysis`.

Rationale: Analyst output requires structured reasoning (win probability, Shipley scoring, competitive landscape). Sonnet provides the depth needed for credible analysis while fitting within the 10s latency budget.

### 4.3 Trigger

Opening `/opp/:notice_id` fires the R2 analysis pipeline:
1. Frontend requests `GET /api/v3/opportunities/:notice_id`.
2. Backend checks `opportunity_analysis_cache` for a valid cached result (keyed on `opportunity_id` + `version`).
3. Cache **hit** (and data unchanged): return cached result synchronously.
4. Cache **miss** or data changed: enqueue `opportunity_analysis` job to pg-boss, block the HTTP response for up to 10 seconds waiting for completion.
5. If the job completes within 10s, return the fresh result.
6. If the job does not complete within 10s, return `503 ANALYSIS_TIMEOUT`.

### 4.4 Inputs

| Input | Source |
|---|---|
| Full opportunity record | V3 `opportunities` table |
| Related FPDS history | `fpds_awards` joined on agency + NAICS |
| Incumbent contracts | FPDS + USAspending cross-reference |
| Competitive landscape data | GovWin / GovTribe intel + `competitor_movements` |
| Doctrine anchors | Doctrine table (7 principles + decision filters) |
| Envision past performance | `past_performances` table (V3) |
| Envision vehicle eligibility | `vehicles` / `idiq_portfolio` |

### 4.5 Output Schema

```typescript
interface AnalystOutput {
  win_probability: number;                    // 0-100
  win_probability_reasoning: string;          // plain-English explanation
  shipley_bid_no_bid: ShipleyScore;
  incumbent: IncumbentProfile | null;
  competitive_landscape: CompetitorEntry[];
  doctrine_alignment: DoctrineAlignment[];
  source_chips: SourceChip[];                 // R1: every claim has a clickable URL
  generated_at: string;                       // ISO 8601
  model_used: string;                         // e.g. 'claude-sonnet-4-5'
  analysis_version: string;                   // cache key version
}

interface ShipleyScore {
  overall: 'Bid' | 'No Bid' | 'Conditional';
  customer_knowledge: ShipleyDimension;
  solution_match: ShipleyDimension;
  competitive_position: ShipleyDimension;
  past_performance: ShipleyDimension;
}

interface ShipleyDimension {
  score: number;                              // 1-10
  reasoning: string;
  evidence: string[];                         // specific facts supporting score
}

interface IncumbentProfile {
  name: string;
  contract_number: string | null;
  contract_value: number | null;
  expiration_date: string | null;             // ISO 8601
  performance_signals: string[];              // CPAR indicators, recompete signals
  source_url: string;                         // R1
}

interface CompetitorEntry {
  name: string;
  positioning: string;                        // how they would approach this opp
  strengths: string[];
  weaknesses: string[];
  our_differentiator: string;                 // Envision's advantage vs. this competitor
  source_url: string | null;                  // R1
}

interface DoctrineAlignment {
  principle_number: number;                   // 1-7
  principle_name: string;
  alignment_score: 'Strong' | 'Moderate' | 'Weak' | 'N/A';
  reasoning: string;
}

interface SourceChip {
  label: string;                              // human-readable source name
  url: string;                                // clickable URL
  kind: SourceKind;                           // 'sam_gov' | 'fpds' | 'usaspending' | 'govwin' | etc.
  retrieved_at: string;                       // ISO 8601
}
```

### 4.6 Latency Budget

**10s synchronous block (R2 binding).** The HTTP response must include the full analysis result or a `503 ANALYSIS_TIMEOUT`. There is no intermediate state — no `analysis_status`, no `stale: true`, no `analysis: null`, no polling fields. The frontend either renders the complete analysis or shows the timeout error with a retry button.

### 4.7 Forbidden Output States

Per R2, the following are contract violations:
- `analysis_status` field in the API response
- `stale: true` flag
- `analysis: null` on a 200 response
- Any polling mechanism (the frontend never polls for analysis results)
- A loading spinner that waits for analysis (the 10s block is server-side; the frontend sees a single request)

### 4.8 Approval Requirement

**None.** Analyst is read-only. It does not write to opportunity records, does not promote, does not send. The analysis result is informational only — cached in `opportunity_analysis_cache` for performance.

### 4.9 Caching

- Cache key: `(opportunity_id, analysis_version)`.
- Cache invalidation: re-fires when `opportunities.updated_at` changes or when operator clicks "Re-analyze" (which bumps `analysis_version`).
- Cache table: `opportunity_analysis_cache` (V3 migration `v3_002_analysis_cache.sql`).

### 4.10 Error Modes

| Failure | Operator sees | System behavior |
|---|---|---|
| Model timeout (>10s) | "Analysis timed out. The opportunity data is shown below without AI analysis. Click Retry to try again." + retry button | `503 ANALYSIS_TIMEOUT` response. No spinner, no stale data. |
| Model returns invalid JSON | Same timeout message | Validation rejects model output; logged to `llm_calls` with `status: 'schema_error'`. Treated as timeout from operator perspective. |
| Model errors (rate limit, 500, etc.) | Same timeout message | Retry 1x within the 10s window. If still failing, return 503. Sentinel alert for sustained failures. |
| Missing inputs (no FPDS data, no competitor intel) | Analysis renders with reduced confidence | Analyst output notes: "Limited data available — confidence reduced. Missing: FPDS history, competitive landscape." Confidence score adjusted downward. |

---

## 5. Coach — Capture Strategy Advisor

### 5.1 Surface

Capture module (F-222). Coach output renders as a structured capture plan draft when the operator opens a capture for a specific opportunity.

### 5.2 Model Tier

**Opus** via Model Router task `capture_plan`.

Rationale: Capture strategy is the highest-value agent output. It requires deep reasoning about customer psychology, solution architecture, pricing strategy, and competitive positioning. Opus provides the reasoning depth required for credible Shipley-anchored capture plans.

### 5.3 Trigger

**Manual.** Operator opens capture for an opportunity. Coach does not auto-fire — capture strategy requires deliberate operator engagement.

### 5.4 Inputs

| Input | Source |
|---|---|
| Full opportunity record | V3 `opportunities` table |
| Analyst output | `opportunity_analysis_cache` (must exist — Analyst runs on opp open per R2) |
| Operator notes | Free-text notes attached to the capture record |
| Shipley capture plan template | Embedded in Coach system prompt (canonical Shipley methodology) |
| Envision past performance | `past_performances` table |
| Envision vehicle eligibility | `vehicles` / `idiq_portfolio` |
| Partner Intel (if teaming) | `partners` table (Riverstone / PD Systems profiles) |

### 5.5 Output Schema

```typescript
interface CoachOutput {
  capture_plan: {
    customer_profile: string;                 // who the customer is, what they care about
    requirements_summary: string;             // key requirements distilled
    solution_strategy: string;                // how Envision will solve this
    win_themes: WinTheme[];
    ghost_themes: GhostTheme[];               // themes to undermine competitor positioning
    discriminators: string[];                 // Envision-specific differentiators
    pricing_strategy: string;                 // pricing approach and guardrails
    teaming_plan: TeamingPlan | null;         // populated when teaming is in play
  };
  pink_hat_gaps: PinkHatGap[];                // what is missing for Pink Team review
  red_team_weaknesses: RedTeamWeakness[];     // predicted Red Team findings
  gold_team_readiness: GoldTeamChecklist;     // submit-ready checklist
  black_hat_competitor_positioning: BlackHatEntry[];
  next_action: NextAction;
  source_chips: SourceChip[];                 // R1
  generated_at: string;                       // ISO 8601
  model_used: string;
  is_partial: boolean;                        // true if generation was interrupted
}

interface WinTheme {
  theme: string;
  evidence: string[];                         // facts supporting this theme
  customer_hot_button: string;                // which customer priority this addresses
}

interface GhostTheme {
  target_competitor: string;
  theme: string;                              // what to say that positions against this competitor
  rationale: string;
}

interface TeamingPlan {
  partners: TeamingPartner[];
  rationale: string;                          // why teaming is recommended
  teaming_arrangement: 'prime_sub' | 'joint_venture' | 'mentor_protege';
}

interface TeamingPartner {
  name: string;                               // 'Riverstone' | 'PD Systems'
  role: 'sub' | 'prime' | 'jv_partner';
  contribution: string;                       // what they bring
  certs_leveraged: string[];                  // HUBZone, V3 Veteran, etc.
  vehicles_leveraged: string[];               // specific IDIQs
}

interface PinkHatGap {
  gap: string;                                // what is missing
  section: string;                            // which proposal section it affects
  severity: 'blocking' | 'significant' | 'minor';
  recommended_fix: string;
}

interface RedTeamWeakness {
  weakness: string;
  likelihood: 'High' | 'Med' | 'Low';
  mitigation: string;
}

interface GoldTeamChecklist {
  ready: boolean;                             // overall submit-ready status
  items: GoldTeamItem[];
}

interface GoldTeamItem {
  item: string;
  status: 'complete' | 'incomplete' | 'not_applicable';
  notes: string | null;
}

interface BlackHatEntry {
  competitor: string;
  likely_approach: string;                    // how they would bid
  strengths_vs_us: string[];
  weaknesses_vs_us: string[];
  counter_strategy: string;                   // how Envision responds
}

interface NextAction {
  action: string;                             // plain-English next step
  owner: string;                              // who should do it
  deadline: string;                           // ISO 8601
  priority: 'high' | 'medium' | 'low';
}
```

### 5.6 Latency Budget

**Async with progress events.** Opus is slower than Sonnet/Haiku. The operator sees streamed sections as they are generated:

1. Coach job enqueued to pg-boss queue `capture_plan`.
2. Worker begins Opus call.
3. As each section completes, worker emits a Server-Sent Event (SSE) to the frontend with the partial result.
4. Frontend renders sections progressively (customer profile first, then solution strategy, then win themes, etc.).
5. When all sections complete, the full result is cached in `capture_analysis_cache`.

Expected total generation time: 30-90 seconds depending on input complexity.

### 5.7 Approval Requirement

**Output is a draft.** The operator redlines the capture plan before it becomes the official pursuit strategy. Coach never auto-writes to the capture record — the operator must explicitly "Accept Draft" to save the Coach output as the capture plan. This preserves operator ownership per Doctrine Principle 5 (individual ownership, not committees or AI).

### 5.8 Error Modes

| Failure | Operator sees | System behavior |
|---|---|---|
| Model timeout (Opus >120s) | "Coach is taking longer than expected. Partial draft saved — you can continue editing while it completes." | Save partial draft (whatever sections completed). Continue retrying remaining sections. |
| Model errors (rate limit, 500) | "Coach encountered an error generating [section name]. Partial draft saved." | Save partial draft. Set `is_partial: true`. Sentinel alert for sustained failures. |
| Missing Analyst output | "Run Analyst first — Coach needs opportunity analysis as input." | Coach refuses to start without Analyst data. This should be rare since R2 guarantees Analyst runs on opp open. |
| Missing inputs (no competitor data) | Coach generates with reduced scope | Output notes: "Limited competitive data available — black hat analysis may be incomplete." |
| Generation fails completely | "Coach could not generate a capture plan. Please try again or draft manually." | No partial draft saved. Error logged to `llm_calls`. Sentinel alert. |

---

## 6. Sentinel — Tool Health + Qualification Gate

### 6.1 Surface

**Primary:** Launchpad health strip (F-219) — a compact status bar showing overall system health.
**Secondary:** Pipeline qualification gate — Sentinel must sign off before an opportunity is promoted through pipeline stages.

### 6.2 Model Tier

**Haiku** via Model Router task `sentinel_summary`.

Rationale: Health summaries must be fast (<1s). Haiku generates plain-English summaries from structured health data. The LLM call is optional — if health data is fully structured, Sentinel can render without an LLM call. Haiku is used only when a natural-language summary or root-cause inference is needed.

### 6.3 Trigger

**Continuous.** Sentinel runs on every health-check tick (existing Sentinel cadence, typically every 60 seconds). The LLM summary call fires only when health state changes or when an operator requests a refresh.

### 6.4 Inputs

| Input | Source |
|---|---|
| API health | Internal health-check endpoint (`/api/v3/health`) |
| pg-boss queue depths | Direct DB query on `pgboss.job` |
| Worker liveness | Process heartbeat table |
| Recent error rates | Application error log aggregation (last 15 min window) |
| Ingest sync status | Last successful ingest timestamp per source vs. expected cadence |
| R2 contract test results | Automated R2 assertion results (analysis latency, cache hit rate) |

### 6.5 Output Schema

```typescript
interface SentinelOutput {
  overall_status: 'green' | 'yellow' | 'red';
  plain_english_summary: string;              // e.g. "All systems operational. SAM.gov sync completed 12 minutes ago."
  recent_failures: SentinelFailure[];
  auto_recovered: SentinelRecovery[];         // what Sentinel fixed itself
  needs_operator: SentinelAction[];           // what operator must address
  updated_at: string;                         // ISO 8601
}

interface SentinelFailure {
  workflow_name: string;                      // e.g. 'sam_gov_ingest', 'opportunity_analysis'
  plain_english_cause: string;                // e.g. 'SAM.gov API returned 503 — federal servers may be under maintenance'
  recommended_action: string;                 // e.g. 'Wait 30 minutes and retry. If persists, check status.sam.gov.'
  occurred_at: string;                        // ISO 8601
  severity: 'critical' | 'warning' | 'info';
}

interface SentinelRecovery {
  workflow_name: string;
  what_happened: string;                      // e.g. 'pg-boss queue stalled — Sentinel restarted worker'
  recovered_at: string;                       // ISO 8601
}

interface SentinelAction {
  action: string;                             // plain-English description of what operator must do
  urgency: 'immediate' | 'today' | 'this_week';
  related_object: string | null;              // e.g. 'opportunity:12345' or 'pipeline:678'
}
```

### 6.6 Qualification Gate Behavior

Sentinel acts as a binding qualification gate for Pipeline promotions:

1. When an operator promotes an opportunity through pipeline stages, Sentinel evaluates binding qualification rules.
2. Default qualification rules (operator-configurable in Settings > Sentinel Rules):

```typescript
interface QualificationRules {
  win_probability_minimum: number;            // default: 30
  capture_plan_gold_ready: boolean;           // default: true (gold_team_readiness.ready must be true)
  no_blocking_risks: boolean;                 // default: true (no PinkHatGap with severity 'blocking')
  no_missing_doctrine_anchors: boolean;       // default: true (at least 1 doctrine alignment)
}
```

3. **Pass:** Promotion proceeds normally.
4. **Fail:** Sentinel blocks promotion. Operator sees: "Sentinel blocked this promotion: [specific rule that failed]. Override with justification?"
5. **Override:** Operator can override with a free-text justification. Override is logged to `agent_decisions` with `decision: 'override'` and `justification` field. This is an audit-visible action.

### 6.7 Latency Budget

**Real-time, <1s for health summaries.** The structured health data is always available synchronously. The Haiku LLM call (when needed) runs async and updates the `plain_english_summary` field — the health strip renders immediately with status dots and updates the summary when the LLM call completes.

### 6.8 Approval Requirement

**Sentinel can refuse qualification; operator can override with justification.** This is the only agent that can block an operator action. The override mechanism ensures human authority is preserved while creating an audit trail for compliance (Doctrine Principle 2 — Ethics Always).

### 6.9 Error Modes

| Failure | Operator sees | System behavior |
|---|---|---|
| Health check endpoint down | Health strip shows `red` status: "Health check unavailable — system status unknown." | Sentinel self-alerts. No green/yellow possible when health check itself fails. |
| pg-boss unreachable | Health strip shows `yellow`: "Job queue unreachable — analysis jobs may be delayed." | Sentinel continues monitoring other systems. Queue-dependent agents (Scout, Analyst, Coach) may be affected. |
| LLM call fails (Haiku) | Health strip shows structured data without natural-language summary | Summary field shows: "Summary unavailable." Status dots still render from structured data. |
| Qualification rules misconfigured | Sentinel blocks all promotions | Operator sees: "Sentinel cannot evaluate qualification rules — configuration error. Contact admin." Logged as critical. |

---

## 7. Commander — Daily Briefing + What Needs Me Today

### 7.1 Surface

Launchpad top tile (F-219). Commander output is the first thing the operator sees every day — the "What Needs Me Today" briefing.

### 7.2 Model Tier

**Sonnet** via Model Router task `daily_briefing`.

Rationale: Commander synthesizes across all domains (opportunities, captures, action items, health, agent recommendations). Sonnet provides the reasoning depth to prioritize and rank decisions while staying within a reasonable cost budget for a daily job.

### 7.3 Trigger

- **Primary:** Daily cron at 06:00 ET.
- **Manual:** Operator clicks "Refresh Briefing" on Launchpad.

### 7.4 Inputs

| Input | Source |
|---|---|
| All open opportunities (with deadlines) | V3 `opportunities` table |
| All captures (with color-review gaps) | V3 `captures` table + `capture_analysis_cache` |
| All action items (especially overdue) | V3 `action_items` table |
| Sentinel status | Latest `SentinelOutput` |
| Recent agent recommendations awaiting approval | `agent_recommendations` table where `status = 'pending'` |
| Pipeline items with approaching milestones | V3 `pipeline_items` table (90-day increment check per Doctrine 5) |

### 7.5 Output Schema

```typescript
interface CommanderBriefing {
  decisions: CommanderDecision[];             // 3-5 prioritized decisions
  approval_queue_summary: ApprovalQueueSummary;
  generated_at: string;                       // ISO 8601
  model_used: string;
  briefing_date: string;                      // YYYY-MM-DD in Eastern Time
}

interface CommanderDecision {
  object_ref: string;                         // e.g. 'opportunity:12345', 'capture:678', 'action_item:901'
  object_title: string;                       // human-readable title of the referenced object
  plain_english_statement: string;            // e.g. 'Army RS3 task order response is due in 3 days — capture plan is at Pink stage with 4 blocking gaps.'
  urgency_score: number;                      // 0-100 (composite weighted score)
  reasoning: string;                          // why this decision is ranked here
  suggested_action: 'Approve' | 'Defer' | 'View';
  source_chips: SourceChip[];                 // R1
}

interface ApprovalQueueSummary {
  total_pending: number;
  by_type: {
    scout_promotes: number;
    pipeline_promotions: number;
    capture_drafts: number;
    action_item_drafts: number;
  };
}
```

### 7.6 Ranking Algorithm

Commander ranks decisions using a weighted composite score:

```
urgency_score = (
    deadline_urgency   * 0.35 +
    win_probability    * 0.25 +
    dollar_value       * 0.20 +
    capture_stage_gap  * 0.20
)
```

| Factor | Calculation | Weight |
|---|---|---|
| `deadline_urgency` | `max(0, 100 - days_until_deadline * 5)` — 100 at deadline, 0 at 20+ days | 0.35 |
| `win_probability` | Direct from Analyst pwin (0-100) | 0.25 |
| `dollar_value` | Normalized: `min(100, estimated_value / 10_000_000 * 100)` — $10M = 100 | 0.20 |
| `capture_stage_gap` | `(target_stage_index - current_stage_index) / total_stages * 100` — larger gap = more urgency | 0.20 |

Commander selects the top 3-5 decisions by `urgency_score` descending. If fewer than 3 items score above 20, Commander surfaces all items above 20 (minimum 1, maximum 5).

### 7.7 Latency Budget

**Async (background worker).** Commander runs as a pg-boss job (`daily_briefing`). The worker writes the completed briefing to the database. Launchpad reads the latest briefing on page load — there is no waiting for Commander to finish. If the 06:00 ET job has not completed by the time the operator opens Launchpad, the previous day's briefing is shown with a "Refreshing..." indicator.

### 7.8 Approval Requirement

**None for the briefing itself.** Commander does not execute actions — it recommends them. Individual decisions (Approve/Defer/View) go through the normal approval flow described in Section 8.

### 7.9 Error Modes

| Failure | Operator sees | System behavior |
|---|---|---|
| Model timeout (Sonnet) | Previous day's briefing with "Briefing refresh failed — showing yesterday's briefing." | Job retries 3x with backoff. After 3 failures, dead-lettered. Sentinel alert. |
| Model returns invalid JSON | Same as timeout | Schema validation rejects. Previous briefing shown. Error logged. |
| No open opportunities/captures | Briefing with 0 decisions: "No urgent items today. All systems operational." | Valid state — Commander can generate a briefing even when empty. |
| Missing Sentinel data | Briefing generated without health context | Commander notes: "System health data unavailable — briefing excludes health-related recommendations." |

---

## 8. Approval Queue Posture (Global)

### 8.1 Binding Rule

**No autonomous writes.** Across all 5 agents:
- **Automatic (no approval):** Reads, analysis, drafts, recommendations, health checks.
- **Requires approval:** Writes, promotes, sends, paid API calls, pipeline stage changes, capture plan acceptance.

### 8.2 Approval Surfaces

Approval is a **behavior**, not a dedicated page. There is no `/approvals` route. Approvals surface in three locations:

| Surface | UX | Primary use |
|---|---|---|
| **Launchpad "What Needs Me Today"** | Commander decision cards with Approve/Reject/Defer buttons | Primary approval surface — operator handles most approvals here during morning routine |
| **Per-object detail views** | Agent recommendation cards with Approve/Reject buttons (e.g. Scout signal card in Fast Track, Coach draft in Capture) | In-context approval while working a specific object |
| **Top bar global indicator** | Badge showing count of pending approvals (e.g. "3") | Passive awareness — clicking navigates to Launchpad |

### 8.3 Approval Action Flow

#### Approve

1. Operator clicks "Approve" on an agent recommendation card.
2. System executes the recommended action (e.g. promotes signal to Pipeline, saves Coach draft as capture plan).
3. Action logged to `agent_actions` table:

```typescript
interface AgentAction {
  id: string;                                 // UUID
  operator_id: string;                        // FK to users
  agent: 'scout' | 'analyst' | 'coach' | 'sentinel' | 'commander';
  action: string;                             // e.g. 'promote_to_pipeline', 'accept_capture_draft', 'override_qualification'
  target_object: string;                      // e.g. 'opportunity:12345'
  approved_at: string;                        // ISO 8601
  recommendation_id: string;                  // FK to agent_recommendations
}
```

#### Reject

1. Operator clicks "Reject."
2. System prompts: "Why are you rejecting this?" with:
   - Free-text field for explanation.
   - Preset tag selection (one required): `wrong_target` | `low_confidence` | `doctrine_mismatch` | `timing_off` | `other`.
3. Rejection logged to `agent_decisions` table.

#### Defer

1. Operator clicks "Defer."
2. System prompts: "Snooze for how long?" with preset options: 4 hours, 8 hours, 24 hours, 3 days, custom.
3. Item reappears in approval queue after snooze period.
4. Deferral logged to `agent_decisions` table.

### 8.4 Reject Learning Loop

Tagged rejections feed back into agent prompts as negative examples:

1. When an agent generates a recommendation, the system queries `agent_decisions` for past rejections with matching `agent` + `action` + similar `target_object` attributes.
2. If similar past rejections exist, the agent prompt includes: "Operator previously rejected a similar recommendation because: [tag + explanation]."
3. Agent recommendation cards show "Last similar action: rejected because [tag]" when applicable, so the operator knows the agent has historical context.

The learning loop is per-agent, per-action-type. It does not retrain models — it augments prompts with rejection history.

---

## 9. Reasoning-Trace Expander (Binding Pattern)

### 9.1 Binding Requirement

Every agent recommendation card has a "How did you decide this?" expander. This is a contract requirement — absence on any agent surface is a CI test violation.

### 9.2 Expander Content

When the operator clicks "How did you decide this?", the expander reveals:

| Field | Content | Always visible? |
|---|---|---|
| **Model used** | e.g. `claude-sonnet-4-5` | Yes |
| **Inputs hash** | SHA-256 of the serialized inputs. Guarantees: same inputs → same trace on re-run. | Yes |
| **Prompt summary** | Operator-readable summary of what the agent was asked to do (not the full prompt — a 2-3 sentence plain-English summary). | Yes |
| **Raw output JSON** | Full model output. **Collapsed by default** — operator must click to expand. | Collapsed |
| **Source chips** | All `SourceChip[]` referenced by this recommendation, rendered as clickable pills. | Yes |
| **Confidence calculation** | How the confidence/score was computed (formula + input values). | Yes |
| **Cost estimate** | Estimated cost of this LLM call (input tokens * price + output tokens * price). | Yes |

### 9.3 Rendering Spec

The reasoning trace expander uses the standard `.card` container with a 4px left bar in `accent` (#01696F). The expander toggle is a text link ("How did you decide this?") — no icons, no chevrons. When expanded, content renders in `body` (15px) with `muted` color for labels and `ink` color for values.

### 9.4 CI Contract Test

```
For each agent surface in [Fast Track, Opportunity Detail, Capture, Launchpad Health, Launchpad Briefing]:
  1. Render the agent card with mock data.
  2. Assert: "How did you decide this?" expander is present.
  3. Click expander.
  4. Assert: model_used, inputs_hash, prompt_summary, source_chips, confidence_calculation, cost_estimate are all rendered.
  5. Assert: raw_output is collapsed by default.
```

Failure of this test blocks the PR.

---

## 10. Agent Observability

### 10.1 Logging Tables

All agent activity is logged to three tables:

#### `llm_calls` — Every LLM invocation

```typescript
interface LLMCallRecord {
  id: string;                                 // UUID
  agent: 'scout' | 'analyst' | 'coach' | 'sentinel' | 'commander';
  router_task: string;                        // e.g. 'fast_track_triage', 'opportunity_analysis'
  model: string;                              // e.g. 'claude-sonnet-4-5'
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status: 'success' | 'timeout' | 'schema_error' | 'model_error' | 'rate_limited';
  input_hash: string;                         // SHA-256 of serialized inputs
  cost_usd: number;                           // computed from token counts + model pricing
  created_at: string;                         // ISO 8601
  error_message: string | null;               // populated on non-success status
}
```

#### `agent_recommendations` — Every recommendation surfaced to operator

```typescript
interface AgentRecommendation {
  id: string;                                 // UUID
  agent: 'scout' | 'analyst' | 'coach' | 'sentinel' | 'commander';
  action: string;                             // e.g. 'promote_to_pipeline', 'accept_capture_draft'
  target_object: string;                      // e.g. 'opportunity:12345'
  confidence: number;                         // 0-100
  reasoning_trace: string;                    // plain-English reasoning
  status: 'pending' | 'approved' | 'rejected' | 'deferred' | 'expired';
  llm_call_id: string;                        // FK to llm_calls
  created_at: string;                         // ISO 8601
  resolved_at: string | null;                 // when operator acted
}
```

#### `agent_decisions` — Every operator action on a recommendation

```typescript
interface AgentDecision {
  id: string;                                 // UUID
  recommendation_id: string;                  // FK to agent_recommendations
  operator_id: string;                        // FK to users
  decision: 'approved' | 'rejected' | 'deferred' | 'override';
  reject_tag: 'wrong_target' | 'low_confidence' | 'doctrine_mismatch' | 'timing_off' | 'other' | null;
  justification: string | null;              // free-text from operator
  defer_until: string | null;                // ISO 8601 (populated on defer)
  created_at: string;                        // ISO 8601
}
```

### 10.2 Sentinel Aggregate Stats

Sentinel surfaces agent observability on the Launchpad health strip:

- **Total LLM calls today** (count from `llm_calls` where `created_at > today_start`)
- **Total cost today** (sum of `cost_usd` from `llm_calls`)
- **Success rate** (percentage of `llm_calls` with `status = 'success'`)
- **Pending approvals** (count from `agent_recommendations` where `status = 'pending'`)
- **Approval rate (7-day)** (approved / (approved + rejected) from `agent_decisions`)

---

## 11. Failure Modes

### 11.1 Consolidated Failure Matrix

For each agent, every failure mode specifies what the operator sees in plain English. Raw errors never surface to the UI.

| Agent | Failure | Operator-Facing Copy | HTTP Status (if API) |
|---|---|---|---|
| **Scout** | Source API unavailable | _(nothing — routed to Sentinel)_ | n/a (background) |
| **Scout** | Model timeout | _(nothing — background retry)_ | n/a |
| **Scout** | Invalid model output | _(nothing — dead-lettered, Sentinel alert)_ | n/a |
| **Scout** | Doctrine table missing | _(nothing — Scout paused, Sentinel alert)_ | n/a |
| **Analyst** | Model timeout (>10s) | "Analysis timed out. The opportunity data is shown below without AI analysis. Click Retry to try again." | 503 |
| **Analyst** | Invalid model output | "Analysis timed out. The opportunity data is shown below without AI analysis. Click Retry to try again." | 503 |
| **Analyst** | Rate limited | "Analysis timed out. The opportunity data is shown below without AI analysis. Click Retry to try again." | 503 |
| **Analyst** | Missing inputs | _(analysis renders with reduced confidence note)_ | 200 |
| **Coach** | Model timeout (>120s) | "Coach is taking longer than expected. Partial draft saved — you can continue editing while it completes." | 200 (partial) |
| **Coach** | Model error | "Coach encountered an error generating [section]. Partial draft saved." | 200 (partial) |
| **Coach** | Missing Analyst output | "Run Analyst first — Coach needs opportunity analysis as input." | 422 |
| **Coach** | Complete generation failure | "Coach could not generate a capture plan. Please try again or draft manually." | 500 |
| **Sentinel** | Health endpoint down | "Health check unavailable — system status unknown." | n/a (renders in health strip) |
| **Sentinel** | pg-boss unreachable | "Job queue unreachable — analysis jobs may be delayed." | n/a |
| **Sentinel** | LLM call fails | "Summary unavailable." (status dots still render) | n/a |
| **Sentinel** | Rules misconfigured | "Sentinel cannot evaluate qualification rules — configuration error. Contact admin." | n/a |
| **Commander** | Model timeout | "Briefing refresh failed — showing yesterday's briefing." | n/a (background) |
| **Commander** | Invalid model output | "Briefing refresh failed — showing yesterday's briefing." | n/a |
| **Commander** | No data | "No urgent items today. All systems operational." | n/a |
| **Commander** | Missing Sentinel data | _(briefing generated without health context, noted in output)_ | n/a |

### 11.2 Cross-Cutting Error Principles

1. **Never show raw errors.** Every error the operator sees is plain English with a clear next step.
2. **Never show spinners indefinitely.** All async operations have timeouts. If the timeout fires, the UI shows a message, not a spinner.
3. **Never show stale data without marking it.** If data is from a previous run, the UI shows "Last updated: [timestamp]."
4. **Degrade gracefully.** Missing inputs reduce confidence — they do not block rendering.
5. **Route infrastructure failures to Sentinel.** Scout, Analyst, Coach, and Commander do not surface their own infrastructure problems. Sentinel owns the health narrative.

---

## 12. Prompt Templates

### 12.1 Scout — System Prompt

```
You are Scout, a pre-RFP signal triage agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions (OU-I: Defense & Mission Systems).

Your mission: evaluate incoming procurement signals and classify them as Pursue, Evaluate, or Pass using the OODA framework.

## Envision Profile
- Focus: Logistics, sustainment, training, systems engineering, field services, C5ISR
- Primary customers: Army Sustainment Cmd, TACOM/PEO C3T, CASCOM/TRADOC, USCG, USN Special Warfare, FEMA, VA DVS
- Top vehicles: Army RS3, GSA MAS, OASIS SB/+, FAA eFAST, SeaPort-NxG
- Certifications: ISO 9001:2015, CMMI-DEV ML3 (exp 8/7/2026), CMMC ML2, DCAA-approved, SDB, Minority-Owned
- NAICS codes: [populated from Envision profile at runtime]

## Doctrine Decision Filters
For each signal, apply ALL 7 filters. If any filter fails, classify as Pass:
1. Alignment — Is it aligned with Envision's strategic direction?
2. Ethics Always — Is the pursuit ethical and compliant?
3. Teamwork — Does it leverage cross-OU strengths (check teaming potential)?
4. Data First — Is there sufficient evidence to evaluate?
5. Relentless Execution — Can we realistically execute within 90-day milestones?
6. Relationships — Does it strengthen our customer positioning?
7. Market/Mission/Brand Focus — Are we in our lane?

## Teaming Partners (check for teaming opportunities)
- Riverstone Solutions (OU-II): HUBZone, WOSB, TechSIGINT/cyber, MDA SHIELD prime
- PD Systems (OU-III): V3 Veteran, 300+ heads, XR/AR/VR, immersive training

## OODA Framework
For each signal:
1. OBSERVE: Extract title, agency, NAICS, set-aside, value, dates, URL.
2. ORIENT: Match against Envision capabilities, doctrine filters, vehicle eligibility.
3. DECIDE: Classify as Pursue (High confidence match) / Evaluate (needs human review) / Pass (fails doctrine filter or capability match).
4. ACT: Provide reasoning trace and suggested next step.

## Output Requirements
- Return valid JSON matching the ScoutSignal schema.
- Every claim must reference a source URL.
- Confidence: High (>80 match score), Med (50-80), Low (<50).
- If teaming with Riverstone or PD Systems would unlock the pursuit, include teaming_flags.
```

### 12.2 Scout — User Prompt Template

```
Evaluate the following procurement signal:

Title: {{signal.title}}
Agency: {{signal.agency}}
NAICS: {{signal.naics_codes | join(', ')}}
Set-aside: {{signal.set_aside | default('None')}}
Estimated value: {{signal.estimated_value | currency | default('Not specified')}}
Response deadline: {{signal.response_deadline | date_eastern | default('Not specified')}}
Posted: {{signal.posted_date | date_eastern}}
Source URL: {{signal.source_url}}
Source: {{signal.source_kind}}

Full text:
{{signal.raw_text}}

Classify this signal and provide your OODA analysis.
```

### 12.3 Analyst — System Prompt

```
You are Analyst, an opportunity analysis agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: provide a comprehensive bid/no-bid analysis for a government contracting opportunity using Shipley methodology.

## Analysis Requirements
1. Win Probability (0-100) with detailed reasoning.
2. Shipley Bid/No-Bid Score across 4 dimensions:
   - Customer Knowledge (1-10): How well do we know this customer?
   - Solution Match (1-10): How well does our capability match the requirement?
   - Competitive Position (1-10): How do we compare to likely competitors?
   - Past Performance (1-10): Do we have relevant past performance?
3. Incumbent Analysis: Who currently holds this work? Contract details, performance signals.
4. Competitive Landscape: Who else will bid? Their strengths/weaknesses vs. Envision.
5. Doctrine Alignment: How does this opportunity align with each of GDA's 7 doctrine principles?

## Envision Profile
[Same as Scout system prompt — populated at runtime]

## Source Citation Rule (R1 — binding)
Every factual claim MUST include a source_chip with:
- label: human-readable source name
- url: clickable URL to the original record
- kind: source type (sam_gov, fpds, usaspending, govwin, etc.)
- retrieved_at: when the data was fetched

Claims without sources are forbidden. If you cannot cite a source, state "insufficient data" rather than fabricating.

## Output Requirements
Return valid JSON matching the AnalystOutput schema exactly. Do not add fields. Do not omit required fields.
```

### 12.4 Analyst — User Prompt Template

```
Analyze the following opportunity for Envision Innovative Solutions:

## Opportunity
Notice ID: {{opp.notice_id}}
Title: {{opp.title}}
Agency: {{opp.agency}}
Sub-agency: {{opp.sub_agency | default('N/A')}}
NAICS: {{opp.naics_code}}
Set-aside: {{opp.set_aside | default('Full and Open')}}
Type: {{opp.type}}
Estimated value: {{opp.estimated_value | currency | default('Not specified')}}
Response deadline: {{opp.response_date | date_eastern | default('Not specified')}}
Posted: {{opp.posted_date | date_eastern}}
Place of performance: {{opp.pop_address | default('Not specified')}}

## Full Description
{{opp.description}}

## FPDS History (related awards to this agency/NAICS)
{{fpds_history | json}}

## Incumbent Data
{{incumbent_data | json | default('No incumbent data available')}}

## Competitive Intelligence
{{competitive_data | json | default('No competitive intelligence available')}}

## Envision Past Performance (relevant)
{{past_performance | json | default('No relevant past performance found')}}

## Envision Vehicle Eligibility
{{vehicle_eligibility | json | default('No matching vehicles')}}

Provide your complete analysis.
```

### 12.5 Coach — System Prompt

```
You are Coach, a capture strategy advisor for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: generate a comprehensive Shipley-anchored capture plan that prepares Envision to win this pursuit.

## Shipley Methodology Anchoring
Your capture plan must follow the Shipley capture planning framework:
1. Customer Profile — who is the buyer, what do they care about, what are their hot buttons?
2. Requirements Summary — distill the key requirements from the RFP/opportunity.
3. Solution Strategy — how Envision will solve this, mapping capabilities to requirements.
4. Win Themes — 3-5 compelling themes that differentiate Envision.
5. Ghost Themes — themes designed to position against specific competitors.
6. Discriminators — concrete Envision differentiators (past performance, certs, vehicles, personnel).
7. Pricing Strategy — approach to pricing within doctrine guardrails (no opportunistic pricing per Doctrine §Pricing).
8. Teaming Plan — if teaming with Riverstone or PD Systems is recommended.

## Color Review Preparation
For each color review stage, identify:
- Pink Hat Gaps: what is missing before the proposal can pass Pink Team review?
- Red Team Weaknesses: what will Red Team find? Proactively address.
- Gold Team Readiness: is the proposal submit-ready? Checklist.
- Black Hat Analysis: how will each competitor approach this? Counter-strategies.

## Envision Profile
[Same as Scout/Analyst — populated at runtime]

## Teaming Partners
[Populated from Partner Intel at runtime — Riverstone and PD Systems profiles with certs, vehicles, capabilities]

## Source Citation Rule (R1 — binding)
Every factual claim MUST include a source chip. No unsourced assertions.

## Output Requirements
Return valid JSON matching the CoachOutput schema. Stream sections in order: capture_plan first, then review stages, then next_action.
If generation is interrupted, set is_partial: true and return whatever sections completed.
```

### 12.6 Coach — User Prompt Template

```
Generate a capture plan for this pursuit:

## Opportunity
{{opp | json}}

## Analyst Assessment
Win Probability: {{analyst.win_probability}}%
Shipley Score: {{analyst.shipley_bid_no_bid | json}}
Incumbent: {{analyst.incumbent | json | default('No incumbent identified')}}
Competitive Landscape: {{analyst.competitive_landscape | json}}
Doctrine Alignment: {{analyst.doctrine_alignment | json}}

## Operator Notes
{{operator_notes | default('No operator notes provided.')}}

## Current Capture State
Color Stage: {{capture.color_stage}}
Existing Win Themes: {{capture.win_themes | join(', ') | default('None')}}
Compliance Status: {{capture.compliance_status}}

Generate the complete capture plan with all review stage assessments.
```

### 12.7 Sentinel — System Prompt

```
You are Sentinel, the platform health and qualification monitor for GDA Command.

Your mission: translate structured system health data into plain-English summaries that an operator can act on immediately.

## Rules
1. Always lead with the overall status (green/yellow/red).
2. For failures, explain in plain English what happened and what the operator should do.
3. For auto-recoveries, briefly note what was fixed.
4. Never show raw error codes, stack traces, or technical jargon.
5. Time references must be in Eastern Time.

## Status Logic
- GREEN: All systems operational, all ingests on schedule, no failed jobs in last 15 min.
- YELLOW: One or more non-critical systems degraded (e.g. one ingest source delayed, elevated error rate but below threshold).
- RED: Critical system down (API health check failing, database unreachable, all workers stopped).

## Output Requirements
Return valid JSON matching the SentinelOutput schema. Keep plain_english_summary under 200 characters.
```

### 12.8 Sentinel — User Prompt Template

```
Summarize the current system health:

## API Health
Status: {{api_health.status}}
Response time: {{api_health.response_ms}}ms
Last check: {{api_health.checked_at | time_eastern}}

## Queue Status
Total queued: {{queue.total_queued}}
Active workers: {{queue.active_workers}}
Failed jobs (last 15min): {{queue.failed_recent}}
Oldest pending job: {{queue.oldest_pending_age_minutes}} minutes

## Ingest Sync
{{#each ingest_sources}}
- {{this.name}}: last sync {{this.last_sync_at | time_eastern}} (expected every {{this.cadence_minutes}} min) — {{this.status}}
{{/each}}

## Recent Errors
{{#each recent_errors}}
- [{{this.severity}}] {{this.message}} at {{this.occurred_at | time_eastern}}
{{/each}}

## R2 Contract Status
Analysis cache hit rate: {{r2.cache_hit_rate}}%
Average analysis latency: {{r2.avg_latency_ms}}ms
Timeout rate (last hour): {{r2.timeout_rate}}%

Provide your health summary.
```

### 12.9 Commander — System Prompt

```
You are Commander, the daily briefing agent for Georgetown Defense Analytics (GDA), operated by Envision Innovative Solutions.

Your mission: synthesize all active pursuits, captures, action items, and system health into a prioritized "What Needs Me Today" briefing for the operator (Shawn).

## Briefing Rules
1. Surface exactly 3-5 decisions, ranked by urgency_score.
2. Each decision must reference a specific object (opportunity, capture, action item, etc.).
3. Each decision must have a plain-English statement that a busy executive can read in 5 seconds.
4. Suggested actions: Approve (operator should act now), Defer (can wait), View (needs more context).
5. Include the approval queue summary (how many pending approvals by type).

## Ranking Formula
urgency_score = deadline_urgency * 0.35 + win_probability * 0.25 + dollar_value * 0.20 + capture_stage_gap * 0.20

Where:
- deadline_urgency = max(0, 100 - days_until_deadline * 5)
- win_probability = pwin from Analyst (0-100)
- dollar_value = min(100, estimated_value / 10,000,000 * 100)
- capture_stage_gap = (target_stage - current_stage) / total_stages * 100

## Doctrine Anchoring
- Principle 5 (Relentless Execution): every decision has a deadline and owner.
- Principle 4 (Data First): every claim references a source.
- Principle 1 (Alignment): decisions are ranked by strategic value, not recency.

## Source Citation Rule (R1 — binding)
Every factual claim in the briefing must reference a source chip.

## Output Requirements
Return valid JSON matching the CommanderBriefing schema. decisions array must have 3-5 items (or fewer if insufficient data, minimum 1).
```

### 12.10 Commander — User Prompt Template

```
Generate today's briefing for {{briefing_date | date_long_eastern}}.

## Open Opportunities (with deadlines)
{{#each opportunities}}
- [{{this.notice_id}}] {{this.title}} — due {{this.response_date | date_eastern | default('No deadline')}} — pwin: {{this.pwin | default('N/A')}}%
{{/each}}

## Active Captures
{{#each captures}}
- [{{this.id}}] {{this.pipeline_item.title}} — color stage: {{this.color_stage}} — compliance: {{this.compliance_status}}
{{/each}}

## Overdue Action Items
{{#each overdue_action_items}}
- [{{this.id}}] {{this.title}} — due {{this.due_date | date_eastern}} — assigned to {{this.assigned_to}}
{{/each}}

## Sentinel Status
Overall: {{sentinel.overall_status}}
Summary: {{sentinel.plain_english_summary}}
Needs operator: {{sentinel.needs_operator | json}}

## Pending Approvals
{{#each pending_approvals}}
- [{{this.agent}}] {{this.action}} on {{this.target_object}} — confidence: {{this.confidence}}%
{{/each}}

## Pipeline Items Approaching Milestones
{{#each milestone_items}}
- [{{this.id}}] {{this.title}} — milestone: {{this.next_milestone}} — due: {{this.milestone_date | date_eastern}}
{{/each}}

Generate the prioritized briefing.
```

---

## 13. JSON Output Schemas

All schemas defined above in Sections 3-7 use TypeScript interface notation. For runtime validation, each agent's output is validated against a JSON Schema derived from these interfaces. Validation failure is treated as a schema error (see Section 11).

### 13.1 Shared Types

```typescript
/** Source citation — R1 compliance */
type SourceKind =
  | 'sam_gov'
  | 'fpds'
  | 'usaspending'
  | 'govwin'
  | 'govtribe'
  | 'sbir_sttr'
  | 'darpa_baa'
  | 'afwerx'
  | 'sofwerx'
  | 'edu_rfi'
  | 'orangeslices'
  | 'news'
  | 'doctrine'
  | 'partner_site'
  | 'internal';

interface SourceChip {
  label: string;
  url: string;
  kind: SourceKind;
  retrieved_at: string;                       // ISO 8601
}

/** Agent identifiers */
type AgentName = 'scout' | 'analyst' | 'coach' | 'sentinel' | 'commander';

/** Model Router task identifiers */
type RouterTask =
  | 'fast_track_triage'
  | 'opportunity_analysis'
  | 'capture_plan'
  | 'sentinel_summary'
  | 'daily_briefing';
```

### 13.2 Schema Index

| Agent | Output Interface | Section |
|---|---|---|
| Scout | `ScoutSignal` | §3.6 |
| Analyst | `AnalystOutput` | §4.5 |
| Coach | `CoachOutput` | §5.5 |
| Sentinel | `SentinelOutput` | §6.5 |
| Commander | `CommanderBriefing` | §7.5 |
| Observability | `LLMCallRecord`, `AgentRecommendation`, `AgentDecision` | §10.1 |
| Approval | `AgentAction` | §8.3 |
| Qualification | `QualificationRules` | §6.6 |

---

## 14. Reference Standards

| Standard | Where Applied | How |
|---|---|---|
| **Anduril Lattice** | Global approval posture (§8) | AI proposes, human approves. No autonomous writes. |
| **Linear** | Approval UX (§8.2) | Approvals are inline within existing surfaces — no separate inbox/page. |
| **Shipley** | Coach methodology (§5), Analyst scoring (§4) | Coach anchors capture plans to Shipley color review lifecycle. Analyst uses Shipley bid/no-bid criteria. |
| **OODA Loop** | Scout methodology (§3.5) | Each signal processed through Observe → Orient → Decide → Act. |

---

_This document is the canonical agent behavior spec. F-220 through F-225 implement these agents verbatim per surface. D4 (Model Router) implements the routing layer. D2 (Visual Design) specifies the card layouts. D1 (IA/URLs) specifies the navigation structure._
