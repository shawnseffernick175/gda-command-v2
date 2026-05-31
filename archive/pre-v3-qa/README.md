# archive/pre-v3-qa

The entire `qa-agent-starter/` directory moved here per **F-254**
(executing the F-253 orphan-code audit).

## What is here

The `qa-agent-starter/` folder contained a Playwright-based QA scaffold
from the V2 era. It is not referenced by any V3 workflow, CI job, or
backend service.

| File | Purpose |
|---|---|
| `README.md` | QA starter guide |
| `STEP_BY_STEP.md` | Step-by-step walkthrough |
| `package.json` / `package-lock.json` | Node dependencies |
| `playwright.config.ts` | Playwright configuration |
| `setup-mac.sh` | macOS setup helper |
| `setup-windows.ps1` | Windows setup helper |
| `tsconfig.json` | TypeScript config |

## Status

- **Not loaded** by any CI workflow, `docker-compose`, or backend service.
- Kept for audit trail and historical reference.
- Safe to delete in the future if no longer useful.

## Audit source

See [`docs/audits/F-253-orphan-code-report.md`](../../docs/audits/F-253-orphan-code-report.md)
for the full audit that produced these verdicts.
