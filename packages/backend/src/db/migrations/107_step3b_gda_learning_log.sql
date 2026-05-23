-- Migration 107: Create gda_learning_log table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_learning_log on n8n DB.

CREATE TABLE IF NOT EXISTS gda_learning_log (
    id integer NOT NULL,
    data_type text NOT NULL,
    source text,
    content text,
    metadata jsonb DEFAULT '{}'::jsonb,
    user_context text,
    trend_tags text[],
    created_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE gda_learning_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_learning_log_id_seq OWNED BY gda_learning_log.id;

ALTER TABLE ONLY gda_learning_log ALTER COLUMN id SET DEFAULT nextval('gda_learning_log_id_seq'::regclass);

ALTER TABLE ONLY gda_learning_log
    ADD CONSTRAINT gda_learning_log_pkey PRIMARY KEY (id);
