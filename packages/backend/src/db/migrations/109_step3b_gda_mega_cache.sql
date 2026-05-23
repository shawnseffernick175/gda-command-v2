-- Migration 109: Create gda_mega_cache table.
-- Part of F-026 Step 3b: ADOPT N8N-ONLY shadow table from n8n-envision-postgres-1.
-- Source: pg_dump --schema-only --table=gda_mega_cache on n8n DB.

CREATE TABLE IF NOT EXISTS gda_mega_cache (
    id integer NOT NULL,
    payload text NOT NULL,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY gda_mega_cache
    ADD CONSTRAINT gda_mega_cache_pkey PRIMARY KEY (id);
