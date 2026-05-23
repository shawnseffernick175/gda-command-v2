-- Migration 087: Create gda_aop_tracker table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_aop_tracker on n8n DB.

CREATE TABLE IF NOT EXISTS gda_aop_tracker (
    id integer NOT NULL,
    ou text DEFAULT 'OU3'::text NOT NULL,
    fiscal_year text NOT NULL,
    quarter text NOT NULL,
    revenue_target numeric(12,2) DEFAULT 0,
    revenue_actual numeric(12,2) DEFAULT 0,
    revenue_forecast numeric(12,2) DEFAULT 0,
    ebitda_target_pct numeric(5,2) DEFAULT 0,
    ebitda_actual_pct numeric(5,2) DEFAULT 0,
    book_to_bill_target numeric(5,2) DEFAULT 0,
    book_to_bill_actual numeric(5,2) DEFAULT 0,
    pipeline_raw numeric(12,2) DEFAULT 0,
    pipeline_qualified numeric(12,2) DEFAULT 0,
    pipeline_weighted numeric(12,2) DEFAULT 0,
    must_win_count integer DEFAULT 0,
    must_win_value numeric(12,2) DEFAULT 0,
    new_biz_bookings numeric(12,2) DEFAULT 0,
    recompete_bookings numeric(12,2) DEFAULT 0,
    headcount_target integer DEFAULT 0,
    headcount_actual integer DEFAULT 0,
    notes text,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_aop_tracker_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_aop_tracker_id_seq OWNED BY gda_aop_tracker.id;

ALTER TABLE ONLY gda_aop_tracker ALTER COLUMN id SET DEFAULT nextval('gda_aop_tracker_id_seq'::regclass);

ALTER TABLE ONLY gda_aop_tracker
    ADD CONSTRAINT gda_aop_tracker_ou_fiscal_year_quarter_key UNIQUE (ou, fiscal_year, quarter);

ALTER TABLE ONLY gda_aop_tracker
    ADD CONSTRAINT gda_aop_tracker_pkey PRIMARY KEY (id);
