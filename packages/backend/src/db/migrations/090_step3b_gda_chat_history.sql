-- Migration 090: Create gda_chat_history table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_chat_history on n8n DB.

CREATE TABLE IF NOT EXISTS gda_chat_history (
    id integer NOT NULL,
    session_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_chat_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_chat_history_id_seq OWNED BY gda_chat_history.id;

ALTER TABLE ONLY gda_chat_history ALTER COLUMN id SET DEFAULT nextval('gda_chat_history_id_seq'::regclass);

ALTER TABLE ONLY gda_chat_history
    ADD CONSTRAINT gda_chat_history_pkey PRIMARY KEY (id);
