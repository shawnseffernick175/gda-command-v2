# GDA Command — Frontend V3

Greenfield React SPA for GDA Command V3. This package is the scaffold only; surfaces, design tokens, agents, and API client are wired by subsequent tickets (F-217 through F-224).

## Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev -w packages/frontend-v3` | Vite dev server on port **5174** |
| `build` | `npm run build -w packages/frontend-v3` | TypeScript check + Vite production build |
| `preview` | `npm run preview -w packages/frontend-v3` | Preview production build locally |
| `typecheck` | `npm run typecheck -w packages/frontend-v3` | `tsc --noEmit` (strict mode) |
| `lint` | `npm run lint -w packages/frontend-v3` | ESLint with zero warnings allowed |

## Path Aliases

Configured in both `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves To |
|---|---|
| `@/*` | `packages/frontend-v3/src/*` |
| `@/components/*` | `packages/frontend-v3/src/components/*` |
| `@/stores/*` | `packages/frontend-v3/src/stores/*` |
| `@/lib/*` | `packages/frontend-v3/src/lib/*` |

## Router

**React Router v6** — chosen over TanStack Router for team familiarity. The route table is defined in `src/App.tsx` with placeholder surfaces for all 6 primary surfaces + Settings sidecar per D1 spec:

| Route | Surface |
|---|---|
| `/launchpad` | Launchpad (default index) |
| `/fast-track` | Fast Track |
| `/opportunities` | Opportunities |
| `/opp/:notice_id` | Opportunity Detail |
| `/capture` | Capture |
| `/capture/:opp_id` | Capture Detail |
| `/pipeline` | Pipeline |
| `/action-items` | Action Items |
| `/settings/*` | Settings |

Every route renders a `<PlaceholderSurface />` component that displays the surface name and matched URL. No navigation chrome yet — that arrives with F-218 (design system).

## Stack

- **Vite 5** — dev/build/preview
- **TypeScript 5.x** — strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
- **Tailwind v4** — via `@tailwindcss/vite` plugin
- **TanStack Query v5** — QueryClientProvider wraps the app
- **Zustand v4** — placeholder store at `src/stores/ui-store.ts`
- **Radix UI** — primitives installed (dialog, dropdown-menu, tooltip, toast, tabs, popover, select, checkbox, radio-group, switch, slot, visually-hidden)
- **React Router v6** — route table with placeholder surfaces

## What Comes Next

- **F-217** — Model router, agents, API client
- **F-218** — Design system tokens, Tailwind theme, components, Vitest/Playwright setup
- **F-219 through F-224** — Surface implementations
