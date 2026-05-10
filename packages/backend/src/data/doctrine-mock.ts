import type {
  DoctrineDraft,
  DoctrinePublishRun,
  GateCheckResult,
} from "@gda/shared";

export const MOCK_DRAFTS: DoctrineDraft[] = [
  {
    id: "dd-001",
    sprint_id: "S-206",
    component: "Approvals Queue",
    doc_type: "decision_log",
    title: "Approvals Queue — human-in-the-loop gate design",
    status: "draft",
    source_pr_number: 42,
    source_pr_url: "https://github.com/shawnseffernick175/gda-command-v2/pull/42",
    body:
      "## Decision\n\nAll risky operational actions (sends, deletes, deploys, paid research, production writes) " +
      "require human approval before execution. The platform enforces this through the Approvals Queue — a " +
      "dedicated surface where pending actions are listed with full context.\n\n" +
      "## Current Live State\n\nNo approvals queue exists in v2 yet. Risky actions are blocked by " +
      "`QUALIFY_WRITES_ENABLED=false` and `dryRun:true` defaults.\n\n" +
      "## Planned State\n\nA `/approvals` page with pending action cards, approve/reject buttons, " +
      "and full audit trail. Backend enforces that no risky action executes without an approved record.\n\n" +
      "## Recommended Next State\n\nShip read-only approvals viewer first (M9), then wire approve/reject " +
      "actions with correlation IDs in M10.",
    created_at: "2026-05-08T14:30:00Z",
    updated_at: "2026-05-09T09:15:00Z",
  },
  {
    id: "dd-002",
    sprint_id: "S-206",
    component: "QA Center",
    doc_type: "sprint_notes",
    title: "S-206 Sprint Notes — QA Center live n8n integration",
    status: "draft",
    source_pr_number: 38,
    source_pr_url: "https://github.com/shawnseffernick175/gda-command-v2/pull/38",
    body:
      "## What Changed\n\nQA Center now connects to real n8n instance instead of returning hardcoded mock " +
      "data. Health checks run against 8 live webhook endpoints. Failures table pulls real failed " +
      "executions from n8n REST API.\n\n" +
      "## Current Live State\n\nLive n8n mode active when `N8N_API_KEY` and `N8N_API_BASE` are set. " +
      "Mock fallback still works when env vars are absent.\n\n" +
      "## Safety Lane Impact\n\nRead-only — no writes, no side effects. Health checks use GET requests only.",
    created_at: "2026-05-07T10:00:00Z",
    updated_at: "2026-05-08T16:45:00Z",
  },
  {
    id: "dd-003",
    sprint_id: "S-206",
    component: "Ops Tracker",
    doc_type: "book_of_truths",
    title: "Book of Truths — qualify dry-run safety gates",
    status: "finalized",
    source_pr_number: 35,
    source_pr_url: "https://github.com/shawnseffernick175/gda-command-v2/pull/35",
    body:
      "## Doctrine\n\nAn opportunity is not pipeline until the operator explicitly qualifies it. " +
      "The qualify action is gated by three safety controls:\n\n" +
      "1. `QUALIFY_WRITES_ENABLED` env flag must be `true`\n" +
      "2. Request must include `approve: true`\n" +
      "3. Default `dryRun: true` prevents accidental writes\n\n" +
      "Every qualify action — whether dry-run or real — is logged with a correlation ID " +
      "in `GDA-{uuid}` format for audit tracing.\n\n" +
      "## Status\n\nFinalized and enforced in production since S-205.",
    created_at: "2026-05-05T08:00:00Z",
    updated_at: "2026-05-06T14:30:00Z",
  },
  {
    id: "dd-004",
    sprint_id: "S-206",
    component: "Pipeline",
    doc_type: "master_build_note",
    title: "Master Build Note — pipeline read-only enforcement",
    status: "draft",
    source_pr_number: 40,
    source_pr_url: "https://github.com/shawnseffernick175/gda-command-v2/pull/40",
    body:
      "## Build Note\n\nPipeline page (`/pipeline`) is strictly read-only. No Qualify buttons, " +
      "no Actions column, no write endpoints. The audit acknowledgement strip confirms this to " +
      "the operator.\n\n" +
      "## Frozen Workflows\n\nThe pipeline query endpoint (`GET /api/opportunities/pipeline`) " +
      "is a frozen read-only surface. Any attempt to add write capabilities must go through " +
      "the Approvals Queue gate.",
    created_at: "2026-05-06T11:00:00Z",
    updated_at: "2026-05-07T08:20:00Z",
  },
  {
    id: "dd-005",
    sprint_id: "S-205",
    component: "Opportunity Detail",
    doc_type: "decision_log",
    title: "OODA analysis block structure — mandatory 4-block format",
    status: "finalized",
    source_pr_number: 30,
    source_pr_url: "https://github.com/shawnseffernick175/gda-command-v2/pull/30",
    body:
      "## Decision\n\nEvery opportunity detail page must include a full OODA analysis block " +
      "with exactly four sections: Observe (source-backed facts), Orient (risk/strength/inference), " +
      "Decide (options with one recommended), Act (next steps with owner/due/priority).\n\n" +
      "## Rationale\n\nThe OODA framework provides a disciplined, repeatable decision structure " +
      "that prevents ad-hoc analysis. Source citations ensure claims are traceable.\n\n" +
      "## Status\n\nFinalized. Implemented in S-205 with 3 hand-crafted + auto-generated analysis.",
    created_at: "2026-05-01T09:00:00Z",
    updated_at: "2026-05-03T15:00:00Z",
  },
  {
    id: "dd-006",
    sprint_id: "S-205",
    component: "Dashboard",
    doc_type: "sprint_notes",
    title: "S-205 Sprint Notes — Launchpad KPI dashboard",
    status: "finalized",
    source_pr_number: 28,
    source_pr_url: "https://github.com/shawnseffernick175/gda-command-v2/pull/28",
    body:
      "## What Changed\n\nHome page redesigned as a KPI dashboard with:\n" +
      "- Financial KPI strip (Total, Pipeline Value, Avg Pwin, Avg Score)\n" +
      "- Opportunity funnel visualization (5 stages)\n" +
      "- Top 5 opportunities by score\n" +
      "- Quick-access cards for all pages\n\n" +
      "## Current Live State\n\nAll data sourced from mock when no DATABASE_URL. " +
      "KPIs computed server-side in `/api/dashboard/kpis`.",
    created_at: "2026-04-28T12:00:00Z",
    updated_at: "2026-04-30T10:00:00Z",
  },
  {
    id: "dd-007",
    sprint_id: "S-205",
    component: "Platform Architecture",
    doc_type: "book_of_truths",
    title: "Book of Truths — response envelope contract",
    status: "finalized",
    source_pr_number: 22,
    source_pr_url: "https://github.com/shawnseffernick175/gda-command-v2/pull/22",
    body:
      "## Doctrine\n\nEvery API endpoint must return the standard GDA envelope:\n" +
      "```json\n{ success, workflow, action, dryRun, data, meta, error }\n```\n\n" +
      "`meta` always includes `generatedAt` (ISO timestamp) and `source` ('gateway').\n" +
      "`error` is null on success, structured `{ code, message, detail }` on failure.\n\n" +
      "## Rationale\n\nConsistent envelope format enables:\n" +
      "- Frontend error handling with a single pattern\n" +
      "- QA Center failure visibility\n" +
      "- Audit trail correlation\n" +
      "- Mock/live source detection",
    created_at: "2026-04-25T08:00:00Z",
    updated_at: "2026-04-26T14:00:00Z",
  },
  {
    id: "dd-008",
    sprint_id: "S-206",
    component: "Workflow Manager",
    doc_type: "sprint_notes",
    title: "S-206 Sprint Notes — Workflow Manager and Settings pages",
    status: "blocked",
    source_pr_number: null,
    source_pr_url: null,
    body:
      "## What Changed\n\nTwo new pages added:\n" +
      "- **Workflow Manager** (`/workflows`) — browse, search, filter all n8n workflows\n" +
      "- **Settings** (`/settings`) — system config, connectors, feature flags, health check\n\n" +
      "## Blocked Reason\n\nPR #9 not yet merged to main. Sprint notes cannot be finalized " +
      "until the code is merged and verified in production.",
    created_at: "2026-05-09T16:00:00Z",
    updated_at: "2026-05-10T00:00:00Z",
  },
];

export const MOCK_PUBLISH_RUNS: DoctrinePublishRun[] = [
  {
    id: "pr-001",
    sprint_id: "S-205",
    trigger_type: "finalize",
    status: "success",
    gate_results: [
      { name: "React Build / CI", status: "pass", message: "Build succeeded.", required: true },
      { name: "QA Center Health", status: "pass", message: "5/6 checks passing.", required: true },
      { name: "Dry-Run: Qualify Write", status: "pass", message: "Dry-run executed successfully.", required: true },
      { name: "Frozen Workflow Guard", status: "pass", message: "No frozen workflows modified.", required: true },
      { name: "Database Migration", status: "skip", message: "No pending migrations.", required: false },
    ],
    commit_sha: "d35ad3f",
    reason: null,
    started_at: "2026-05-03T15:00:00Z",
    completed_at: "2026-05-03T15:02:30Z",
  },
  {
    id: "pr-002",
    sprint_id: "S-206",
    trigger_type: "pr-merge",
    status: "success",
    gate_results: [
      { name: "React Build / CI", status: "pass", message: "Build succeeded.", required: true },
      { name: "PR Merge Validation", status: "pass", message: "PR #38 merged cleanly.", required: true },
    ],
    commit_sha: "1a071bc",
    reason: null,
    started_at: "2026-05-08T16:45:00Z",
    completed_at: "2026-05-08T16:45:45Z",
  },
  {
    id: "pr-003",
    sprint_id: "S-206",
    trigger_type: "finalize",
    status: "blocked",
    gate_results: [
      { name: "React Build / CI", status: "pass", message: "Build succeeded.", required: true },
      { name: "QA Center Health", status: "pass", message: "5/6 checks passing.", required: true },
      { name: "Dry-Run: Qualify Write", status: "pass", message: "Dry-run executed successfully.", required: true },
      { name: "Frozen Workflow Guard", status: "pass", message: "No frozen workflows modified.", required: true },
      { name: "PR #9 Merge Status", status: "fail", message: "PR #9 (M7) not yet merged to main.", required: true },
    ],
    commit_sha: null,
    reason: "Cannot finalize S-206: PR #9 (Milestone 7 — Settings & Workflow Manager) is still open. All code must be merged before sprint finalization.",
    started_at: "2026-05-10T00:05:00Z",
    completed_at: "2026-05-10T00:05:12Z",
  },
];
