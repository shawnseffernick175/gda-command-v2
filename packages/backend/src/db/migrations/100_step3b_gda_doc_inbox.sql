-- Migration 100: Create gda_doc_inbox table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_doc_inbox on n8n DB.

CREATE TABLE IF NOT EXISTS gda_doc_inbox (
    id integer NOT NULL,
    title text NOT NULL,
    doc_type text DEFAULT 'rfp'::text,
    content text,
    source_url text,
    file_name text,
    status text DEFAULT 'pending'::text,
    chunks_created integer DEFAULT 0,
    error_message text,
    opp_id integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone
);

CREATE SEQUENCE gda_doc_inbox_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_doc_inbox_id_seq OWNED BY gda_doc_inbox.id;

ALTER TABLE ONLY gda_doc_inbox ALTER COLUMN id SET DEFAULT nextval('gda_doc_inbox_id_seq'::regclass);

ALTER TABLE ONLY gda_doc_inbox
    ADD CONSTRAINT gda_doc_inbox_pkey PRIMARY KEY (id);
