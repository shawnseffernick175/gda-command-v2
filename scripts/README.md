# scripts/check-visual-tokens.mjs — Visual Guardrail

## What it does

This script is the enforcement layer for the **F-100 / aesthetics_canonical_v1** design system.
It walks every `*.ts`, `*.tsx`, and `*.css` file under `packages/frontend/src/` (plus `packages/frontend/index.html`) and fails CI if any file contains:

| Category | Forbidden |
|---|---|
| **Hex colors** | `#0f1117`, `#1a1d27`, `#22262f`, `#2a2e3a`, `#e4e4e7`, `#9ca3af`, `#3b82f6`, `#22c55e`, `#f59e0b`, `#ef4444` |
| **Font families** | `JetBrains Mono`, `Fira Code`, `monospace` (in `font-family` declarations) |
| **Inline style props** | Any JSX `style={…}` that sets `color`, `background`, `font-family`, or `fontFamily` |
| **Legacy class names** | `kpi-grid`, `signal-grid`, `funnel-row`, `funnel-label`, `funnel-value`, `funnel-pwin`, `summary-strip`, `field-grid`, `quick-access-grid`, `sidebar-overlay`, `mobile-header`, `two-column-layout` |

These tokens belong to the old dark-theme visual system. Their presence in a PR indicates **theme drift** — styles that bypass the canonical token layer and hard-code values that conflict with the light-mode design system.

### What is NOT flagged

- Canonical hex tokens: `#F7F6F2`, `#28251D`, `#7A7974`, `#D4D1CA`, `#01696F`, `#A12C7B`, `#015C61`, `#FFFFFF`, `#B45309`
- Tailwind semantic classes: `bg-bg`, `text-ink`, `border-border`, `text-accent`, `bg-accent`, `text-critical`, `bg-critical`, `text-muted`
- `tabular-nums` (numeric formatting — not a font-family declaration)
- The `aesthetics_canonical_v1.md` doc itself

## How to add an exception

Only skip the guardrail for **legacy shim files** that cannot be refactored yet (e.g., third-party overrides, generated output, temporary compatibility layers).

Add the following comment on **one of the first 5 lines** of the file:

```ts
// VISUAL_GUARDRAIL_IGNORE
```

**Use this sparingly.** Every ignored file is technical debt. File a follow-up ticket to remove the exception as soon as the underlying component is migrated to canonical tokens.

## Running locally

```bash
node scripts/check-visual-tokens.mjs
```

No dependencies. Pure Node.js built-ins (`fs`, `path`, `process`, `url`). Runs in under 10 seconds on a typical frontend tree.

## CI integration

The check runs automatically on every pull request via `.github/workflows/visual-guardrail.yml`. It will block merge if any violation is found.
