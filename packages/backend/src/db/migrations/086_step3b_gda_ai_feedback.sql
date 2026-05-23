-- Migration 086: Create gda_ai_feedback table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_ai_feedback on n8n DB.

CREATE TABLE IF NOT EXISTS gda_ai_feedback (
    id integer NOT NULL,
    source text NOT NULL,
    recommendation_id text,
    recommendation_text text,
    user_action text,
    user_note text,
    modified_text text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT gda_ai_feedback_user_action_check CHECK ((user_action = ANY (ARRAY['accept'::text, 'reject'::text, 'modify'::text, 'defer'::text, 'flag'::text])))
);

CREATE SEQUENCE gda_ai_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_ai_feedback_id_seq OWNED BY gda_ai_feedback.id;

ALTER TABLE ONLY gda_ai_feedback ALTER COLUMN id SET DEFAULT nextval('gda_ai_feedback_id_seq'::regclass);

ALTER TABLE ONLY gda_ai_feedback
    ADD CONSTRAINT gda_ai_feedback_pkey PRIMARY KEY (id);
