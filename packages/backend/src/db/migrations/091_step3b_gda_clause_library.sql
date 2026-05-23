-- Migration 091: Create gda_clause_library table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_clause_library on n8n DB.

CREATE TABLE IF NOT EXISTS gda_clause_library (
    id integer NOT NULL,
    clause_number character varying(50),
    title character varying(500),
    category character varying(100),
    standard_response text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

CREATE SEQUENCE gda_clause_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_clause_library_id_seq OWNED BY gda_clause_library.id;

ALTER TABLE ONLY gda_clause_library ALTER COLUMN id SET DEFAULT nextval('gda_clause_library_id_seq'::regclass);

ALTER TABLE ONLY gda_clause_library
    ADD CONSTRAINT gda_clause_library_clause_number_key UNIQUE (clause_number);

ALTER TABLE ONLY gda_clause_library
    ADD CONSTRAINT gda_clause_library_pkey PRIMARY KEY (id);
