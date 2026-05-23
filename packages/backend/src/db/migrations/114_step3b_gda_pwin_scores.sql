-- Migration 114: Create gda_pwin_scores table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_pwin_scores on n8n DB.

CREATE TABLE IF NOT EXISTS gda_pwin_scores (
    id integer NOT NULL,
    opportunity text NOT NULL,
    agency text,
    pwin integer NOT NULL,
    weighted_score numeric(4,2),
    recommendation character varying(30),
    scores jsonb DEFAULT '{}'::jsonb,
    breakdown jsonb DEFAULT '[]'::jsonb,
    gates jsonb DEFAULT '{}'::jsonb,
    notes text,
    assessed_by text,
    pursuit_id text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_pwin_scores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_pwin_scores_id_seq OWNED BY gda_pwin_scores.id;

ALTER TABLE ONLY gda_pwin_scores ALTER COLUMN id SET DEFAULT nextval('gda_pwin_scores_id_seq'::regclass);

ALTER TABLE ONLY gda_pwin_scores
    ADD CONSTRAINT gda_pwin_scores_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_pwin_date ON gda_pwin_scores USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pwin_opp ON gda_pwin_scores USING btree (opportunity);
