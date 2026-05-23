-- Migration 113: Create gda_prompt_architect_memory table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_prompt_architect_memory on n8n DB.

CREATE TABLE IF NOT EXISTS gda_prompt_architect_memory (
    id integer NOT NULL,
    session_id text,
    message jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_prompt_architect_memory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_prompt_architect_memory_id_seq OWNED BY gda_prompt_architect_memory.id;

ALTER TABLE ONLY gda_prompt_architect_memory ALTER COLUMN id SET DEFAULT nextval('gda_prompt_architect_memory_id_seq'::regclass);

ALTER TABLE ONLY gda_prompt_architect_memory
    ADD CONSTRAINT gda_prompt_architect_memory_pkey PRIMARY KEY (id);
