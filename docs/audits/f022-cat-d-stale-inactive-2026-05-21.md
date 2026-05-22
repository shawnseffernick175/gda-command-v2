# F-022 Category D — Stale Inactive Workflow Assessment

**Date:** 2026-05-22
**Status:** Read-only inventory complete
**Tracking issue:** [#257](https://github.com/shawnseffernick175/gda-command-v2/issues/257)

---

## Summary

| Metric | Count |
|--------|-------|
| Total inactive workflows | 8 |
| Meet STALE INACTIVE threshold (90+ days) | **0** |
| Classified for completeness | 8 |

**Key finding:** All 8 inactive workflows were created between 2026-04-22 and 2026-05-20 — none are older than 90 days (threshold: 2026-02-21). There are no "stale" inactive workflows by the strict Cat D definition. The full inventory is provided below for completeness and future reference.

### No accidentally-disabled workflows detected

None of the 8 inactive workflows appear to be accidentally toggled off. All are either:
- Superseded by active replacements (same name, different ID)
- One-shot utilities that were never intended for continuous use
- Recently disabled after a single test run

## Classification Buckets

| Classification | Count | Workflows |
|----------------|-------|-----------|
| DELETE | 6 | oneshot-schema-fix, gist-update, fast-track-ingest (old), read-jsx-temp, seed-feedback, create-approval-queue-table |
| INVESTIGATE | 2 | finalize-sprint, govtribe-cron |
| REACTIVATE | 0 | — |
| PRESERVE | 0 | — |

## Full Inventory

| Name | ID | Created | Last Exec | Triggers | Cred Count | GDA PG? | Classification | Justification |
|------|----|---------|-----------|----------|------------|---------|----------------|---------------|
| GDA.util.oneshot-schema-fix-rr38 | `eggRyGUueMkIJxgf` | 2026-04-22 | Never | webhook | 2 | Yes | DELETE | One-shot DDL fix; "oneshot" in name; never executed; no callers |
| GDA.util.gist-update | `gxRweKRZXiouvWUw` | 2026-05-03 | Never | webhook | 2 | No | DELETE | Superseded by 4+ active gist-update workflows (t2209zk3c9x0OS9S, djgOV2vX3PIv9cvm, PoOofuf0OgaYJCBN, 4bhVvKvVgLXcX6AZ) |
| GDA.cron.fast-track-ingest | `bU3PjkpSuVZP8Zue` | 2026-05-04 | Never | schedule | 1 | Yes | DELETE | Superseded by active `GDA.cron.fast-track-ingest` (MJapg8dGkvEzLn0K), same name |
| GDA.util.read-jsx-temp | `g9wMu2M7i1F7mY86` | 2026-05-04 | Never | manual | 1 | Yes | DELETE | Temporary utility; "temp" in name; never executed; no callers |
| GDA.oneshot.seed-feedback-s203 | `gBCN4PXeAdjZa3xI` | 2026-05-05 | Never | webhook | 2 | Yes | DELETE | One-shot data seeding script; "oneshot"+"seed" in name; never executed |
| GDA.oneshot.create-approval-queue-table | `85vEBTRvzw8nAgS8` | 2026-05-08 | Never | manual | 1 | Yes | DELETE | One-shot DDL script; "oneshot"+"create-table" in name; never executed |
| GDA.doctrine.finalize-sprint | `qn4h5DQrv4g0KL95` | 2026-05-09 | Never | manual | 1 | Yes | INVESTIGATE | Sprint workflow with 12 nodes and 5 Postgres references; never executed but may have intended use in doctrine sprint cycle; needs architect input |
| GDA.ingest.govtribe-cron | `5KuF4KZ8uxYcbUN5` | 2026-05-20 | 2026-05-20 (1x, success) | schedule + webhook | 1 | No | INVESTIGATE | Recently created (2 days ago); ran once successfully; calls backend GovTribe poll endpoint; may be intentionally disabled after test or superseded by direct-poll implementation |

## Credential Cross-Reference

### GDA Postgres credential (HwronxMmGY5XDGEt)

6 of 8 inactive workflows reference this credential:

| Workflow | References |
|----------|------------|
| GDA.util.oneshot-schema-fix-rr38 | 3 Postgres nodes |
| GDA.cron.fast-track-ingest (old) | 4 Postgres nodes |
| GDA.util.read-jsx-temp | 1 Postgres node |
| GDA.oneshot.seed-feedback-s203 | 1 Postgres node |
| GDA.oneshot.create-approval-queue-table | 1 Postgres node |
| GDA.doctrine.finalize-sprint | 5 Postgres nodes |

### Bridge PATs (TBzQR4MBiWOGoJmV)

**0 references.** None of the 8 inactive workflows use the GDA GitHub Bridge PAT credential.

### Canary workflows (LPUSYd4Vpph1Qg7n, Zb2quk78c5mszZ2C)

**0 references.** None of the 8 inactive workflows reference the system-watchdog or change-detector canary workflows.

## Recommended Next Actions

### DELETE bucket (6 workflows)

These can be safely deleted in a future cleanup PR:
- All are one-shot scripts, temporary utilities, or superseded duplicates
- None have active callers
- None have ever executed (except as noted)
- Deletion reduces credential surface area (6 fewer GDA Postgres references)

**Suggested sequencing:** Batch with Cat E cleanup in a future session. No urgency.

### INVESTIGATE bucket (2 workflows)

| Workflow | Question for Architect |
|----------|----------------------|
| GDA.doctrine.finalize-sprint | Is there a planned sprint-finalization workflow? 12 nodes suggests non-trivial design. Should it be preserved as a template or deleted? |
| GDA.ingest.govtribe-cron | Was this superseded by the direct-poll implementation (F-005 / PR #237)? If so, safe to delete. If it serves a different purpose (scheduled vs. on-demand), may need reactivation. |

## Lineage

- F-022 Cat A: [#257 comment](https://github.com/shawnseffernick175/gda-command-v2/issues/257#issuecomment-4513007362)
- F-022 Cat B: [#257 comment](https://github.com/shawnseffernick175/gda-command-v2/issues/257#issuecomment-4513111854)
- F-022 Cat C: [#257 comment](https://github.com/shawnseffernick175/gda-command-v2/issues/257#issuecomment-4513784731)
- F-022 Closeout: `docs/audits/f022-closeout-2026-05-21.md`
