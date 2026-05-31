# F-313: Output Generators — Briefing / Capture Plan / Win Theme PDFs

## Status
**Queued** — depends on F-300, F-301, F-302, F-303, F-Color-Team-Reviews (#539). Do NOT add `devin-ready` until those merge.

## Why this exists (Completion Plan item #15)
Color Team Reviews (#539) handle critique on uploaded docs. F-313 handles **generation** of net-new deliverables: opportunity briefings, capture plans, win-theme decks. Same agent stack, opposite direction.

## Objective

Produce three publication-grade deliverables on demand, from any opportunity or capture, with doctrine + evidence baked in:

1. **Opportunity Briefing PDF** — executive 2-page brief, R2 analysis condensed, doctrine alignment, PWin, key risks, recommended action
2. **Capture Plan PDF** — 6-page capture strategy: agency intel, incumbent, competitors, win themes, teaming, schedule, risks, decision factors
3. **Win Theme PDF** — 1-page theme deck per pursuit: 3-5 themes in AJ voice, backed by past performance + capability evidence

## Hard rules

1. **6 colors only on review (F-539 — NO GOLD).** F-313 is generation, not review, but if any generator surface offers a pre-publish color check, it shows the 6 colors only.
2. **R1 — every claim cited.** PDFs include citation footnotes with full URLs (clickable in PDF reader) — not just a "Sources" section at the end.
3. **R2 — auto-populate from analysis.** "Generate Briefing" pulls from the F-305 cached analysis. No re-running unless analysis is stale.
4. **Doctrine-aligned themes.** Win themes must reference at least one of the 8 principles or be flagged "needs doctrine alignment review."
5. **No Gold pass anywhere.** This is canonical and must be enforced in code, not just UI text. CI test rejects any string match on `(?i)gold.team` or `(?i)gold.review` in F-313 codepaths.

## Templates

Templates live in `apps/backend-v3/src/output-generators/templates/`:
- `briefing.pdf.template.html` (Pandoc or Puppeteer source)
- `capture-plan.pdf.template.html`
- `win-theme.pdf.template.html`

Templates use Hydra Teal + Inter per aesthetics canonical.

## Acceptance criteria

### Backend
- [ ] `POST /v3/output-generators/briefing` — body: `{opportunity_id}` → returns PDF binary + saved doc_id
- [ ] `POST /v3/output-generators/capture-plan` — body: `{capture_id}` → PDF + doc_id
- [ ] `POST /v3/output-generators/win-themes` — body: `{capture_id}` → PDF + doc_id
- [ ] Generated PDFs are first-class docs in the ingest table (F-304) — can be re-uploaded for color review on themselves
- [ ] F-300 agent tools: `generate_briefing`, `generate_capture_plan`, `generate_win_themes`

### Frontend
- [ ] On `/opportunities/:id` → "Generate Briefing" button → renders → preview → download or save to drive
- [ ] On `/captures/:id` → both "Generate Capture Plan" and "Generate Win Themes" buttons
- [ ] All generated PDFs appear in `/documents` with source links back to the originating entity

## Tests
- [ ] Gold-free CI gate: any `(?i)gold.team` or `(?i)gold.review` string in F-313 codepaths fails build (this is on top of the existing forbidden-tokens scan)
- [ ] Citation test: every PDF has clickable footnotes with full URLs
- [ ] Layout test: PDFs match Hydra Teal + Inter aesthetics canonical (visual regression)

## Risks
- LLM hallucination in win themes: themes must cite past performance docs. Themes with no evidence are explicitly labeled "draft — needs evidence" not silently included.
- PDF generation cost / latency: cache aggressively; only regenerate when underlying analysis is stale.

## Definition of done
- Open any opportunity → generate Briefing → download PDF with R1 citations + doctrine alignment + PWin → re-upload that PDF → Pink Team Review (F-539) returns findings → loop closes.
- Open any capture → generate Capture Plan + Win Themes → both PDFs cite evidence and match aesthetics.
- Zero "Gold" references anywhere in F-313 code or output (CI-enforced).
