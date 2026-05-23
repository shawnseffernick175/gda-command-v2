-- Migration 103: Create gda_health_scans table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_health_scans on n8n DB.

CREATE TABLE IF NOT EXISTS gda_health_scans (
    id integer NOT NULL,
    scan_time timestamp with time zone DEFAULT now() NOT NULL,
    total_endpoints integer DEFAULT 0 NOT NULL,
    passed integer DEFAULT 0 NOT NULL,
    failed integer DEFAULT 0 NOT NULL,
    timed_out integer DEFAULT 0 NOT NULL,
    pass_rate numeric(5,2) DEFAULT 0 NOT NULL,
    results jsonb DEFAULT '[]'::jsonb NOT NULL,
    duration_ms integer,
    scan_type character varying(20) DEFAULT 'daily'::character varying
);

CREATE SEQUENCE gda_health_scans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_health_scans_id_seq OWNED BY gda_health_scans.id;

ALTER TABLE ONLY gda_health_scans ALTER COLUMN id SET DEFAULT nextval('gda_health_scans_id_seq'::regclass);

ALTER TABLE ONLY gda_health_scans
    ADD CONSTRAINT gda_health_scans_pkey PRIMARY KEY (id);
