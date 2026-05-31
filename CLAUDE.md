# CLAUDE.md — GDA Command v2

## Backend layout (canonical)

The ONLY backend is `apps/backend-v3/`. There is no `packages/backend/`. Any code adding endpoints, cron jobs, ingestion, workers, or routes goes under `apps/backend-v3/src/`. The frontend is `packages/frontend-v3/`. All Devin work must respect these paths.

**The only compose file is `docker-compose.prod.yml`.** There is no `docker-compose.yml`, `docker-compose.n8n.yml`, or root-level Dockerfile. The only Dockerfiles live under `apps/<app>/Dockerfile` or `packages/<pkg>/Dockerfile`. V3 has no n8n in the critical path — all ingestion is backend-cron driven (F-240+).

## Canonical Docs

All canonical documentation lives in `docs/canonical/`. Read these before making changes:

- `docs/canonical/aesthetics_canonical_v1.md` — design tokens, typography, layout
- `docs/canonical/gda_company_profile_v1.md` — company identity, OUs, doctrine
- `docs/canonical/tool_ownership_model_v1.md` — Envision-first ownership model
- `docs/canonical/doctrine_to_doors_map.md` — doctrine-to-door enforcement
- `docs/canonical/partner_intel_spec_v1.md` — Partner Intel door spec

## Product Rules

See `docs/canonical/product_rules.md` for non-negotiable product rules:

- **R1** — Every data point has a searchable source. No bare numbers, no unsourced values.
- **R2** — Analysis is automatic on opportunity open. No "Run Analysis" buttons.
