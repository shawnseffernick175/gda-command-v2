-- V3 Migration 140: Default action_items.owner_email (#1142 June upload fix)
--
-- BUG A. The ingest triage path (services/ingest/router.ts) inserts an
-- action_item without owner_email, but the column is NOT NULL with no default,
-- so every financial upload threw 23502. The error was swallowed as a warn but
-- surfaced to the user as an upload failure and blocked the triage handoff.
-- Giving the column a sentinel default makes every code path safe regardless of
-- whether a caller supplies the value.
--
-- Forward-only and idempotent — safe to re-run.

BEGIN;

ALTER TABLE action_items ALTER COLUMN owner_email SET DEFAULT 'ingest-system@gda.local';

COMMIT;
