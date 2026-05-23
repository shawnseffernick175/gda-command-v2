-- Migration 099: Create gda_discussions table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_discussions on n8n DB.

CREATE TABLE IF NOT EXISTS gda_discussions (
    id integer NOT NULL,
    session_id text,
    page_context text,
    user_query text NOT NULL,
    ai_response text,
    source_tool text,
    pinned boolean DEFAULT false,
    tags text[],
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE gda_discussions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_discussions_id_seq OWNED BY gda_discussions.id;

ALTER TABLE ONLY gda_discussions ALTER COLUMN id SET DEFAULT nextval('gda_discussions_id_seq'::regclass);

ALTER TABLE ONLY gda_discussions
    ADD CONSTRAINT gda_discussions_pkey PRIMARY KEY (id);
