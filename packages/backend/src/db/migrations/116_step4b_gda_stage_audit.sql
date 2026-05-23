-- Migration 116: Create gda_stage_audit table.
-- Part of F-026 Step 4b: Migrate orphan GDA table from n8n-envision-postgres-1.
-- Source: \d+ gda_stage_audit on n8n DB (PR #306 PLAN.md Section 4).

CREATE TABLE IF NOT EXISTS gda_stage_audit (
    id integer NOT NULL,
    plan_id integer,
    opportunity text,
    from_stage text,
    to_stage text,
    changed_by text DEFAULT 'user'::text,
    change_reason text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS gda_stage_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_stage_audit_id_seq OWNED BY gda_stage_audit.id;

ALTER TABLE ONLY gda_stage_audit ALTER COLUMN id SET DEFAULT nextval('gda_stage_audit_id_seq'::regclass);

ALTER TABLE ONLY gda_stage_audit
    ADD CONSTRAINT gda_stage_audit_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_audit_created ON gda_stage_audit USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_plan ON gda_stage_audit USING btree (plan_id);
