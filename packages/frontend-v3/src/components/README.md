# GDA Command V3 — Component Library

## Adding a New Primitive

1. Create a directory at `src/components/<ComponentName>/`.
2. Add `<ComponentName>.tsx` — export a named function component.
3. Define the component's props interface in `src/types.ts`.
4. If the component displays a data point, require a `sourceUrl` prop (R1 enforcement).
5. Add the component to the barrel export in `src/components/index.ts`.
6. Create `<ComponentName>.stories.tsx` with stories for: default, hover, disabled, error (where applicable), light theme variant.
7. Write a unit test covering render + prop contract in `src/components/__tests__/`.
8. If the component takes `sourceUrl`, add it to `src/components/__tests__/r1-dom-contract.test.tsx`.

## Adding a New Chart

1. Create `src/charts/<ChartName>.tsx`.
2. Use ECharts only — no other chart libraries are permitted.
3. Import from `echarts/core` with tree-shaking (`echarts.use()`).
4. Accept data via a typed prop (define the interface in `src/types.ts`).
5. Include `sourceRefs` in the data contract — render them as `<SourceUrlChip>` below the chart.
6. Add the chart to `src/charts/index.ts`.
7. Create `<ChartName>.stories.tsx` with realistic mock data.
8. Add a fixture at `test/fixtures/charts/<chart-name>.json`.
9. Add the chart to `src/charts/__tests__/chart-contract.test.tsx`.

## R1 Enforcement

**R1: Every data point has a searchable source.**

### Runtime (DOM-level)
- Components `Stat`, `Metric`, `Field`, `SourceUrlChip` all render their data inside a clickable `<a href>` with `target="_blank"` and `rel="noopener noreferrer"`.
- The contract test at `src/components/__tests__/r1-dom-contract.test.tsx` verifies this for every R1-binding component.

### Static (AST-level)
- The ESLint custom rule at `eslint-rules/require-source-url.js` enforces that `sourceUrl` (or `url` for `SourceUrlChip`) is passed as a prop in JSX.
- Activated in `eslint.config.js` as `gda-rules/require-source-url: error`.

## Forbidden Tokens

The scanner at `scripts/scan-forbidden-tokens.js` enforces:

| Forbidden | Reason |
|---|---|
| Raw hex colors (`#xxx`) | Use design tokens via Tailwind classes |
| `box-shadow:` | Elevation via 1px borders + surface tokens, never shadows |
| `recharts`, `chart.js`, `nivo`, `victory`, `react-vis` imports | ECharts only |

**Allowlisted files** (may contain raw hex):
- `src/lib/echarts-theme.ts` — token hex values for ECharts registration
- `src/styles/tokens.css` — auto-generated token CSS
- `design-tokens/**` — source token definitions

Run the scanner: `node scripts/scan-forbidden-tokens.js`

## CI Workflow

On every PR:
1. `pnpm --filter frontend-v3 lint` — ESLint (including R1 rule) + forbidden-tokens scanner
2. `pnpm --filter frontend-v3 test` — Vitest (unit + R1 DOM contract + chart contract)
3. `pnpm --filter frontend-v3 build` — Vite production build (includes token compilation)
4. `pnpm --filter frontend-v3 storybook:build` — Static Storybook output

All four must pass for CI green.
