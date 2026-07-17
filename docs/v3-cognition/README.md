# V3 Cognition Layer — Spec Index

This directory contains the executable specifications for the GDA Command V3 Completion Plan. Specs are filed on GitHub as tracker issues; this directory is the canonical reference inside the repo.

## Master Plan
- [GDA_V3_Completion_Plan.md](./GDA_V3_Completion_Plan.md) — rev 2 (APPROVED 2026-05-31)

## Track A — Cognition Layer (devin-ready)
- [F-300](./F-300-spec.md) — Agent Runtime (LangGraph + Tool Registry + Trace + healthz) — issue #535
- [F-301](./F-301-spec.md) — RAG Corpus (pgvector + CEO docs + V1 workflows + CPARs) — issue #536
- [F-302](./F-302-spec.md) — Decision Memory + PWin Model + Learning Loop — issue #537
- [F-303](./F-303-spec.md) — Doctrine Rules Engine (8 Principles + 6 Exclusions + 8% Margin Floor + Evidence Rubric) — issue #538

## Track B — Active surfaces (devin-ready)
- F-260a — Awards surface (USAspending) in V3 UI — issue #533
- F-260b — Regulatory Notices surface (Federal Register) in V3 UI — issue #534

## Output + Connectors (devin-ready)
- [F-Color-Team-Reviews](./F-Color-Team-Reviews-spec.md) — 6-Color Review on Any Uploaded Doc (Pink/Red/Black/Blue/White/Green — **NO GOLD**) — issue #539
- [F-Govwin](./F-Govwin-spec.md) — GovWin IQ Connector (OAuth2, company-paid $1.2k/yr) — issue #541

## Downstream queue (NOT devin-ready — dependency-blocked)
These ship after Track A merges. They live as tracker issues so the plan is visible end-to-end.
- [F-304](./F-304-spec.md) — Universal Ingestion (drag-drop + email-in + auto-classify) — issue #543
- [F-305](./F-305-spec.md) — Opportunity Auto-Analysis on Open (R2) — issue #544
- [F-306](./F-306-spec.md) — Capability Matching + Auto-Qualify against OU3 — issue #545
- [F-307](./F-307-spec.md) — Risks as First-Class Objects (Launchpad roll-up) — issue #546
- [F-308](./F-308-spec.md) — Launchpad Daily News + What Needs Me Today + Door Summaries — issue #547
- [F-309](./F-309-spec.md) — Sentinel Handoff Monitor (plain language + GovTribe pacing) — issue #548
- [F-310](./F-310-spec.md) — Action Item Tracker (AI drafts feeding Launchpad) — issue #549
- [F-311](./F-311-spec.md) — Financial Bible (PD-SYS 4-file format, Envision-OU scoped) — issue #550
- [F-312](./F-312-spec.md) — Partner Profiles (Riverstone + PD Systems read-only) — issue #551
- [F-313](./F-313-spec.md) — Output Generators (Briefing / Capture Plan / Win Themes) — issue #552
- [F-314](./F-314-spec.md) — V2 Decommission + Final Cutover (**HARD HOLD** — explicit Shawn go required) — issue #553

## RAG Corpus Seed
- [build_rag_corpus_seed.py](../../apps/backend-v3/scripts/build_rag_corpus_seed.py) — CEO doc chunker
- [build_v1_corpus_seed.py](../../apps/backend-v3/scripts/build_v1_corpus_seed.py) — V1 archive chunker
- `apps/backend-v3/data/rag-seed/corpus_seed.jsonl` — 123 CEO chunks, evidence_grade=A
- `apps/backend-v3/data/rag-seed/corpus_seed_v1.jsonl` — 81 V1 archive chunks, evidence_grade=B
- `apps/backend-v3/data/rag-seed/corpus_seed_combined.jsonl` — 204 chunks total

## Standing rules
- **No Gold pass anywhere.** 6 colors only: Pink, Red, Black, Blue, White, **Green** (executive/final). CI-enforced in F-313 + F-Color-Team-Reviews.
- **OrangeSlices is the visual FORMAT reference only.** We do NOT ingest OrangeSlices content. Daily News (F-308) builds from our own sources.
- **R1** — every fact cites a clickable source.
- **R2** — opening an opportunity triggers full agent analysis automatically.
- **Doctrine non-negotiable** — F-303 enforces 8 principles + 6 exclusions + 8% margin floor at every gate.
