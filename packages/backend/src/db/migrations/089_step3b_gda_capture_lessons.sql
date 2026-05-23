-- Migration 089: Create gda_capture_lessons table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_capture_lessons on n8n DB.

CREATE TABLE IF NOT EXISTS gda_capture_lessons (
    id integer NOT NULL,
    opportunity text,
    agency text,
    naics_code text,
    stage_from text,
    stage_to text,
    outcome text,
    lesson_text text,
    win_factors jsonb DEFAULT '[]'::jsonb,
    loss_factors jsonb DEFAULT '[]'::jsonb,
    competitor_notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_capture_lessons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_capture_lessons_id_seq OWNED BY gda_capture_lessons.id;

ALTER TABLE ONLY gda_capture_lessons ALTER COLUMN id SET DEFAULT nextval('gda_capture_lessons_id_seq'::regclass);

ALTER TABLE ONLY gda_capture_lessons
    ADD CONSTRAINT gda_capture_lessons_pkey PRIMARY KEY (id);
