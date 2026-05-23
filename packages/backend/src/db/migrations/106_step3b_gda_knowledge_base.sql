-- Migration 106: Create gda_knowledge_base table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_knowledge_base on n8n DB.

CREATE TABLE IF NOT EXISTS gda_knowledge_base (
    id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    sources jsonb DEFAULT '[]'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE gda_knowledge_base_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_knowledge_base_id_seq OWNED BY gda_knowledge_base.id;

ALTER TABLE ONLY gda_knowledge_base ALTER COLUMN id SET DEFAULT nextval('gda_knowledge_base_id_seq'::regclass);

ALTER TABLE ONLY gda_knowledge_base
    ADD CONSTRAINT gda_knowledge_base_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tags ON gda_knowledge_base USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_timestamp ON gda_knowledge_base USING btree ("timestamp" DESC);
