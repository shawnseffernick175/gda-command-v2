# Stage Systems — GDA Command

GDA has **three independent "stage"-like systems**. They look alike (all are
ordered phases) but answer different questions and live on different data. They
must never be silently conflated: advancing an opportunity along one axis does
**not** change the others.

The frontend surfaces this distinction with the `StageAxisInfo` component
(`packages/frontend-v3/src/components/shared/StageAxisInfo.tsx`), rendered next
to each control/view so the user always knows which axis they are looking at.

## 1. Capture / pipeline stage (`capture`)

Where a pursuit sits in the BD process. **This is the only axis a "move stage"
action changes.**

- **DB keys** (`pipeline_items.stage`, canonical in
  `packages/frontend-v3/src/lib/stages.ts`):
  `interest → qualify → qualified → pursue → solicitation → post_submittal`,
  terminal `won / lost / no_bid / gov_cancelled`.
- `qualify` is a pre-pipeline staging state (not counted in pipeline metrics);
  `qualified` is the first counted stage.
- Surfaced on: Pipeline "Pipeline by Stage" chart, the pipeline list, the
  opportunity detail stage control, and Ops Tracker.

## 2. Color-team review (`color_team`)

Which proposal review gate a draft document has cleared. A proposal-quality
axis, **independent of capture stage** — an opportunity in `pursue` can have no
color-team review, and a `solicitation`-stage draft can be mid-Red-team.

- **Values** (`COLOR_LABELS` in `ColorTeamsContent.tsx`):
  Blue (customer perspective) · Pink (storyboard) · Red (proposal evaluation) ·
  Green (executive/final) · White (compliance sweep); Black Hat is a
  competitor simulation, not a gate.
- Surfaced on: Color Team Reviews page, Capture reviews.

## 3. AOP coverage layer (`coverage`)

The doctrine funnel used to **size the pipeline against the AOP revenue
target**. A reporting rollup, **not a per-opportunity status** — a single
opportunity contributes to a layer based on its capture stage, but the layer
itself is an aggregate coverage bucket.

- **Layers**: AOP · Identification · Pursuit · Capture · Proposal · Evaluation.
- Each layer's `Required = AOP revenue target × layer multiple`; editing the
  AOP target recomputes every layer (single source of truth, see PR #1220).
- Surfaced on: Pipeline "Pipeline Coverage" card.

## Why this matters

Before this was documented, a control that changed one axis could read as
changing another (e.g. a coverage layer named "Capture" vs. the capture stage
named "Pursue/Capture"). The `StageAxisInfo` tag + tooltip makes the active
axis explicit at every control without changing any stored keys or values.
