-- Migration 096: Create gda_daily_briefs table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_daily_briefs on n8n DB.

CREATE TABLE IF NOT EXISTS gda_daily_briefs (
    id integer NOT NULL,
    brief_date date DEFAULT CURRENT_DATE,
    brief_data jsonb,
    stats jsonb,
    generated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_daily_briefs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_daily_briefs_id_seq OWNED BY gda_daily_briefs.id;

ALTER TABLE ONLY gda_daily_briefs ALTER COLUMN id SET DEFAULT nextval('gda_daily_briefs_id_seq'::regclass);

ALTER TABLE ONLY gda_daily_briefs
    ADD CONSTRAINT gda_daily_briefs_pkey PRIMARY KEY (id);
