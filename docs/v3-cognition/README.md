# GDA Command V3 — Cognition Layer

This folder holds the **authoritative specs and seed data** for the GDA Command V3 Cognition Layer and beyond.

## What's here

| File | Purpose |
|---|---|
| `GDA_V3_Completion_Plan.md` | The North Star. Defines the complete V3 tool end-to-end. Approved by Shawn May 31, 2026. Rev 2 corrections at the top. |
| `F-300-spec.md` | Agent Runtime (LangGraph + tool registry + agent_traces + healthz). Issue [#535](https://github.com/shawnseffernick175/gda-command-v2/issues/535). |
| `F-301-spec.md` | RAG corpus (pgvector + ingest of 7 CEO docs + V1 workflows + CPARs). Issue [#536](https://github.com/shawnseffernick175/gda-command-v2/issues/536). |
| `F-302-spec.md` | Decision Memory + initial PWin scorer + learning loop. Issue [#537](https://github.com/shawnseffernick175/gda-command-v2/issues/537). |
| `F-303-spec.md` | Doctrine Rules Engine — 8 principles + 6 exclusions + 8% margin floor + evidence rubric. Issue [#538](https://github.com/shawnseffernick175/gda-command-v2/issues/538). |
| `F-Color-Team-Reviews-spec.md` | 6-color review (Pink/Red/Black/Blue/White/Green) on any uploaded doc. **No Gold.** Issue [#539](https://github.com/shawnseffernick175/gda-command-v2/issues/539). |
| `../../apps/backend-v3/scripts/build_rag_corpus_seed.py` | Chunker that produces the corpus seed. |
| `../../apps/backend-v3/data/rag-seed/corpus_seed.jsonl` | 124 pre-chunked passages from the 7 CEO docs, ready for F-301 to embed and load into pgvector. |

## Sequencing

Track A (Cognition) must complete before Track C (Agentic Surfaces) can be wired:

```
F-301 RAG ──┐
            ├── F-300 Agent Runtime ── F-302 Decision Memory ── (unblocks Track C)
F-303 Doctrine ──┘
```

F-303 can run parallel with F-301; F-300 consumes both.

## Standing build rules (apply to every F-spec)

- Container-level verification AC on every spec (curl from inside the network, not just UI screenshots)
- Root cause only — no symptom patches, no SQL aliases, no V2 fixes
- Source link on every data point clickable to origin
- Dark mode primary, light mode opt-in
- ECharts only when charts are used; no cartoon visualizations
- Nothing on V3 >5h old without staleness warning
- Premium UI — clean hierarchy, restrained color, professional typography, logical density
- Devin work via `gh` CLI only; no `browser_task` for GitHub
- PRs not approved without Shawn's explicit "go"

## Rev 2 corrections (May 31, 2026)

1. **Gold removed** from Color Team Reviews. Six colors only.
2. **OrangeSlices is a format reference, not a data source.** Daily News is built from our own sources, styled in the OrangeSlices layout.
3. **GovWin + GovTribe both first-class V3 connectors** (both company-paid). See plan Section 2 for credentials.
