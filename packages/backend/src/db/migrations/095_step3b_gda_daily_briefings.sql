-- Migration 095: Create gda_daily_briefings table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_daily_briefings on n8n DB.

CREATE TABLE IF NOT EXISTS gda_daily_briefings (
    id integer NOT NULL,
    briefing_date date DEFAULT CURRENT_DATE,
    briefing_json jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE gda_daily_briefings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_daily_briefings_id_seq OWNED BY gda_daily_briefings.id;

ALTER TABLE ONLY gda_daily_briefings ALTER COLUMN id SET DEFAULT nextval('gda_daily_briefings_id_seq'::regclass);

ALTER TABLE ONLY gda_daily_briefings
    ADD CONSTRAINT gda_daily_briefings_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_briefing_date ON gda_daily_briefings USING btree (briefing_date);
