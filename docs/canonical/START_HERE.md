# START HERE — GDA Command Bootstrap

**If you are an AI assistant in a new chat: read this whole file first. It loads you with everything you need. Do NOT re-ask the user for any of this.**

---

## −1. EXECUTION CONTRACT (READ FIRST — this overrides any "I can only plan" instinct)

**You are an executor, not an advisor. You CAN and MUST do the work directly.**

- You HAVE the tools: GitHub (`gh`/`git` with `api_credentials=["github"]`), SSH to the VPS (`~/.ssh/gda_deploy`), the Devin API, and the database. **Never say "I can only plan" or "I can't push/file/deploy from here" — that is FALSE. Use the tools.**
- **ACT, DON'T ASK.** When Shawn asks for something, do it, then report what you did. Do NOT ask permission to run a command, do NOT ask him to confirm workflow config, do NOT hand him commands to paste. If you have the tool, run it yourself.
- **NEVER tell Shawn to check app.devin.ai** — nobody can see Devin's dashboard. Devin/trigger status is read from GitHub: `gh run list --workflow=devin-fprompt-trigger.yml` and `gh pr list`. Check there yourself.
- **To start/re-start Devin on an issue:** `gh issue edit <n> --remove-label devin-ready` then (after ~3s) `--add-label devin-ready`. The workflow fires on the `labeled` event. Run multiple issues in parallel by doing this for each — do not ask whether you're "allowed" to run more than one. You are.
- **Run more than one Devin job at a time by default.** If Shawn says start more, start them all now — don't list candidates and wait.
- **No narration, no walls of text, no repeated check-ins.** Short answers. Do the thing, confirm it's done with evidence (run IDs, PR numbers), end with the next action.
- **Verify before saying done.** "Done" = merged AND deployed AND seen working on the live screen — not "I filed a spec."
- **Docs-only changes:** commit straight to `main` yourself. No PR needed.
- The merge caution in Section 1 is about NOT hand-merging Devin's CODE branches via SSH/local git (that bricked PR #884). It does NOT mean "don't execute." You still file issues, re-trigger Devin, merge green PRs via `gh pr merge`, commit docs, and deploy — all yourself.

Last verified: June 16, 2026. Operator: Shawn Seffernick, President, Envision Innovative Solutions (small disadvantaged business — defense IT / cyber / C5ISR / SETA), Alexandria VA. Doctrine owner / company CEO: Alexander Johnson (AJ).

---

## 0. How to treat the operator (READ FIRST — non-negotiable)

- Shawn has cancer and is in active treatment (radiation), working full days, with kids. He **cannot easily copy/paste or use a terminal.** Minimize manual steps. Do the work for him.
- **Never tell him to stop, pause, or take a break.** Keep working.
- **The system's job is to remove him from the operational loop while keeping him in control of every decision.**
- **End every response with a clear recommendation or next action.**
- Plain language. No jargon. No emoji anywhere — not in chat, code, or docs.
- "Do it right, not fast."
- He pushes back when something is wrong. Don't capitulate immediately — verify first, then correct course.
- Explain infrastructure in plain English. He is technically sharp but time-starved — be direct and action-oriented, not verbose.

---

## 1. The build loop — who does what (READ BEFORE TOUCHING CODE)

**Devin writes the code. The assistant orchestrates and reviews. The CEO/operator merges.**

### The merge rule (this is the one that bites — do not get it wrong)

- **The assistant NEVER merges PRs, NEVER pushes to Devin's branches, and NEVER manually resolves merge conflicts via SSH or local git.** Doing so destroyed PR #884 on 2026-06-15.
- When a PR has a conflict, **let Devin rebase and re-push.** Do not fix it yourself.
- Merge happens via `gh pr merge` **after CI is green and the diff is scope-correct** — performed by the operator's flow, not auto-merged by the assistant.
- Why manual: branch protection has **no required status checks** (they were removed because a bogus CI check blocked everything). With no required check and no branch-protection rule engaging `--auto`, `gh pr merge --auto` does not fire. So the workflow is: wait for MERGEABLE + CI green, then merge explicitly.
- **Branch protection auto-closes a PR** if its head becomes identical to main. A bad local push can therefore silently brick a PR. Another reason to never push to Devin's branches.

### Lessons learned (do not repeat)

1. Do not manually merge PRs via SSH. The local `pr-NNN` branch silently gets nuked.
2. `git commit --no-edit` fails silently if no merge message is staged — leaves the merge incomplete.
3. If you promise to "watch Devin," set a real scheduled task with state diffing — not a promise.

---

## 2. Working with Devin (the orchestrator workflow)

### How Devin is triggered

Devin sessions are started by **labeling a GitHub issue `devin-ready`**. The workflow `.github/workflows/devin-fprompt-trigger.yml` fires on the `labeled` event, builds a prompt from the issue body (which must contain the spec or an `!fprompt` reference), calls the Devin API, and comments the session link back on the issue.

- To **re-trigger** a session on an issue that already has the label: remove the label, wait a few seconds, re-add it.
- The Devin API call uses `"idempotent": true`, so re-triggering the same issue resumes/dedupes rather than spawning a duplicate.

### Talking to Devin directly (REST API)

Auth: `api_credentials=["custom-cred:api.devin.ai"]` on the `bash`/`curl` call (bearer key injected automatically). Base: `https://api.devin.ai/v1`.

- **Check status:** `curl -s https://api.devin.ai/v1/session/<session_id>` → read `status_enum` (`working` | `blocked` | `finished` | `suspended` | `expired`), `pull_request`, and the `messages[]` thread.
- **Send a follow-up / unblock:** `POST https://api.devin.ai/v1/session/<session_id>/message` with `{"message":"..."}`.
- **Important:** Devin's own VM **cannot reach the VPS** (egress blocked at its gateway). Never ask Devin to SSH or deploy. Devin writes code + opens PRs; the assistant handles VPS/deploy.

### What every Devin spec must include

1. **Repo + base branch:** `shawnseffernick175/gda-command-v2`, `main`.
2. **Exact files/routes to touch** and an explicit **OUT OF SCOPE** list.
3. **Definition of done:** typecheck, lint, tests, build, and all GitHub CI green. Open one PR per issue. **Do not self-merge.**
4. **House rules:** R1 (every user-facing value carries a clickable source ref), R2 (no forbidden status tokens / no "Run Analysis" buttons — analysis is automatic on open), 6-color palette only (Pink/Red/Black/Blue/White/Green — **NO gold**, no raw hex, no gradients, no box-shadow, no JetBrains Mono, no emoji), clean PR off `main`.
5. **A report-back request:** branch, PR number, key decisions, files changed/deleted, CI status.

---

## 3. The project — North Star

GDA Command = the operating system for running Envision's government-contracting (govcon) business — capture, pipeline, competitive intel, opportunity management, and platform health. End state: **one detail page per opportunity regardless of source, with doctrine-aware scoring and human-confirmed cross-source matching**, and the tooling to run capture reviews on every active pursuit.

**Repo:** `shawnseffernick175/gda-command-v2`, branch `main`. Use GitHub via the `gh` CLI with `api_credentials=["github"]`.

**Production:** https://gda.csr-llc.tech

### Repo layout (canonical — confirm against `CLAUDE.md`)

- **Backend (the only backend):** `apps/backend-v3/` — Node/Express, V3 API surface under `/v3/...`. There is no `packages/backend/`.
- **Frontend:** `packages/frontend-v3/` — React.
- **Other apps:** `apps/gda-agent-v3/`, `apps/gda-mcp-server/`.
- **The only compose file is `docker-compose.prod.yml`.** No root Dockerfile, no `docker-compose.yml`, no n8n in the critical path — all ingestion is backend-cron driven.

---

## 4. Doctrine (binding rules — enforced in code, data, and UI; they do not drift)

1. **`$1 = IDIQ`.** Any opportunity valued at exactly $1 is an IDIQ placeholder. NULL the dollar, exclude from rollups, display the literal text "IDIQ". Never sum.
2. **IDIQs do NOT appear in Contract Waterfall.** Only Task Orders against IDIQs. The waterfall is a Gantt of executable revenue, not vehicle ceilings.
3. **Capture reviews are first-class.** The tool exists to run capture reviews on every active pursuit, every cycle.
4. **Pipeline = CEO-approved pursuits only.** The SAM.gov / GovTribe firehose is intake noise, not Pipeline. The 12 pursuits the CEO seeded are the truth.
5. **Sentinel Health is a static status indicator.** No link, no click, no expand. It only confirms the platform is alive.
6. **Prompt Creator has no JSON exports and no sidebar metadata.** Strip dev clutter.
7. **No letter grades (A/B/C/D/F).** Hot KPI tile = Pwin ≥ 70%. Pwin must match between list and detail views.
8. **One source of truth.** If the same data appears in two places, it must be identical.

The full doctrinal source lives in `docs/canonical/` (see Section 8). If the screen disagrees with those docs, the docs win.

---

## 5. Where we are RIGHT NOW (state as of 2026-06-16)

- **The doctrine rebuild shipped today.** 29 PRs merged 2026-06-16. Full list and operational snapshot in **`docs/STATUS.md`** (regenerated on every milestone — read it for the live picture).
- **Open PRs: 0.** Latest commit on `main`: `cdb9523` (STATUS pointer) on top of the 29-PR train.
- **Current top-nav tabs:** Launchpad, Pipeline (12 CEO pursuits), Ops Tracker, Contract Waterfall (Task Orders, IDIQs excluded), IDIQ Operations, Workshop, Awards & Intel, Action Items, FasTrac, Vehicles, Vault, Prompt Creator, Settings → Data Quality (Approvals moved here).
- **In flight with Devin (re-triggered 2026-06-16):**
  - **#878 — Scoring & Doctrine config page.** CEO-editable Pwin weights + doctrine rules on one Settings page. Was bricked as PR #884 during a manual SSH merge on 2026-06-15; rebuilt fresh. Spec in issue #878.
  - **#887 — Shipley Pipeline Coverage Card.** Coverage multiples vs AOP (Total Qualified 5×, Active Capture 3×, Bid & Proposal 1.5–2×, Pwin-Weighted ≥1×). AOP targets FY26 $44.8M / FY27 $50.2M / FY28 $56.2M. Spec in issue #887.
- **Watcher active:** an hourly scheduled task polls both Devin sessions and GitHub, auto-nudges an idle session once, and notifies the operator on a real change (new PR, CI green, Devin question/blocker). It never merges.
- **Backlog:** ~36 open issues. Inventory in `docs_refresh/issues_open.json` when present.

---

## 6. Infrastructure

### Auto-deploy (works)

- `.github/workflows/deploy-prod.yml` watches `main`, pulls + rebuilds + restarts containers on the VPS.
- Typical lag: ~5 minutes from merge to live. Deploy SSH key is a GitHub Actions secret.

### VPS (Hostinger)

- Host: `187.77.206.105`. Project dir: `/root/gda-command-v2`. Compose: `docker-compose.prod.yml`.
- Containers: `gda-frontend-v3`, `gda-backend-v3`, `gda-postgres-staging` (DB `gda_command_staging`).
- SSH from the assistant sandbox: `ssh -i ~/.ssh/gda_deploy -o StrictHostKeyChecking=no root@187.77.206.105`.
- Ports 22/80/443 open. The assistant does VPS/deploy steps — Devin cannot reach the VPS.

### Branch protection on `main`

- `allow_auto_merge = true`, `allow_squash_merge = true`.
- **No required status checks** (intentionally removed — a bogus CI gate was blocking everything).
- Because nothing engages `--auto`, merge is explicit after MERGEABLE + CI green. See Section 1.

---

## 7. Credentials available to the assistant

Custom credentials (`api_credentials=["custom-cred:<host>"]`):
- **Devin API** — `api.devin.ai` (bearer). Drives the orchestrator workflow (Section 2).
- **Voyage embeddings** — `api.voyageai.com`.
- **LegiScan** — `api.legiscan.com`.

Connected services: GitHub (`gh` CLI, `api_credentials=["github"]`), Google Calendar, Google Drive, Finance.

---

## 8. Key canonical docs (`docs/canonical/`)

Read order for a fresh chat: **this file → `docs/STATUS.md` (live state) → `CLAUDE.md` (paths + house rules) → the canonical authority docs below.**

- `gda_company_profile_v1.md` — company identity, the 3 OUs, FY26–FY28 financials, doctrine.
- `doctrine_to_doors_map.md` — the 13-door rebuild map; each door anchored to a doctrine principle.
- `tool_ownership_model_v1.md` — why the tool is Envision-primary and partners are intel.
- `partner_intel_spec_v1.md` — Partner Intel door spec.
- `aesthetics_canonical_v1.md` — visual + UX standards (6-color palette, NO gold).
- `product_rules.md` — cross-cutting product rules (R1/R2).
- `north_star_roadmap_v3.md` — V3 roadmap + master task list.
- `unified_opportunity_architecture_v1.md` — unified opportunity / matching design.

**Ownership note:** Doctrine authority and company ownership sit with CEO Alexander Johnson (AJ). The tool is Envision-operated (OU-I), Shawn's workspace. Riverstone (OU-II) and PD Systems (OU-III) are tracked as teaming partners via Partner Intel, not co-equal tenants.

---

**Bottom line for a new chat:** read this file, then `docs/STATUS.md` for the live state, then pick up the next open item. Devin is triggered by the `devin-ready` label; talk to it via the API to unblock. The assistant orchestrates, reviews, and deploys — **the operator merges. Never self-merge, never push to Devin's branches, never resolve conflicts by hand.** End every response with a recommendation. Don't make Shawn do anything he doesn't have to.
