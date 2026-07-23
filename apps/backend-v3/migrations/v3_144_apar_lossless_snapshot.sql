-- F-625 lossless AP/AR ingest.
--
-- The prior upsert key (source, period, vendor/customer, COALESCE(invoice,''))
-- silently MERGED two legitimately-distinct lines that share a vendor+invoice:
-- an April Open-AP report carries two vouchers with the same vendor and invoice
-- number, so the second row updated the first instead of inserting, dropping
-- $383.18 (parser emitted 111 rows, only 110 persisted). The same natural key
-- could never purge rows left by an earlier mis-parse, forcing manual deletes.
--
-- Switch AP/AR to snapshot-replace semantics keyed by a per-report line ordinal
-- (line_seq): the ingest deletes the period's existing rows and re-inserts every
-- parsed line with its ordinal, so no voucher is ever collapsed and a re-ingest
-- self-cleans stale rows. period (e.g. "FY26 Apr") already uniquely identifies a
-- month, so (source, period, line_seq) is a stable identity.
--
-- Additive + reversible. Existing rows get line_seq = NULL (NULLs are distinct in
-- a btree unique index, so no violation) until the doc is re-ingested through the
-- new path. Forward-only and idempotent — safe to re-run.

BEGIN;

ALTER TABLE ap_actuals ADD COLUMN IF NOT EXISTS line_seq INT;
ALTER TABLE ar_actuals ADD COLUMN IF NOT EXISTS line_seq INT;

DROP INDEX IF EXISTS ap_actuals_upsert_key;
DROP INDEX IF EXISTS ar_actuals_upsert_key;

CREATE UNIQUE INDEX IF NOT EXISTS ap_actuals_snapshot_key
  ON ap_actuals (source, period, line_seq);
CREATE UNIQUE INDEX IF NOT EXISTS ar_actuals_snapshot_key
  ON ar_actuals (source, period, line_seq);

COMMENT ON COLUMN ap_actuals.line_seq IS
  'Zero-based ordinal of this voucher within its source Open-AP report. Part of the (source, period, line_seq) snapshot identity so duplicate vendor+invoice lines are never merged. NULL for rows written before v3_144.';
COMMENT ON COLUMN ar_actuals.line_seq IS
  'Zero-based ordinal of this invoice within its source Aged-AR report. Part of the (source, period, line_seq) snapshot identity so duplicate customer+invoice lines are never merged. NULL for rows written before v3_144.';

COMMIT;
