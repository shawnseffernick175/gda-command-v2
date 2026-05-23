-- Migration 105: Create gda_incumbent_analysis table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_incumbent_analysis on n8n DB.

CREATE TABLE IF NOT EXISTS gda_incumbent_analysis (
    id integer NOT NULL,
    agency character varying(200) NOT NULL,
    vendor_name character varying(300) NOT NULL,
    vendor_uei character varying(20),
    dollars_obligated numeric(14,2) DEFAULT 0,
    award_count integer DEFAULT 0,
    division character varying(200),
    vendor_size character varying(20) DEFAULT 'Large'::character varying,
    govtribe_url character varying(500),
    analyzed_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_incumbent_analysis_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_incumbent_analysis_id_seq OWNED BY gda_incumbent_analysis.id;

ALTER TABLE ONLY gda_incumbent_analysis ALTER COLUMN id SET DEFAULT nextval('gda_incumbent_analysis_id_seq'::regclass);

ALTER TABLE ONLY gda_incumbent_analysis
    ADD CONSTRAINT gda_incumbent_analysis_agency_vendor_name_key UNIQUE (agency, vendor_name);

ALTER TABLE ONLY gda_incumbent_analysis
    ADD CONSTRAINT gda_incumbent_analysis_pkey PRIMARY KEY (id);
