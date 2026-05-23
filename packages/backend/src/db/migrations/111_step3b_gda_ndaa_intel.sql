-- Migration 111: Create gda_ndaa_intel table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_ndaa_intel on n8n DB.

CREATE TABLE IF NOT EXISTS gda_ndaa_intel (
    id integer NOT NULL,
    section text NOT NULL,
    title text NOT NULL,
    impact text,
    category text,
    source_type text NOT NULL,
    source_bill text DEFAULT 'P.L. 119-60 NDAA FY2026'::text,
    ingested_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_ndaa_intel_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_ndaa_intel_id_seq OWNED BY gda_ndaa_intel.id;

ALTER TABLE ONLY gda_ndaa_intel ALTER COLUMN id SET DEFAULT nextval('gda_ndaa_intel_id_seq'::regclass);

ALTER TABLE ONLY gda_ndaa_intel
    ADD CONSTRAINT gda_ndaa_intel_pkey PRIMARY KEY (id);

ALTER TABLE ONLY gda_ndaa_intel
    ADD CONSTRAINT gda_ndaa_intel_section_source_type_key UNIQUE (section, source_type);
