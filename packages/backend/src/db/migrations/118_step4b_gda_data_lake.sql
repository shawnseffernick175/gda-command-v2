-- Migration 118: Create gda_data_lake table.
-- Part of F-026 Step 4b: Migrate orphan GDA table from n8n-envision-postgres-1.
-- Source: \d+ gda_data_lake on n8n DB (PR #306 PLAN.md Section 4).

CREATE TABLE IF NOT EXISTS gda_data_lake (
    id integer NOT NULL,
    source text NOT NULL,
    source_id text,
    record_type text NOT NULL,
    raw_data jsonb NOT NULL,
    normalized_data jsonb,
    processing_status text DEFAULT 'pending'::text,
    error_message text,
    ingested_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    batch_id text,
    dedup_key text
);

CREATE SEQUENCE IF NOT EXISTS gda_data_lake_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_data_lake_id_seq OWNED BY gda_data_lake.id;

ALTER TABLE ONLY gda_data_lake ALTER COLUMN id SET DEFAULT nextval('gda_data_lake_id_seq'::regclass);

ALTER TABLE ONLY gda_data_lake
    ADD CONSTRAINT gda_data_lake_pkey PRIMARY KEY (id);

ALTER TABLE ONLY gda_data_lake
    ADD CONSTRAINT gda_data_lake_source_source_id_record_type_key UNIQUE (source, source_id, record_type);

CREATE INDEX IF NOT EXISTS idx_datalake_batch ON gda_data_lake USING btree (batch_id);

CREATE INDEX IF NOT EXISTS idx_datalake_dedup ON gda_data_lake USING btree (dedup_key);

CREATE INDEX IF NOT EXISTS idx_datalake_ingested ON gda_data_lake USING btree (ingested_at DESC);

CREATE INDEX IF NOT EXISTS idx_datalake_source ON gda_data_lake USING btree (source);

CREATE INDEX IF NOT EXISTS idx_datalake_status ON gda_data_lake USING btree (processing_status);

CREATE INDEX IF NOT EXISTS idx_datalake_type ON gda_data_lake USING btree (record_type);
