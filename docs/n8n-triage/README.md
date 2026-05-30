# F-219: n8n Workflow Triage — Independent Verification

## Context

V2 GDA backend + V2 postgres were decommissioned 2026-05-30 in favor of V3. At time of teardown, n8n had **160 workflows (158 active)** built against V2. Pre-emptively all 158 were deactivated to stop retry storms. Now we need to triage them.

A first-pass triage was produced by pattern-matching on name + node URLs + credentials. **This ticket asks Devin to independently re-classify all 160 workflows and report disagreements.**

## Inputs (read-only)

- `inventory.csv` — workflow ID, name, V2/V3 backend ref, postgres usage, node count
- `my-triage.csv` — my recommendation per workflow (KILL_V2_API / KILL_V2_DEAD / REWIRE_TO_V3 / KEEP_V3 / KEEP_INDEPENDENT / INSPECT) with reasoning
- `my-triage.md` — same data grouped by recommendation, human-readable
- `workflows/*.json` — full JSON for every workflow (id, name, active, nodes, connections, settings)
- `../../db/v3/migrations/` — V3 schema authoritative source
- `../../packages/backend-v3/src/` — V3 backend code, route definitions

## Classification definitions

| Class | Meaning |
|---|---|
| **KILL_V2_API** | V2 REST API webhook handler. V3 backend replaces this entire surface. Workflow is dead and will not be revived. |
| **KILL_V2_DEAD** | Utility/other workflow pointing at dead V2 infrastructure. No V3 equivalent needed. |
| **REWIRE_TO_V3** | Function is still needed in V3. Workflow must be edited: swap postgres credential to V3 staging DB, update HTTP URLs to V3 backend, adapt SQL to V3 schema. |
| **KEEP_V3** | Already pointed at V3 backend, no V2 deps. |
| **KEEP_INDEPENDENT** | No V2 or V3 dependencies. Standalone utility (e.g., notification, MCP bridge, dev tool). Safe to leave alone. |
| **INSPECT** | Mixed signals. Human review needed. |

## V2 infrastructure (now dead)

- Backend container: `gda-backend` → `http://gda-backend:3001`, `https://gda.csr-llc.tech`
- Postgres: container `gda-postgres`, DB `gda_command`, user `gda`
- All n8n credentials referencing these are now broken

## V3 infrastructure (live)

- Backend container: `gda-backend-v3` → `https://gda-v3.csr-llc.tech` (routes under `/v3/*`)
- Postgres: container `gda-postgres-staging`, DB `gda_command_staging`, user `gda_staging`, network alias `postgres-staging`
- V3 schema: see `db/v3/migrations/v3_000_*.sql` … `v3_007_*.sql`

## Task

For all 160 workflows in `workflows/`:

1. Read the JSON. Look at: every node's `type`, `parameters.url`, `parameters.query`, `credentials`, webhook paths, branching logic.
2. Cross-reference V3 backend routes (find them by grep'ing `packages/backend-v3/src/` for route definitions) and V3 schema (`db/v3/migrations/`).
3. Decide your own classification independently.
4. Compare to `my-triage.csv`.

## Deliverables

Single file: `docs/n8n-triage/disagreements.csv`

Columns:
- `id` — workflow id
- `name` — workflow name
- `my_class` — my recommendation
- `devin_class` — your independent recommendation
- `confidence` — High / Medium / Low
- `evidence` — specific node id(s), URL(s), SQL fragment(s), or V3 code reference(s) that drove your call
- `notes` — anything else worth flagging (e.g., "V3 doesn't actually have a replacement for this route", "SQL writes to a V2 table that doesn't exist in V3 schema")

**Include only rows where your classification differs from mine.**

Also produce: `docs/n8n-triage/devin-summary.md` — 1 page max:
- Total agree / disagree counts
- Patterns in disagreements (e.g., "I think 12 of your KILL_V2_API should be REWIRE because V3 has no equivalent route")
- Any **gaps in V3** that this exercise exposed (workflows whose function exists nowhere in V3 yet)

## Constraints

- **Read-only.** Do NOT modify any workflow JSON. Do NOT modify any V3 source. Do NOT add any other files.
- **Do not propose rewires.** A separate ticket will handle rewiring after triage is locked.
- **Do not run anything against the live VPS.** All analysis from these files in the repo.
- Open ONE PR: `f-219-n8n-triage-verify` → `main`, containing only `disagreements.csv` and `devin-summary.md`.

## Definition of done

- `disagreements.csv` exists with one row per disagreement, all columns populated
- `devin-summary.md` exists, ≤ 1 page
- PR description states total reviewed (160), agreement count, disagreement count, and 2-3 highest-confidence disagreements with evidence
- CI passes (lint/format only — no tests to add)
