## Aesthetics & Organization Standard (non-negotiable)

This section is the single source of truth for all UI work going forward. It supersedes any earlier visual choices. Match the Sprint 1 prototype tokens exactly. Shawn reviews every UI change against this list before merging.

**Design feel:** Quiet, dense, neutral, professional. No chrome. No decoration. Looks like an instrument panel a senior partner uses, not a SaaS dashboard.

### Color tokens (Tailwind config — `tailwind.config.js`)

```js
colors: {
  bg:       '#F7F6F2',  // warm off-white page background (never pure white)
  ink:      '#28251D',  // primary text
  muted:    '#7A7974',  // secondary text, captions, labels
  border:   '#D4D1CA',  // hairline borders, dividers
  accent:   '#01696F',  // Hydra Teal — THE ONLY accent (links, active states, primary buttons, pillar pills)
  critical: '#A12C7B',  // deep magenta — severity ONLY (critical flags, expired badges)
}
```

**Rules:**
- One accent: `accent` (#01696F). It marks the active tab, primary buttons, source links, and one-pixel left-bars on banner cards.
- Critical severity uses `critical` (#A12C7B). Never confused with accent.
- Card background is `#FFFFFF`. Page background is `bg` (#F7F6F2). Body is never pure white.
- No gradients. No shadows beyond the 1px card shadow defined below. No glow effects.

### Typography

- Font family: **Inter only**, loaded from Google Fonts (`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`). No second font. No monospace family.
- Sizes (in `theme.extend.fontSize`):
  - `display` — 32px / 40px line / -0.01em tracking / 600 weight (page titles)
  - `section` — 20px / 28px line / 600 weight (section headers)
  - `body` — 15px / 24px line (default)
  - `caption` — 12px / 16px line (metadata, doctrine tags)
- Doctrine tags: caption size, italic, `muted` color.
- All numbers use `font-variant-numeric: tabular-nums`. Applied globally in `index.css` to `table, td, th, .num, .nums`.

### Layout

- Page wrapper: `max-width: 1280px; margin: 0 auto; padding: 0 32px;` (utility class `.container-page`).
- Card: `background:#FFFFFF; border:1px solid #D4D1CA; border-radius:4px; padding:24px; box-shadow:0 1px 2px rgba(0,0,0,0.04);` (utility class `.card`).
- Banner / critical flag cards: same as card PLUS a 4px left accent bar in either `accent` or `critical` depending on severity.
- Spacing: 8px base grid. Use 8, 16, 24, 32, 48. Never 7, 9, 14, 27, etc.
- Border radius: 4px everywhere. Never larger.

### Buttons

- Default: 32px height, 16px horizontal padding, 4px radius, 13px font, 500 weight, 1px `border` border, white background, `ink` text. Hover: background → `bg`.
- Primary: same dimensions, `accent` background, white text, `accent` border. Hover: background → `#015C61`.
- No icon-only buttons. No floating action buttons. No gradient buttons.

### Tabs

- Tabs sit on the same row, 16px gap. Active tab has a **2px Hydra Teal underline** directly below the label. Inactive tabs are `muted` color. No background fill on tabs.

### Severity badges

- **Critical** (e.g. "EXPIRED APR 29, 2026"): filled badge, `critical` background, white text, 11px font, 600 weight, 4px radius, 4px/8px padding.
- **Warning** (e.g. "EXPIRES IN 71 DAYS"): outlined badge, 1px amber border (`#B45309`), amber text, same dimensions.
- **OK / Current**: no badge needed; use `muted` text inline.
- Never use red dots, yellow dots, or traffic-light dots as decoration.

### Tables

- 1px `border` lines between rows. Header row: caption size, `muted` color, uppercase, 0.04em tracking.
- All numeric columns right-aligned, `tabular-nums`.
- No zebra striping. No row hover background (unless row is clickable, then `bg` on hover).

### Dates and times

- All dates render in Eastern Time. Never raw UTC. Use the existing format helpers (`formatShortDate`, `formatLongDate`, `formatTimeEastern`).
- Format examples: "Thursday, May 28, 2026" for long; "May 28, 2026" for short; "10:47 PM EST" for times.

### Forbidden

- **Zero decorative charts.** Charts only when they convey real meaning. Use ECharts only. Never recharts, never Chart.js, never canvas hacks. No charts in Sprint 1, none in Sprint 2 unless explicitly required and Shawn-approved.
- **No icons except** abstract severity dots and the dismiss "×" on flag cards. No Lucide icon spray. No Heroicons spray. No emoji in UI.
- **No animations** beyond a 120ms ease background-color transition on buttons and links.
- **No stock images, no illustrations, no gradients, no glows.**
- **No dark mode** in this build.

### Component organization

- One component per file. No 400-line page files. Pages compose components.
- File names match component names exactly (PascalCase.tsx).
- Page files live in `pages/`. Reusable components live in `components/<domain>/`.

### Forbidden patterns from past mistakes

- Do NOT use the old dark-theme tokens (`#0f1117`, `#1a1d27`, `#3b82f6`, etc.). They are deprecated.
- Do NOT use inline `style={...}` for colors. Use Tailwind classes that reference the tokens above.
- Do NOT use JetBrains Mono or any monospace font for body text.
- Do NOT use `.kpi-grid`, `.signal-grid`, `.funnel-row` legacy class names — they belong to the deprecated layout.
