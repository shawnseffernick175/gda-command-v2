-- Migration 088: Create gda_approval_queue table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_approval_queue on n8n DB.

CREATE TABLE IF NOT EXISTS gda_approval_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    lane text DEFAULT 'unknown'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by text,
    requested_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    approved_by text,
    meta jsonb
);

ALTER TABLE ONLY gda_approval_queue
    ADD CONSTRAINT gda_approval_queue_pkey PRIMARY KEY (id);
