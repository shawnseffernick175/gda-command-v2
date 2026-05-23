-- Migration 117: Create gda_content_store table.
-- Part of F-026 Step 4b: Migrate orphan GDA table from n8n-envision-postgres-1.
-- Source: \d+ gda_content_store on n8n DB (PR #306 PLAN.md Section 4).

CREATE TABLE IF NOT EXISTS gda_content_store (
    id integer NOT NULL,
    content_type text NOT NULL,
    source_table text,
    source_id integer,
    title text,
    content text NOT NULL,
    content_hash text,
    metadata jsonb DEFAULT '{}'::jsonb,
    embedding_status text DEFAULT 'pending'::text,
    chunk_index integer DEFAULT 0,
    token_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    embedded_at timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS gda_content_store_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_content_store_id_seq OWNED BY gda_content_store.id;

ALTER TABLE ONLY gda_content_store ALTER COLUMN id SET DEFAULT nextval('gda_content_store_id_seq'::regclass);

ALTER TABLE ONLY gda_content_store
    ADD CONSTRAINT gda_content_store_pkey PRIMARY KEY (id);

ALTER TABLE ONLY gda_content_store
    ADD CONSTRAINT gda_content_store_content_hash_key UNIQUE (content_hash);

CREATE INDEX IF NOT EXISTS idx_content_source ON gda_content_store USING btree (source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_content_status ON gda_content_store USING btree (embedding_status);

CREATE INDEX IF NOT EXISTS idx_content_type ON gda_content_store USING btree (content_type);
