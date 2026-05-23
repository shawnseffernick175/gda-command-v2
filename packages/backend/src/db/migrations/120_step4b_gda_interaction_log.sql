-- Migration 120: Create gda_interaction_log table.
-- Part of F-026 Step 4b: Migrate orphan GDA table from n8n-envision-postgres-1.
-- Source: \d+ gda_interaction_log on n8n DB (PR #306 PLAN.md Section 4).

CREATE TABLE IF NOT EXISTS gda_interaction_log (
    id integer NOT NULL,
    user_id text DEFAULT 'shawn'::text,
    interaction_type text NOT NULL,
    entity_type text,
    entity_id integer,
    action text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb,
    result jsonb DEFAULT '{}'::jsonb,
    session_id text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS gda_interaction_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_interaction_log_id_seq OWNED BY gda_interaction_log.id;

ALTER TABLE ONLY gda_interaction_log ALTER COLUMN id SET DEFAULT nextval('gda_interaction_log_id_seq'::regclass);

ALTER TABLE ONLY gda_interaction_log
    ADD CONSTRAINT gda_interaction_log_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_interact_created ON gda_interaction_log USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interact_entity ON gda_interaction_log USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_interact_type ON gda_interaction_log USING btree (interaction_type);
