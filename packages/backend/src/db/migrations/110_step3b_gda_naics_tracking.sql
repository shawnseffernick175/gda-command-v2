-- Migration 110: Create gda_naics_tracking table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_naics_tracking on n8n DB.

CREATE TABLE IF NOT EXISTS gda_naics_tracking (
    id integer NOT NULL,
    company text NOT NULL,
    naics_code text,
    month text NOT NULL,
    revenue numeric,
    employees integer,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_naics_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_naics_tracking_id_seq OWNED BY gda_naics_tracking.id;

ALTER TABLE ONLY gda_naics_tracking ALTER COLUMN id SET DEFAULT nextval('gda_naics_tracking_id_seq'::regclass);

ALTER TABLE ONLY gda_naics_tracking
    ADD CONSTRAINT gda_naics_tracking_company_month_key UNIQUE (company, month);

ALTER TABLE ONLY gda_naics_tracking
    ADD CONSTRAINT gda_naics_tracking_pkey PRIMARY KEY (id);
