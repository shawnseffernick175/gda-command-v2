# Component Primitives — GDA Command V3

## Adding a New Primitive

1. Create `src/components/<Name>/<Name>.tsx` with typed props interface
2. Every data-display component that shows a single sourced value **must** require a `sourceUrl` prop and render as `<a href={sourceUrl} target="_blank" rel="noopener noreferrer">` (R1 rule)
3. Use CSS variables from `tokens.css` via Tailwind utility classes — no raw hex values
4. Create `<Name>.stories.tsx` in the same directory (default, hover, disabled, error, light variants)
5. Export from an index if grouping is needed

### Component Conventions

- Height: 32px (h-8) for inputs/buttons, 28px (h-7) for small variant
- Radius: `rounded-sm` (4px) for inputs/buttons, `rounded-md` (6px) for cards
- Border: 1px `border-border`, 1.5px `border-accent` on focus
- Text: `text-sm` for body, `text-xs` for labels/captions
- Transitions: `duration-[var(--duration-state)]` for state changes
- No `box-shadow` anywhere — elevation is via surface color + border

## Adding a New Chart

1. Create `src/charts/<ChartName>.tsx`
2. Import ECharts core + only the chart/component modules needed (tree-shake)
3. Define a typed data interface matching the D2 §7 contract
4. Use `echarts-for-react` with `theme="gda-dark"`
5. Include `<SourceUrlChip>` links for every `sourceRefs` entry (R1 compliance)
6. Create `<ChartName>.stories.tsx` with fixture data
7. Add fixture to `tests/fixtures/charts/<chart-name>.json`
8. Add an assertion to `src/charts/__tests__/chart-contract.test.tsx`

### Chart Rules

- **ECharts only** — no recharts, Chart.js, nivo, victory, react-vis, or direct d3
- Raw hex colors only in `src/lib/echarts-theme.ts` (allowlisted)
- Consumer code references the theme, not individual colors

## R1 / Forbidden-Tokens Enforcement

### R1 — Structural Data Binding

Every data point rendered to the user must have a clickable `<a href>` source link in the DOM.

- Components: `Stat`, `Metric`, `Field`, `SourceUrlChip` require `sourceUrl` / `url` prop
- Charts: render `SourceUrlChip` for each `sourceRefs` entry
- ESLint rule `gda-rules/require-source-url` enforces this statically
- DOM test `src/components/__tests__/r1-dom-contract.test.tsx` enforces at runtime

### Forbidden-Tokens Scanner

Script: `scripts/scan-forbidden-tokens.ts`

Scans `src/**` (excluding allowlist) for:
- Raw hex color literals (`#xxx`, `#xxxxxx`, `#xxxxxxxx`)
- `box-shadow:` declarations
- Imports of forbidden chart libraries

**Allowlist** (raw hex permitted):
- `src/lib/echarts-theme.ts`
- `src/styles/tokens.css`
- `design-tokens/**`
- Files with `VISUAL_GUARDRAIL_IGNORE` in first 5 lines
- Test files (`*.test.ts`, `*.test.tsx`, `__tests__/`)

Run: `npm run lint` (includes scanner automatically)
