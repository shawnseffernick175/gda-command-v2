-- Migration 112: Create gda_ooda_loops table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_ooda_loops on n8n DB.

CREATE TABLE IF NOT EXISTS gda_ooda_loops (
    id integer NOT NULL,
    target text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    observe_data jsonb DEFAULT '{}'::jsonb,
    orient_summary jsonb DEFAULT '{}'::jsonb,
    decision jsonb DEFAULT '{}'::jsonb,
    act_items jsonb DEFAULT '[]'::jsonb,
    user_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE gda_ooda_loops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_ooda_loops_id_seq OWNED BY gda_ooda_loops.id;

ALTER TABLE ONLY gda_ooda_loops ALTER COLUMN id SET DEFAULT nextval('gda_ooda_loops_id_seq'::regclass);

ALTER TABLE ONLY gda_ooda_loops
    ADD CONSTRAINT gda_ooda_loops_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_ooda_loops_target ON gda_ooda_loops USING btree (target);

CREATE INDEX IF NOT EXISTS idx_ooda_loops_timestamp ON gda_ooda_loops USING btree ("timestamp" DESC);
