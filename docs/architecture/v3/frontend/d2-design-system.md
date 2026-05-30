# D2 — Design System Spec (Dark Theme, Typography, Components, ECharts Theme)

**Parent:** F-215 (#426)
**Status:** Spec-only (no production code)
**Implements:** `packages/frontend-v3/design-tokens/tokens.json` + this document
**Consumed by:** F-218 (implementation)

---

## 1. Color Tokens

All components reference **semantic tokens only**. Raw hex values never appear in component code.

### 1.1 Dark Theme Palette (primary)

| Token | Hex | Usage |
|---|---|---|
| `canvas` | `#0B0D0F` | Page background, app shell |
| `surface` | `#13161A` | Card backgrounds, panels |
| `surface-raised` | `#1A1E23` | Modals, drawers, tooltips, popovers |
| `border` | `#2A2F36` | Default dividers, card borders |
| `border-strong` | `#3D434C` | Focused inputs, active borders, reference lines |
| `ink-primary` | `#E6E8EB` | Primary text, headings, labels |
| `ink-muted` | `#9AA0A8` | Secondary text, captions, axis labels |
| `ink-dim` | `#6B7079` | Disabled text, placeholder text |
| `accent` | `#01696F` | Hydra Teal. Links, primary buttons, active states, chart accent |
| `accent-hover` | `#017F86` | Hover on accent elements |
| `accent-pressed` | `#015C61` | Active/pressed accent elements |
| `critical` | `#A12C7B` | Deep magenta. Severity only (expired badges, critical flags) |
| `critical-hover` | `#B8338E` | Hover on critical elements |
| `success` | `#3FA66B` | Positive outcomes, compliant status |
| `success-hover` | `#4DBD7A` | Hover on success elements |
| `warning` | `#C48A1E` | Expiring certs, approaching deadlines |
| `warning-hover` | `#D69B2F` | Hover on warning elements |

### 1.2 Light Theme Palette (opt-in via theme token swap)

| Token | Hex | Usage |
|---|---|---|
| `canvas` | `#F7F6F2` | Warm off-white page background (never pure white) |
| `surface` | `#FFFFFF` | Card backgrounds |
| `surface-raised` | `#FFFFFF` | Modals, drawers, tooltips |
| `border` | `#D4D1CA` | Hairline borders, dividers |
| `border-strong` | `#B8B5AE` | Focused inputs, active borders |
| `ink-primary` | `#28251D` | Primary text |
| `ink-muted` | `#7A7974` | Secondary text, captions |
| `ink-dim` | `#A3A09A` | Disabled text, placeholder text |
| `accent` | `#01696F` | Hydra Teal (same across themes) |
| `accent-hover` | `#017F86` | Hover on accent elements |
| `accent-pressed` | `#015C61` | Active/pressed accent elements |
| `critical` | `#A12C7B` | Deep magenta (same across themes) |
| `critical-hover` | `#B8338E` | Hover on critical elements |
| `success` | `#2E8B57` | Positive outcomes |
| `success-hover` | `#3A9D66` | Hover on success elements |
| `warning` | `#B45309` | Amber warnings |
| `warning-hover` | `#C5641A` | Hover on warning elements |

### 1.3 Semantic Token Map

Every component uses these semantic aliases, never raw hex:

| Semantic Token | Dark Value | Light Value | Usage |
|---|---|---|---|
| `bg-canvas` | `canvas` | `canvas` | Root app background |
| `bg-surface` | `surface` | `surface` | Card / panel fill |
| `bg-surface-raised` | `surface-raised` | `surface-raised` | Elevated containers |
| `text-primary` | `ink-primary` | `ink-primary` | Body text, headings |
| `text-secondary` | `ink-muted` | `ink-muted` | Captions, labels |
| `text-disabled` | `ink-dim` | `ink-dim` | Disabled, placeholder |
| `border-default` | `border` | `border` | Standard borders |
| `border-focused` | `border-strong` | `border-strong` | Focus rings, active |
| `accent-fg` | `accent` | `accent` | Accent text/icons |
| `accent-bg` | `accent` | `accent` | Primary button fill |
| `accent-bg-hover` | `accent-hover` | `accent-hover` | Primary button hover |
| `accent-bg-pressed` | `accent-pressed` | `accent-pressed` | Primary button pressed |
| `state-critical` | `critical` | `critical` | Critical badges, flags |
| `state-critical-hover` | `critical-hover` | `critical-hover` | Critical hover |
| `state-success` | `success` | `success` | Success indicators |
| `state-success-hover` | `success-hover` | `success-hover` | Success hover |
| `state-warning` | `warning` | `warning` | Warning badges |
| `state-warning-hover` | `warning-hover` | `warning-hover` | Warning hover |
| `state-info` | `accent` | `accent` | Informational indicators |

---

## 2. Typography

### 2.1 Font Families

| Token | Value | Usage |
|---|---|---|
| `font-ui` | `'Inter', system-ui, -apple-system, sans-serif` | All UI text |
| `font-numeric` | `'Inter', system-ui, sans-serif` with `font-feature-settings: 'tnum', 'ss01'` | Tabular numbers, financial data, KPIs |
| `font-mono` | `'JetBrains Mono', ui-monospace, monospace` | Solicitation IDs, notice numbers, code blocks |

**Loading:** Inter from Google Fonts (weights 400, 500, 600, 700). JetBrains Mono from Google Fonts (weights 400, 500).

### 2.2 Type Scale (rem, 16px base)

| Token | Size (rem) | Line Height | Weight | Usage |
|---|---|---|---|---|
| `text-xs` | 0.75 | 1.0 | 400 | Badges, micro-labels |
| `text-sm` | 0.8125 | 1.25 | 400 | Default UI text, table cells, form labels |
| `text-base` | 0.875 | 1.375 | 400 | Body paragraphs, descriptions |
| `text-md` | 1.0 | 1.5 | 500 | Section sub-headers, card titles |
| `text-lg` | 1.125 | 1.5 | 600 | Section headers |
| `text-xl` | 1.25 | 1.5 | 600 | Page sub-titles |
| `text-2xl` | 1.5 | 1.375 | 600 | Page titles |
| `text-3xl` | 1.875 | 1.25 | 700 | Display headings (rare) |

### 2.3 Font Weight Tokens

| Token | Value |
|---|---|
| `weight-regular` | 400 |
| `weight-medium` | 500 |
| `weight-semibold` | 600 |
| `weight-bold` | 700 |

### 2.4 Typography Rules

- All numeric columns use `font-variant-numeric: tabular-nums`. Applied globally to `table, td, th, [data-numeric]`.
- Solicitation IDs, notice numbers, and code references use `font-mono` at `text-xs` or `text-sm`.
- Doctrine tags render at `text-xs`, italic, `text-secondary` color.
- No letter-spacing adjustments except `0.04em` on table header uppercase text.
- No text-transform except uppercase on table headers.

---

## 3. Geometry

### 3.1 Spacing Scale (8px grid)

All spacing derives from a 4px micro-grid. The primary grid is 8px.

| Token | Value | Usage |
|---|---|---|
| `space-0` | 0px | Reset |
| `space-0.5` | 2px | Hairline gaps |
| `space-1` | 4px | Micro-grid: inline icon gaps, chip padding-y |
| `space-2` | 8px | Base grid unit: input padding, small gaps |
| `space-3` | 12px | Medium internal padding |
| `space-4` | 16px | Standard gap between elements |
| `space-5` | 20px | Medium section spacing |
| `space-6` | 24px | Card internal padding |
| `space-8` | 32px | Page horizontal padding, section gaps |
| `space-10` | 40px | Large section spacing |
| `space-12` | 48px | Major vertical separation |
| `space-16` | 64px | Page-level vertical sections |

### 3.2 Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 4px | Inputs, buttons, badges |
| `radius-md` | 6px | Cards, panels, modals |
| `radius-full` | 999px | Chips, tags, pills |

**Hard rule:** No `border-radius` > 12px outside chips/pills. No rounded corners on full-page containers.

### 3.3 Border Width

| Token | Value | Usage |
|---|---|---|
| `border-default` | 1px | Standard borders |
| `border-focused` | 1.5px | Focus rings, active states |

### 3.4 Elevation

Zero shadows. Elevation is communicated exclusively through surface color + border:

| Level | Background | Border |
|---|---|---|
| Base | `bg-canvas` | none |
| Raised | `bg-surface` | `border-default` 1px |
| Overlay | `bg-surface-raised` | `border-default` 1px |

No `box-shadow` of any kind. No `filter: drop-shadow()`. No glow effects.

### 3.5 Layout

- Page wrapper: `max-width: 1440px; margin: 0 auto; padding: 0 32px;`
- Sidebar width: 240px collapsed-capable to 52px icon rail
- Inspector panel: 400px default, resizable 320-560px
- Minimum viewport: 1024px (operator tool, not consumer web)

---

## 4. Motion

| Token | Duration | Easing | Usage |
|---|---|---|---|
| `motion-reveal` | 120ms | ease-out | Panel open, content appear |
| `motion-state` | 80ms | ease-out | Button state, toggle, checkbox |
| `motion-hover` | 0ms | instant | Hover color changes |
| `motion-none` | 0ms | none | Default — no animation |

**Hard rules:**
- No bounces, no springs, no decorative animation.
- No repeating animations.
- No `transition-duration` > 200ms.
- Loading skeletons use a neutral pulse (ink-dim at 20% opacity), not accent colors.
- ECharts: 120ms cubic-out on initial render only.

---

## 5. Component Library Spec

Every component references semantic tokens. No raw hex in component code.

### 5.1 Button

**Anatomy:**
```
┌─────────────────────────────┐
│  [icon?]  Label  [icon?]    │
└─────────────────────────────┘
  height: 32px
  padding: 0 16px (0 12px with icon)
  radius: radius-sm (4px)
  font: text-sm / weight-medium
  gap: space-2 (8px) between icon and label
```

**Variants:**

| Variant | Background | Text | Border | Hover BG | Active BG |
|---|---|---|---|---|---|
| Primary | `accent-bg` | `#FFFFFF` | `accent-bg` | `accent-bg-hover` | `accent-bg-pressed` |
| Secondary | transparent | `text-primary` | `border-default` | `bg-surface` | `bg-surface-raised` |
| Ghost | transparent | `text-secondary` | none | `bg-surface` | `bg-surface-raised` |
| Danger | transparent | `state-critical` | `state-critical` | `state-critical` (text: white) | `state-critical-hover` (text: white) |

**States:** default, hover, focus (1.5px `accent-fg` outline, 2px offset), active, disabled (40% opacity, pointer-events: none).

**Keyboard:** `Enter` / `Space` → activate. `Tab` → focus next.

**ARIA:** `role="button"`, `aria-disabled` when disabled. Danger variant: `aria-label` must describe destructive action.

**Props:**
```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';        // md = 32px, sm = 28px
  disabled?: boolean;
  loading?: boolean;          // shows spinner, disables interaction
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}
```

---

### 5.2 Input (Text / Search / Number)

**Anatomy:**
```
  ┌─ Label (text-xs, text-secondary) ─────────────┐
  │                                                │
  ┌────────────────────────────────────────────────┐
  │ [prefix?]  value / placeholder  [suffix?]      │
  └────────────────────────────────────────────────┘
  │ Helper text / Error text (text-xs)             │
  └────────────────────────────────────────────────┘
  height: 32px
  padding: 0 space-2 (8px)
  radius: radius-sm (4px)
  bg: bg-surface
  border: 1px border-default
  font: text-sm / weight-regular
```

**States:**

| State | Border | Background | Text |
|---|---|---|---|
| Default | `border-default` | `bg-surface` | `text-primary` |
| Hover | `border-strong` | `bg-surface` | `text-primary` |
| Focus | 1.5px `accent-fg` | `bg-surface` | `text-primary` |
| Error | 1.5px `state-critical` | `bg-surface` | `text-primary` |
| Disabled | `border-default` 50% | `bg-canvas` | `text-disabled` |

**Search variant:** Prefix search icon (16px, ink-muted). Suffix clear button on non-empty.

**Number variant:** Uses `font-numeric` (tabular-nums). Right-aligned value. Optional step buttons.

**Keyboard:** Standard text input behavior. `Escape` → clear (search only). `Enter` → submit.

**ARIA:** `aria-label` or associated `<label>`. `aria-invalid="true"` on error. `aria-describedby` → helper/error text ID.

**Props:**
```typescript
interface InputProps {
  type: 'text' | 'search' | 'number';
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  disabled?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
}
```

---

### 5.3 Select / Combobox

**Anatomy:**
```
  ┌─ Label ────────────────────────────────────────┐
  ┌────────────────────────────────────────────────┐
  │  Selected value / placeholder       [chevron]  │
  └────────────────────────────────────────────────┘
         │
  ┌──────┴─────────────────────────────────────────┐
  │ [search input — combobox only]                 │
  ├────────────────────────────────────────────────┤
  │  Option 1                                      │
  │  Option 2  ✓                                   │
  │  Option 3                                      │
  └────────────────────────────────────────────────┘
  Dropdown: bg-surface-raised, 1px border-default, radius-md
  Max-height: 240px, overflow-y: auto
```

**States:** Same border/focus pattern as Input. Selected option shows check mark.

**Keyboard:** `Enter` / `Space` → open. Arrow keys → navigate. `Enter` → select. `Escape` → close. Combobox: type to filter.

**ARIA:** `role="combobox"` / `role="listbox"`. `aria-expanded`, `aria-activedescendant`, `aria-selected`.

**Props:**
```typescript
interface SelectProps<T> {
  label?: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  searchable?: boolean;      // enables combobox mode
  disabled?: boolean;
}
```

---

### 5.4 Checkbox / Radio / Toggle

**Checkbox anatomy:**
```
  ┌──┐
  │✓ │  Label text
  └──┘
  Box: 16px, radius-sm (4px), 1px border-default
  Checked: accent-bg fill, white check icon
```

**Radio anatomy:**
```
  (●)  Label text
  Circle: 16px, 1px border-default
  Selected: accent-bg fill ring, white inner dot
```

**Toggle anatomy:**
```
  ┌────────┐
  │    [●] │  Label text
  └────────┘
  Track: 36px x 20px, radius-full
  Off: bg-surface, border-default
  On: accent-bg, white thumb
```

**States:** default, hover (border-strong), focus (1.5px accent-fg outline), checked, disabled (40% opacity).

**Keyboard:** `Space` → toggle. `Tab` → next. Radio group: arrow keys to navigate.

**ARIA:** Checkbox: `role="checkbox"`, `aria-checked`. Radio: `role="radio"`, `aria-checked`, group with `role="radiogroup"`. Toggle: `role="switch"`, `aria-checked`.

**Props:**
```typescript
interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  indeterminate?: boolean;
}

interface RadioGroupProps<T> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; disabled?: boolean }[];
  name: string;
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}
```

---

### 5.5 Chip / Tag

**Anatomy:**
```
  ┌──────────────────────────┐
  │  [icon?]  Label  [x?]   │
  └──────────────────────────┘
  height: 24px
  padding: 0 space-2 (8px)
  radius: radius-full (999px)
  font: text-xs / weight-medium
  bg: bg-surface-raised
  border: 1px border-default
```

**Source URL chip (R1 binding):**
```
  ┌─────────────────────────────────┐
  │  [source-icon]  domain.gov  →   │
  └─────────────────────────────────┘
  Always shows domain extracted from URL.
  Clickable — opens source URL in new tab.
  icon: per source-kind (sam_gov, fpds, usaspending, govwin, news, etc.)
```

**Confidence chip:**

| Level | Background | Text | Border |
|---|---|---|---|
| High | `state-success` at 15% opacity | `state-success` | none |
| Medium | `state-warning` at 15% opacity | `state-warning` | none |
| Low | `state-critical` at 15% opacity | `state-critical` | none |

**Status chip (pipeline/capture stages):**

| Status | Background | Text |
|---|---|---|
| Qualified | `accent-fg` at 15% | `accent-fg` |
| Pursuing | `accent-fg` at 15% | `accent-fg` |
| Submitted | `state-info` at 15% | `state-info` |
| Won | `state-success` at 15% | `state-success` |
| Lost | `text-disabled` at 15% | `text-disabled` |
| Blocked | `state-critical` at 15% | `state-critical` |

**Props:**
```typescript
interface ChipProps {
  label: string;
  variant?: 'default' | 'source' | 'confidence' | 'status';
  level?: 'high' | 'medium' | 'low';        // confidence
  status?: 'qualified' | 'pursuing' | 'submitted' | 'won' | 'lost' | 'blocked';
  sourceUrl?: string;                         // source chip
  sourceKind?: SourceKind;                    // source chip
  onRemove?: () => void;                      // shows dismiss x
  onClick?: () => void;
}
```

---

### 5.6 Card / Surface

**Anatomy:**
```
  ┌────────────────────────────────────────────────┐
  │                                                │
  │  [Header area — optional]                      │
  │  ───────────────────────────────────────────    │
  │  [Content area]                                │
  │                                                │
  │  [Footer area — optional]                      │
  │                                                │
  └────────────────────────────────────────────────┘
  bg: bg-surface
  border: 1px border-default
  radius: radius-md (6px)
  padding: space-6 (24px)
```

**Banner card variant:** Same as card + 4px left accent bar in `accent-fg` (info) or `state-critical` (critical).

**States:** default. Clickable variant adds hover → `bg-surface-raised` transition (`motion-state`).

**Props:**
```typescript
interface CardProps {
  variant?: 'default' | 'banner';
  bannerSeverity?: 'info' | 'critical';
  clickable?: boolean;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';   // sm=16, md=24, lg=32
  children: ReactNode;
}
```

---

### 5.7 Table

**Anatomy:**
```
  ┌──────────┬──────────┬──────────┬──────────┐
  │ HEADER ▲ │ HEADER   │ HEADER   │ HEADER ▼ │  ← sticky, uppercase
  ├──────────┼──────────┼──────────┼──────────┤
  │ Cell     │ Cell     │ 1,234    │ $5.2M    │  ← row, 1px border bottom
  │ Cell     │ Cell     │ 2,456    │ $3.1M    │
  │ Cell     │ Cell     │   789    │ $1.8M    │
  └──────────┴──────────┴──────────┴──────────┘
```

**Header:** `text-xs`, `text-secondary`, uppercase, `letter-spacing: 0.04em`, `weight-semibold`. Sticky (`position: sticky; top: 0; z-index: 10`). Background: `bg-surface`.

**Rows:** 1px `border-default` between rows. No zebra striping. Row height: 40px min (operator density). Numeric columns right-aligned with `font-numeric`.

**Sortable headers:** Click toggles asc/desc/none. Sort indicator: subtle triangle (4px) in `text-secondary`.

**Row hover:** `bg-surface-raised` when row is clickable. No hover background on non-clickable tables.

**Row select:** Checkbox column (first). Selected rows get `accent-fg` at 8% opacity background.

**Keyboard:** `Tab` → focus table. Arrow keys → navigate cells. `Enter` → activate row action. `Space` → toggle row select. `J/K` as vim-style row navigation when table is focused.

**ARIA:** `role="grid"` or `role="table"`. Column headers: `role="columnheader"`, `aria-sort`. Selectable rows: `aria-selected`.

**Props:**
```typescript
interface TableColumn<T> {
  key: string;
  header: string;
  width?: number | string;
  sortable?: boolean;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  loading?: boolean;
  stickyHeader?: boolean;
  rowKey: (row: T) => string;
}
```

---

### 5.8 List (J/K Navigable)

**Anatomy:**
```
  ┌────────────────────────────────────────────────┐
  │  ► Item 1 — active (bg-surface-raised)         │
  ├────────────────────────────────────────────────┤
  │    Item 2                                      │
  ├────────────────────────────────────────────────┤
  │    Item 3                                      │
  └────────────────────────────────────────────────┘
  Item height: 36px min
  Padding: space-2 (8px) horizontal
  Active indicator: 2px left bar accent-fg
```

**Keyboard:** `J` → next item. `K` → previous item. `Enter` → activate. `Escape` → deselect.

**ARIA:** `role="listbox"`, items `role="option"`, `aria-selected`, `aria-activedescendant`.

**Props:**
```typescript
interface ListProps<T> {
  items: T[];
  activeId?: string;
  onActivate?: (item: T) => void;
  renderItem: (item: T, active: boolean) => ReactNode;
  itemKey: (item: T) => string;
  emptyState?: ReactNode;
}
```

---

### 5.9 Modal / Drawer

**Modal anatomy:**
```
  ┌─ Backdrop (bg-canvas at 60% opacity) ──────────────────────┐
  │                                                             │
  │   ┌─────────────────────────────────────────────────┐       │
  │   │  Title                                [x]      │       │
  │   ├─────────────────────────────────────────────────┤       │
  │   │                                                │       │
  │   │  Content                                       │       │
  │   │                                                │       │
  │   ├─────────────────────────────────────────────────┤       │
  │   │                     [Secondary]  [Primary]     │       │
  │   └─────────────────────────────────────────────────┘       │
  └─────────────────────────────────────────────────────────────┘
  Modal: bg-surface-raised, 1px border-default, radius-md
  Width: 480px default, max 640px
  Entrance: motion-reveal (120ms ease-out)
```

**Drawer anatomy:** Same as modal but slides from right edge. Width: 400px default (resizable 320-560px). Full viewport height.

**Keyboard:** `Escape` → close. `Tab` → trap focus within. Focus first interactive element on open. Return focus on close.

**ARIA:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title.

**Props:**
```typescript
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';      // sm=400, md=480, lg=640
  children: ReactNode;
  footer?: ReactNode;
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;                   // default 400, range 320-560
  children: ReactNode;
}
```

---

### 5.10 Toast / Notification

**Anatomy:**
```
  ┌────────────────────────────────────────────────┐
  │  [severity-bar]  Message text        [dismiss] │
  └────────────────────────────────────────────────┘
  Position: bottom-right, 16px from edge
  bg: bg-surface-raised
  border: 1px border-default
  Left bar: 3px in severity color (accent/success/warning/critical)
  radius: radius-md (6px)
  Max-width: 400px
  Auto-dismiss: 5s (configurable, never for errors)
  Stack: max 3 visible, newest on bottom
  Entrance: slide up + motion-reveal
```

**ARIA:** `role="alert"` for errors, `role="status"` for info/success. `aria-live="polite"`.

**Props:**
```typescript
interface ToastProps {
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;
  duration?: number;          // ms, 0 = persistent
}
```

---

### 5.11 Tooltip

**Anatomy:**
```
         ┌──────────────────────┐
         │  Tooltip text        │
         └──────────┬───────────┘
                    ▼
            [trigger element]
  bg: bg-surface-raised
  border: 1px border-strong
  radius: radius-sm (4px)
  padding: space-1 (4px) space-2 (8px)
  font: text-xs
  max-width: 240px
  Delay: 300ms hover before show
  Position: top preferred, flip if clipped
```

**ARIA:** `role="tooltip"`, trigger has `aria-describedby` pointing to tooltip ID.

**Props:**
```typescript
interface TooltipProps {
  content: string | ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;              // ms, default 300
  children: ReactNode;         // trigger element
}
```

---

### 5.12 Command Palette (Cmd+K)

**Anatomy:**
```
  ┌─ Backdrop ─────────────────────────────────────────────────┐
  │                                                             │
  │   ┌─────────────────────────────────────────────────┐       │
  │   │  🔍  Search commands...                         │       │
  │   ├─────────────────────────────────────────────────┤       │
  │   │  RECENT                                        │       │
  │   │  ► Navigate to Pipeline                        │       │
  │   │    Navigate to Opportunities                   │       │
  │   ├─────────────────────────────────────────────────┤       │
  │   │  ACTIONS                                       │       │
  │   │    Create action item                          │       │
  │   │    Run qualification check                     │       │
  │   └─────────────────────────────────────────────────┘       │
  └─────────────────────────────────────────────────────────────┘
  Width: 560px, centered
  Max-height: 400px
  bg: bg-surface-raised, 1px border-default, radius-md
  Search input: full-width, no border, text-md
  Groups: text-xs, text-secondary, uppercase, 0.04em tracking
  Items: text-sm, 40px height, hover → bg-surface
```

**Keyboard:** `Cmd+K` / `Ctrl+K` → open. `Escape` → close. Arrow keys → navigate. `Enter` → execute. Type to filter.

**ARIA:** `role="combobox"` on input. `role="listbox"` on results. `aria-activedescendant`.

**Props:**
```typescript
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandGroup[];
  onExecute: (command: Command) => void;
}

interface CommandGroup {
  label: string;
  commands: Command[];
}

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  action: () => void;
}
```

---

### 5.13 Agent Recommendation Card

Binding pattern from F-215 section 6: plain English recommendation with confidence, sources, and approve/reject.

**Anatomy:**
```
  ┌────────────────────────────────────────────────────────────┐
  │  4px left bar (accent-fg)                                  │
  │                                                            │
  │  AGENT RECOMMENDATION          [Confidence: High ●]       │
  │                                                            │
  │  "This opportunity aligns with Envision's NAICS 541330     │
  │   and RS3 vehicle. Recommend qualifying to pipeline."      │
  │                                                            │
  │  Sources:                                                  │
  │  [sam.gov] [govtribe.com] [rs3-vehicle-ref]               │
  │                                                            │
  │  ▸ Show reasoning                                          │
  │                                                            │
  │  ┌──────────┐  ┌──────────┐                                │
  │  │ Approve  │  │ Reject   │                                │
  │  └──────────┘  └──────────┘                                │
  └────────────────────────────────────────────────────────────┘
  bg: bg-surface
  border: 1px border-default
  radius: radius-md (6px)
  Confidence chip: per Confidence chip spec (section 5.5)
  Sources: Source URL chips (R1 binding)
  Reasoning expander: collapsible, text-sm, text-secondary
  Approve: primary button. Reject: secondary button.
```

**Props:**
```typescript
interface AgentRecommendationCardProps {
  recommendation: string;       // plain English
  confidence: 'high' | 'medium' | 'low';
  sources: SourceRef[];         // R1 binding
  reasoning?: string;           // expandable detail
  onApprove: () => void;
  onReject: () => void;
  status?: 'pending' | 'approved' | 'rejected';
}

interface SourceRef {
  url: string;
  kind: 'sam_gov' | 'fpds' | 'usaspending' | 'govwin' | 'news' | 'doctrine' | 'partner_site' | 'internal';
  label?: string;
}
```

---

### 5.14 Empty State

**Anatomy:**
```
  ┌────────────────────────────────────────────────┐
  │                                                │
  │           [muted illustration — optional]      │
  │                                                │
  │          No opportunities found                │
  │                                                │
  │    Adjust your filters or check back later.    │
  │                                                │
  │           [Optional action button]             │
  │                                                │
  └────────────────────────────────────────────────┘
  Title: text-md, text-primary, weight-medium
  Description: text-sm, text-secondary
  Centered vertically and horizontally in container
  Min-height: 200px
```

No illustrations, no icons, no emoji. Text-only.

**Props:**
```typescript
interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}
```

---

### 5.15 Error State

**Anatomy:**
```
  ┌────────────────────────────────────────────────┐
  │  4px left bar (state-critical)                 │
  │                                                │
  │  Something went wrong                          │
  │                                                │
  │  Failed to load pipeline data. Please try      │
  │  again or contact support.                     │
  │                                                │
  │  [Retry]                                       │
  │                                                │
  └────────────────────────────────────────────────┘
  Title: text-md, text-primary, weight-medium
  Description: text-sm, text-secondary
  Left bar: state-critical
  Retry: secondary button
```

**Props:**
```typescript
interface ErrorStateProps {
  title?: string;                // default: "Something went wrong"
  description?: string;
  onRetry?: () => void;
  error?: Error;                 // for dev console logging
}
```

---

### 5.16 Loading Skeleton

**Anatomy:**
```
  ┌────────────────────────────────────────────────┐
  │  ████████████████████░░░░░░░░░░░░░░            │
  │  ████████████░░░░░░░░░░░░░░░░░░░░░░            │
  │  ██████████████████░░░░░░░░░░░░░░░░            │
  └────────────────────────────────────────────────┘
  Pulse: ink-dim at 20% opacity, 1.5s ease-in-out infinite
  Shape: matches target content layout
  radius: radius-sm (4px)
```

**Hard rule:** Skeletons use **neutral pulse only**. No brand/accent colors. No shimmer gradient.

**Props:**
```typescript
interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  lines?: number;               // for text skeleton
  variant?: 'text' | 'rect' | 'circle';
}
```

---

### 5.17 Sidebar Nav Item

**Anatomy:**
```
  Expanded:
  ┌────────────────────────────────────────┐
  │  [icon]  Label             [badge?]    │
  └────────────────────────────────────────┘

  Collapsed (icon rail):
  ┌──────┐
  │ [ic] │
  └──────┘

  height: 36px
  padding: 0 space-3 (12px)
  radius: radius-sm (4px)
  font: text-sm / weight-medium
  gap: space-3 (12px) between icon and label
  Active: bg-surface-raised, 2px left bar accent-fg, text-primary
  Inactive: transparent, text-secondary
  Hover: bg-surface
```

**ARIA:** `role="navigation"`, items as `<a>` or `role="link"`. Active: `aria-current="page"`.

**Props:**
```typescript
interface SidebarNavItemProps {
  icon: ReactNode;
  label: string;
  href: string;
  active?: boolean;
  badge?: number;
  collapsed?: boolean;
}
```

---

### 5.18 Top Bar

**Anatomy:**
```
  ┌──────────────────────────────────────────────────────────────┐
  │  [Logo/Brand]    [Breadcrumb?]         [Search] [User] [⚙] │
  └──────────────────────────────────────────────────────────────┘
  height: 48px
  bg: bg-surface
  border-bottom: 1px border-default
  padding: 0 space-4 (16px)
  Logo: text-sm, weight-semibold, text-primary
```

---

### 5.19 Inspector Panel

**Anatomy:**
```
  ┌─── Inspector ──────────── [x] ──┐
  │                                  │
  │  Entity title                    │
  │  ──────────────────────────      │
  │                                  │
  │  SECTION 1                       │
  │  Field: Value                    │
  │  Field: Value                    │
  │                                  │
  │  SECTION 2                       │
  │  Field: Value                    │
  │                                  │
  └──────────────────────────────────┘
  Width: 400px default (resizable 320-560px)
  bg: bg-surface
  border-left: 1px border-default
  Sections: text-xs, uppercase, text-secondary, 0.04em tracking
  Fields: text-sm key (text-secondary) / text-sm value (text-primary)
  Slide-in from right: motion-reveal (120ms)
```

Follows Palantir Foundry inspector pattern. Dense key-value layout.

---

### 5.20 Stage Indicator (Shipley)

Maps Shipley 7-stage capture lifecycle to dark theme:

| Stage | Color | Token |
|---|---|---|
| 0 - Long Term Positioning | `#6B7079` | `stage-0` (ink-dim) |
| 1 - Opportunity Assessment | `#9AA0A8` | `stage-1` (ink-muted) |
| 2 - Capture Planning | `#01696F` | `stage-2` (accent) |
| 3 - Proposal Planning | `#01696F` | `stage-3` (accent) |
| 4 - Proposal Development | `#C48A1E` | `stage-4` (warning) |
| 5 - Post-Submittal | `#C48A1E` | `stage-5` (warning) |
| 6 - Post-Award | `#3FA66B` | `stage-6` (success) |

**Anatomy:**
```
  [●]  Stage 2: Capture Planning
  Dot: 8px, filled with stage color
  Label: text-sm, text-primary
```

No traffic-light dots. Use filled circles with stage-specific color only.

**Props:**
```typescript
interface StageIndicatorProps {
  stage: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  label?: string;               // override default Shipley label
  showLabel?: boolean;           // default true
}
```

---

### 5.21 Source URL Chip

R1 binding: every data point has a searchable source.

**Anatomy:**
```
  ┌───────────────────────────────┐
  │  [kind-icon]  sam.gov  →      │
  └───────────────────────────────┘
  height: 24px
  radius: radius-full (999px)
  padding: 0 space-2 (8px)
  font: text-xs, weight-medium
  bg: bg-surface-raised
  border: 1px border-default
  Clickable: opens URL in new tab (target="_blank", rel="noopener")
  Domain extracted from URL automatically
  Icon: per source kind (16px, text-secondary)
```

**Source kind icons (abstract, minimal):**
- `sam_gov` — document icon
- `fpds` — document icon
- `usaspending` — chart icon (small bar)
- `govwin` — document icon
- `news` — document icon
- `doctrine` — shield icon
- `partner_site` — link icon
- `internal` — lock icon

**Props:**
```typescript
interface SourceUrlChipProps {
  url: string;
  kind: SourceKind;
  label?: string;               // override auto-extracted domain
}

type SourceKind = 'sam_gov' | 'fpds' | 'usaspending' | 'govwin' | 'news' | 'doctrine' | 'partner_site' | 'internal';
```

---

## 6. ECharts Dark Theme

Custom ECharts theme file. Every option is explicitly set or defaulted. F-218 will produce `packages/frontend-v3/echarts-theme.json`.

### 6.1 Global

```json
{
  "backgroundColor": "transparent",
  "textStyle": {
    "fontFamily": "'Inter', system-ui, sans-serif",
    "fontWeight": 400,
    "fontSize": 12
  },
  "animation": true,
  "animationDuration": 120,
  "animationEasing": "cubicOut",
  "animationDurationUpdate": 0
}
```

### 6.2 Color Palette

Single accent for primary series. Extended palette for multi-series:

```json
{
  "color": [
    "#01696F",
    "#3FA66B",
    "#C48A1E",
    "#A12C7B",
    "#6B7079",
    "#9AA0A8",
    "#E6E8EB"
  ]
}
```

Single-series charts always use the first color (`accent-fg`).

### 6.3 Axes

```json
{
  "categoryAxis": {
    "axisLine": { "lineStyle": { "color": "#2A2F36" } },
    "axisTick": { "lineStyle": { "color": "#2A2F36" } },
    "axisLabel": {
      "color": "#9AA0A8",
      "fontFamily": "'Inter', system-ui, sans-serif",
      "fontSize": 11
    },
    "splitLine": {
      "lineStyle": { "color": "#2A2F36", "opacity": 0.5, "type": "solid" }
    },
    "nameTextStyle": { "color": "#9AA0A8", "fontSize": 11 }
  },
  "valueAxis": {
    "axisLine": { "lineStyle": { "color": "#2A2F36" } },
    "axisTick": { "lineStyle": { "color": "#2A2F36" } },
    "axisLabel": {
      "color": "#9AA0A8",
      "fontFamily": "'Inter', system-ui, sans-serif",
      "fontSize": 11
    },
    "splitLine": {
      "lineStyle": { "color": "#2A2F36", "opacity": 0.5, "type": "solid" }
    },
    "nameTextStyle": { "color": "#9AA0A8", "fontSize": 11 }
  }
}
```

### 6.4 Tooltip

```json
{
  "tooltip": {
    "backgroundColor": "#1A1E23",
    "borderColor": "#3D434C",
    "borderWidth": 1,
    "textStyle": {
      "color": "#E6E8EB",
      "fontFamily": "'Inter', system-ui, sans-serif",
      "fontSize": 12
    },
    "padding": [8, 12],
    "extraCssText": "border-radius: 6px;"
  }
}
```

### 6.5 Legend

```json
{
  "legend": {
    "textStyle": { "color": "#9AA0A8", "fontSize": 11 },
    "right": 0,
    "top": 0,
    "itemWidth": 12,
    "itemHeight": 12,
    "itemGap": 16,
    "inactiveColor": "#6B7079"
  }
}
```

### 6.6 Series Defaults

```json
{
  "line": {
    "lineStyle": { "width": 2 },
    "symbolSize": 4,
    "symbol": "circle",
    "smooth": false,
    "itemStyle": { "borderWidth": 0 }
  },
  "bar": {
    "barMaxWidth": 32,
    "itemStyle": { "borderRadius": [2, 2, 0, 0] }
  },
  "pie": {
    "itemStyle": { "borderColor": "#13161A", "borderWidth": 2 },
    "label": { "color": "#E6E8EB", "fontSize": 11 }
  },
  "funnel": {
    "itemStyle": { "borderColor": "#13161A", "borderWidth": 1 },
    "label": { "color": "#E6E8EB", "fontSize": 11, "position": "inside" }
  }
}
```

### 6.7 Mark Lines (Reference Lines)

```json
{
  "markLine": {
    "lineStyle": {
      "color": "#3D434C",
      "type": "dashed",
      "width": 1
    },
    "label": {
      "color": "#9AA0A8",
      "fontSize": 11,
      "fontFamily": "'Inter', system-ui, sans-serif"
    }
  }
}
```

### 6.8 Hard Rules

- **No gradients** — `areaStyle` never uses gradient fills.
- **No shadows** — `shadowBlur`, `shadowColor`, `shadowOffsetX/Y` always 0 or omitted.
- **No 3D** — no `globe`, `bar3D`, `scatter3D` or any 3D chart type.
- Font: always Inter with tabular-nums feature settings where numeric data is displayed.
- Legend: top-right, muted text. Never bottom, never floating.
- Animation: 120ms cubic-out on initial render only. `animationDurationUpdate: 0` prevents re-render animation.

---

## 7. The 5 Named Charts

Binding from F-215 section 8. Each chart spec includes decision statement, data contract, axes, tooltip, and edge states.

### 7.1 Funding Velocity (FY vs FY)

**Decision:** "Is total addressable funding growing or shrinking in our NAICS lanes?"

**Chart type:** Grouped bar chart (current FY vs prior FY) with optional trend line overlay.

**Data contract:**
```typescript
interface FundingVelocityData {
  periods: {
    label: string;              // e.g. "Q1", "Q2", etc.
    currentFY: number;          // $ obligated in current FY
    priorFY: number;            // $ obligated in prior FY
  }[];
  naicsFilter: string[];        // active NAICS codes
  sourceRefs: SourceRef[];      // R1 binding
}
```

**Axes:**
- X: Category (quarters or months)
- Y: Value (USD, abbreviated — $1.2M, $500K)

**Title format:** `Funding Velocity — FY{current} vs FY{prior}`

**Tooltip:** `{period}: ${currentFY} (FY{current}) / ${priorFY} (FY{prior}) — {delta}% change`

**Default time window:** Current FY vs prior FY, quarterly granularity.

**Colors:** Current FY = `accent-fg`. Prior FY = `ink-muted`.

**Empty state:** "No funding data available for selected NAICS codes."

**Error state:** Standard error card with retry.

---

### 7.2 Pipeline Aging

**Decision:** "Which pursuits are stalling in early stages and need intervention?"

**Chart type:** Horizontal bar chart. Each bar = one pipeline item, length = days in current stage.

**Data contract:**
```typescript
interface PipelineAgingData {
  items: {
    id: string;
    title: string;
    stage: number;              // Shipley 0-6
    daysInStage: number;
    threshold: number;          // days before "stale" warning
    value: number;              // contract value estimate
  }[];
  sourceRefs: SourceRef[];
}
```

**Axes:**
- X: Value (days in stage)
- Y: Category (opportunity title, truncated to 40 chars)

**Title format:** `Pipeline Aging — {count} Active Pursuits`

**Tooltip:** `{title} — Stage {stage}: {daysInStage} days (threshold: {threshold}d) — est. ${value}`

**Default time window:** All active pipeline items.

**Colors:** Below threshold = `accent-fg`. At threshold = `state-warning`. Above threshold = `state-critical`.

**Reference line:** Dashed vertical at mean threshold.

**Empty state:** "No active pipeline items."

**Error state:** Standard error card with retry.

---

### 7.3 Win-Probability Distribution

**Decision:** "Is our pipeline quality improving over time, or are we padding with low-probability filler?"

**Chart type:** Histogram (10% buckets: 0-10, 10-20, ..., 90-100). Stacked by Shipley stage color.

**Data contract:**
```typescript
interface WinProbDistributionData {
  buckets: {
    range: string;              // e.g. "30-40%"
    rangeMin: number;
    rangeMax: number;
    items: {
      stage: number;
      count: number;
      totalValue: number;
    }[];
  }[];
  sourceRefs: SourceRef[];
}
```

**Axes:**
- X: Category (pwin buckets)
- Y: Value (count of opportunities)

**Title format:** `Win-Probability Distribution — {total} Opportunities`

**Tooltip:** `{range}: {count} opps — ${totalValue} total — Stage {stage}: {stageCount}`

**Default time window:** All active pipeline + capture items.

**Colors:** Stacked by Shipley stage color per section 5.20 mapping.

**Empty state:** "No opportunities with pwin estimates."

**Error state:** Standard error card with retry.

---

### 7.4 Source-Kind Contribution

**Decision:** "Which intel sources are actually generating pipeline, and which are noise?"

**Chart type:** Stacked bar chart. Each bar = time period (month). Stacks = source kind.

**Data contract:**
```typescript
interface SourceKindContributionData {
  periods: {
    label: string;              // e.g. "Jan 2026"
    sources: {
      kind: SourceKind;
      count: number;            // opportunities discovered
      qualified: number;        // moved to pipeline
      value: number;            // total estimated value
    }[];
  }[];
  sourceRefs: SourceRef[];
}
```

**Axes:**
- X: Category (months)
- Y: Value (count of opportunities)

**Title format:** `Source-Kind Contribution — Last {n} Months`

**Tooltip:** `{month} — {kind}: {count} discovered, {qualified} qualified (${value})`

**Default time window:** Last 6 months.

**Colors:** Assigned from ECharts palette in source-kind order: `sam_gov` = accent, `govwin` = success, `news` = warning, etc.

**Empty state:** "No source data for the selected period."

**Error state:** Standard error card with retry.

---

### 7.5 Capture-Stage Funnel (Shipley)

**Decision:** "Where are pursuits leaking out of the pipeline, and is our conversion rate healthy?"

**Chart type:** Funnel chart. 7 Shipley stages, widest at top (Stage 0), narrowest at bottom (Stage 6).

**Data contract:**
```typescript
interface CaptureStageData {
  stages: {
    stage: number;              // 0-6
    label: string;              // Shipley stage name
    count: number;              // items in this stage
    totalValue: number;         // aggregate estimated value
    conversionRate: number;     // % moving to next stage
  }[];
  sourceRefs: SourceRef[];
}
```

**Axes:** None (funnel chart).

**Title format:** `Capture Funnel — {total} Opportunities`

**Tooltip:** `Stage {stage}: {label} — {count} opps (${totalValue}) — {conversionRate}% conversion`

**Default time window:** Current snapshot (all active items).

**Colors:** Shipley stage colors per section 5.20.

**Empty state:** "No capture data available."

**Error state:** Standard error card with retry.

---

## 8. Forbidden Tokens (CI Guardrail Extension)

Extends the existing Visual Token Guardrail workflow (`.github/workflows/visual-guardrail.yml`) and V3 Forbidden Tokens workflow (`.github/workflows/v3-forbidden-tokens.yml`).

The following tokens are **permanently forbidden** in V3 frontend component code (`packages/frontend-v3/src/**`). CI will hard-fail any PR that introduces them.

### 8.1 Forbidden Color Tokens

Raw hex values in component code. All colors must reference design tokens:

```
# Legacy dark-theme hex values (F-100 drift)
#0f1117
#1a1d27
#22262f
#2a2e3a

# Legacy light-theme hex values
#e4e4e7
#9ca3af

# Legacy accent colors
#3b82f6  (Tailwind blue — replaced by Hydra Teal)
#22c55e  (Tailwind green)
#f59e0b  (Tailwind amber)
#ef4444  (Tailwind red)
```

Any raw hex literal in `.tsx` / `.ts` / `.css` files under `packages/frontend-v3/src/` is forbidden. All colors flow through semantic tokens defined in `tokens.json` and the Tailwind v4 `@theme` block.

### 8.2 Forbidden CSS Patterns

| Pattern | Reason |
|---|---|
| `border-radius` > 12px (outside chips) | Design system cap |
| `box-shadow` of any kind | Zero-shadow elevation model |
| `linear-gradient` / `radial-gradient` | No gradients |
| `filter: drop-shadow()` | No shadows |
| Inline `style={}` for color/spacing/font | Must use tokens/classes |
| `font-family` declarations in components | Must use font tokens |

### 8.3 Forbidden Libraries

| Library | Reason |
|---|---|
| `chart.js` / `react-chartjs-2` | ECharts only (doctrine) |
| `recharts` | ECharts only |
| `victory` | ECharts only |
| `nivo` | ECharts only |
| Any non-ECharts charting library | ECharts only |

### 8.4 Forbidden Patterns

| Pattern | Reason |
|---|---|
| Emoji in production component code | Professional instrument panel |
| Skeleton components with accent/brand colors | Neutral pulse only |
| `text-transform: capitalize` on data values | Data integrity |
| Cartoon palette tokens (`#FF...` bright primaries not in canonical palette) | Design system compliance |
| `animation-iteration-count: infinite` (except loading skeleton pulse) | No decorative animation |

### 8.5 CI Workflow Draft

The V3 forbidden token scanner should extend `scripts/check-visual-tokens.mjs` to also scan `packages/frontend-v3/src/`:

```
Scan targets:
  - packages/frontend-v3/src/**/*.{ts,tsx,css}

Allowlist:
  - packages/frontend-v3/design-tokens/tokens.json (token definitions)
  - Files with VISUAL_GUARDRAIL_IGNORE marker (first 5 lines)
  - Test files (*.test.ts, *.spec.ts, __tests__/)

Exit code:
  - 0: no violations
  - 1: violations found (hard fail)

Output format:
  ❌ packages/frontend-v3/src/components/Button.tsx:12
     Forbidden hex color: #3b82f6
  
  ❌ packages/frontend-v3/src/pages/Pipeline.tsx:45
     Forbidden inline color/font style prop
  
  2 violation(s) found. All colors must use design tokens.
```

---

## 9. Token File Structure

File: `packages/frontend-v3/design-tokens/tokens.json`

See the companion file for the complete token JSON. The structure follows:

```
{
  "color": {
    "dark": { "canvas": {...}, "surface": {...}, "ink": {...}, "accent": {...}, "state": {...}, "stage": {...} },
    "light": { ... (same keys, different hex values) },
    "semantic": { ... (references to dark/light via $ref or key) }
  },
  "space": { "0": "0px", "0.5": "2px", "1": "4px", "2": "8px", ... },
  "radius": { "sm": "4px", "md": "6px", "full": "999px" },
  "fontSize": { "xs": "0.75rem", "sm": "0.8125rem", ... },
  "lineHeight": { "xs": "1.0", "sm": "1.25", ... },
  "fontFamily": { "ui": "'Inter', ...", "numeric": "'Inter', ...", "mono": "'JetBrains Mono', ..." },
  "fontWeight": { "regular": 400, "medium": 500, "semibold": 600, "bold": 700 },
  "motion": { "reveal": "120ms", "state": "80ms", "hover": "0ms" }
}
```

---

## 10. Tailwind v4 Integration Plan

Tailwind v4 uses CSS-native `@theme` blocks with CSS custom properties. Every token maps to a Tailwind utility.

### 10.1 `@theme` Block (for `app.css`)

F-218 will add the following to `packages/frontend-v3/src/app.css`:

```css
@import "tailwindcss";

@theme {
  /* Colors — Dark (default) */
  --color-canvas: #0B0D0F;
  --color-surface: #13161A;
  --color-surface-raised: #1A1E23;
  --color-border: #2A2F36;
  --color-border-strong: #3D434C;
  --color-ink-primary: #E6E8EB;
  --color-ink-muted: #9AA0A8;
  --color-ink-dim: #6B7079;
  --color-accent: #01696F;
  --color-accent-hover: #017F86;
  --color-accent-pressed: #015C61;
  --color-critical: #A12C7B;
  --color-critical-hover: #B8338E;
  --color-success: #3FA66B;
  --color-success-hover: #4DBD7A;
  --color-warning: #C48A1E;
  --color-warning-hover: #D69B2F;

  /* Shipley stage colors */
  --color-stage-0: #6B7079;
  --color-stage-1: #9AA0A8;
  --color-stage-2: #01696F;
  --color-stage-3: #01696F;
  --color-stage-4: #C48A1E;
  --color-stage-5: #C48A1E;
  --color-stage-6: #3FA66B;

  /* Spacing — 4px micro-grid */
  --spacing-0: 0px;
  --spacing-0_5: 2px;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 20px;
  --spacing-6: 24px;
  --spacing-8: 32px;
  --spacing-10: 40px;
  --spacing-12: 48px;
  --spacing-16: 64px;

  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-full: 999px;

  /* Font families */
  --font-ui: 'Inter', system-ui, -apple-system, sans-serif;
  --font-numeric: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Font sizes */
  --text-xs: 0.75rem;
  --text-sm: 0.8125rem;
  --text-base: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;

  /* Line heights */
  --leading-xs: 1.0;
  --leading-sm: 1.25;
  --leading-base: 1.375;
  --leading-md: 1.5;
  --leading-lg: 1.5;
  --leading-xl: 1.5;
  --leading-2xl: 1.375;
  --leading-3xl: 1.25;

  /* Font weights */
  --font-regular: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Motion */
  --duration-reveal: 120ms;
  --duration-state: 80ms;
  --duration-hover: 0ms;
  --ease-reveal: ease-out;
}
```

### 10.2 Light Theme Override

Light theme opt-in via `data-theme="light"` on `<html>`:

```css
[data-theme="light"] {
  --color-canvas: #F7F6F2;
  --color-surface: #FFFFFF;
  --color-surface-raised: #FFFFFF;
  --color-border: #D4D1CA;
  --color-border-strong: #B8B5AE;
  --color-ink-primary: #28251D;
  --color-ink-muted: #7A7974;
  --color-ink-dim: #A3A09A;
  /* accent, critical stay the same */
  --color-success: #2E8B57;
  --color-success-hover: #3A9D66;
  --color-warning: #B45309;
  --color-warning-hover: #C5641A;
}
```

### 10.3 Utility Mapping

With Tailwind v4 `@theme`, every `--color-*` variable automatically generates utilities:

| CSS Variable | Tailwind Class |
|---|---|
| `--color-canvas` | `bg-canvas`, `text-canvas`, `border-canvas` |
| `--color-surface` | `bg-surface`, `text-surface` |
| `--color-ink-primary` | `text-ink-primary` |
| `--color-ink-muted` | `text-ink-muted` |
| `--color-accent` | `bg-accent`, `text-accent`, `border-accent` |
| `--color-critical` | `bg-critical`, `text-critical` |
| `--color-success` | `bg-success`, `text-success` |
| `--color-warning` | `bg-warning`, `text-warning` |

Spacing utilities map from `--spacing-*` (e.g., `p-2` = 8px, `gap-4` = 16px).

Font utilities: `font-ui`, `font-numeric`, `font-mono`.

### 10.4 Global Styles

```css
/* Applied globally in app.css */
html {
  font-family: var(--font-ui);
  font-size: 16px;
  background-color: var(--color-canvas);
  color: var(--color-ink-primary);
}

table, td, th, [data-numeric] {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum', 'ss01';
}
```

---

## Reference Standards (binding)

| Standard | What we take |
|---|---|
| **Linear** | Visual language (quiet, dense), motion (minimal, purposeful), typography (Inter) |
| **Palantir Foundry** | Table density, inspector panel pattern, key-value layouts |
| **Bloomberg Terminal / Observable** | Chart doctrine (data-first, no decoration, single accent) |
| **Anduril Lattice** | Operator status chips, mission-command tone, severity model |

---

## Acceptance Checklist

1. This document renders end-to-end
2. Every color, type, space, motion value documented (sections 1-4)
3. Every component has full anatomy + states + keyboard + ARIA (section 5)
4. ECharts theme file format specified (section 6)
5. 5 named charts have data contracts + decision statements (section 7)
6. Forbidden tokens list complete with CI workflow draft (section 8)
7. Light theme palette specified (section 1.2)
8. Token file structure specified (section 9)
9. Tailwind v4 integration plan specified (section 10)
10. PR is docs-only — no production code
