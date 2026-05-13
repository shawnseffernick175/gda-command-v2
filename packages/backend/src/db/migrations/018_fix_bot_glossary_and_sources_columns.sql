-- Migration 018: Add missing columns to bot_glossary and bot_sources
-- Fixes Devin Review issues: frontend expects category/related_entities on glossary
-- and type/endpoint/entities_served/status/refresh_frequency on sources
-- ============================================================================

-- bot_glossary: add category and related_entities
ALTER TABLE bot_glossary ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE bot_glossary ADD COLUMN IF NOT EXISTS related_entities TEXT[] DEFAULT '{}';

-- bot_sources: add type, endpoint, entities_served, status, refresh_frequency
ALTER TABLE bot_sources ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'api';
ALTER TABLE bot_sources ADD COLUMN IF NOT EXISTS endpoint TEXT;
ALTER TABLE bot_sources ADD COLUMN IF NOT EXISTS entities_served TEXT[] DEFAULT '{}';
ALTER TABLE bot_sources ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE bot_sources ADD COLUMN IF NOT EXISTS refresh_frequency TEXT DEFAULT 'manual';

-- ============================================================================
-- Populate glossary categories
-- ============================================================================
UPDATE bot_glossary SET category = 'metrics', related_entities = ARRAY['Capture Plans', 'Ops Tracker'] WHERE acronym = 'P(Win)';
UPDATE bot_glossary SET category = 'services', related_entities = ARRAY['Company Profile', 'Capture Plans'] WHERE acronym = 'SETA';
UPDATE bot_glossary SET category = 'technology', related_entities = ARRAY['Company Profile', 'Intel Hub'] WHERE acronym = 'C5ISR';
UPDATE bot_glossary SET category = 'set-asides', related_entities = ARRAY['Ops Tracker', 'Company Profile'] WHERE acronym = 'SDVOSB';
UPDATE bot_glossary SET category = 'solicitation', related_entities = ARRAY['Fast Track', 'Ops Tracker'] WHERE acronym = 'BAA';
UPDATE bot_glossary SET category = 'programs', related_entities = ARRAY['Fast Track', 'Ops Tracker'] WHERE acronym = 'SBIR';
UPDATE bot_glossary SET category = 'systems', related_entities = ARRAY['CPARS Builder', 'Capture Plans'] WHERE acronym = 'CPARS';
UPDATE bot_glossary SET category = 'systems', related_entities = ARRAY['FPDS Monitor', 'Intel Hub'] WHERE acronym = 'FPDS';
UPDATE bot_glossary SET category = 'contracts', related_entities = ARRAY['Ops Tracker', 'Pipeline'] WHERE acronym = 'IDIQ';
UPDATE bot_glossary SET category = 'classification', related_entities = ARRAY['Ops Tracker', 'Company Profile'] WHERE acronym = 'NAICS';
UPDATE bot_glossary SET category = 'solicitation', related_entities = ARRAY['Ops Tracker', 'Capture Plans'] WHERE acronym = 'RFP';
UPDATE bot_glossary SET category = 'solicitation', related_entities = ARRAY['Fast Track', 'Ops Tracker'] WHERE acronym = 'RFI';
UPDATE bot_glossary SET category = 'solicitation', related_entities = ARRAY['Fast Track', 'Ops Tracker'] WHERE acronym = 'SS';
UPDATE bot_glossary SET category = 'regulation', related_entities = ARRAY['Compliance', 'Doctrine'] WHERE acronym = 'FAR';
UPDATE bot_glossary SET category = 'regulation', related_entities = ARRAY['Compliance', 'Doctrine'] WHERE acronym = 'DFARS';
UPDATE bot_glossary SET category = 'frameworks', related_entities = ARRAY['Fast Track', 'Intel Hub'] WHERE acronym = 'OODA';
UPDATE bot_glossary SET category = 'contracts', related_entities = ARRAY['Ops Tracker', 'Pipeline'] WHERE acronym = 'GWAC';
UPDATE bot_glossary SET category = 'agencies', related_entities = ARRAY['Ops Tracker', 'Company Profile'] WHERE acronym = 'GSA';
UPDATE bot_glossary SET category = 'agencies', related_entities = ARRAY['Ops Tracker', 'Company Profile'] WHERE acronym = 'SBA';
UPDATE bot_glossary SET category = 'systems', related_entities = ARRAY['CPARS Builder', 'Capture Plans'] WHERE acronym = 'PPIRS';
UPDATE bot_glossary SET category = 'frameworks', related_entities = ARRAY['Compliance', 'Doctrine'] WHERE acronym = 'RMF';
UPDATE bot_glossary SET category = 'frameworks', related_entities = ARRAY['Compliance', 'Doctrine'] WHERE acronym = 'CMMC';
UPDATE bot_glossary SET category = 'technology', related_entities = ARRAY['Knowledge Base', 'Book of Truths'] WHERE acronym = 'RAG';

-- ============================================================================
-- Populate source metadata
-- ============================================================================
UPDATE bot_sources SET type = 'api', endpoint = 'https://api.sam.gov/opportunities/v2/search', entities_served = ARRAY['Ops Tracker', 'SAM Monitor'], status = 'active', refresh_frequency = 'every 6 hours' WHERE name = 'SAM.gov';
UPDATE bot_sources SET type = 'api', endpoint = 'https://api.govtribe.com/opportunity', entities_served = ARRAY['Ops Tracker', 'Intel Hub'], status = 'active', refresh_frequency = 'every 6 hours' WHERE name = 'GovTribe';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.fpds.gov/ezsearch', entities_served = ARRAY['FPDS Monitor', 'Intel Hub'], status = 'active', refresh_frequency = 'daily' WHERE name = 'FPDS.gov';
UPDATE bot_sources SET type = 'api', endpoint = 'https://api.usaspending.gov/api/v2', entities_served = ARRAY['Pipeline', 'Charts'], status = 'active', refresh_frequency = 'daily' WHERE name = 'USAspending.gov';
UPDATE bot_sources SET type = 'api', endpoint = 'https://iq.govwin.com/neo/api/v1', entities_served = ARRAY['Ops Tracker', 'Intel Hub'], status = 'planned', refresh_frequency = 'every 6 hours' WHERE name = 'GovWin IQ';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.sbir.gov/api', entities_served = ARRAY['Fast Track', 'Ops Tracker'], status = 'active', refresh_frequency = 'weekly' WHERE name = 'SBIR.gov';
UPDATE bot_sources SET type = 'webhook', endpoint = 'https://n8n.csr-llc.tech/webhook', entities_served = ARRAY['Ops Tracker', 'Intel Hub', 'Agents'], status = 'active', refresh_frequency = 'real-time' WHERE name = 'n8n Workflows';
UPDATE bot_sources SET type = 'manual', endpoint = NULL, entities_served = ARRAY['Intel Hub', 'Morning Briefing'], status = 'active', refresh_frequency = 'daily' WHERE name = 'Defense News';
UPDATE bot_sources SET type = 'manual', endpoint = NULL, entities_served = ARRAY['Intel Hub', 'Morning Briefing'], status = 'active', refresh_frequency = 'daily' WHERE name = 'Federal News Network';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.bgov.com/api', entities_served = ARRAY['Intel Hub', 'Charts'], status = 'planned', refresh_frequency = 'daily' WHERE name = 'Bloomberg Government';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.afwerx.af.mil', entities_served = ARRAY['Fast Track'], status = 'active', refresh_frequency = 'weekly' WHERE name = 'AFWERX';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.diu.mil', entities_served = ARRAY['Fast Track'], status = 'active', refresh_frequency = 'weekly' WHERE name = 'DIU';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.darpa.mil', entities_served = ARRAY['Fast Track'], status = 'active', refresh_frequency = 'weekly' WHERE name = 'DARPA';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.army.mil/xtech', entities_served = ARRAY['Fast Track'], status = 'active', refresh_frequency = 'weekly' WHERE name = 'Army xTech';
UPDATE bot_sources SET type = 'api', endpoint = 'https://www.secnav.navy.mil/agility', entities_served = ARRAY['Fast Track'], status = 'active', refresh_frequency = 'weekly' WHERE name = 'NavalX';
