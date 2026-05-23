-- Migration 093: Create gda_compliance_matrices table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_compliance_matrices on n8n DB.

CREATE TABLE IF NOT EXISTS gda_compliance_matrices (
    id integer NOT NULL,
    title text,
    solicitation_number text,
    matrix_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_compliance_matrices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_compliance_matrices_id_seq OWNED BY gda_compliance_matrices.id;

ALTER TABLE ONLY gda_compliance_matrices ALTER COLUMN id SET DEFAULT nextval('gda_compliance_matrices_id_seq'::regclass);

ALTER TABLE ONLY gda_compliance_matrices
    ADD CONSTRAINT gda_compliance_matrices_pkey PRIMARY KEY (id);
