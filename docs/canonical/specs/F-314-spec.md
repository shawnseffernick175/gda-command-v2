# F-314 — V2 Decommission + Final Cutover (SPEC / DECISION RECORD)

Status: COMPLETE (no code teardown required) — recorded 2026-06-02
Owner approval: Shawn ("please do the spec for v1/2 tear down", 2026-06-02)

## Summary

F-314 was the planned "final cutover" to remove all V1/V2 code now that the V3
stack (apps/backend-v3, packages/frontend-v3, apps/gda-agent-v3,
apps/gda-mcp-server, packages/shared) is the production system. Investigation on
2026-06-02 found that **the V1/V2 source was already removed from the git
repository in a prior cleanup.** No teardown PR is required. What remained were
stale local build artifacts on the VPS, which have now been deleted.

## Investigation findings (VPS `/root/gda-command-v2`, main @ c1653a8)

1. **`packages/frontend` (7.1M) and `packages/backend` (2.2M) contained only
   build artifacts** — `dist/`, `node_modules/`, `uploads/`, `tsconfig.tsbuildinfo`.
   No `src/`, no `package.json`, no Dockerfile. They were leftover output from old
   V1/V2 builds.
2. **Neither directory was tracked in git** (`git ls-files` returned 0 files for
   each). They existed only in the VPS working tree, not in the repo.
3. **Nothing in V3 imports from V1/V2.** Repo-wide grep for imports from
   `@gda/frontend`, `@gda/backend`, or relative `../../frontend|backend` paths in
   `apps/` and `packages/frontend-v3/` returned nothing.
4. **Root `package.json` workspaces = `packages/shared`, `apps/backend-v3`,
   `apps/gda-mcp-server`, `packages/frontend-v3`** — V1/V2 are not workspaces.
   `@gda/shared` IS active and must be retained.
5. **Production runs only `-v3` services.** `docker-compose.prod.yml` build
   contexts: backend-v3, gda-agent-v3, frontend-v3, gda-mcp-server, plus postgres
   / postgres-staging. No V1/V2 container is built or deployed.
6. **A CI guard already enforces this:** `.github/workflows/no-phantom-backend.yml`
   fails any PR/push that resurrects `packages/backend`, root-level Dockerfiles
   (Dockerfile, Dockerfile.v3, Dockerfile.v2, Dockerfile.dev), forbidden compose
   files (docker-compose.yml, docker-compose.n8n.yml, docker-compose.dev.yml), an
   `n8n/` directory, or pre-V3 doc dirs outside `archive/`. This passes on clean
   CI checkouts because the git repo is already V3-only.

## Action taken (2026-06-02)

- Deleted the stale local artifacts from the VPS:
  `rm -rf packages/frontend packages/backend` (9.3MB freed). Git unaffected —
  the directories were never tracked. `packages/frontend-v3` and
  `packages/shared` confirmed intact afterward.
- No PR, no schema change, no service change, no deploy required.

## Remaining V1/V2 references (intentional, leave as-is)

- `docs/architecture/v3/phase-0-legacy-audit.md` — historical audit doc, keep.
- The `no-phantom-backend.yml` guard — keep; it is the active enforcement that
  prevents V1/V2 from returning.

## Definition of done — MET

- [x] No V1/V2 source in git (confirmed: was already removed pre-2026-06-02).
- [x] No V1/V2 build/runtime references in compose or CI (only -v3 + the guard).
- [x] Stale VPS build artifacts removed.
- [x] V3 stack (`-v3` packages + `@gda/shared`) untouched and operational.

## If a future audit finds V1/V2 resurrected

Treat as a regression: the `no-phantom-backend.yml` guard should have caught it.
Re-run the investigation grep above, confirm nothing in V3 depends on it, delete
via a clean PR off `main`, and ensure the guard still passes.
