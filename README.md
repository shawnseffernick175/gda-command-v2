# GDA Command v2

The operating system for running Envision's government-contracting business — capture, pipeline, competitive intelligence, opportunity management, and platform health.

- **Production:** https://gda.csr-llc.tech
- **Live operational state:** [`docs/STATUS.md`](docs/STATUS.md) — regenerated on every milestone. Read it for the current PR queue, tab map, and data sources.
- **New-chat bootstrap (AI assistants start here):** [`docs/canonical/START_HERE.md`](docs/canonical/START_HERE.md)
- **Agent house rules + canonical paths:** [`CLAUDE.md`](CLAUDE.md)

---

## Architecture

```
React Command Center (frontend-v3)              served by frontend container
        ↓  /v3 API
backend-v3 (Node / Express, V3 API surface)     gda-backend-v3
        ↓
Postgres (gda-postgres-staging)  ·  gda-agent-v3  ·  MCP server  ·  external data
        ↓
Doctrine-aware scoring  ·  human-confirmed match queue  ·  capture reviews
```

There is **no n8n in the critical path** — all ingestion is backend-cron driven. Traefik/nginx fronts the stack; auto-deploy watches `main`.

## Repo layout (canonical)

```
apps/
  backend-v3/     — the ONLY backend (Express, V3 API under /v3/...). No packages/backend.
  gda-agent-v3/   — agent service
  gda-mcp-server/ — MCP tool server (port 4100, https://gda-mcp.csr-llc.tech)
packages/
  frontend-v3/    — React command center
db/               — database assets
docs/             — documentation (see docs/canonical for source-of-truth)
scripts/  tests/  .github/
```

> Path rules are enforced in [`CLAUDE.md`](CLAUDE.md). Any code adding endpoints, cron jobs, ingestion, workers, or routes goes under `apps/backend-v3/src/`. The frontend is `packages/frontend-v3/`. The only compose file is `docker-compose.prod.yml`.

## Command Center tabs (current)

Launchpad · Pipeline (CEO-approved pursuits only) · Ops Tracker · Contract Waterfall (Task Orders only — IDIQs excluded) · IDIQ Operations · Workshop · Awards & Intel · Action Items · FasTrac · Vehicles · Vault · Prompt Creator · Settings → Data Quality.

See [`docs/STATUS.md`](docs/STATUS.md) for the authoritative, dated capability map.

## API

The backend exposes the V3 surface under `/v3/...` (e.g. `/v3/opportunities`, `/v3/match-suggestions`, `/v3/reports/funnel`, `/v3/briefing/today`). Health check: `GET /health`. Endpoints evolve with each milestone — treat `apps/backend-v3/src/` and `docs/STATUS.md` as the source of truth rather than a frozen table here.

## Doctrine (binding product rules)

These came from the operator directly and are enforced in code, data, and UI:

1. **`$1 = IDIQ`** — NULL the dollar, exclude from rollups, display literal "IDIQ", never sum.
2. **IDIQs are not in Contract Waterfall** — only Task Orders (a Gantt of executable revenue).
3. **Capture reviews are first-class** — run on every active pursuit, every cycle.
4. **Pipeline = CEO-approved pursuits only** — not the SAM/GovTribe firehose.
5. **Sentinel Health is a static status indicator** — no link, no click, no expand.
6. **Prompt Creator** — no JSON exports, no sidebar metadata.
7. **No letter grades** — Hot KPI tile = Pwin ≥ 70%; Pwin matches between list and detail.
8. **One source of truth** — the same data in two places must be identical.

Plus the cross-cutting house rules: **R1** every user-facing value carries a clickable source reference; **R2** analysis is automatic on opportunity open (no "Run Analysis" buttons). Visual standard: 6-color palette (Pink/Red/Black/Blue/White/Green — **NO gold**), no raw hex, no gradients, no emoji. See [`docs/canonical/product_rules.md`](docs/canonical/product_rules.md) and [`docs/canonical/aesthetics_canonical_v1.md`](docs/canonical/aesthetics_canonical_v1.md).

## Production deployment

Auto-deploy is wired: `.github/workflows/deploy-prod.yml` watches `main`, pulls, rebuilds, and restarts containers on the VPS (~5 min from merge to live). Manual run, if ever needed:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Stack: `gda-frontend-v3`, `gda-backend-v3`, `gda-postgres-staging` (database `gda_command_staging`). Auto-migration runs on backend startup. The MCP server (`gda-mcp-server`) serves tools at `https://gda-mcp.csr-llc.tech`.

### VPS

- Host `187.77.206.105` (Hostinger). Project dir `/root/gda-command-v2`. Compose `docker-compose.prod.yml`.
- SSH: `ssh -i ~/.ssh/gda_deploy root@187.77.206.105`.

## Development workflow

- **Devin** writes code and opens PRs (triggered by labeling a GitHub issue `devin-ready`).
- The **assistant** orchestrates, reviews diffs, and deploys.
- The **operator** merges via `gh pr merge` after CI is green and the diff is scope-correct.
- **Never self-merge, never push to Devin's branches, never resolve conflicts by hand** — let Devin rebase and re-push. Branch protection on `main`: `allow_auto_merge` and `allow_squash_merge` true, **no required status checks** (intentionally removed). Details in [`docs/canonical/START_HERE.md`](docs/canonical/START_HERE.md).

## Canonical documentation

Source-of-truth strategic docs live in [`docs/canonical/`](docs/canonical/). If the screen disagrees with those docs, the docs win. Authority and ownership sit with CEO Alexander Johnson (AJ); the tool is Envision-operated (OU-I), with Riverstone (OU-II) and PD Systems (OU-III) tracked as teaming partners via Partner Intel.
