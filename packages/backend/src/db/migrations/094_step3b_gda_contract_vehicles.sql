-- Migration 094: Create gda_contract_vehicles table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_contract_vehicles on n8n DB.

CREATE TABLE IF NOT EXISTS gda_contract_vehicles (
    id integer NOT NULL,
    vehicle_name text NOT NULL,
    contract_number text,
    idiq_type text DEFAULT 'Multi-Award'::text,
    agency text,
    issuing_office text,
    naics_codes text,
    ceiling_value numeric,
    period_of_performance text,
    pop_start date,
    pop_end date,
    set_aside text,
    gda_position text DEFAULT 'Not Positioned'::text,
    prime_or_sub text DEFAULT 'Unknown'::text,
    teaming_partners text,
    task_orders_won integer DEFAULT 0,
    task_orders_bid integer DEFAULT 0,
    on_ramp_eligible boolean DEFAULT false,
    on_ramp_window text,
    notes text,
    sam_url text,
    govtribe_id text,
    source text DEFAULT 'Manual'::text,
    last_refreshed timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE SEQUENCE gda_contract_vehicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE gda_contract_vehicles_id_seq OWNED BY gda_contract_vehicles.id;

ALTER TABLE ONLY gda_contract_vehicles ALTER COLUMN id SET DEFAULT nextval('gda_contract_vehicles_id_seq'::regclass);

ALTER TABLE ONLY gda_contract_vehicles
    ADD CONSTRAINT gda_contract_vehicles_contract_number_key UNIQUE (contract_number);

ALTER TABLE ONLY gda_contract_vehicles
    ADD CONSTRAINT gda_contract_vehicles_pkey PRIMARY KEY (id);
