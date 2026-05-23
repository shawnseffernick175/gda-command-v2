-- Migration 098: Create gda_dept_market table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_dept_market on n8n DB.

CREATE TABLE IF NOT EXISTS gda_dept_market (
    id integer NOT NULL,
    dept text NOT NULL,
    total_budget_m numeric,
    addressable_m numeric,
    addressable_pct text,
    source text,
    naics_codes text,
    refresh_source text DEFAULT 'GDA.sched.dept-market-refresh'::text,
    last_updated timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_dept_market_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_dept_market_id_seq OWNED BY gda_dept_market.id;

ALTER TABLE ONLY gda_dept_market ALTER COLUMN id SET DEFAULT nextval('gda_dept_market_id_seq'::regclass);

ALTER TABLE ONLY gda_dept_market
    ADD CONSTRAINT gda_dept_market_dept_key UNIQUE (dept);

ALTER TABLE ONLY gda_dept_market
    ADD CONSTRAINT gda_dept_market_pkey PRIMARY KEY (id);
