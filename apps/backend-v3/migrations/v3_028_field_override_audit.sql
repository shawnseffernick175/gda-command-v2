-- V3 Migration 028: Field Override Audit Trail (F-413)
--
-- Adds an append-only audit trail for unified_opportunity_field_overrides.
--
-- The override table itself (v3_026) holds only the CURRENT override per
-- (internal_id, field_name) because of its UNIQUE constraint — so it cannot
-- answer "who changed this field, from what, to what, and when". This table
-- records every set/clear action as an immutable row, giving a full history.
--
-- One row is written per override mutation by the F-413 service, inside the
-- same transaction that upserts/deletes the override (atomic).

-- Up Migration

BEGIN;

CREATE TABLE unified_opportunity_field_override_audit (
  id              BIGSERIAL       PRIMARY KEY,
  internal_id     UUID            NOT NULL REFERENCES unified_opportunities(internal_id) ON DELETE CASCADE,
  field_name      TEXT            NOT NULL,
  -- 'set' (create/update an override) or 'clear' (remove an override)
  action          TEXT            NOT NULL CHECK (action IN ('set', 'clear')),
  old_value_json  JSONB,          -- prior override value, NULL if none existed
  new_value_json  JSONB,          -- new override value, NULL on 'clear'
  set_by          TEXT            NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Read the trail for one opportunity (and optionally one field), newest first.
CREATE INDEX idx_unified_opp_override_audit_lookup
  ON unified_opportunity_field_override_audit (internal_id, field_name, created_at DESC);

COMMIT;

-- Down Migration

BEGIN;

DROP TABLE IF EXISTS unified_opportunity_field_override_audit;

COMMIT;
