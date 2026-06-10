# Override Capture — Design Notes (Path A)

## Purpose

This feature captures every human override of an AI-generated grade or pipeline stage so Envision can see where the AI is over- or under-grading opportunities in real time, and accumulate a labeled dataset of (AI prediction → human decision) pairs. No prompts change, no weights update — this is a data-collection scaffold only.

## Semantic note: what `ai_value` means for stage rows

For **grade overrides**, `ai_value` is literally the AI's prediction (written by the analysis worker into `opportunities.grade`).

For **pipeline stage overrides**, `ai_value` captures the **system's previous value** — which may be:
- The AI's auto-no-bid decision (when the analysis worker set stage to `no_bid` due to <30-day deadline)
- A previous human decision (most stage transitions today are 100% human)

Both are valuable data for the learning loop. The distinction can be inferred by checking whether the prior row was set by the auto-no-bid rule (checking `created_by` and timing on the `pipeline_items` row). When Path B ships, we will revisit whether to separately track auto-no-bid triggers.

## SQL recipes

### Find AI-graded-F opps that you promoted (weekly query)

```sql
SELECT odo.id, o.title, o.agency, o.naics,
       odo.ai_value AS ai_grade,
       odo.human_value AS your_grade,
       odo.reason,
       odo.created_at
FROM opportunity_decision_overrides odo
JOIN opportunities o ON o.id = odo.opportunity_id
WHERE odo.field_name = 'grade'
  AND odo.ai_value = 'F'
  AND odo.human_value IN ('A', 'B', 'C')
ORDER BY odo.created_at DESC;
```

### Count overrides by week

```sql
SELECT date_trunc('week', created_at) AS week,
       field_name,
       COUNT(*) AS overrides
FROM opportunity_decision_overrides
GROUP BY 1, 2
ORDER BY 1 DESC;
```

## Path B (future PR)

Path B will consume from `opportunity_decision_overrides` to:
1. Fine-tune scoring prompts where the AI consistently disagrees with human judgment
2. Retrain scoring rules when the dataset reaches statistical significance
3. Auto-surface "the AI keeps getting this NAICS wrong" alerts on the Launchpad

This PR (Path A) does NOT implement any auto-tuning. The AI continues to score exactly as before.
