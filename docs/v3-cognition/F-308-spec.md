# F-308: Launchpad — Daily News + "What Needs Me Today" + Door Summaries + Day-1 Banners

## Status
**Queued** — depends on F-300, F-301, F-303, F-307, F-Govwin (#541), F-Govtribe (#542). Do NOT add `devin-ready` until those merge.

## Why this exists (verbatim from Shawn — Rev 2 correction must remain enforced)
> "i fucking uploaded an orange slies email and said that is what i wanted my morning news to look like not that i wanted that!!!"

**OrangeSlices is the visual FORMAT reference for Daily News. We do NOT ingest OrangeSlices content.** Daily News is built from our own sources only: SAM, USAspending, Federal Register, GovWin, GovTribe, news, agency forecasts. The OrangeSlices email layout (clean section blocks, agency tag chips, dollar value first, source link last) is the visual model — nothing more.

## Objective

Make `/launchpad` the door Shawn opens first every morning. It must answer four questions in this order:

1. **What's new since I was last here?** (Daily News)
2. **What needs me today?** (action items with reasons, ranked by priority + due date)
3. **What's the state of each door?** (one-paragraph summary per door)
4. **What landed yesterday that I need to know about?** (Day-1 banners — major posts, awards, regulatory drops)

## Layout (OrangeSlices-formatted, not OrangeSlices-sourced)

```
┌─────────────────────────────────────────────────────────┐
│ GDA COMMAND · LAUNCHPAD · Sun May 31 2026 · 16:38 EDT  │
├─────────────────────────────────────────────────────────┤
│ DAY-1 BANNERS (≤3 items, dismissable)                    │
│   • Big new SAM notice in Envision NAICS                 │
│   • USAspending award to known competitor                │
│   • Federal Register rule affecting our agency           │
├─────────────────────────────────────────────────────────┤
│ DAILY NEWS                                               │
│   ┌─[AGENCY: DoD] [$ 24.5M] ────────────────────────┐   │
│   │ Title of opportunity / award / rule             │   │
│   │ One-sentence why-it-matters from agent          │   │
│   │ Source: SAM Notice 12345 · Posted 6h ago        │   │
│   └─────────────────────────────────────────────────┘   │
│   (10-15 cards/day, ranked by F-302 relevance score)    │
├─────────────────────────────────────────────────────────┤
│ WHAT NEEDS ME TODAY                                      │
│   • Action item 1 — reason — due — source             │
│   • Action item 2 — reason — due — source             │
│   (max 7 items; if >7 truncate w/ "see all" link)       │
├─────────────────────────────────────────────────────────┤
│ DOOR SUMMARIES (5-7 doors, one paragraph each)           │
│   Opportunities  ·  Pipeline  ·  Capture  ·  Action     │
│   Items  ·  Partner Intel  ·  Risks  ·  Sentinel        │
├─────────────────────────────────────────────────────────┤
│ WHAT'S AT RISK (top 5 critical/high open risks)          │
└─────────────────────────────────────────────────────────┘
```

## Hard rules

1. **No OrangeSlices ingestion.** No fetcher, no parser, no feed. Format reference only.
2. **Sources cited per R1.** Every news card hyperlinks to its source (SAM URL, USAspending URL, FR URL, GovWin entry, GovTribe entry, news article).
3. **Doctrine filter (F-303).** Daily News auto-suppresses items hitting any of the 6 exclusions unless explicitly opted-in by Shawn ("show me excluded items too" toggle).
4. **Relevance ranked by F-302.** Items ordered by predicted relevance score, not just recency. Click-through and dismiss feed back to training.
5. **No emojis in headings.** No charts. Tabular-nums. EST dates. Per aesthetics canonical.

## Acceptance criteria

### Backend
- [ ] `GET /v3/launchpad/daily-news` — returns ranked items from last 24h across all sources (SAM, USAspending, FR, GovWin, GovTribe, news)
- [ ] `GET /v3/launchpad/day-1-banners` — major events from last 24h that meet "big enough to interrupt" threshold (configurable)
- [ ] `GET /v3/launchpad/what-needs-me` — action items ranked by priority × due-proximity × age
- [ ] `GET /v3/launchpad/door-summaries` — agent-generated paragraph per door, cached 1h
- [ ] `GET /v3/launchpad/risks-roll-up` — same query as F-307 Launchpad panel
- [ ] `POST /v3/launchpad/news-feedback` — dismissed / clicked / saved per card → F-302 training
- [ ] Pre-warm worker: runs every hour, materializes Daily News for next page-load

### Frontend
- [ ] `/launchpad` page rebuilt to spec layout
- [ ] Each news card is a `LaunchpadNewsCard` component with R1 source link footer
- [ ] Door summary cards link to their respective doors
- [ ] Risks panel shared with `/risks` page (same component)

### Sources
- [ ] SAM: filtered by Envision NAICS + agencies + set-asides
- [ ] USAspending: awards to known competitors or in target NAICS
- [ ] Federal Register: rules tagged by agency or affecting our compliance posture
- [ ] GovWin: opportunities, awards, market intel (when #541 merges)
- [ ] GovTribe: ditto (when #542 merges)
- [ ] News: agency press releases + defense/space trade press (curated feed list)

## Tests
- [ ] Empty-day test: if no items meet threshold, Daily News shows "Quiet morning — no qualifying activity since [time]" instead of fake content
- [ ] OrangeSlices-suppression test: any code path that fetches OrangeSlices is rejected by CI guardrail
- [ ] Doctrine filter test: items hitting exclusions are suppressed unless toggle on

## Risks
- News volume: target 10-15 items/day. If >25, F-302 ranking is mis-tuned — alert.
- Stale "Day-1 banners": must roll over at midnight EST. Cron at 00:05 EST.

## Definition of done
- Shawn opens Launchpad at 7am EDT → sees ≤3 Day-1 banners + 10-15 ranked news cards + 5-7 action items + door paragraphs + top 5 risks → every fact cites a source → zero OrangeSlices content anywhere → layout matches OrangeSlices visual reference per Shawn's screenshot.
