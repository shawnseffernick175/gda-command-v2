/**
 * Seed script — populates the database from existing mock data files.
 * Run after migrations: npx tsx src/db/seed.ts
 */

import pg from "pg";
import { getMockOpportunities } from "../data/opportunities-mock";
import { MOCK_CAPTURE_PLANS, MOCK_CAPTURE_ACTIVITIES } from "../data/capture-mock";
import { MOCK_DRAFTS, MOCK_PUBLISH_RUNS } from "../data/doctrine-mock";
import { MOCK_INTEL_ITEMS, MOCK_BRIEFINGS, MOCK_RESEARCH_REPORTS, MOCK_COMPETITORS } from "../data/intel-mock";
import { MOCK_APPROVALS } from "../data/approvals-mock";
import { MOCK_REQUIREMENTS as MOCK_COMPLIANCE, MOCK_CLAUSES } from "../data/compliance-mock";
import { MOCK_PROPOSALS } from "../data/proposals-mock";
import { MOCK_CONTACTS } from "../data/contacts-mock";
import { MOCK_REPORT_TEMPLATES, MOCK_GENERATED_REPORTS, MOCK_SCHEDULED_REPORTS, MOCK_EXPORT_JOBS } from "../data/reports-mock";
import { MOCK_PROMPTS } from "../data/prompts-mock";
import { MOCK_FAST_TRACK_MATCHES } from "../data/fast-track-mock";
import {
  MOCK_COLLECTIONS as MOCK_KNOWLEDGE_COLLECTIONS,
  MOCK_DOCUMENTS as MOCK_KNOWLEDGE_DOCUMENTS,
  MOCK_CHAT_SESSIONS,
} from "../data/knowledge-mock";
import { MOCK_SHRED_JOBS, MOCK_REQUIREMENTS_SJ001 as MOCK_SHRED_REQUIREMENTS } from "../data/rfp-shredder-mock";
import { MOCK_COLOR_REVIEWS } from "../data/color-review-mock";
import {
  MOCK_ANOMALIES,
  MOCK_COMPETITOR_MOVEMENTS,
  MOCK_ESCALATION_RULES,
  MOCK_ESCALATIONS,
} from "../data/anomaly-mock";
import { MOCK_SAM_OPPORTUNITIES, MOCK_SCAN_RUNS as MOCK_SAM_SCANS } from "../data/sam-monitor-mock";
import { MOCK_THREADS as MOCK_DISCUSSION_THREADS, MOCK_MESSAGES as MOCK_DISCUSSION_MESSAGES } from "../data/discussions-mock";
import { MOCK_CPARS_RECORDS } from "../data/cpars-mock";
import { MOCK_FPDS_AWARDS } from "../data/fpds-mock";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://gda:gda_dev_password@localhost:5432/gda_command";

function esc(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Convert JS array to PostgreSQL TEXT[] literal */
function pgArray(arr: string[] | undefined | null): string {
  if (!arr || arr.length === 0) return "{}";
  return "{" + arr.map((s) => `"${String(s).replace(/"/g, '\\"')}"`).join(",") + "}";
}

async function seed() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Check if already seeded
  const { rows } = await pool.query(
    "SELECT count(*) as c FROM opportunities"
  ).catch(() => ({ rows: [{ c: "0" }] }));
  if (parseInt(rows[0].c) > 0) {
    process.stdout.write("[seed] Database already has data. Skipping seed.\n");
    process.stdout.write("[seed] To re-seed, run: DROP SCHEMA public CASCADE; CREATE SCHEMA public; then re-run migrations and seed.\n");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // --- Default admin user ---
    await client.query(`
      INSERT INTO users (id, email, password_hash, display_name, role)
      VALUES (
        'a0000000-0000-0000-0000-000000000001',
        'admin@gda-command.local',
        '$2b$10$placeholder_hash_for_dev',
        'GDA Admin',
        'admin'
      )
    `);

    // --- Opportunities ---
    const opps = getMockOpportunities();
    for (const o of opps) {
      await client.query(
        `INSERT INTO opportunities (id, title, agency, department, status, score, value_estimated, probability_of_win, naics, psc, due_date, solicitation_number, set_aside, place_of_performance, incumbent, qualified_at, qualified_by, tags, raw_source_url, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [o.id, o.title, o.agency, o.department, o.status, o.score, o.value_estimated, o.probability_of_win, o.naics, o.psc, o.due_date, o.solicitation_number, o.set_aside, o.place_of_performance, o.incumbent, o.qualified_at, o.qualified_by, pgArray(o.tags as string[]), o.raw_source_url, o.created_at, o.updated_at]
      );
    }
    process.stdout.write(`[seed] ${opps.length} opportunities\n`);

    // --- Capture Plans ---
    for (const cp of MOCK_CAPTURE_PLANS) {
      await client.query(
        `INSERT INTO capture_plans (id, opportunity_id, opportunity_title, agency, phase, pwin, value_estimated, capture_manager, bid_decision, teaming_partners, milestones, gate_reviews, win_themes, discriminators, risks, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [cp.id, cp.opportunity_id, cp.opportunity_title, cp.agency, cp.phase, cp.pwin, cp.value_estimated, cp.capture_manager, cp.bid_decision, JSON.stringify(cp.teaming_partners), JSON.stringify(cp.milestones), JSON.stringify(cp.gate_reviews), pgArray(cp.win_themes as string[]), pgArray(cp.discriminators as string[]), JSON.stringify(cp.risks), cp.created_at, cp.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_CAPTURE_PLANS.length} capture plans\n`);

    // --- Capture Activities ---
    for (const a of MOCK_CAPTURE_ACTIVITIES) {
      await client.query(
        `INSERT INTO capture_activities (id, capture_plan_id, opportunity_title, activity_type, description, performed_by, performed_at, outcome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [a.id, a.capture_plan_id, a.opportunity_title, a.activity_type, a.description, a.performed_by, a.performed_at, a.outcome]
      );
    }
    process.stdout.write(`[seed] ${MOCK_CAPTURE_ACTIVITIES.length} capture activities\n`);

    // --- Doctrine ---
    for (const d of MOCK_DRAFTS) {
      await client.query(
        `INSERT INTO doctrine_drafts (id, sprint_id, component, doc_type, title, status, source_pr_number, source_pr_url, body, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [d.id, d.sprint_id, d.component, d.doc_type, d.title, d.status, d.source_pr_number, d.source_pr_url, d.body, d.created_at, d.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_DRAFTS.length} doctrine drafts\n`);

    for (const pr of MOCK_PUBLISH_RUNS) {
      await client.query(
        `INSERT INTO doctrine_publish_runs (id, sprint_id, trigger_type, status, gate_results, commit_sha, reason, started_at, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [pr.id, pr.sprint_id, pr.trigger_type, pr.status, JSON.stringify(pr.gate_results), pr.commit_sha, pr.reason, pr.started_at, pr.completed_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_PUBLISH_RUNS.length} doctrine publish runs\n`);

    // --- Intel ---
    for (const item of MOCK_INTEL_ITEMS) {
      await client.query(
        `INSERT INTO intel_items (id, title, summary, category, priority, source, source_url, related_opportunity_id, related_competitor, tags, read, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [item.id, item.title, item.summary, item.category, item.priority, item.source, item.source_url, item.related_opportunity_id, item.related_competitor, pgArray(item.tags as string[]), item.read, item.created_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_INTEL_ITEMS.length} intel items\n`);

    for (const b of MOCK_BRIEFINGS) {
      await client.query(
        `INSERT INTO morning_briefings (id, date, headline, key_metrics, alerts, action_items, market_snapshot, generated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [b.id, b.date, b.headline, JSON.stringify(b.key_metrics), JSON.stringify(b.alerts), JSON.stringify(b.action_items), b.market_snapshot, b.generated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_BRIEFINGS.length} morning briefings\n`);

    for (const r of MOCK_RESEARCH_REPORTS) {
      await client.query(
        `INSERT INTO deep_research_reports (id, query, status, summary, findings, sources_count, requested_at, completed_at, requested_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [r.id, r.query, r.status, r.summary, r.findings, r.sources_count, r.requested_at, r.completed_at, r.requested_by]
      );
    }
    process.stdout.write(`[seed] ${MOCK_RESEARCH_REPORTS.length} deep research reports\n`);

    for (const c of MOCK_COMPETITORS) {
      await client.query(
        `INSERT INTO competitor_profiles (id, name, threat_score, contracts_won, contracts_value, primary_naics, strengths, weaknesses, recent_wins, watch_status, last_updated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [c.id, c.name, c.threat_score, c.contracts_won, c.contracts_value, pgArray(c.primary_naics as string[]), pgArray(c.strengths as string[]), pgArray(c.weaknesses as string[]), pgArray(c.recent_wins as string[]), c.watch_status, c.last_updated]
      );
    }
    process.stdout.write(`[seed] ${MOCK_COMPETITORS.length} competitor profiles\n`);

    // --- Approvals ---
    for (const a of MOCK_APPROVALS) {
      await client.query(
        `INSERT INTO approvals (id, title, description, category, priority, status, requester, assignee, correlation_id, related_entity_id, related_entity_type, dry_run_result, created_at, updated_at, expires_at, resolved_at, resolved_by, resolution_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [a.id, a.title, a.description, a.category, a.priority, a.status, a.requester, a.assignee, a.correlation_id, a.related_entity_id, a.related_entity_type, a.dry_run_result ? JSON.stringify(a.dry_run_result) : null, a.created_at, a.updated_at, a.expires_at, a.resolved_at, a.resolved_by, a.resolution_notes]
      );
    }
    process.stdout.write(`[seed] ${MOCK_APPROVALS.length} approvals\n`);

    // --- Compliance ---
    for (const c of MOCK_COMPLIANCE) {
      await client.query(
        `INSERT INTO compliance_requirements (id, solicitation_id, solicitation_title, section, requirement, category, status, evidence, responsible_party, notes, related_clause_ids, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [c.id, c.solicitation_id, c.solicitation_title, c.section, c.requirement, c.category, c.status, c.evidence, c.responsible_party, c.notes, pgArray(c.related_clause_ids as string[]), c.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_COMPLIANCE.length} compliance requirements\n`);

    for (const cl of MOCK_CLAUSES) {
      await client.query(
        `INSERT INTO clause_references (id, clause_number, title, type, full_text, summary, applicability, common_pitfalls, related_clauses, last_updated)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [cl.id, cl.clause_number, cl.title, cl.type, cl.full_text, cl.summary, pgArray(cl.applicability as string[]), pgArray(cl.common_pitfalls as string[]), pgArray(cl.related_clauses as string[]), cl.last_updated]
      );
    }
    process.stdout.write(`[seed] ${MOCK_CLAUSES.length} clause references\n`);

    // --- Proposals ---
    for (const p of MOCK_PROPOSALS) {
      await client.query(
        `INSERT INTO proposals (id, title, solicitation_id, solicitation_title, agency, status, value_estimated, due_date, submission_date, capture_manager, proposal_manager, volumes, red_team_findings, scorecard, timeline, compliance_score, overall_score, win_themes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [p.id, p.title, p.solicitation_id, p.solicitation_title, p.agency, p.status, p.value_estimated, p.due_date, p.submission_date, p.capture_manager, p.proposal_manager, JSON.stringify(p.volumes), JSON.stringify(p.red_team_findings), JSON.stringify(p.scorecard), JSON.stringify(p.timeline), p.compliance_score, p.overall_score, pgArray(p.win_themes as string[]), p.created_at, p.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_PROPOSALS.length} proposals\n`);

    // --- Contacts ---
    for (const c of MOCK_CONTACTS) {
      await client.query(
        `INSERT INTO contacts (id, first_name, last_name, title, agency, department, email, phone, status, relationship_strength, last_contact_date, relationship_history, meeting_notes, relationships, linked_opportunities, teaming_records, tags, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [c.id, c.first_name, c.last_name, c.title, c.agency, c.department, c.email, c.phone, c.status, c.relationship_strength, c.last_contact_date, c.relationship_history, JSON.stringify(c.meeting_notes), JSON.stringify(c.relationships), JSON.stringify(c.linked_opportunities), JSON.stringify(c.teaming_records), pgArray(c.tags as string[]), c.created_at, c.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_CONTACTS.length} contacts\n`);

    // --- Reports ---
    for (const t of MOCK_REPORT_TEMPLATES) {
      await client.query(
        `INSERT INTO report_templates (id, name, category, description, sections, default_format, available_formats, estimated_pages, last_used, use_count, created_by, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [t.id, t.name, t.category, t.description, JSON.stringify(t.sections), t.default_format, pgArray(t.available_formats as string[]), t.estimated_pages, t.last_used, t.use_count, t.created_by, pgArray(t.tags as string[])]
      );
    }
    process.stdout.write(`[seed] ${MOCK_REPORT_TEMPLATES.length} report templates\n`);

    for (const r of MOCK_GENERATED_REPORTS) {
      await client.query(
        `INSERT INTO generated_reports (id, template_id, template_name, category, title, status, format, generated_at, generated_by, file_size_bytes, page_count, sections_included, parameters, download_url, expires_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [r.id, r.template_id, r.template_name, r.category, r.title, r.status, r.format, r.generated_at, r.generated_by, r.file_size_bytes, r.page_count, pgArray(r.sections_included as string[]), JSON.stringify(r.parameters), r.download_url, r.expires_at, r.notes]
      );
    }
    process.stdout.write(`[seed] ${MOCK_GENERATED_REPORTS.length} generated reports\n`);

    for (const s of MOCK_SCHEDULED_REPORTS) {
      await client.query(
        `INSERT INTO scheduled_reports (id, template_id, template_name, frequency, next_run, last_run, recipients, format, enabled, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [s.id, s.template_id, s.template_name, s.frequency, s.next_run, s.last_run, pgArray(s.recipients as string[]), s.format, s.enabled, s.created_by]
      );
    }
    process.stdout.write(`[seed] ${MOCK_SCHEDULED_REPORTS.length} scheduled reports\n`);

    for (const e of MOCK_EXPORT_JOBS) {
      await client.query(
        `INSERT INTO export_jobs (id, source_page, format, status, started_at, completed_at, file_size_bytes, download_url, row_count, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [e.id, e.source_page, e.format, e.status, e.started_at, e.completed_at, e.file_size_bytes, e.download_url, e.row_count, e.correlation_id]
      );
    }
    process.stdout.write(`[seed] ${MOCK_EXPORT_JOBS.length} export jobs\n`);

    // --- Prompts ---
    for (const p of MOCK_PROMPTS) {
      await client.query(
        `INSERT INTO prompts (id, name, category, description, template, variables, tags, version, is_active, usage_count, last_used, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [p.id, p.title, p.category, p.description, p.body, pgArray([]), pgArray(p.tags), p.version, p.status === "active", p.usageCount, p.lastUsedAt, p.createdBy, p.createdAt, p.updatedAt]
      );
    }
    process.stdout.write(`[seed] ${MOCK_PROMPTS.length} prompts\n`);

    // --- Fast Track ---
    for (const m of MOCK_FAST_TRACK_MATCHES) {
      await client.query(
        `INSERT INTO fast_track_matches (id, signal_type, signal_title, signal_source, signal_date, company_name, company_role, technology_tags, contract_path, score, status, executive_summary, risks_and_gaps, recommended_action, ooda, sources, needs_attention, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [m.id, m.signal_type, m.signal_summary, m.signal_type, m.created_at, m.company_name, m.company_role, pgArray(m.technology_tags), m.contract_path_hypothesis, m.match_score, m.status, m.analysis?.executive_summary ?? null, pgArray(m.analysis?.risks_or_gaps as string[]), m.recommended_next_action, JSON.stringify(m.ooda), JSON.stringify(m.sources), m.status === "new" || m.status === "reviewing", m.created_at, m.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_FAST_TRACK_MATCHES.length} fast track matches\n`);

    // --- Knowledge Collections ---
    for (const c of MOCK_KNOWLEDGE_COLLECTIONS) {
      await client.query(
        `INSERT INTO knowledge_collections (id, name, description, document_count, total_chunks, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [c.id, c.name, c.description, c.document_count, c.total_chunks, c.last_updated]
      );
    }
    process.stdout.write(`[seed] ${MOCK_KNOWLEDGE_COLLECTIONS.length} knowledge collections\n`);

    // --- Knowledge Documents ---
    for (const d of MOCK_KNOWLEDGE_DOCUMENTS) {
      await client.query(
        `INSERT INTO knowledge_documents (id, collection_id, title, doc_type, file_name, file_size_bytes, page_count, chunk_count, status, tags, metadata, indexed_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [d.id, d.collection, d.title, d.type, d.file_name, d.file_size_bytes, d.pages, d.chunks_indexed, d.status, pgArray(d.tags), JSON.stringify(d.metadata ?? {}), d.indexed_at, d.uploaded_at, d.indexed_at ?? d.uploaded_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_KNOWLEDGE_DOCUMENTS.length} knowledge documents\n`);

    // --- Knowledge Chat Sessions ---
    for (const s of MOCK_CHAT_SESSIONS) {
      await client.query(
        `INSERT INTO knowledge_chat_sessions (id, title, messages, sources, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [s.id, s.title, JSON.stringify(s.messages), JSON.stringify(s.context ? [s.context] : []), s.created_at, s.created_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_CHAT_SESSIONS.length} knowledge chat sessions\n`);

    // --- RFP Shred Jobs ---
    for (const j of MOCK_SHRED_JOBS) {
      await client.query(
        `INSERT INTO shred_jobs (id, solicitation_id, solicitation_title, agency, file_name, file_size_bytes, page_count, status, requirements_found, sections_parsed, started_at, completed_at, processing_time_seconds, correlation_id, error_message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [j.id, j.solicitation_id, j.solicitation_title, j.agency, j.file_name, j.file_size_bytes, j.page_count, j.status, j.requirements_found, pgArray(j.sections_parsed as string[]), j.started_at, j.completed_at, j.processing_time_seconds, j.correlation_id, j.error_message]
      );
    }
    process.stdout.write(`[seed] ${MOCK_SHRED_JOBS.length} shred jobs\n`);

    for (const r of MOCK_SHRED_REQUIREMENTS) {
      await client.query(
        `INSERT INTO extracted_requirements (id, shred_job_id, section, requirement_text, requirement_type, complexity, keyword, far_references, compliance_match, matched_evidence, matched_document_id, matched_document_title, page_number, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [r.id, r.shred_job_id, r.section, r.requirement_text, r.requirement_type, r.complexity, r.keyword, pgArray(r.far_references as string[]), r.compliance_match, r.matched_evidence, r.matched_document_id, r.matched_document_title, r.page_number, r.confidence]
      );
    }
    process.stdout.write(`[seed] ${MOCK_SHRED_REQUIREMENTS.length} extracted requirements\n`);

    // --- Color Reviews ---
    for (const cr of MOCK_COLOR_REVIEWS) {
      await client.query(
        `INSERT INTO color_reviews (id, proposal_id, proposal_title, agency, phase, status, started_at, completed_at, overall_score, max_score, pass_rate, total_checks, passed_checks, failed_checks, warning_checks, reviewer, summary, go_no_go, confidence, requirement_checks, section_scores, gold_checks, cost_line_items, green_checks, format_checks, risk_factors, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
        [cr.id, cr.proposal_id, cr.proposal_title, cr.agency, cr.phase, cr.status, cr.started_at, cr.completed_at, cr.overall_score, cr.max_score, cr.pass_rate, cr.total_checks, cr.passed_checks, cr.failed_checks, cr.warning_checks, cr.reviewer, cr.summary, cr.go_no_go, cr.confidence, JSON.stringify(cr.requirement_checks), JSON.stringify(cr.section_scores), JSON.stringify(cr.gold_checks), JSON.stringify(cr.cost_line_items), JSON.stringify(cr.green_checks), JSON.stringify(cr.format_checks), pgArray(cr.risk_factors as string[]), cr.created_at, cr.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_COLOR_REVIEWS.length} color reviews\n`);

    // --- Anomalies ---
    for (const a of MOCK_ANOMALIES) {
      await client.query(
        `INSERT INTO anomalies (id, category, severity, status, title, description, opportunity_id, opportunity_title, agency, detected_at, acknowledged_at, resolved_at, metric_name, metric_value, baseline_value, deviation_pct, trend, root_cause, recommended_actions, related_anomaly_ids, source_workflow)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [a.id, a.category, a.severity, a.status, a.title, a.description, a.opportunity_id, a.opportunity_title, a.agency, a.detected_at, a.acknowledged_at, a.resolved_at, a.metric_name, a.metric_value, a.baseline_value, a.deviation_pct, JSON.stringify(a.trend), a.root_cause, pgArray(a.recommended_actions as string[]), pgArray(a.related_anomaly_ids as string[]), a.source_workflow]
      );
    }
    process.stdout.write(`[seed] ${MOCK_ANOMALIES.length} anomalies\n`);

    for (const cm of MOCK_COMPETITOR_MOVEMENTS) {
      await client.query(
        `INSERT INTO competitor_movements (id, competitor_name, movement_type, title, description, impact_assessment, threat_level, affected_opportunities, source, source_url, detected_at, verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [cm.id, cm.competitor_name, cm.movement_type, cm.title, cm.description, cm.impact_assessment, cm.threat_level, pgArray(cm.affected_opportunities as string[]), cm.source, cm.source_url, cm.detected_at, cm.verified]
      );
    }
    process.stdout.write(`[seed] ${MOCK_COMPETITOR_MOVEMENTS.length} competitor movements\n`);

    for (const r of MOCK_ESCALATION_RULES) {
      await client.query(
        `INSERT INTO escalation_rules (id, name, condition, priority)
         VALUES ($1,$2,$3,$4)`,
        [r.id, r.name, r.condition, r.priority]
      );
    }
    process.stdout.write(`[seed] ${MOCK_ESCALATION_RULES.length} escalation rules\n`);

    for (const e of MOCK_ESCALATIONS) {
      await client.query(
        `INSERT INTO escalations (id, rule_id, rule_name, priority, status, title, description, opportunity_id, opportunity_title, agency, triggered_at, due_date, assigned_to, resolution_notes, resolved_at, days_overdue)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [e.id, e.rule_id, e.rule_name, e.priority, e.status, e.title, e.description, e.opportunity_id, e.opportunity_title, e.agency, e.triggered_at, e.due_date, e.assigned_to, e.resolution_notes, e.resolved_at, e.days_overdue]
      );
    }
    process.stdout.write(`[seed] ${MOCK_ESCALATIONS.length} escalations\n`);

    // --- SAM Monitor ---
    for (const s of MOCK_SAM_OPPORTUNITIES) {
      await client.query(
        `INSERT INTO sam_opportunities (id, notice_id, title, agency, sub_agency, type, set_aside, naics, naics_description, psc, value_estimate, response_deadline, posted_date, place_of_performance, relevance_score, relevance_reasons, ai_summary, scan_status, matched_naics, matched_keywords, sam_url, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [s.id, s.notice_id, s.title, s.agency, s.sub_agency, s.type, s.set_aside, s.naics, s.naics_description, s.psc, s.value_estimate, s.response_deadline, s.posted_date, s.place_of_performance, s.relevance_score, pgArray(s.relevance_reasons as string[]), s.ai_summary, s.scan_status, s.matched_naics, pgArray(s.matched_keywords as string[]), s.sam_url, s.created_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_SAM_OPPORTUNITIES.length} SAM opportunities\n`);

    for (const sr of MOCK_SAM_SCANS) {
      await client.query(
        `INSERT INTO sam_scan_runs (id, started_at, completed_at, status, opportunities_found, new_matches, naics_codes_scanned, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sr.id, sr.started_at, sr.completed_at, sr.status, sr.opportunities_found, sr.new_matches, pgArray(sr.naics_codes_scanned as string[]), sr.error]
      );
    }
    process.stdout.write(`[seed] ${MOCK_SAM_SCANS.length} SAM scan runs\n`);

    // --- Discussions ---
    for (const t of MOCK_DISCUSSION_THREADS) {
      await client.query(
        `INSERT INTO discussion_threads (id, entity_type, entity_id, entity_title, title, created_by, created_at, updated_at, message_count, last_message_at, participants, is_resolved, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [t.id, t.entity_type, t.entity_id, t.entity_title, t.title, t.created_by, t.created_at, t.updated_at, t.message_count, t.last_message_at, pgArray(t.participants as string[]), t.is_resolved, pgArray(t.tags as string[])]
      );
    }
    process.stdout.write(`[seed] ${MOCK_DISCUSSION_THREADS.length} discussion threads\n`);

    // Flatten discussion messages from threads
    const allMessages = MOCK_DISCUSSION_THREADS.flatMap((t: any) => {
      const msgs = MOCK_DISCUSSION_MESSAGES[t.id as keyof typeof MOCK_DISCUSSION_MESSAGES];
      return msgs ?? [];
    });
    for (const m of allMessages) {
      await client.query(
        `INSERT INTO discussion_messages (id, thread_id, author, content, created_at, edited_at, reactions, mentions, attachments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [m.id, m.thread_id, m.author, m.content, m.created_at, m.edited_at, JSON.stringify(m.reactions), pgArray(m.mentions as string[]), JSON.stringify(m.attachments)]
      );
    }
    process.stdout.write(`[seed] ${allMessages.length} discussion messages\n`);

    // --- CPARS ---
    for (const c of MOCK_CPARS_RECORDS) {
      await client.query(
        `INSERT INTO cpars_records (id, contract_number, contract_title, agency, period_of_performance, contract_value, status, overall_rating, quality_rating, schedule_rating, cost_rating, management_rating, narrative, ai_generated_narrative, key_accomplishments, relevance_tags, matched_opportunities, evaluator, evaluation_date, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [c.id, c.contract_number, c.contract_title, c.agency, c.period_of_performance, c.contract_value, c.status, c.overall_rating, c.quality_rating, c.schedule_rating, c.cost_rating, c.management_rating, c.narrative, c.ai_generated_narrative, pgArray(c.key_accomplishments as string[]), pgArray(c.relevance_tags as string[]), pgArray(c.matched_opportunities as string[]), c.evaluator, c.evaluation_date, c.created_at, c.updated_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_CPARS_RECORDS.length} CPARS records\n`);

    // --- FPDS ---
    for (const f of MOCK_FPDS_AWARDS) {
      await client.query(
        `INSERT INTO fpds_awards (id, piid, title, agency, vendor, vendor_duns, award_amount, ceiling_amount, award_date, period_of_performance_start, period_of_performance_end, award_type, competition_type, naics, psc, place_of_performance, is_competitor, competitor_name, is_recompete_candidate, recompete_date, relevance_score, fpds_url, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [f.id, f.piid, f.title, f.agency, f.vendor, f.vendor_duns, f.award_amount, f.ceiling_amount, f.award_date, f.period_of_performance_start, f.period_of_performance_end, f.award_type, f.competition_type, f.naics, f.psc, f.place_of_performance, f.is_competitor, f.competitor_name, f.is_recompete_candidate, f.recompete_date, f.relevance_score, f.fpds_url, f.created_at]
      );
    }
    process.stdout.write(`[seed] ${MOCK_FPDS_AWARDS.length} FPDS awards\n`);

    await client.query("COMMIT");
    process.stdout.write("[seed] Done! All data seeded successfully.\n");
  } catch (e) {
    await client.query("ROLLBACK");
    process.stderr.write(`[seed] FAILED: ${(e as Error).message}\n`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
