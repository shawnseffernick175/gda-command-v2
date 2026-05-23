-- Migration 104: Create gda_idiq_tracker table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_idiq_tracker on n8n DB.

CREATE TABLE IF NOT EXISTS gda_idiq_tracker (
    id integer NOT NULL,
    contract_number text NOT NULL,
    idiq_name text NOT NULL,
    agency text,
    issuing_office text,
    naics_codes text[],
    contract_ceiling numeric DEFAULT 0,
    period_of_performance_start date,
    period_of_performance_end date,
    gda_position text DEFAULT 'targeting'::text,
    gda_prime_or_sub text DEFAULT 'prime'::text,
    vehicle_type text DEFAULT 'IDIQ'::text,
    set_aside text,
    total_tos_issued integer DEFAULT 0,
    total_to_value numeric DEFAULT 0,
    last_to_date date,
    on_ramp_status text DEFAULT 'none'::text,
    on_ramp_deadline date,
    competitors text[],
    incumbent_primes text[],
    sam_search_keywords text[],
    notes text,
    source_url text,
    last_checked timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT gda_idiq_tracker_gda_position_check CHECK ((gda_position = ANY (ARRAY['holder'::text, 'teaming'::text, 'targeting'::text]))),
    CONSTRAINT gda_idiq_tracker_gda_prime_or_sub_check CHECK ((gda_prime_or_sub = ANY (ARRAY['prime'::text, 'sub'::text, 'either'::text]))),
    CONSTRAINT gda_idiq_tracker_on_ramp_status_check CHECK ((on_ramp_status = ANY (ARRAY['none'::text, 'open'::text, 'closed'::text, 'upcoming'::text]))),
    CONSTRAINT gda_idiq_tracker_vehicle_type_check CHECK ((vehicle_type = ANY (ARRAY['IDIQ'::text, 'BPA'::text, 'GWAC'::text, 'MAC'::text, 'SA-IDIQ'::text])))
);

CREATE SEQUENCE gda_idiq_tracker_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_idiq_tracker_id_seq OWNED BY gda_idiq_tracker.id;

ALTER TABLE ONLY gda_idiq_tracker ALTER COLUMN id SET DEFAULT nextval('gda_idiq_tracker_id_seq'::regclass);

ALTER TABLE ONLY gda_idiq_tracker
    ADD CONSTRAINT gda_idiq_tracker_contract_number_key UNIQUE (contract_number);

ALTER TABLE ONLY gda_idiq_tracker
    ADD CONSTRAINT gda_idiq_tracker_pkey PRIMARY KEY (id);
