-- Migration 085: Create gda_action_history table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_action_history on n8n DB.

CREATE TABLE IF NOT EXISTS gda_action_history (
    id integer NOT NULL,
    tab character varying(50) NOT NULL,
    action_type character varying(50) NOT NULL,
    title character varying(255),
    input_data jsonb DEFAULT '{}'::jsonb,
    output_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval),
    status character varying(20) DEFAULT 'completed'::character varying
);

CREATE SEQUENCE gda_action_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_action_history_id_seq OWNED BY gda_action_history.id;

ALTER TABLE ONLY gda_action_history ALTER COLUMN id SET DEFAULT nextval('gda_action_history_id_seq'::regclass);

ALTER TABLE ONLY gda_action_history
    ADD CONSTRAINT gda_action_history_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_action_history_created ON gda_action_history USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_history_expires ON gda_action_history USING btree (expires_at);

CREATE INDEX IF NOT EXISTS idx_action_history_tab ON gda_action_history USING btree (tab);
