-- Migration 119: Create gda_decision_memory table.
-- Part of F-026 Step 4b: Migrate orphan GDA table from n8n-envision-postgres-1.
-- Source: \d+ gda_decision_memory on n8n DB (PR #306 PLAN.md Section 4).
-- Includes FK to gda_opportunity_tracker per architect decision Q1.

CREATE TABLE IF NOT EXISTS gda_decision_memory (
    id integer NOT NULL,
    opportunity_id integer,
    decision_type text NOT NULL,
    decision text NOT NULL,
    confidence numeric,
    reasoning text,
    factors jsonb DEFAULT '{}'::jsonb,
    context_snapshot jsonb DEFAULT '{}'::jsonb,
    outcome text,
    outcome_date timestamp with time zone,
    outcome_details jsonb,
    accuracy_score numeric,
    decision_by text DEFAULT 'system'::text,
    reviewed_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS gda_decision_memory_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_decision_memory_id_seq OWNED BY gda_decision_memory.id;

ALTER TABLE ONLY gda_decision_memory ALTER COLUMN id SET DEFAULT nextval('gda_decision_memory_id_seq'::regclass);

ALTER TABLE ONLY gda_decision_memory
    ADD CONSTRAINT gda_decision_memory_pkey PRIMARY KEY (id);

ALTER TABLE ONLY gda_decision_memory
    ADD CONSTRAINT gda_decision_memory_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES gda_opportunity_tracker(id);

CREATE INDEX IF NOT EXISTS idx_decision_created ON gda_decision_memory USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_opp ON gda_decision_memory USING btree (opportunity_id);

CREATE INDEX IF NOT EXISTS idx_decision_outcome ON gda_decision_memory USING btree (outcome);

CREATE INDEX IF NOT EXISTS idx_decision_type ON gda_decision_memory USING btree (decision_type);
