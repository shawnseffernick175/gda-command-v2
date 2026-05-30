# GDA Command — Frontend V3

Greenfield React SPA for GDA Command V3 surfaces.

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Starts Vite dev server on port **5174** |
| `build` | `npm run build` | Compile tokens + TypeScript + Vite production build |
| `preview` | `npm run preview` | Preview production build locally |
| `typecheck` | `npm run typecheck` | `tsc --noEmit` (strict mode) |
| `lint` | `npm run lint` | ESLint + forbidden token scan |
| `test` | `npm run test` | Vitest unit tests |
| `storybook` | `npm run storybook` | Storybook dev server on port 6006 |

Run from repo root via workspace filter:

```bash
npm run dev --workspace=packages/frontend-v3
npm run build --workspace=packages/frontend-v3
```

## Path Aliases

| Alias | Resolves to |
|-------|-------------|
| `@/*` | `src/*` |
| `@/components/*` | `src/components/*` |
| `@/stores/*` | `src/stores/*` |
| `@/lib/*` | `src/lib/*` |

Configured in both `tsconfig.json` (for IDE / tsc) and `vite.config.ts` (for bundling).

## Router Choice: React Router v6

React Router v6 was chosen over TanStack Router for this scaffold because:

1. **Team familiarity** — the V2 frontend already uses `react-router-dom`, minimizing onboarding friction.
2. **Simplicity** — the 9 placeholder routes do not yet need TanStack Router's typed route features. If typed params become valuable later, migration is straightforward since routes are centralized in `App.tsx`.
3. **Bundle size** — React Router is already a dependency in the workspace graph.

### Routes

| Path | Surface |
|------|---------|
| `/launchpad` | Launchpad (default landing) |
| `/fast-track` | Fast Track |
| `/opportunities` | Opportunities |
| `/opp/:notice_id` | Opportunity Detail |
| `/capture` | Capture |
| `/capture/:opp_id` | Capture Detail |
| `/pipeline` | Pipeline |
| `/action-items` | Action Items |
| `/settings/*` | Settings (sidecar) |

Every route renders a `<PlaceholderSurface />` showing the surface name and matched URL.

## What Comes Next

- **F-217** — Model router, agents, API client
- **F-219 through F-224** — Surface implementations

## Tech Stack

- **Vite 6** — build tooling
- **TypeScript 5.x** — strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin
- **TanStack Query v5** — data fetching (QueryClientProvider wired)
- **Zustand v4** — client state (`stores/ui-store.ts`)
- **Radix UI** — headless primitives (installed)
- **React Router v6** — routing
- **ECharts** — charting (via `echarts-for-react`)
- **Inter + JetBrains Mono** — self-hosted variable fonts with tabular-nums
