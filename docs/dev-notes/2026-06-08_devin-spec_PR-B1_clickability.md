# PR-B1 — Clickability hardening (#30)

## Goal
Eliminate "things that look clickable but aren't" in the frontend, and add one high-value
real interaction (agency/org breadcrumb click-to-filter). Establish a global convention:
**no element carries `cursor-pointer` or a hover-affordance style unless it has a real
handler (`onClick`), an `href`/`<Link>`, or `role="button"`.**

Repo: packages/frontend-v3/src. This is a FRONTEND-ONLY change. No backend, no migrations.

## Audit result (do not re-audit — scope is fixed below)
A full sweep of all 16 files containing `cursor-pointer` was done. Every table row, tile,
toggle, range input, file-upload label/dropzone, and KPI link already has a real handler or
`<Link>`. Only ONE dead-click affordance exists, plus the org breadcrumbs are display-only
text that SHOULD be clickable (highest-value interaction, pairs with the new org-hierarchy
columns from PR-A5). Note: `components/OpportunityCard.tsx` is defined but NOT imported
anywhere — leave it alone (do not "fix" dead code; the live list uses inline rows).

---

## Change 1 — SourceChip: gate clickable affordance on URL presence
File: `components/shared/source-chip.tsx`

Problem: `kindStyles.real` (L22) always includes `cursor-pointer hover:bg-gda-cyan/20`.
When `kind === "real"` but `url` is null/empty, the component falls through to the plain
`<span>` (L42-48) which still gets those clickable styles — a dead click.

Fix:
- Split the `real` style into a clickable variant (with `cursor-pointer hover:bg-gda-cyan/20`)
  and a static variant (same border/bg/text colors, but NO `cursor-pointer`, NO hover).
- The `<a>` branch (url present + real) uses the clickable variant.
- The fallthrough `<span>` uses the static variant for `real`-without-url.
- `heuristic` and `pending` already have no cursor-pointer — leave unchanged.

Keep the exact same visual colors; only remove the pointer cursor + hover when there is no
link target. Do not change the public props or the heuristic/pending rendering.

---

## Change 2 — Agency / org breadcrumbs: make them click-to-filter
File: `app/opportunities/page.tsx`

Context already in place:
- `agencyFilter` state (L150) + `setAgencyFilter` (L327) feed the backend `agency` query
  param (L166). There is a free-text "Agency…" input (L323-330).
- Org-hierarchy columns from PR-A5: `opp.department`, `opp.agency_name`, `opp.office`,
  `opp.contracting_office` (read path returns these).
- Two live render surfaces show org text as plain, non-interactive elements:
  - List table row cell (around L803): `<td>{opp.department ?? opp.agency ?? "---"}</td>`.
    The row has NO row-level onClick (it uses `<Link>` inside cells), so an agency click
    here does NOT need stopPropagation.
  - Detail badge strip (around L985-988): a `<Badge>` showing
    `[opp.department, opp.agency_name, opp.office, opp.contracting_office].join(' > ')`.
  - Also the compact card-grid row variant (around L699-710) shows `opp.agency` as a span;
    THIS variant's wrapper `<div>` (L699) HAS a row onClick `onNavigate(opp.id)`, so an
    agency click here MUST call `e.stopPropagation()`.

Implement:
1. Add a small handler in `OpportunityList`:
   ```
   const applyAgencyFilter = useCallback((value: string) => {
     setAgencyFilter(value);
     setPage(1);
   }, []);
   ```
   (Pass it down to the row components as a prop, or lift via context — match the existing
   prop-passing pattern in this file. Rows currently receive `onNavigate`; add an
   `onAgencyFilter?: (value: string) => void` prop alongside it on the same components.)

2. List table row cell (L803 area): wrap the department/agency text in a `<button type="button">`
   styled to look like the surrounding text (inherit color, `hover:text-gda-green underline-offset-2
   hover:underline cursor-pointer`, truncate preserved). onClick sets the filter to the most
   specific available segment — prefer `opp.agency_name`, else `opp.department`, else `opp.agency`.
   Keep the existing `title` tooltip (full breadcrumb). Empty/`---` stays plain text (no button,
   no cursor-pointer).

3. Detail badge strip (L985-988 area): render the breadcrumb as up to four clickable segments
   separated by " > ". Each present segment (`department`, `agency_name`, `office`,
   `contracting_office`) becomes a `<button type="button">` that calls the filter handler with
   that segment's exact string and navigates back to the list view (clear the `?id=` param /
   call the same back-to-list mechanism this page already uses for the detail→list transition —
   match existing code; do NOT invent a new router pattern). Separators (" > ") are plain
   non-clickable spans. If only `opp.agency` is available (no hierarchy), show it as one
   clickable segment. Visual: keep Badge look but make each segment a button with
   `hover:text-gda-green cursor-pointer`; the separator stays muted and non-interactive.

4. Compact card-grid row (L699-710 area): wrap the `opp.agency` span in a `<button type="button">`
   with `onClick={(e) => { e.stopPropagation(); onAgencyFilter?.(opp.agency!); }}`,
   styled `hover:text-gda-green cursor-pointer`. stopPropagation is REQUIRED here because the
   parent div navigates.

Filtering uses the existing `agency` query param (substring match server-side). Setting
`agencyFilter` to an exact agency string is fine — it will match. No backend change needed.

---

## Change 3 — Global convention guard (lightweight)
Add a short code comment block at the top of `components/shared/source-chip.tsx` (or a 1-line
note) is NOT required. Instead, just ensure the two changed files obey the rule. Do NOT add a
new lint rule or CI check in this PR (out of scope; would risk CI churn). The convention is:
elements get `cursor-pointer`/hover ONLY when they have onClick/href/Link/role=button.

---

## Constraints (HARD)
- Read each file before editing it. Match existing styling tokens (gda-green, gda-cyan, etc.).
- NO emojis. NO em-dashes (use " - " or rewrite). The CI "Forbidden Visual Token" check fails on these.
- Frontend-only. NO migrations, NO backend files, NO schema-doc edits.
- Do not touch `OpportunityCard.tsx` (unused).
- Keep all changes additive/behavior-preserving except the intended new click-to-filter.
- Buttons must be real `<button type="button">` (not divs) for accessibility, except where a
  `<Link>`/`<a>` is the right element.
- Preserve existing `title` tooltips and truncation.
- Run `pnpm -C packages/frontend-v3 lint` / typecheck locally and fix before opening the PR.
- Open ONE PR against main with a clear title: "B1: clickability - gate dead affordances + agency click-to-filter (#30)".
