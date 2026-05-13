-- Migration 017: Book of Truths tables + Financial KPI seed data
-- ============================================================================

-- Book of Truths: entities (5 categories), glossary, sources
CREATE TABLE IF NOT EXISTS bot_entities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  module TEXT NOT NULL,
  rules TEXT[] DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS bot_glossary (
  id SERIAL PRIMARY KEY,
  term TEXT NOT NULL,
  acronym TEXT,
  definition TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);

-- ============================================================================
-- Category 1: FAQs & Troubleshooting
-- ============================================================================
INSERT INTO bot_entities (name, description, category, module, rules) VALUES
('How do I add a new opportunity?', 'Use Fast Track for pre-RFP signals or navigate to Ops Tracker to view live opportunities from SAM.gov/GovTribe feeds', 'faq', 'ops-tracker', ARRAY['Fast Track for emerging signals pre-RFP', 'Ops Tracker auto-pulls from n8n feeds', 'Promoted Fast Track items appear in Ops Tracker automatically']),
('What does the NAICS size filter mean?', 'Each NAICS code has a size standard (revenue or headcount). Envision is Small for employee-based NAICS (41 employees) and Large for revenue-based NAICS ($382M revenue)', 'faq', 'ops-tracker', ARRAY['Revenue-based NAICS = Large Business for Envision', 'Employee-based NAICS = Small Business for Envision', 'Filter shows Small/Large/Unclassified categories']),
('Why does a page show 401 Unauthorized?', 'Your JWT token may have expired. Log out and log back in. If persistent, check that AUTH_REQUIRED=true in backend .env', 'faq', 'system', ARRAY['JWT tokens expire after the configured TTL', 'Refresh tokens auto-renew if not expired', 'Clear localStorage and re-login as last resort']),
('How do I run an AI agent?', 'Go to the Agent Command Center. Select an agent (Morning Commander, Opportunity Watch, etc.) and click Run. High-impact actions go to the Approval Queue first.', 'faq', 'agents', ARRAY['Requires OPENAI_API_KEY or ANTHROPIC_API_KEY', 'Agent runs are tracked in agent_runs table', 'Check approval queue for pending actions']),
('How do I export a Color Review report?', 'Navigate to Color Review, select the review, and click Export Report. It generates a downloadable HTML report with all section ratings.', 'faq', 'color-review', ARRAY['Export generates HTML format', 'Includes all color team ratings', 'Can be shared offline with stakeholders']),
('What is the source badge on opportunities?', 'Live API = data from n8n workflows (GovTribe, SAM.gov, GDA Tracker). Live DB = local database fallback when n8n is unreachable.', 'faq', 'ops-tracker', ARRAY['Green chip = Live API (n8n)', 'Blue chip = Live DB (postgres fallback)', 'n8n returns ~291 real opportunities']),
('How do I classify a competitor?', 'Go to Company Intelligence, find the competitor, use the dropdown to set Team (green), Threat (red), or Neutral (gray). Click AI Analyze for automated assessment.', 'faq', 'company-intel', ARRAY['Team = teaming partner', 'Threat = direct competitor', 'Neutral = not yet classified'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Category 2: Policies & Procedures
-- ============================================================================
INSERT INTO bot_entities (name, description, category, module, rules) VALUES
('Shipley Capture Lifecycle', 'All opportunities follow the Shipley BD lifecycle: Long Range → Opportunity Assessment → Capture Planning → Proposal Prep → Proposal → Post-Submit', 'policy', 'pipeline', ARRAY['Gate reviews required at each stage transition', 'Bid/No-Bid decision at Opportunity Assessment', 'Color reviews during Proposal stage', 'All gate decisions logged in Audit Log']),
('Bid/No-Bid Decision Process', 'Every qualified opportunity requires a formal bid/no-bid decision. Goes through Approvals queue. Factors: strategic fit, P(Win), resource availability, competitive landscape.', 'policy', 'approvals', ARRAY['Decision made at Opportunity Assessment stage', 'Requires capture manager approval', 'No-bid decisions routed to archive', 'Decision rationale documented']),
('Risk Management Policy', 'All identified risks must be logged in the Risk Register with If-This-Then-That triggers, likelihood/impact scores, and mitigation strategies. Critical risks (score 15+) reviewed weekly.', 'policy', 'risk-register', ARRAY['5x5 matrix for likelihood and impact', 'Critical risks reviewed weekly', 'All risks must have assigned owners', 'Mitigation strategies required for High and Critical']),
('AI Agent Governance', 'All AI agents operate in read-only or dry-run mode by default. High-impact actions (status changes, data writes) require human approval through the Approval Queue.', 'policy', 'agents', ARRAY['Safety lane: read-only for analysis, dry-run for proposed changes', 'Human-in-the-loop for all write operations', 'Agent runs audited in agent_runs table', 'Dual LLM: GPT-4o for scoring, Claude for deep analysis']),
('Data Source Priority', 'n8n live feeds are the primary data source. Local database is the fallback. Source badges indicate origin. Never manually edit live-feed data.', 'policy', 'system', ARRAY['n8n webhook = primary source of truth for opportunities', 'Local DB = fallback and user-generated data', 'Source badge must always be accurate', 'Do not manually modify n8n-sourced records']),
('Compliance Review Process', 'All proposals must complete compliance review against extracted requirements before submission. RFP Shredder extracts requirements, Compliance page tracks status.', 'policy', 'compliance', ARRAY['RFP must be shredded before compliance review', 'Each requirement marked Compliant, Partial, or Non-Compliant', 'Non-compliant items require mitigation plan', 'Final compliance matrix included in proposal'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Category 3: Product/Service Data (Envision)
-- ============================================================================
INSERT INTO bot_entities (name, description, category, module, rules) VALUES
('Envision Innovative Solutions', 'Defense IT and cybersecurity company. SDVOSB. $382M revenue, 41 employees. Core focus: C5ISR, SETA, systems engineering, cyber operations.', 'product', 'company-profile', ARRAY['Revenue: $382M (Large for revenue-based NAICS)', 'Employees: 41 (Small for employee-based NAICS)', 'Set-asides: SDVOSB, Small Business', 'CAGE Code and UEI registered in SAM.gov']),
('Core NAICS Codes', 'Envision primary NAICS: 541511, 541512, 541519, 541330, 541611, 541690, 541715, 518210, 561611', 'product', 'company-profile', ARRAY['541511 — Custom Computer Programming', '541512 — Computer Systems Design', '541519 — Other Computer Related Services', '541330 — Engineering Services', '541611 — Admin Management Consulting', '541715 — R&D in Physical/Engineering/Life Sciences', '518210 — Data Processing and Hosting']),
('Core Competencies', 'Systems Engineering, Cybersecurity (RMF/CMMC), C5ISR Integration, SETA Services, Cloud Migration (AWS/Azure GovCloud), Software Development, Data Analytics', 'product', 'company-profile', ARRAY['Cleared workforce available', 'Army and DoD past performance', 'Active security clearances across team', 'AWS GovCloud and Azure Gov certified']),
('Key Competitors', 'Leidos, SAIC, Booz Allen Hamilton, CACI, ManTech, L3Harris, Parsons, Peraton', 'product', 'company-intel', ARRAY['Leidos — largest defense IT competitor, incumbent on many SETA contracts', 'SAIC — strong in C5ISR and Army programs', 'Booz Allen — dominant in analytics and consulting', 'CACI — growing cyber and intel portfolio', 'ManTech — strong in DoD mission IT']),
('Contract Vehicles', 'GSA Schedule, Army ITES-3S, DHS EAGLE II, SEWP V, CIO-SP3', 'product', 'company-profile', ARRAY['GSA Schedule provides broad access', 'Army ITES-3S for Army IT services', 'SEWP V for IT products and solutions', 'CIO-SP3 for health and other civilian IT'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Category 4: Goal-Oriented Guidelines (90-Day Blueprint)
-- ============================================================================
INSERT INTO bot_entities (name, description, category, module, rules) VALUES
('Sprint 1 Goals (Complete)', 'Auto-run Capture Coach, Color Review Export, Company Intelligence DB, Proposal Center consolidation, Multi-source Gov Feed auto-pull', 'goal', 'roadmap', ARRAY['Auto Capture Coach — fire-and-forget on new opps ✓', 'Color Review Export — HTML report download ✓', 'Company Intel — Team/Threat/Neutral classification ✓', 'Proposal Center — consolidated tabs ✓', 'Gov Sources — SAM/FPDS/GovWin/GovTribe feeds ✓']),
('Sprint 2 Goals (Current)', 'Fix all 401 auth bugs, connect all n8n workflows, replace mock data with real data, Book of Truths population, Financial KPIs, User Manual rewrite', 'goal', 'roadmap', ARRAY['Auth fixes across 11 pages ✓', 'n8n integration (291 real opportunities) ✓', 'Book of Truths with 5-category structure', 'Financial KPIs from real data', 'User Manual with Getting Started guide']),
('Sprint 3 Goals (Next)', 'Fast Track redesign for pre-RFP emerging tech discovery, live SAM.gov API direct feed, full E2E testing of all 35 pages, production hardening', 'goal', 'roadmap', ARRAY['Fast Track — innovation factories, academia, BAAs', 'SAM.gov direct API integration', 'E2E test coverage for every page', 'Production performance optimization']),
('90-Day Target', 'Full Operational Capability — every page works, real data flows through all feeds, AI agents produce actionable intelligence, zero mock data in production', 'goal', 'roadmap', ARRAY['All 35+ pages functional', 'Real opportunity data from all gov sources', 'AI agents running daily analysis', 'User Manual complete with pictures/videos', 'Zero environmental/mock data remaining'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Category 5: Curated Knowledge Base (RAG Foundation)
-- ============================================================================
INSERT INTO bot_entities (name, description, category, module, rules) VALUES
('Opportunity Analysis Framework', 'Every opportunity evaluated on: strategic fit (does it match our core competencies?), competitive position (who is the incumbent?), win probability, resource requirements, and past performance relevance', 'knowledge', 'ops-tracker', ARRAY['Score 80+ = must pursue', 'Score 60-79 = evaluate resources', 'Score below 60 = fast-track no-bid unless strategic', 'Always consider teaming to strengthen weak areas']),
('OODA Decision Loop', 'Observe (gather signals) → Orient (analyze context, competitive landscape) → Decide (go/no-go, teaming strategy) → Act (submit, position, monitor). Applied to every Fast Track signal.', 'knowledge', 'fast-track', ARRAY['Observe: What is the government buying?', 'Orient: How does this fit our capabilities?', 'Decide: Bid, team, or watch?', 'Act: Execute capture strategy']),
('SBA Size Standards', 'Small Business Administration defines size standards per NAICS code. Revenue-based thresholds: $19.5M-$47M depending on NAICS. Employee-based thresholds: 250-1500 employees. Envision must classify correctly for each bid.', 'knowledge', 'ops-tracker', ARRAY['Revenue-based: compare Envision $382M to threshold', 'Employee-based: compare Envision 41 to threshold', 'Small status enables set-aside access', 'Misclassification can result in SBA protest']),
('Color Review Methodology', 'Shipley color teams provide structured proposal reviews: Blue (requirements fit), Pink (outline/storyboard), Red (technical accuracy), Gold (cost/price), White (final compliance check), Black Hat (competitor analysis)', 'knowledge', 'color-review', ARRAY['Blue Team: Does our solution address all requirements?', 'Pink Team: Is the outline logical and complete?', 'Red Team: Is the technical approach sound?', 'Gold Team: Is our pricing competitive?', 'White Team: Is the document compliant and error-free?']),
('Government Procurement Lifecycle', 'RFI/Sources Sought → Draft RFP → Final RFP → Q&A Period → Proposal Due → Evaluation → Award → Protest Period → Contract Start. GDA Command tracks from pre-RFI through post-award.', 'knowledge', 'pipeline', ARRAY['Pre-RFI signals tracked in Fast Track', 'Active solicitations in Ops Tracker', 'Capture strategy in Capture Plans', 'Proposal development in Proposal Center', 'Award tracking in Pipeline'])
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Glossary (acronyms and terms)
-- ============================================================================
INSERT INTO bot_glossary (term, acronym, definition) VALUES
('Probability of Win', 'P(Win)', 'Estimated likelihood of winning a contract opportunity, scored 0-100%'),
('Systems Engineering Technical Assistance', 'SETA', 'Professional services supporting government acquisition programs with engineering expertise'),
('Command, Control, Communications, Computers, Cyber, Intelligence, Surveillance, Reconnaissance', 'C5ISR', 'Integrated military systems for battlefield awareness and decision-making'),
('Service-Disabled Veteran-Owned Small Business', 'SDVOSB', 'SBA set-aside category for businesses owned by service-disabled veterans'),
('Broad Agency Announcement', 'BAA', 'Government solicitation for basic and applied research proposals, often pre-RFP'),
('Small Business Innovation Research', 'SBIR', 'Federal program funding R&D at small businesses for government applications'),
('Contractor Performance Assessment Reporting System', 'CPARS', 'Government system for recording contractor past performance evaluations'),
('Federal Procurement Data System', 'FPDS', 'Central repository for federal contract award data'),
('Indefinite Delivery/Indefinite Quantity', 'IDIQ', 'Contract type providing an indefinite quantity of services over a fixed period'),
('North American Industry Classification System', 'NAICS', 'Standard classification of business establishments by type of economic activity'),
('Request for Proposal', 'RFP', 'Government solicitation requesting formal proposals from contractors'),
('Request for Information', 'RFI', 'Pre-solicitation request for industry feedback, not a formal bid request'),
('Sources Sought', 'SS', 'Government notice seeking information about potential vendors before formal solicitation'),
('Federal Acquisition Regulation', 'FAR', 'Principal set of rules governing federal procurement'),
('Defense Federal Acquisition Regulation Supplement', 'DFARS', 'DoD-specific supplement to FAR with additional defense procurement rules'),
('Observe Orient Decide Act', 'OODA', 'Decision-making loop framework used in Fast Track opportunity analysis'),
('Government-Wide Acquisition Contract', 'GWAC', 'Pre-competed contract vehicle available to all federal agencies'),
('General Services Administration', 'GSA', 'Federal agency managing government procurement and property'),
('Small Business Administration', 'SBA', 'Federal agency supporting small business development and set-aside programs'),
('Past Performance Information Retrieval System', 'PPIRS', 'Central repository for past performance evaluations across government'),
('Risk Management Framework', 'RMF', 'NIST framework for integrating security and risk management into system development'),
('Cybersecurity Maturity Model Certification', 'CMMC', 'DoD framework assessing contractor cybersecurity practices'),
('Retrieval-Augmented Generation', 'RAG', 'AI technique combining retrieval of relevant documents with language model generation')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Sources
-- ============================================================================
INSERT INTO bot_sources (name, description) VALUES
('SAM.gov', 'Official government system for contract opportunities, entity registration, and exclusions'),
('GovTribe', 'Commercial platform for government contract intelligence and analytics'),
('FPDS.gov', 'Federal Procurement Data System — historical contract award data'),
('USAspending.gov', 'Official source for federal spending data and award information'),
('GovWin IQ', 'Deltek platform for government opportunity forecasts and competitive intelligence'),
('SBIR.gov', 'Official portal for Small Business Innovation Research opportunities'),
('n8n Workflows', 'Internal automation platform executing GDA Command data pipelines at n8n.csr-llc.tech'),
('Defense News', 'Trade publication covering defense industry news and contract awards'),
('Federal News Network', 'Media outlet covering federal government operations and contracting'),
('Bloomberg Government', 'Analytics platform for government contracting data and analysis'),
('AFWERX', 'Air Force innovation factory for technology transition and SBIR/STTR'),
('DIU', 'Defense Innovation Unit — accelerates adoption of commercial technology for national security'),
('DARPA', 'Defense Advanced Research Projects Agency — funds breakthrough technologies'),
('Army xTech', 'Army innovation program connecting startups and small businesses with Army problems'),
('NavalX', 'Navy innovation accelerator connecting naval problems with commercial solutions')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Financial KPIs (schema: id, label, category, value, target, unit, period, trend)
-- ============================================================================
INSERT INTO financial_kpis (id, label, category, value, target, unit, period, trend) VALUES
('fin-001', 'Annual Revenue', 'revenue', 382000000, 400000000, '$', 'FY2026', 'up'),
('fin-002', 'Pipeline Value', 'pipeline', 2303223583, 2500000000, '$', 'FY2026', 'up'),
('fin-003', 'Win Rate', 'performance', 34.5, 40, '%', 'FY2026', 'up'),
('fin-004', 'Avg Contract Value', 'revenue', 12400000, 15000000, '$', 'FY2026', 'up'),
('fin-005', 'Active Contracts', 'portfolio', 28, 35, 'count', 'FY2026', 'up'),
('fin-006', 'Backlog', 'revenue', 347000000, 400000000, '$', 'FY2026', 'up'),
('fin-007', 'Avg P(Win)', 'pipeline', 42.3, 50, '%', 'FY2026', 'up'),
('fin-008', 'Proposals Submitted', 'pipeline', 15, 20, 'count', 'FY2026-Q2', 'up'),
('fin-009', 'Employee Count', 'company', 41, 50, 'count', 'FY2026', 'up'),
('fin-010', 'Revenue Per Employee', 'efficiency', 9317073, 10000000, '$', 'FY2026', 'up')
ON CONFLICT (id) DO NOTHING;
