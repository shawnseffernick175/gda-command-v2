-- Migration 092: Create gda_competitor_crawls table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_competitor_crawls on n8n DB.

CREATE TABLE IF NOT EXISTS gda_competitor_crawls (
    id integer NOT NULL,
    competitor_name text NOT NULL,
    crawl_data jsonb NOT NULL,
    changes_detected jsonb DEFAULT '[]'::jsonb,
    change_count integer DEFAULT 0,
    significance text DEFAULT 'LOW'::text,
    previous_crawl_id integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_competitor_crawls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_competitor_crawls_id_seq OWNED BY gda_competitor_crawls.id;

ALTER TABLE ONLY gda_competitor_crawls ALTER COLUMN id SET DEFAULT nextval('gda_competitor_crawls_id_seq'::regclass);

ALTER TABLE ONLY gda_competitor_crawls
    ADD CONSTRAINT gda_competitor_crawls_pkey PRIMARY KEY (id);
