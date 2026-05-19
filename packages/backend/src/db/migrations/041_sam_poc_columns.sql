-- Migration 041: Add POC columns to sam_opportunities for contact auto-capture
ALTER TABLE sam_opportunities ADD COLUMN IF NOT EXISTS poc_name TEXT;
ALTER TABLE sam_opportunities ADD COLUMN IF NOT EXISTS poc_email TEXT;
ALTER TABLE sam_opportunities ADD COLUMN IF NOT EXISTS poc_phone TEXT;
ALTER TABLE sam_opportunities ADD COLUMN IF NOT EXISTS poc_title TEXT;
