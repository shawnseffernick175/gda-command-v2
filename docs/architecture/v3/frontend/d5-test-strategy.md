# D5 — Frontend V3 Test Strategy & CI Pipeline

**Parent:** F-215 (#426)
**Date:** 2026-05-30
**Status:** Draft — awaiting human sign-off before F-218 implementation
**Canonical inputs:**
- `docs/canonical/aesthetics_canonical_v1.md` (design tokens, forbidden patterns)
- `docs/canonical/product_rules.md` (R1 source citations, R2 auto-analysis)
- `docs/architecture/v3/phase-1-test-strategy.md` (backend V3 CI patterns)
- `docs/architecture/v3/phase-1-api-contract.md` (V3 API contract + OpenAPI)

> **Scope lock:** `packages/frontend-v3/` only. Backend V3 owns its own tests.
> No production code in this ticket — strategy doc + CI workflow drafts.

---

## 1. Test Pyramid (binding)

Listed from fastest/cheapest (base) to slowest/most expensive (top).

| Layer | Tool | Scope | Trigger | Target Time |
|---|---|---|---|---|
| **Unit** | Vitest + React Testing Library | Component rendering, utility functions, token-to-Tailwind mapping, design-token consistency | Every PR | < 2 min |
| **Integration** | Vitest + React Testing Library | Surface-level rendering (6 surfaces against mocked V3 API), agent recommendation card flows, keyboard model, cross-surface navigation, approval queue interactions | Every PR | < 5 min |
| **Contract** | Vitest + custom assertions | R1 source-URL enforcement, R2 detail-load contract, source-kinds enum parity, forbidden response shapes, approval queue write-action contracts | Every PR | Zero tolerance |
| **E2E** | Playwright | Full operator journeys against deployed frontend-v3 + V3 API, keyboard-only navigation, theme switching, Cmd+K palette | Every PR + merge | < 10 min |
| **Visual regression** | Playwright screenshots | Per-surface + component story snapshots, diff threshold < 0.1% | Every PR | < 5 min |

**Total PR gate time target: < 15 min** (unit + integration + contract + visual run in parallel; E2E runs against staging post-build).

---

## 2. Unit Tests (fast, every PR)

### 2.1 Component rendering

Every component in `packages/frontend-v3/src/components/` has a corresponding `*.test.ts` file that verifies:

- Renders without error given valid props
- Renders correct DOM structure
- Handles empty/null/undefined data gracefully (no console errors)
- Passes axe-core WCAG AA checks

### 2.2 Utility functions

All pure functions in `packages/frontend-v3/src/utils/` tested for:

- Correct output for known inputs
- Edge cases (empty arrays, null values, boundary dates)
- Type safety (TypeScript strict mode enforces at compile time; runtime tests cover coercion edges)

### 2.3 Token-to-Tailwind mapping

Verify that every color token defined in `tokens.json` maps to a valid Tailwind class:

```typescript
// Example: token-tailwind-mapping.test.ts
import tokens from '../tokens.json';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config';

const fullConfig = resolveConfig(tailwindConfig);

describe('[Tokens] Token-to-Tailwind mapping', () => {
  Object.entries(tokens.colors).forEach(([name, value]) => {
    it(`token "${name}" exists in Tailwind config`, () => {
      expect(fullConfig.theme.colors[name]).toBe(value);
    });
  });
});
```

### 2.4 Design-token consistency

- No raw hex values outside `tokens.json`
- All components reference tokens via Tailwind classes, never inline `style={{}}`
- Forbidden tokens (`#0f1117`, `#1a1d27`, `#3b82f6`) absent from all source files

---

## 3. Integration Tests (every PR)

### 3.1 Surface-level rendering

Each of the 6 frontend surfaces renders correctly against mocked V3 API responses:

| Surface | Mock fixture | Key assertions |
|---|---|---|
| **Launchpad** | `v3-api/launchpad.json` | Today-actionable counts render, critical flags display with source URLs |
| **Fast Track** | `v3-api/fast-track.json` | Signal cards render, R2 auto-analysis triggers on promote, grade badges correct |
| **Opportunities** | `v3-api/opportunities.json` | Opportunity list renders, R2 auto-analysis response handled, grade badges correct |
| **Capture** | `v3-api/capture.json` | Color review cards render, compliance matrix populates, pricing guardrails shown |
| **Pipeline** | `v3-api/pipeline.json` | Stage columns render, drag-drop handlers fire, teaming flags visible |
| **Action Items** | `v3-api/action-items.json` | Task list renders, click navigates to source surface (opp/capture/pipeline), AI drafts display |

### 3.2 Agent recommendation card flows

Every agent recommendation card supports the full interaction cycle:

```
Approve -> confirm toast -> item moves to approved queue
Reject  -> confirm toast -> item removed from pending
Defer   -> sets deferred_until date -> item grays out
Expand reasoning -> reasoning-trace panel opens with model_used, trace_id, sources
```

### 3.3 Keyboard model

| Shortcut | Action | Test assertion |
|---|---|---|
| `Cmd+K` / `Ctrl+K` | Open command palette | Palette overlay visible, input focused |
| `J` / `K` | Navigate list items down/up | `aria-selected` moves to correct row |
| `O` | Open selected item detail | Detail view renders for selected item |
| `P` | Promote selected to pipeline | Confirmation dialog appears |
| `Escape` | Close overlay/modal | Overlay removed from DOM |
| `?` | Show keyboard shortcut overlay | Overlay with all shortcuts visible |

### 3.4 Cross-surface navigation

- Tab navigation between surfaces updates URL and renders correct surface
- Browser back/forward preserves surface state
- Deep links to specific items resolve correctly

### 3.5 Approval queue interactions

- Every write action (stage move, status change, teaming flag toggle) shows Approve/Reject buttons
- Approve fires the correct V3 API mutation
- Reject reverts the optimistic update

---

## 4. Contract Tests (every PR — binding, zero tolerance)

### 4.1 R1: Source URL enforcement

**Rule:** Every data point in rendered DOM has a clickable source URL (per `product_rules.md`).

**Mechanism — two-layer check:**

1. **Static prop presence (compile time):** Every `<Stat>`, `<Metric>`, `<Field>` component requires a `sourceUrl` prop. TypeScript enforces at compile time — missing `sourceUrl` is a type error.

2. **DOM-rendered anchor (runtime — the actual R1 enforcement):** Render each surface, query all `[data-testid^="data-point-"]` elements, assert each contains a **clickable `<a>` tag** with a valid `href`, `target="_blank"`, and `rel="noopener"`. Prop presence alone is insufficient — the data point must be rendered as a clickable anchor in the DOM.

```typescript
// Example: r1-source-enforcement.contract.test.ts
describe('[R1] Source URL enforcement — DOM level', () => {
  SURFACES.forEach((surface) => {
    it(`${surface.name} — every data point renders a clickable source link`, () => {
      render(<Surface {...surface.mockProps} />);
      const dataPoints = screen.getAllByTestId(/^data-point-/);
      expect(dataPoints.length).toBeGreaterThan(0);
      dataPoints.forEach((el) => {
        // The data point element itself, or a descendant, must be an anchor with valid href
        const anchor = el.tagName === 'A' ? el : el.querySelector('a[href]');
        expect(anchor).not.toBeNull();
        expect(anchor!.getAttribute('href')).toMatch(/^https?:\/\//);
        expect(anchor!.getAttribute('target')).toBe('_blank');
        expect(anchor!.getAttribute('rel')).toContain('noopener');
      });
    });
  });
});
```

Both layers must pass. The static check prevents omitting the prop; the DOM-level check prevents rendering the prop as a non-clickable attribute.

### 4.2 R2: Opportunity detail contract

**Rule:** Opportunity detail returns 200 with fresh analysis OR 503 `ANALYSIS_TIMEOUT` — no third state.

**Mechanism:**
- Mock V3 API returns either `{ success: true, data: { analysis: {...} } }` (200) or `{ success: false, error: { code: "ANALYSIS_TIMEOUT" } }` (503)
- Test asserts the frontend handles exactly these two states — no loading spinners, no "pending analysis", no "click to analyze" buttons
- Any other response shape in fixtures fails the contract test

```typescript
// Example: r2-detail-contract.contract.test.ts
describe('[R2] Opportunity detail load contract', () => {
  it('renders analysis on 200 response', () => {
    mockApi.get('/api/v3/opportunities/:id').reply(200, FIXTURE_200);
    render(<OpportunityDetail id="test-id" />);
    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument();
  });

  it('renders timeout error on 503 ANALYSIS_TIMEOUT', () => {
    mockApi.get('/api/v3/opportunities/:id').reply(503, FIXTURE_503);
    render(<OpportunityDetail id="test-id" />);
    expect(screen.getByText(/analysis timeout/i)).toBeInTheDocument();
  });

  it('no third state exists — no loading, no pending, no retry button', () => {
    const forbiddenElements = [
      'analysis-loading', 'analysis-pending', 'run-analysis-button',
      'analysis-spinner', 'click-to-analyze'
    ];
    forbiddenElements.forEach((testId) => {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    });
  });
});
```

### 4.3 Source-kinds enum parity

Frontend `SourceKind` enum must exactly match V3 API `SourceKind` enum:

```typescript
// source-kinds-parity.contract.test.ts
import { SourceKind as FrontendSourceKind } from '../src/types/sources';
import { SourceKind as ApiSourceKind } from '../../shared/src/v3/source-kinds';

const ACCEPTABLE_SOURCE_KINDS = [
  'sam_gov',
  'fpds',
  'usaspending',
  'govwin',
  'govtribe',
  'news',
  'doctrine',
  'partner_site',
  'internal',
  'sbir_sttr',
  'darpa_baa',
  'afwerx',
  'sofwerx',
  'edu_rfi',
  'orangeslices',
] as const;

describe('[Contract] Source-kinds enum parity', () => {
  it('frontend enum values match V3 API enum values', () => {
    expect(Object.values(FrontendSourceKind).sort())
      .toEqual(Object.values(ApiSourceKind).sort());
  });

  it('all acceptable source kinds are present', () => {
    const frontendValues = Object.values(FrontendSourceKind);
    ACCEPTABLE_SOURCE_KINDS.forEach((kind) => {
      expect(frontendValues).toContain(kind);
    });
  });
});
```

Acceptable source kinds (per `product_rules.md` + D3 §13.1 — 15 total): `sam_gov`, `fpds`, `usaspending`, `govwin`, `govtribe`, `news`, `doctrine`, `partner_site`, `internal`, `sbir_sttr`, `darpa_baa`, `afwerx`, `sofwerx`, `edu_rfi`, `orangeslices`.

The parity test compares frontend's `SourceKind` enum against D3 `FrontendSourceKind` — they must be identical.

### 4.4 Forbidden response shapes

CI scans all mock fixtures and frontend types for forbidden V3 patterns:

| Forbidden token | Context | Detection |
|---|---|---|
| `analysis_status` | As field, column, or enum value | grep + AST scan |
| `stale: true` / `stale: boolean` | As analysis flag | grep + type scan |
| `analysis: null` | In any response fixture | JSON parse + assert |
| `not_yet_analyzed` / `running` / `pending` | As analysis state strings | grep across all `.ts` and `.json` |

### 4.5 Approval queue write-action contract

Every write action surface exposes Approve and Reject buttons. CI renders each write-action component and asserts both buttons are present and wired.

### 4.6 5-Chart contract tests

D2 §7 specifies 5 named charts with data contracts. For each chart, the contract test:

| Chart | Fixture | Key assertions |
|---|---|---|
| **Funding velocity** | `tests/fixtures/charts/funding-velocity.json` | ECharts renders, data series matches D2 §7 schema, R1 source links on data points |
| **Pipeline aging** | `tests/fixtures/charts/pipeline-aging.json` | ECharts renders, data series matches D2 §7 schema, R1 source links on data points |
| **Win-probability distribution** | `tests/fixtures/charts/win-probability.json` | ECharts renders, data series matches D2 §7 schema, R1 source links on data points |
| **Source-kind contribution** | `tests/fixtures/charts/source-kind-contribution.json` | ECharts renders, data series matches D2 §7 schema, R1 source links on data points |
| **Capture-stage funnel** | `tests/fixtures/charts/capture-stage-funnel.json` | ECharts renders, data series matches D2 §7 schema, R1 source links on data points |

Each test:
- Renders the chart with a canonical fixture (`tests/fixtures/charts/<chart-name>.json`)
- Asserts the chart uses ECharts (no other chart libraries — enforced by forbidden-tokens scanner against `recharts`, `chart.js`, `nivo`, `victory`, etc.)
- Asserts the chart's data series matches the schema in D2 §7
- Asserts every data point has a clickable source link (R1 — covered by the DOM-level R1 test if data points use `data-point-*` testid pattern)
- Asserts the chart renders in dark theme by default with D2 token-defined colors (no raw hex in the chart consumer code)

---

## 5. E2E Tests (every PR + merge, on staging deploy)

### 5.1 Infrastructure

- Playwright suite runs against deployed `frontend-v3` + V3 API
- Docker Compose spins up: Postgres (pgvector), backend-v3, frontend-v3
- `MOCK_LLM=1` for all CI runs (see section 11)

### 5.2 Operator journeys

| Journey | Steps | Key assertions |
|---|---|---|
| **Fast Track R2 trigger path** | Land on Launchpad -> open Fast Track -> click signal -> Promote to Opportunity -> R2 fires -> analyst output renders | R2 auto-analysis triggers on promote, analysis panel renders with source URLs, no loading/pending states |
| **Fast Track signal to Capture** | Fast Track -> Promote -> Opportunity -> Promote to Pipeline -> advance to Capture | Each surface loads without error, item state persists across surfaces |
| **Full capture workflow** | Open Capture item -> view color review -> check compliance -> review pricing -> approve | All panels render, approval persists |
| **Action Items navigation** | Open Action Items -> click action item -> navigates to source surface (opp / capture / pipeline) | Source surface loads with correct item, back-navigation returns to Action Items |
| **Keyboard-only journey** | Navigate entire app using only keyboard (J/K/O/P/Cmd+K/Escape) — no mouse clicks | Every surface reachable, all actions executable |
| **Theme switch** | Toggle dark/light mode, verify all surfaces render correctly in both themes | No broken tokens, all text readable, contrast ratios pass |
| **Cmd+K command palette** | Open palette -> type search -> select result -> navigate to target | Palette opens, results filter, navigation works |
| **Agent reasoning trace** | Open any agent recommendation -> expand reasoning -> verify trace fields | `model_used`, `trace_id`, `sources` all present |

### 5.3 File naming

- E2E test files: `*.e2e.ts`
- Located in `packages/frontend-v3/test/e2e/`
- Describe blocks: `[Surface] [Behavior]` (e.g., `[Opportunities] [R2 detail load]`)

### 5.4 Failure artifacts

On failure, Playwright uploads:
- Trace files (`.zip`) for step-by-step replay
- Screenshot at point of failure
- Console log dump

---

## 6. Visual Regression Tests (every PR)

### 6.1 Mechanism

- Playwright captures screenshots for each surface + each component story
- Baselines stored in `packages/frontend-v3/test/__visual__/`
- Diff threshold: **< 0.1%** (pixel-level comparison)
- Baseline images are committed to the repo

### 6.2 Baseline update workflow

1. Developer makes intentional visual change
2. PR includes updated baseline screenshots
3. PR must carry the `viz-baseline-update` label
4. Without the label, any baseline diff > 0.1% fails CI
5. Reviewer explicitly approves the visual change

### 6.3 CI behavior

- Workflow posts diff images as a PR comment (before/after/diff panels)
- Only surfaces touched by the PR are re-screenshotted (optimization)
- Full baseline regeneration available via `npm run test:visual:update` locally

---

## 7. CI Workflows (drafts — `.disabled` extension)

Six workflow files, all in `.github/workflows/`, all with `.disabled` extension so they do not fire until F-218 enables them.

### 7.1 `frontend-v3-ci.yml.disabled`

**Trigger:** Every PR touching `packages/frontend-v3/`

| Step | Command | Failure = red |
|---|---|---|
| Lint | `eslint` with project config | Yes |
| Typecheck | `tsc --noEmit --strict` | Yes |
| Unit + integration tests | `vitest run` | Yes |
| Contract tests | `vitest run --config vitest.contract.config.ts` | Yes |
| Build | `vite build` | Yes |
| Bundle-size check | Assert main chunk < 350KB gzipped | Yes |
| Lighthouse perf | `perf >= 90` on built static output | Yes |

### 7.2 `frontend-v3-visual.yml.disabled`

**Trigger:** Every PR touching `packages/frontend-v3/`

| Step | Description |
|---|---|
| Install Playwright browsers | `npx playwright install --with-deps chromium` |
| Run visual regression suite | `npx playwright test --config playwright.visual.config.ts` |
| Post diff images to PR | GitHub Script action posts before/after/diff as PR comment |
| Gate on `viz-baseline-update` label | If diffs detected and label absent, fail the check |

### 7.3 `frontend-v3-e2e.yml.disabled`

**Trigger:** PR + merge to main

| Step | Description |
|---|---|
| Docker Compose up | Spin up V3 backend + frontend-v3 + Postgres |
| Wait for services healthy | Health check loop (max 60s) |
| Run Playwright E2E suite | `npx playwright test --config playwright.e2e.config.ts` |
| Upload trace files on failure | `actions/upload-artifact` with trace zips |

### 7.4 `frontend-v3-forbidden-tokens.yml.disabled`

**Trigger:** Every PR touching `packages/frontend-v3/`

Extends the existing Visual Token Guardrail pattern:

| Check | Rule | Failure = red |
|---|---|---|
| Raw hex outside `tokens.json` | No `#0f1117`, `#1a1d27`, `#3b82f6` or any raw hex not in tokens | Yes |
| `box-shadow` in source | No `box-shadow` declarations permitted (D2 — depth via 1px borders and surface elevation tokens, never shadows). Allowlisted: token-definition files (`echarts-theme.ts`, `design-tokens/**`) | Yes |
| Gradients | `linear-gradient`, `radial-gradient` forbidden | Yes |
| Inline color styles | `style={{...color...}}` forbidden | Yes |
| Emoji in production components | No emoji in `src/` (test files exempt) | Yes |
| Chart library imports | `Chart.js`, `Recharts`, `Victory`, `canvas` chart imports forbidden | Yes |

### 7.5 `frontend-v3-r1-r2-contract.yml.disabled`

**Trigger:** Every PR touching `packages/frontend-v3/`

| Check | Mechanism | Failure = red |
|---|---|---|
| R1 static: `sourceUrl` prop | AST scan — every `<Stat>`, `<Metric>`, `<Field>` has `sourceUrl` | Yes |
| R1 runtime: DOM-level anchor | Render each surface, assert every `data-point-*` contains a clickable `<a href>` with `target="_blank"` and `rel="noopener"` | Yes |
| R2 runtime: detail contract | Vitest against mocked V3 API — 200-with-analysis or 503, no third state | Yes |
| Forbidden-shape scan | grep for `analysis_status`, `stale`, `analysis: null`, polling fields | Yes |
| Source-kinds enum parity | Frontend `SourceKind` === V3 API `SourceKind` (15 kinds per D3 §13.1) | Yes |

### 7.6 `frontend-v3-agent-trace.yml.disabled`

**Trigger:** Every PR touching `packages/frontend-v3/`

| Check | Mechanism | Failure = red |
|---|---|---|
| Reasoning-trace expander present | Every agent surface renders a `[data-testid="reasoning-trace"]` element | Yes |
| Trace fields present | `model_used`, `trace_id`, `sources` rendered inside expander | Yes |
| Absence = CI red | Missing expander or missing fields fails the build | Yes |

---

## 8. Backend Interaction Tests

### 8.1 Principle

Frontend tests assume V3 API is correct (backend V3 owns its own contract tests). Frontend tests mock V3 API responses using checked-in fixtures.

### 8.2 Mock fixture location

All V3 API mock fixtures live in:

```
packages/frontend-v3/test/fixtures/v3-api/
  launchpad.json
  fast-track.json
  opportunities.json
  opportunities-detail-200.json
  opportunities-detail-503.json
  pipeline.json
  capture.json
  action-items.json
  agent-recommendations.json
```

### 8.3 Fixture drift detector

If the V3 API OpenAPI spec (`docs/architecture/v3/openapi-v3.yaml`) changes, a CI step validates all fixtures against the updated spec:

```bash
# Pseudocode for fixture drift check
npx openapi-validator validate \
  --spec docs/architecture/v3/openapi-v3.yaml \
  --fixtures packages/frontend-v3/test/fixtures/v3-api/*.json
```

Any fixture that no longer matches the OpenAPI spec fails CI, forcing fixture updates to stay in sync with the API contract.

---

## 9. Test Data Fixtures (binding)

### 9.1 Quality requirements

- **Anonymized but realistic** — no synthetic "Lorem ipsum" data
- Real agency names, real NAICS codes, realistic dollar values
- PII-sensitive fields use SHA-256 hashed values (same pattern as backend sanitized snapshots)

### 9.2 Coverage requirements

Every fixture set must cover:

| Dimension | Values covered |
|---|---|
| Source kinds | `sam_gov`, `fpds`, `usaspending`, `govwin`, `govtribe`, `news`, `doctrine`, `partner_site`, `internal`, `sbir_sttr`, `darpa_baa`, `afwerx`, `sofwerx`, `edu_rfi`, `orangeslices` (15 total per D3 §13.1) |
| Status states | Every opportunity/pipeline/capture status enum value |
| Shipley stages | All 7 stages (Long Range Planning through Post-Submittal) |
| Agent recommendation types | Approve, Reject, Defer, Escalate |
| Severity levels | OK, Warning, Critical |
| Edge cases | Empty lists, single item, max-length strings, expired dates |

### 9.3 Offline demo mode

Operators can run the app against fixtures for offline demos:

```bash
VITE_USE_FIXTURES=1 npm run dev --workspace=packages/frontend-v3
```

When `VITE_USE_FIXTURES=1`, the app loads all data from `test/fixtures/v3-api/` instead of calling the live V3 API. This enables:

- Conference demos without network
- New hire onboarding against safe data
- Designer review of all states

---

## 10. Accessibility Tests

### 10.1 Integration

- `axe-core` integrated into every unit and integration test via `vitest-axe`
- Every component test includes `expect(await axe(container)).toHaveNoViolations()`

### 10.2 WCAG AA compliance

- Color contrast ratios checked against canonical tokens (accent `#01696F` on white = 5.1:1, passes AA)
- Focus indicators visible on all interactive elements
- All images have descriptive `alt` text (or `role="presentation"` for decorative)

### 10.3 Keyboard-only navigation

- Every surface navigable via Tab/Shift+Tab
- Custom keyboard shortcuts (J/K/O/P/Cmd+K) tested per surface
- Focus trap in modals/overlays
- Skip-to-content link on every page

### 10.4 Screen reader labels

- All interactive elements have `aria-label` or visible label association
- Dynamic content updates announced via `aria-live` regions
- Table headers properly associated with data cells

---

## 11. Mock LLM in CI

### 11.1 Environment variable

All CI runs set `MOCK_LLM=1`. No real API keys in CI ever.

### 11.2 Mock response coverage

Mock responses cover all 8 D4 task types:

| D4 Task Type | Mock fixture path | Schema validation | Coverage scope |
|---|---|---|---|
| `fast_track_triage` | `tests/fixtures/llm-mock/fast_track_triage.json` | `FastTrackTriageOutput` from `d4_types.ts` | Fast Track surface — signal scoring and filtering |
| `opportunity_analysis` | `tests/fixtures/llm-mock/opportunity_analysis.json` | `OpportunityAnalysisOutput` from `d4_types.ts` | Opportunity detail — R2 auto-analysis (pwin, incumbent, competitors, blackhat) |
| `capture_plan` | `tests/fixtures/llm-mock/capture_plan.json` | `CapturePlanOutput` from `d4_types.ts` | Capture surface — win themes, pricing, teaming |
| `daily_briefing` | `tests/fixtures/llm-mock/daily_briefing.json` | `DailyBriefingOutput` from `d4_types.ts` | Launchpad — today-actionable summary |
| `sentinel_summary` | `tests/fixtures/llm-mock/sentinel_summary.json` | `SentinelSummaryOutput` from `d4_types.ts` | Sentinel door — system health narrative |
| `doctrine_score` | `tests/fixtures/llm-mock/doctrine_score.json` | `DoctrineScoreOutput` from `d4_types.ts` | Cross-surface — doctrine alignment scoring |
| `semantic_embed` | `tests/fixtures/llm-mock/semantic_embed.json` | `SemanticEmbedOutput` from `d4_types.ts` | Knowledge base — embedding generation |
| `source_research` | `tests/fixtures/llm-mock/source_research.json` | `SourceResearchOutput` from `d4_types.ts` | Agent surface — source discovery and citation |

### 11.3 Mock parity test

Mock response schemas are validated against real provider response schemas:

```typescript
// mock-parity.contract.test.ts
describe('[Contract] Mock LLM parity', () => {
  MOCK_RESPONSES.forEach(({ taskType, mockResponse, schema }) => {
    it(`mock for "${taskType}" matches real provider schema`, () => {
      const result = schema.safeParse(mockResponse);
      expect(result.success).toBe(true);
    });
  });
});
```

### 11.4 Key constraint

If a mock response schema drifts from the real provider schema, the parity test fails. This prevents the "works in CI, breaks in prod" failure mode.

---

## 12. Performance Budgets

### 12.1 Page-level budgets

| Metric | Budget | Measurement |
|---|---|---|
| Initial page load | < 1.5s | Simulated 3G Fast (Lighthouse) |
| Time to Interactive | < 2.0s | Lighthouse TTI |
| Cumulative Layout Shift | < 0.1 | Lighthouse CLS |
| Largest Contentful Paint | < 2.0s | Lighthouse LCP |

### 12.2 Bundle-size budgets

| Chunk | Budget | Enforcement |
|---|---|---|
| Main bundle | < 350KB gzipped | CI fails if exceeded (Linear-level, non-negotiable) |
| Per-surface chunk | < 100KB gzipped | CI warns, blocks after F-220 |

### 12.3 Lighthouse CI

- Lighthouse runs against the built static output (not dev server)
- Performance score must be >= 90
- Budget overrides require explicit operator approval + PR label `perf-budget-override`

### 12.4 Reference standard

Bundle size and performance budgets modeled after Linear (dense, fast, professional operator tool). The aesthetics canonical demands "quiet, dense, neutral, professional" — performance is part of that promise.

---

## 13. Operator-Grade Quality Checks

### 13.1 Console errors on cold load

CI scrapes browser console during E2E cold load. Any `console.error` = red.

Exemptions:
- React strict-mode double-render warnings (development only, stripped in prod build)
- Third-party library deprecation warnings (tracked in separate issue)

### 13.2 Failed network requests on cold load

CI monitors network tab during E2E cold load. Any non-2xx response (except expected 503 `ANALYSIS_TIMEOUT`) = red.

### 13.3 Chart rendering

All charts (ECharts only, per aesthetics canonical) render with real data shapes from fixtures. No "demo" or placeholder data in any chart component.

### 13.4 Keyboard shortcut affordances

- All keyboard shortcuts have visible tooltips on hover
- `?` overlay lists all shortcuts with descriptions
- Missing affordance = CI red (E2E test checks for tooltip elements)

---

## 14. Sentinel + QA Stay Live (binding)

Per binding rule: "Sentinel + QA stay on the tool throughout — no shortcuts."

### 14.1 CI health checks

- CI runs Sentinel-style health checks against staging deploys after every merge
- Checks: frontend serves 200, API health endpoint returns 200, critical surfaces load without error
- Failed checks block the merge

### 14.2 QA dashboard

- CI status surfaced in an operator-visible QA dashboard (Sentinel door)
- Dashboard shows: last CI run status, test coverage trend, bundle size trend, visual regression status
- Red CI blocks deploy pipeline

---

## 15. Release Gates

### 15.1 Every PR (must be green)

1. Lint (eslint)
2. Typecheck (tsc strict)
3. Unit tests (vitest)
4. Integration tests (vitest)
5. Contract tests (R1/R2/source-kinds/forbidden-shapes)
6. Visual regression (Playwright snapshots)
7. Forbidden tokens (hex/shadow/gradient/emoji/chart libs)
8. Agent trace (reasoning expander present)
9. Bundle-size check (< 350KB main)
10. Lighthouse perf (>= 90)

### 15.2 Pre-merge (must be green)

- E2E suite on staging (all operator journeys pass)
- Sentinel health check on staging deploy

### 15.3 Post-merge

- Smoke test on prod deploy (frontend serves 200, critical surfaces load)

### 15.4 Operator approval required for

| Change type | Approval mechanism |
|---|---|
| Visual baseline updates | `viz-baseline-update` label on PR |
| Bundle-size budget increase | `perf-budget-override` label + justification in PR body |
| Performance budget change | `perf-budget-override` label + justification in PR body |

---

## 16. Test Naming Conventions

### 16.1 File naming

| Type | Pattern | Example |
|---|---|---|
| Unit tests | `*.test.ts` | `OpportunityCard.test.ts` |
| Contract tests | `*.contract.test.ts` | `r1-source-enforcement.contract.test.ts` |
| E2E tests | `*.e2e.ts` | `opportunities-journey.e2e.ts` |
| Visual tests | `*.visual.test.ts` | `launchpad-surface.visual.test.ts` |

### 16.2 Describe block format

`[Surface] [Behavior]`

Examples:
- `[Opportunities] [R2 detail load]`
- `[Pipeline] [Stage progression]`
- `[Capture] [Color review rendering]`
- `[Agent] [Reasoning trace expander]`

### 16.3 Contract test naming

Contract tests must reference the binding rule by name in the describe block:

```typescript
describe('[R1] Every data point has a source URL', () => { ... });
describe('[R2] Opportunity detail — 200 or 503, no third state', () => { ... });
describe('[Contract] Source-kinds enum parity', () => { ... });
describe('[Contract] Forbidden response shapes absent', () => { ... });
```

---

## 17. CI Infrastructure

### 17.1 Runners

- All workflows use existing GitHub Actions runners (`ubuntu-latest`)
- No new infrastructure spend
- Node.js 22 (matches existing CI pattern in `ci.yml`)

### 17.2 Playwright browsers

- Preinstalled via `npx playwright install --with-deps chromium`
- Chromium only (no Firefox/WebKit in CI — operator tool targets Chrome)

### 17.3 Visual baselines

- Stored in repo under `packages/frontend-v3/test/__visual__/`
- Committed as PNG files
- Git LFS recommended if baseline directory exceeds 50MB

### 17.4 Caching

- npm dependencies cached via `actions/setup-node` cache
- Playwright browsers cached via `actions/cache` keyed on Playwright version
- Vite build cache preserved between runs

### 17.5 Secrets

- No new secrets required for frontend CI
- `MOCK_LLM=1` replaces all real API keys
- Staging deploy secrets reuse existing repo secrets pattern

---

## 18. Test Coverage Targets

### 18.1 Thresholds

| Metric | Target |
|---|---|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

### 18.2 Enforcement

- Coverage report generated on every PR via `vitest --coverage`
- Coverage summary posted as PR comment
- Drops below threshold require justification in PR body
- Coverage trend tracked over time (no ratcheting down without operator approval)

---

## 19. Migration to V3 Frontend

### 19.1 During cutover (F-226)

- V2 tests (`packages/frontend/`) stay green
- V2 and V3 frontend test suites run in parallel during soak period
- No cross-contamination — V2 tests do not import from `packages/frontend-v3/`

### 19.2 V2 test freeze

- No new V2 tests after F-218 (V3 test implementation begins)
- Bug fixes to V2 may update existing tests but not add new test files

### 19.3 V2 test deletion

- V2 test suite deleted at F-228 (V2 archive milestone)
- V2 CI workflows disabled at F-228

---

## 20. Workflow File Summary

| File | Trigger | Purpose |
|---|---|---|
| `frontend-v3-ci.yml.disabled` | PR touching `packages/frontend-v3/` | Lint + typecheck + unit + integration + contract + build + bundle-size + Lighthouse |
| `frontend-v3-visual.yml.disabled` | PR touching `packages/frontend-v3/` | Playwright visual regression + PR comment with diff images |
| `frontend-v3-e2e.yml.disabled` | PR + merge | Docker Compose E2E suite + trace upload on failure |
| `frontend-v3-forbidden-tokens.yml.disabled` | PR touching `packages/frontend-v3/` | Raw hex, box-shadow, gradients, inline color, emoji, chart libs |
| `frontend-v3-r1-r2-contract.yml.disabled` | PR touching `packages/frontend-v3/` | R1 sourceUrl props, R2 detail contract, forbidden shapes, enum parity |
| `frontend-v3-agent-trace.yml.disabled` | PR touching `packages/frontend-v3/` | Reasoning-trace expander + required fields |

All files use `.disabled` extension — they will not fire until F-218 removes the extension.

---

## Appendix A: Reference Standards

| Standard | What we borrow |
|---|---|
| **Linear** | Bundle-size discipline (< 350KB), performance budgets, visual regression rigor |
| **Foundry** | Operator-grade quality (no console errors, no failed requests, keyboard-first) |
| **Backend V3 CI** | Drift detector pattern, contract tests, forbidden token scanning |
| **Aesthetics canonical** | Design token enforcement, forbidden pattern detection |

## Appendix B: Acceptance Checklist

- [ ] `d5-test-strategy.md` renders end-to-end
- [ ] All 6 CI workflow drafts present in `.github/workflows/` (as `.disabled`)
- [ ] Performance budgets quantified (section 12)
- [ ] Coverage targets quantified (section 18)
- [ ] Mock LLM strategy documented (section 11)
- [ ] R1/R2 contract test approach concrete (section 4)
- [ ] Visual regression workflow draft complete (section 7.2)
- [ ] Release gates documented (section 15)
- [ ] PR is docs + workflow drafts only — no actual test code
- [ ] CI green
