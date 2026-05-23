-- Migration 108: Create gda_meeting_notes table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_meeting_notes on n8n DB.

CREATE TABLE IF NOT EXISTS gda_meeting_notes (
    id integer NOT NULL,
    session_id character varying(100),
    meeting_title character varying(500),
    meeting_type character varying(50),
    raw_transcript text,
    summary text,
    key_decisions jsonb,
    action_items jsonb,
    opportunities jsonb,
    competitor_mentions jsonb,
    budget_signals jsonb,
    follow_up jsonb,
    intelligence_value character varying(20),
    attendees text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_meeting_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_meeting_notes_id_seq OWNED BY gda_meeting_notes.id;

ALTER TABLE ONLY gda_meeting_notes ALTER COLUMN id SET DEFAULT nextval('gda_meeting_notes_id_seq'::regclass);

ALTER TABLE ONLY gda_meeting_notes
    ADD CONSTRAINT gda_meeting_notes_pkey PRIMARY KEY (id);
