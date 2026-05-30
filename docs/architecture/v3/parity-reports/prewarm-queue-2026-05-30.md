# Pre-warm Queue Depth — 2026-05-30

## pg-boss Queue State (after migration)

```sql
SELECT name, COUNT(*) FROM pgboss.job
WHERE state IN ('created','retry','active')
GROUP BY name ORDER BY name;
```

```
         name         | count
----------------------+-------
 analysis-capture     |   220
 analysis-opportunity | 31484
(2 rows)
```

## Interpretation

- **analysis-opportunity: 31,484** — 15,742 opportunities × 2 commit runs (idempotency test).
  Per single run: 15,742 pre-warm jobs for V3 opportunities lacking analysis.
- **analysis-capture: 220** — 110 captures × 2 commit runs.
  Per single run: 110 pre-warm jobs for V3 captures lacking analysis.
- Total unique pre-warm jobs per single run: **15,852** (15,742 + 110).

All records that lacked analysis in V2 have pre-warm jobs enqueued for the `analysis-opportunity` and `analysis-capture` queues. This satisfies R2 ("Analysis is automatic on opportunity open — no Run Analysis buttons").

## Registered Queues

The `analysis-opportunity` and `analysis-capture` queues are registered in `pgboss.schedule` (via v3_004 + v3_006 migrations). The `analysis-periodic-refresh` queue is also registered for periodic re-analysis.
