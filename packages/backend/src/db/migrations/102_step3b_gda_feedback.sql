-- Migration 102: Create gda_feedback table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_feedback on n8n DB.

CREATE TABLE IF NOT EXISTS gda_feedback (
    id integer NOT NULL,
    event_type character varying(50) NOT NULL,
    predicted_value numeric(5,2),
    actual_value numeric(5,2),
    context jsonb DEFAULT '{}'::jsonb,
    notes text,
    logged_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_feedback_id_seq OWNED BY gda_feedback.id;

ALTER TABLE ONLY gda_feedback ALTER COLUMN id SET DEFAULT nextval('gda_feedback_id_seq'::regclass);

ALTER TABLE ONLY gda_feedback
    ADD CONSTRAINT gda_feedback_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_gda_feedback_event_type ON gda_feedback USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_gda_feedback_logged_at ON gda_feedback USING btree (logged_at);
