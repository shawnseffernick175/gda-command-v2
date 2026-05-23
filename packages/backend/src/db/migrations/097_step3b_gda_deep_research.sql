-- Migration 097: Create gda_deep_research table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_deep_research on n8n DB.

CREATE TABLE IF NOT EXISTS gda_deep_research (
    id integer NOT NULL,
    target text NOT NULL,
    research_type text NOT NULL,
    opp_id integer,
    report jsonb NOT NULL,
    executive_summary text,
    confidence text DEFAULT 'MEDIUM'::text,
    sources_used integer DEFAULT 0,
    follow_up_queries jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_deep_research_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_deep_research_id_seq OWNED BY gda_deep_research.id;

ALTER TABLE ONLY gda_deep_research ALTER COLUMN id SET DEFAULT nextval('gda_deep_research_id_seq'::regclass);

ALTER TABLE ONLY gda_deep_research
    ADD CONSTRAINT gda_deep_research_pkey PRIMARY KEY (id);
