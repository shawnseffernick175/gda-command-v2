-- Migration 115: Create gda_pattern_library table.
-- Part of F-026 Step 4b: Migrate orphan GDA table from n8n-envision-postgres-1.
-- Source: \d+ gda_pattern_library on n8n DB (PR #306 PLAN.md Section 4).

CREATE TABLE IF NOT EXISTS gda_pattern_library (
    id integer NOT NULL,
    pattern_type text NOT NULL,
    pattern_name text NOT NULL,
    description text,
    conditions jsonb NOT NULL,
    historical_outcome jsonb NOT NULL,
    sample_size integer DEFAULT 0,
    confidence numeric DEFAULT 0,
    last_validated timestamp with time zone,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS gda_pattern_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_pattern_library_id_seq OWNED BY gda_pattern_library.id;

ALTER TABLE ONLY gda_pattern_library ALTER COLUMN id SET DEFAULT nextval('gda_pattern_library_id_seq'::regclass);

ALTER TABLE ONLY gda_pattern_library
    ADD CONSTRAINT gda_pattern_library_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_pattern_active ON gda_pattern_library USING btree (active);

CREATE INDEX IF NOT EXISTS idx_pattern_type ON gda_pattern_library USING btree (pattern_type);
