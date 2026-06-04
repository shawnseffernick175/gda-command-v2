-- v3_038_govtribe_contacts.sql
CREATE TABLE IF NOT EXISTS govtribe_contacts (
  id             BIGSERIAL PRIMARY KEY,
  govtribe_id    TEXT UNIQUE NOT NULL,
  name           TEXT,
  title          TEXT,
  agency         TEXT,
  email          TEXT,
  phone          TEXT,
  contact_type   TEXT,           -- e.g. "Contracting Officer", "Program Manager"
  source_url     TEXT,
  raw_json       JSONB,
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS govtribe_contacts_agency_idx ON govtribe_contacts (agency);
CREATE INDEX IF NOT EXISTS govtribe_contacts_name_idx   ON govtribe_contacts (name);
