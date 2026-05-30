# Devin Independent Triage — Summary

**Reviewed:** 160 workflows | **Agree:** 159 | **Disagree:** 1

## Classification Counts

| Class | Shawn | Devin | Delta |
|---|---:|---:|---|
| KILL_V2_API | 82 | 82 | — |
| KILL_V2_DEAD | 2 | 2 | — |
| REWIRE_TO_V3 | 47 | 48 | +1 (ndaa-ingest) |
| KEEP_INDEPENDENT | 24 | 23 | −1 (ndaa-ingest) |
| INSPECT | 5 | 5 | — |

## Disagreement

**GDA.cron.ndaa-ingest** (`AQOLuJyT8edVTEyP`): `my-triage.csv` marks
this KEEP_INDEPENDENT with reason "no DB/V2 dependency," but the workflow
JSON shows node "Store NDAA Intel" carries credential
`postgres:GDA Postgres` (id `HwronxMmGY5XDGEt`). The `has_pg` column in
`my-triage.csv` also reads `N`, contradicting the credential. Because this
cron writes to the V2 DB, it should be **REWIRE_TO_V3**.

## Patterns

- All 82 `GDA.api.*` webhooks correctly tagged KILL_V2_API — V3 backend
  replaces the n8n-as-API-gateway pattern entirely.
- All 48 REWIRE_TO_V3 workflows use `postgres:GDA Postgres` (V2) and need
  repointing to `gda_command_staging` on the V3 postgres instance.
- 23 KEEP_INDEPENDENT workflows have zero V2/V3 infrastructure deps
  (utilities, GitHub bridge, Telegram notifier, SSH tools, smoke tests).
- 5 INSPECT workflows (bot, error-handler, bidirectional-sync, form,
  sub-workflow) have mixed signals warranting manual review.

## V3 Gaps

Of the 82 KILL_V2_API workflows, most serve functions that **do not yet
exist as V3 routes**. Key gaps grouped by domain:

| Domain | Example workflows | V3 status |
|---|---|---|
| Competitive intel | comp-intel, competitor-watchlist, competitor-field, black-hat, wargame | No V3 route |
| Daily brief / sitrep | daily-brief, morning-briefing, sitrep | No V3 route |
| Knowledge / RAG | knowledge-base, rag-query, embed-and-store, semantic-search | No V3 route |
| Doc management | doc-ingest, doc-compare, export-engine, export-excel | No V3 route |
| Contracts / vehicles | contracts, vehicle-tracker, idiq-tracker | No V3 route |
| Chat / agents | agentic-chat, chat-simple, prompt-architect | No V3 route |
| Proposals / red-team | proposals, red-team, pptx-gen | No V3 route |

These gaps do not change the triage (the workflows are dead regardless),
but they flag functions that may need V3 backend routes before the V3
frontend can reach feature parity.
