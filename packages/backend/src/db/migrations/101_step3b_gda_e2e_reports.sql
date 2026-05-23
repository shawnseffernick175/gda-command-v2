-- Migration 101: Create gda_e2e_reports table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_e2e_reports on n8n DB.

CREATE TABLE IF NOT EXISTS gda_e2e_reports (
    id integer NOT NULL,
    run_at timestamp with time zone,
    pass_rate character varying(10),
    passed integer,
    failed integer,
    errors integer,
    total integer,
    analysis text,
    results jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_e2e_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_e2e_reports_id_seq OWNED BY gda_e2e_reports.id;

ALTER TABLE ONLY gda_e2e_reports ALTER COLUMN id SET DEFAULT nextval('gda_e2e_reports_id_seq'::regclass);

ALTER TABLE ONLY gda_e2e_reports
    ADD CONSTRAINT gda_e2e_reports_pkey PRIMARY KEY (id);
