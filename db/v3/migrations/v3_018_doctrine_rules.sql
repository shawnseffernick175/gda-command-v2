-- V3 Migration 017: Doctrine Rules Engine (F-303)
-- Creates tables for the 8 Doctrine Principles, 6 Strategic Exclusions,
-- rules config, and doctrine evaluations.

BEGIN;

-- 1. Doctrine Principles (8 CEO-authored principles scored 1-5)
CREATE TABLE IF NOT EXISTS doctrine_principles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_form TEXT NOT NULL,
  long_form TEXT NOT NULL,
  evaluation_prompt TEXT NOT NULL,
  display_order INT NOT NULL
);

-- 2. Doctrine Exclusions (6 hard-block rules)
CREATE TABLE IF NOT EXISTS doctrine_exclusions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_logic_prompt TEXT NOT NULL,
  applies_to_ous TEXT[] DEFAULT ARRAY['gda','envision','riverstone','pds'],
  is_hard_block BOOLEAN DEFAULT TRUE,
  override_requires TEXT
);

-- 3. Doctrine Rules Config (key-value for margin floor, evidence rules, must-win list)
CREATE TABLE IF NOT EXISTS doctrine_rules_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Doctrine Evaluations (scored results per entity)
CREATE TABLE IF NOT EXISTS doctrine_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind TEXT NOT NULL,
  entity_id UUID NOT NULL,
  agent_run_id UUID,
  principle_scores JSONB NOT NULL,
  alignment_total INT NOT NULL,
  exclusion_triggers JSONB,
  margin_check JSONB,
  evidence_grades JSONB,
  recommendations JSONB,
  evaluated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctrine_eval_entity
  ON doctrine_evaluations(entity_kind, entity_id, evaluated_at DESC);

-- 5. Agent Decisions (audit log for overrides)
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID,
  kind TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_refs JSONB,
  decided_by TEXT NOT NULL,
  decided_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_decisions_opp_kind
  ON agent_decisions(opportunity_id, kind, decided_at DESC);

-- ============================================================
-- SEED: 8 Doctrine Principles
-- ============================================================

INSERT INTO doctrine_principles (id, name, short_form, long_form, evaluation_prompt, display_order) VALUES
('alignment', 'Alignment', 'Is it enterprise-aligned?',
 'Doctrine→Strategy→Org→Systems→Brand→Activation→Market→Customer. Misalignment at any layer erodes margin. Does this pursuit serve a defined OU lane and the GDA enterprise direction?',
 'Evaluate whether this opportunity aligns with GDA enterprise strategy and Envision (OU-I) defined lanes. Consider: Does the scope match Envision focus areas (logistics, sustainment, training, systems engineering, field services, C5ISR)? Is it consistent with the "Agile Integrator" positioning? Does it serve the Enable pillar? Score 1 if completely misaligned, 5 if perfectly in-lane. Cite specific evidence from the opportunity description, NAICS codes, and customer alignment.',
 1),
('ethics_always', 'Ethics Always', 'Is it ethical?',
 'Integrity is the primary risk control. Zero gray zones. Are there integrity, regulatory, or representation risks?',
 'Evaluate whether this opportunity presents any integrity, regulatory, or representation risks. Consider: Are there OCI (Organizational Conflict of Interest) concerns? Are there compliance risks with FAR/DFARS? Would pursuing this require misrepresenting capabilities or certifications? Is the customer relationship clean? Score 1 if serious ethical concerns exist, 5 if no ethical risks identified. Cite specific regulatory frameworks or risk indicators.',
 2),
('teamwork', 'Teamwork', 'Does it require silo behavior?',
 'Cross-OU collaboration. No hero culture. Shared accountability. Does this leverage cross-OU integration where appropriate (Digital-to-Dirt)?',
 'Evaluate whether this opportunity leverages cross-OU integration where appropriate. Consider: Does the scope span multiple domains where Riverstone (cyber/SIGINT) or PD Systems (training/XR) would strengthen the bid? Is there a teaming opportunity that enhances win probability? Would pursuing solo create hero-culture risk? Score 1 if it requires inappropriate silo behavior, 5 if teamwork is properly leveraged or not needed. Cite teaming considerations and partner capabilities.',
 3),
('data_first', 'Data First, Then Debate', 'Is it fact-based?',
 'Facts precede opinions. Anecdotes do not override evidence. Is the rationale grounded in [A] sources, or [C] hypothesis?',
 'Evaluate the evidence quality supporting this pursuit decision. Consider: Is the opportunity data sourced from [A] Primary sources (contracts, budgets, CPARs, FPDS, SAM.gov, federal register)? Or is it relying on [C] Hypothesis (tribal knowledge, "everyone knows")? Are there verifiable data points supporting the pursuit rationale? Score 1 if decision relies entirely on hypothesis, 5 if grounded in primary source evidence. Cite the evidence grade of key data points.',
 4),
('relentless_execution', 'Relentless Execution', 'Is it executable?',
 '90-day increments. Zero-defect. Individual ownership, not committees. Do we have the delivery capacity (staffing, vehicle, past performance)?',
 'Evaluate whether Envision has the delivery capacity to execute this opportunity. Consider: Do we have sufficient cleared staff or hiring pipeline? Do we hold the required contract vehicle (RS3, OASIS+, SeaPort-NxG, GSA MAS, eFAST)? Do we have relevant past performance (CPARs) for this scope? Can we staff within 90-day increments? Score 1 if execution capacity is severely lacking, 5 if fully resourced and proven. Cite specific vehicles, staffing, and PP evidence.',
 5),
('relationships', 'Relationships, Relationships, Relationships', 'Does it strengthen positioning?',
 'Strategic assets. Long-term over transactional. Do we have the customer relationship and history?',
 'Evaluate the customer relationship strength for this opportunity. Consider: Do we have incumbent status or prior contract history with this customer? Have we engaged the customer in pre-RFP discussions? Is there documented engagement (call logs, meetings, draft requirements review)? Does this build long-term strategic positioning vs. one-time transactional? Score 1 if no relationship exists, 5 if strong incumbent/relationship advantage. Cite engagement history and customer interaction evidence.',
 6),
('market_mission_brand', 'Market, Mission, Brand Focus', 'Are we in our lane?',
 'Mission-led, not contract-chasing. Solution-first. Does this fit "Boring Excellence" / Agile Integrator / Mission Assurance positioning?',
 'Evaluate whether this opportunity fits the GDA/Envision brand positioning. Consider: Does it align with "Boring Excellence" — predictable execution, certainty of outcome? Is it mission-assurance work (not flashy innovation theater)? Does it fit the Agile Integrator identity (large enough to govern risk, small enough to execute fast)? Would winning this enhance or dilute the brand? Score 1 if it is pure contract-chasing with no brand fit, 5 if perfectly mission-aligned. Cite positioning evidence.',
 7),
('customer_facing', 'Customer Facing', 'Is customer pain well-documented?',
 'Is the customer pain well understood with documented engagement? Customer engagement is the foundation of every pursuit.',
 'Evaluate whether the customer pain is well understood and documented. Consider: Is there evidence of customer engagement (meetings, site visits, draft SOW review)? Is the requirement clearly articulated by the customer (not inferred)? Do we understand the "why" behind this procurement? Is there a named CO/COR/PM relationship? Score 1 if customer pain is completely unknown, 5 if deeply understood with documented engagement. Cite customer interaction evidence and requirement clarity.',
 8)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEED: 6 Strategic Exclusions
-- ============================================================

INSERT INTO doctrine_exclusions (id, name, description, trigger_logic_prompt, applies_to_ous, is_hard_block, override_requires) VALUES
('low_assurance_cyber', 'Low-Assurance Non-Classified Cyber Services', 'Block pursuits for generic commercial cybersecurity services that do not require government clearances or assurance frameworks.',
 'Determine if this opportunity is for low-assurance, non-classified cyber services. Trigger if: the scope is commercial-grade cybersecurity (SOC monitoring, pen testing, vulnerability scanning) WITHOUT requiring cleared personnel, government-accredited facilities, or compliance with NIST 800-171/CMMC frameworks. Do NOT trigger if the work requires TS/SCI access, RMF authorization, or operates within a classified environment.',
 ARRAY['gda','envision','riverstone','pds'], TRUE, 'executive_rationale'),
('commercial_software_only', 'Commercial-Only Software Development', 'Block pursuits for pure commercial software development with no mission/government nexus.',
 'Determine if this opportunity is for commercial-only software development. Trigger if: the scope is building commercial software products (SaaS, mobile apps, web platforms) for non-government customers or for government customers but with no mission-specific requirements (no FedRAMP, no IL4+, no STIG compliance, no mission-critical SLA). Do NOT trigger if the software development serves a defense/IC mission, requires cleared developers, or must meet government security standards.',
 ARRAY['gda','envision','riverstone','pds'], TRUE, 'executive_rationale'),
('staff_aug_only', 'Staff-Augmentation-Only Pursuits', 'Block pursuits that are purely staff augmentation with no platform or mission ownership.',
 'Determine if this opportunity is purely staff augmentation. Trigger if: the scope is body-shop staffing with no technical solution ownership, no deliverables beyond labor hours, no platform/tool/system that Envision would own or operate, and the contractor has no mission accountability beyond filling seats. Do NOT trigger if there is a technical solution component, deliverable-based work, or mission ownership even if staffing is a component.',
 ARRAY['gda','envision','riverstone','pds'], TRUE, 'executive_rationale'),
('below_margin_floor', 'Below 8% Gross Margin (Core Lanes)', 'Block pursuits in core lanes where expected gross margin falls below 8% without executive override.',
 'Determine if the expected gross margin for this opportunity falls below 8%. Trigger if: pricing assumptions, wrap rates, or competitive analysis indicate the achievable gross margin is less than 8% in a core Envision lane. Do NOT trigger if: margin data is unavailable (flag as unknown instead), or if the pursuit is explicitly a strategic loss-leader approved by CEO.',
 ARRAY['gda','envision','riverstone','pds'], TRUE, 'executive_rationale'),
('non_cleared_commercial_it', 'Non-Cleared / Purely Commercial IT', 'Block pursuits for IT services that require no security clearances and serve no government mission.',
 'Determine if this opportunity is for non-cleared, purely commercial IT services. Trigger if: the scope is generic IT support (helpdesk, network admin, desktop support, cloud migration) with no clearance requirement, no government-specific compliance framework, and no defense/IC mission nexus. Do NOT trigger if the IT work requires cleared personnel, operates in a government enclave, or supports a mission-critical system.',
 ARRAY['gda','envision','riverstone','pds'], TRUE, 'executive_rationale'),
('ou2_out_of_lane', 'OU2 Out-of-Lane Mission', 'Block OU2-led pursuits for mission lanes outside NSA, NGA, NRO, ODNI, CIA, USCYBERCOM.',
 'Determine if this is an OU2 (Riverstone)-led pursuit outside their approved mission lanes. Trigger if: the pursuit is led by Riverstone AND the customer/mission is NOT one of: NSA, NGA, NRO, ODNI, CIA, USCYBERCOM. Do NOT trigger if: the pursuit is Envision-led (even if Riverstone is a sub), or if the customer is within the approved IC/cyber community list.',
 ARRAY['riverstone'], TRUE, 'executive_rationale')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEED: Doctrine Rules Config
-- ============================================================

INSERT INTO doctrine_rules_config (key, value, description) VALUES
('margin_floor_pct', '8', 'Minimum gross margin percentage required for core lane pursuits'),
('evidence_required_for_must_win', '["A","B"]', 'Evidence grades required for must-win pursuit decisions (no [C] hypothesis without override)'),
('must_win_pursuits', '["MAPS","63rd_BSB","IEW_S_SETA_recompete","BAMBOOTIGER"]', 'Named must-win pursuits that require Grade A/B evidence'),
('alignment_score_thresholds', '{"strong":32,"moderate":24,"weak":16}', 'Thresholds for doctrine alignment score interpretation (out of 40)')
ON CONFLICT (key) DO NOTHING;

COMMIT;
