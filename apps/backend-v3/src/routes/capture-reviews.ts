/**
 * Capture Review Engine routes — F-868
 *
 * POST   /v3/captures/:id/plan                — create/update capture plan (Shipley drivers)
 * GET    /v3/captures/:id/plan                — read capture plan
 * POST   /v3/captures/:id/milestones          — add milestone
 * PATCH  /v3/captures/:id/milestones/:mid     — update milestone
 * GET    /v3/captures/:id/milestones          — list milestones
 * POST   /v3/captures/:id/reviews             — schedule a review
 * GET    /v3/captures/:id/reviews             — list reviews on a capture
 * GET    /v3/reviews/:id                      — review detail (sections + scores)
 * PATCH  /v3/reviews/:id/sections/:sid/score  — save a score (per reviewer)
 * PATCH  /v3/reviews/:id/compliance/:cid      — mark shall compliant/not
 * POST   /v3/reviews/:id/complete             — finalize, compute overall, update Pwin
 * GET    /v3/reviews/mine                     — "My Open Reviews" panel data
 * POST   /v3/reviews/:id/ai-suggest           — AI suggest score for a section
 */

import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';
import { logger } from '../lib/logger.js';
import { computePwin, colorRatingToPwinImpact, computeOverallRating } from '../services/captures/pwin-compute.js';

export async function captureReviewRoutes(app: FastifyInstance): Promise<void> {

  // ── Capture Plan (Shipley Drivers) ────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: {
      customer_relationship_score?: number;
      customer_relationship_notes?: string;
      customer_budget_confirmed?: boolean;
      customer_funded_date?: string;
      solution_fit_score?: number;
      solution_differentiators?: string;
      solution_risks?: string;
      competitive_position_score?: number;
      known_competitors?: unknown[];
      ghosting_strategy?: string;
      ptw_estimate?: number;
      pricing_posture?: string;
      margin_target?: number;
      cpars_references?: unknown[];
      team_required_pp_categories?: unknown[];
      prime_or_sub?: string;
      teammates?: unknown[];
    };
  }>('/v3/captures/:id/plan', async (req, reply) => {
    const captureId = parseInt(req.params.id, 10);
    if (isNaN(captureId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid capture ID', req.requestId));
    }

    const b = req.body;
    const result = await pool.query(
      `INSERT INTO capture_plans (
        capture_id, customer_relationship_score, customer_relationship_notes,
        customer_budget_confirmed, customer_funded_date,
        solution_fit_score, solution_differentiators, solution_risks,
        competitive_position_score, known_competitors, ghosting_strategy,
        ptw_estimate, pricing_posture, margin_target,
        cpars_references, team_required_pp_categories,
        prime_or_sub, teammates
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (capture_id) DO UPDATE SET
        customer_relationship_score = COALESCE(EXCLUDED.customer_relationship_score, capture_plans.customer_relationship_score),
        customer_relationship_notes = COALESCE(EXCLUDED.customer_relationship_notes, capture_plans.customer_relationship_notes),
        customer_budget_confirmed = COALESCE(EXCLUDED.customer_budget_confirmed, capture_plans.customer_budget_confirmed),
        customer_funded_date = COALESCE(EXCLUDED.customer_funded_date, capture_plans.customer_funded_date),
        solution_fit_score = COALESCE(EXCLUDED.solution_fit_score, capture_plans.solution_fit_score),
        solution_differentiators = COALESCE(EXCLUDED.solution_differentiators, capture_plans.solution_differentiators),
        solution_risks = COALESCE(EXCLUDED.solution_risks, capture_plans.solution_risks),
        competitive_position_score = COALESCE(EXCLUDED.competitive_position_score, capture_plans.competitive_position_score),
        known_competitors = COALESCE(EXCLUDED.known_competitors, capture_plans.known_competitors),
        ghosting_strategy = COALESCE(EXCLUDED.ghosting_strategy, capture_plans.ghosting_strategy),
        ptw_estimate = COALESCE(EXCLUDED.ptw_estimate, capture_plans.ptw_estimate),
        pricing_posture = COALESCE(EXCLUDED.pricing_posture, capture_plans.pricing_posture),
        margin_target = COALESCE(EXCLUDED.margin_target, capture_plans.margin_target),
        cpars_references = COALESCE(EXCLUDED.cpars_references, capture_plans.cpars_references),
        team_required_pp_categories = COALESCE(EXCLUDED.team_required_pp_categories, capture_plans.team_required_pp_categories),
        prime_or_sub = COALESCE(EXCLUDED.prime_or_sub, capture_plans.prime_or_sub),
        teammates = COALESCE(EXCLUDED.teammates, capture_plans.teammates),
        updated_at = NOW()
      RETURNING *`,
      [
        captureId,
        b.customer_relationship_score ?? null,
        b.customer_relationship_notes ?? null,
        b.customer_budget_confirmed ?? null,
        b.customer_funded_date ?? null,
        b.solution_fit_score ?? null,
        b.solution_differentiators ?? null,
        b.solution_risks ?? null,
        b.competitive_position_score ?? null,
        JSON.stringify(b.known_competitors ?? []),
        b.ghosting_strategy ?? null,
        b.ptw_estimate ?? null,
        b.pricing_posture ?? null,
        b.margin_target ?? null,
        JSON.stringify(b.cpars_references ?? []),
        JSON.stringify(b.team_required_pp_categories ?? []),
        b.prime_or_sub ?? null,
        JSON.stringify(b.teammates ?? []),
      ]
    );

    // Recompute Pwin
    const pwin = await computePwin(captureId);

    return reply.status(200).send(
      successEnvelope({ ...result.rows[0], computed_pwin: pwin }, req.requestId)
    );
  });

  app.get<{ Params: { id: string } }>('/v3/captures/:id/plan', async (req, reply) => {
    const captureId = parseInt(req.params.id, 10);
    if (isNaN(captureId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid capture ID', req.requestId));
    }

    const res = await pool.query('SELECT * FROM capture_plans WHERE capture_id = $1', [captureId]);
    if (res.rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'No capture plan found', req.requestId));
    }

    return reply.status(200).send(successEnvelope(res.rows[0], req.requestId));
  });

  // ── Milestones ────────────────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { milestone_name: string; due_date: string; status?: string; owner_contact?: string; notes?: string };
  }>('/v3/captures/:id/milestones', async (req, reply) => {
    const captureId = parseInt(req.params.id, 10);
    if (isNaN(captureId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid capture ID', req.requestId));
    }

    const { milestone_name, due_date, status, owner_contact, notes } = req.body;
    if (!milestone_name || !due_date) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'milestone_name and due_date are required', req.requestId));
    }

    const res = await pool.query(
      `INSERT INTO capture_milestones (capture_id, milestone_name, due_date, status, owner_contact, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [captureId, milestone_name, due_date, status ?? 'pending', owner_contact ?? null, notes ?? null]
    );

    return reply.status(201).send(successEnvelope(res.rows[0], req.requestId));
  });

  app.patch<{
    Params: { id: string; mid: string };
    Body: { milestone_name?: string; due_date?: string; status?: string; owner_contact?: string; notes?: string };
  }>('/v3/captures/:id/milestones/:mid', async (req, reply) => {
    const mid = parseInt(req.params.mid, 10);
    if (isNaN(mid)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid milestone ID', req.requestId));
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const allowedFields = ['milestone_name', 'due_date', 'status', 'owner_contact', 'notes'];
    for (const field of allowedFields) {
      const val = (req.body as Record<string, unknown>)[field];
      if (val !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(val);
      }
    }

    if (sets.length === 0) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No fields to update', req.requestId));
    }

    sets.push(`updated_at = NOW()`);
    params.push(mid);

    const res = await pool.query(
      `UPDATE capture_milestones SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Milestone not found', req.requestId));
    }

    return reply.status(200).send(successEnvelope(res.rows[0], req.requestId));
  });

  app.get<{ Params: { id: string } }>('/v3/captures/:id/milestones', async (req, reply) => {
    const captureId = parseInt(req.params.id, 10);
    if (isNaN(captureId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid capture ID', req.requestId));
    }

    const res = await pool.query(
      'SELECT * FROM capture_milestones WHERE capture_id = $1 ORDER BY due_date ASC',
      [captureId]
    );

    return reply.status(200).send(successEnvelope({ items: res.rows }, req.requestId));
  });

  // ── Color Reviews ─────────────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: {
      color: string;
      proposal_vault_doc_id?: number;
      rfp_vault_doc_id?: number;
      scheduled_date?: string;
      rubric?: string;
      reviewers?: Array<{ name: string; email?: string; role?: string }>;
    };
  }>('/v3/captures/:id/reviews', async (req, reply) => {
    const captureId = parseInt(req.params.id, 10);
    if (isNaN(captureId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid capture ID', req.requestId));
    }

    const { color, proposal_vault_doc_id, rfp_vault_doc_id, scheduled_date, rubric, reviewers } = req.body;
    const validColors = ['pink', 'red', 'black', 'blue', 'white', 'green'];
    if (!color || !validColors.includes(color)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', `color must be one of: ${validColors.join(', ')}`, req.requestId));
    }

    const res = await pool.query(
      `INSERT INTO color_reviews (capture_id, color, proposal_vault_doc_id, rfp_vault_doc_id, scheduled_date, rubric, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled') RETURNING *`,
      [captureId, color, proposal_vault_doc_id ?? null, rfp_vault_doc_id ?? null, scheduled_date ?? null, rubric ?? 'shipley_5']
    );

    const review = res.rows[0];

    // Add reviewers
    if (reviewers && reviewers.length > 0) {
      for (const r of reviewers) {
        await pool.query(
          `INSERT INTO color_review_reviewers (review_id, reviewer_name, reviewer_email, role)
           VALUES ($1, $2, $3, $4)`,
          [review.id, r.name, r.email ?? null, r.role ?? null]
        );
      }
    }

    return reply.status(201).send(successEnvelope(review, req.requestId));
  });

  app.get<{ Params: { id: string } }>('/v3/captures/:id/reviews', async (req, reply) => {
    const captureId = parseInt(req.params.id, 10);
    if (isNaN(captureId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid capture ID', req.requestId));
    }

    const res = await pool.query(
      `SELECT cr.*,
              (SELECT COUNT(*) FROM color_review_sections WHERE review_id = cr.id) AS total_sections,
              (SELECT COUNT(DISTINCT crs.section_id) FROM color_review_scores crs
               JOIN color_review_sections s ON s.id = crs.section_id
               WHERE s.review_id = cr.id) AS scored_sections,
              (SELECT json_agg(json_build_object('id', crr.id, 'name', crr.reviewer_name, 'role', crr.role, 'submitted_at', crr.submitted_at))
               FROM color_review_reviewers crr WHERE crr.review_id = cr.id) AS reviewers
       FROM color_reviews cr
       WHERE cr.capture_id = $1
       ORDER BY cr.created_at DESC`,
      [captureId]
    );

    return reply.status(200).send(successEnvelope({ items: res.rows }, req.requestId));
  });

  // ── Review detail ─────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>('/v3/reviews/:id', async (req, reply) => {
    const reviewId = parseInt(req.params.id, 10);
    if (isNaN(reviewId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid review ID', req.requestId));
    }

    const reviewRes = await pool.query('SELECT * FROM color_reviews WHERE id = $1', [reviewId]);
    if (reviewRes.rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Review not found', req.requestId));
    }

    const review = reviewRes.rows[0];

    const sectionsRes = await pool.query(
      'SELECT * FROM color_review_sections WHERE review_id = $1 ORDER BY display_order ASC',
      [reviewId]
    );

    const reviewersRes = await pool.query(
      'SELECT * FROM color_review_reviewers WHERE review_id = $1',
      [reviewId]
    );

    const scoresRes = await pool.query(
      `SELECT crs.* FROM color_review_scores crs
       JOIN color_review_sections s ON s.id = crs.section_id
       WHERE s.review_id = $1`,
      [reviewId]
    );

    const complianceRes = await pool.query(
      'SELECT * FROM color_review_compliance WHERE review_id = $1 ORDER BY id ASC',
      [reviewId]
    );

    return reply.status(200).send(successEnvelope({
      ...review,
      sections: sectionsRes.rows,
      reviewers: reviewersRes.rows,
      scores: scoresRes.rows,
      compliance: complianceRes.rows,
    }, req.requestId));
  });

  // ── Score a section ───────────────────────────────────────────────────

  app.patch<{
    Params: { id: string; sid: string };
    Body: {
      reviewer_id: number;
      score?: number;
      color_rating?: string;
      strengths?: string;
      weaknesses?: string;
      recommendations?: string;
    };
  }>('/v3/reviews/:id/sections/:sid/score', async (req, reply) => {
    const sectionId = parseInt(req.params.sid, 10);
    const { reviewer_id, score, color_rating, strengths, weaknesses, recommendations } = req.body;

    if (isNaN(sectionId) || !reviewer_id) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid section_id or missing reviewer_id', req.requestId));
    }

    const res = await pool.query(
      `INSERT INTO color_review_scores (section_id, reviewer_id, score, color_rating, strengths, weaknesses, recommendations)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (section_id, reviewer_id) DO UPDATE SET
         score = COALESCE(EXCLUDED.score, color_review_scores.score),
         color_rating = COALESCE(EXCLUDED.color_rating, color_review_scores.color_rating),
         strengths = COALESCE(EXCLUDED.strengths, color_review_scores.strengths),
         weaknesses = COALESCE(EXCLUDED.weaknesses, color_review_scores.weaknesses),
         recommendations = COALESCE(EXCLUDED.recommendations, color_review_scores.recommendations),
         submitted_at = NOW()
       RETURNING *`,
      [sectionId, reviewer_id, score ?? null, color_rating ?? null, strengths ?? null, weaknesses ?? null, recommendations ?? null]
    );

    // Mark the review as in_progress if it was scheduled
    const reviewId = parseInt(req.params.id, 10);
    await pool.query(
      `UPDATE color_reviews SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1 AND status = 'scheduled'`,
      [reviewId]
    );

    return reply.status(200).send(successEnvelope(res.rows[0], req.requestId));
  });

  // ── Compliance toggle ─────────────────────────────────────────────────

  app.patch<{
    Params: { id: string; cid: string };
    Body: { is_compliant?: boolean; proposal_addressed_in?: string; notes?: string };
  }>('/v3/reviews/:id/compliance/:cid', async (req, reply) => {
    const cid = parseInt(req.params.cid, 10);
    if (isNaN(cid)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid compliance ID', req.requestId));
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const allowedFields = ['is_compliant', 'proposal_addressed_in', 'notes'];
    for (const field of allowedFields) {
      const val = (req.body as Record<string, unknown>)[field];
      if (val !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(val);
      }
    }

    if (sets.length === 0) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No fields to update', req.requestId));
    }

    params.push(cid);
    const res = await pool.query(
      `UPDATE color_review_compliance SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (res.rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Compliance item not found', req.requestId));
    }

    return reply.status(200).send(successEnvelope(res.rows[0], req.requestId));
  });

  // ── Complete a review ─────────────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/v3/reviews/:id/complete', async (req, reply) => {
    const reviewId = parseInt(req.params.id, 10);
    if (isNaN(reviewId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid review ID', req.requestId));
    }

    const reviewRes = await pool.query('SELECT * FROM color_reviews WHERE id = $1', [reviewId]);
    if (reviewRes.rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Review not found', req.requestId));
    }

    const review = reviewRes.rows[0] as { id: number; capture_id: number; status: string };

    if (review.status === 'complete') {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Review is already complete', req.requestId));
    }

    // Compute overall rating from section scores
    const sectionsRes = await pool.query(
      `SELECT s.weight_pct,
              (SELECT AVG(crs.score) FROM color_review_scores crs WHERE crs.section_id = s.id) AS score
       FROM color_review_sections s WHERE s.review_id = $1`,
      [reviewId]
    );

    const sections = sectionsRes.rows.map((r: Record<string, unknown>) => ({
      score: r.score as number | null,
      weight_pct: r.weight_pct as number | null,
    }));

    const { rating, score } = computeOverallRating(sections);
    const pwinImpact = colorRatingToPwinImpact(rating);

    // Update review
    await pool.query(
      `UPDATE color_reviews SET
        status = 'complete',
        completed_date = CURRENT_DATE,
        overall_color_rating = $1,
        overall_score = $2,
        pwin_impact = $3,
        updated_at = NOW()
       WHERE id = $4`,
      [rating, score, pwinImpact, reviewId]
    );

    // Recompute Pwin for the capture
    const pwin = await computePwin(review.capture_id);

    // Create action items from recommendations
    const recsRes = await pool.query(
      `SELECT crs.recommendations, s.section_name
       FROM color_review_scores crs
       JOIN color_review_sections s ON s.id = crs.section_id
       WHERE s.review_id = $1 AND crs.recommendations IS NOT NULL AND crs.recommendations != ''`,
      [reviewId]
    );

    for (const rec of recsRes.rows) {
      const r = rec as { recommendations: string; section_name: string };
      await pool.query(
        `INSERT INTO action_items (title, body, owner_email, status, source_id)
         VALUES ($1, $2, 'shawn@envisioninnovative.com', 'open',
                 (SELECT id FROM sources WHERE kind = 'internal' LIMIT 1))`,
        [`Review finding: ${r.section_name}`, r.recommendations]
      );
    }

    logger.info({ reviewId, rating, score, pwinImpact, pwin }, 'Color review completed');

    return reply.status(200).send(successEnvelope({
      overall_color_rating: rating,
      overall_score: score,
      pwin_impact: pwinImpact,
      computed_pwin: pwin,
    }, req.requestId));
  });

  // ── My Open Reviews ───────────────────────────────────────────────────

  app.get('/v3/reviews/mine', async (req, reply) => {
    const res = await pool.query(
      `SELECT cr.id AS review_id, cr.color, cr.status, cr.scheduled_date,
              cr.capture_id,
              c.pipeline_item_id,
              o.title AS capture_name,
              (SELECT COUNT(*) FROM color_review_sections WHERE review_id = cr.id) AS total_sections,
              (SELECT COUNT(DISTINCT crs.section_id) FROM color_review_scores crs
               JOIN color_review_sections s ON s.id = crs.section_id
               WHERE s.review_id = cr.id) AS scored_sections
       FROM color_reviews cr
       JOIN captures c ON c.id = cr.capture_id
       LEFT JOIN pipeline_items pi ON pi.id = c.pipeline_item_id
       LEFT JOIN opportunities o ON o.id = pi.opportunity_id AND o.deleted_at IS NULL
       WHERE cr.status IN ('scheduled', 'in_progress')
       ORDER BY cr.scheduled_date ASC NULLS LAST`
    );

    return reply.status(200).send(successEnvelope({ items: res.rows }, req.requestId));
  });

  // ── AI Suggest Score ──────────────────────────────────────────────────

  app.post<{
    Params: { id: string };
    Body: { section_id: number };
  }>('/v3/reviews/:id/ai-suggest', async (req, reply) => {
    const reviewId = parseInt(req.params.id, 10);
    const { section_id } = req.body;

    if (isNaN(reviewId) || !section_id) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid review_id or section_id', req.requestId));
    }

    // Get section details
    const sectionRes = await pool.query(
      'SELECT * FROM color_review_sections WHERE id = $1 AND review_id = $2',
      [section_id, reviewId]
    );
    if (sectionRes.rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Section not found', req.requestId));
    }

    const section = sectionRes.rows[0] as {
      section_name: string;
      section_m_criterion: string | null;
      rfp_text_excerpt: string | null;
      proposal_text_excerpt: string | null;
    };

    // Get review rubric
    const reviewRes = await pool.query('SELECT rubric FROM color_reviews WHERE id = $1', [reviewId]);
    const rubric = (reviewRes.rows[0] as { rubric: string })?.rubric ?? 'shipley_5';

    // Return a structured AI suggestion (actual LLM call would go through llmRouter)
    const suggestion = {
      suggested_score: 3,
      suggested_color_rating: 'Green',
      strengths: `The proposal section addresses the ${section.section_name} criterion with specific examples and metrics.`,
      weaknesses: `Could strengthen the response with additional past performance references directly aligned to ${section.section_m_criterion ?? 'the evaluation factor'}.`,
      recommendations: `Add 1-2 specific past performance examples that demonstrate capability in ${section.section_name}. Quantify outcomes where possible.`,
      rubric_used: rubric,
      model_note: 'AI suggestion — review and edit before saving.',
    };

    return reply.status(200).send(successEnvelope(suggestion, req.requestId));
  });

  // ── RFP Section L+M extraction ────────────────────────────────────────

  app.post<{ Params: { id: string } }>('/v3/reviews/:id/extract-rfp', async (req, reply) => {
    const reviewId = parseInt(req.params.id, 10);
    if (isNaN(reviewId)) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'Invalid review ID', req.requestId));
    }

    const reviewRes = await pool.query('SELECT * FROM color_reviews WHERE id = $1', [reviewId]);
    if (reviewRes.rows.length === 0) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', 'Review not found', req.requestId));
    }

    const review = reviewRes.rows[0] as { rfp_vault_doc_id: number | null };

    if (!review.rfp_vault_doc_id) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'No RFP document linked to this review', req.requestId));
    }

    // Get RFP text from vault
    const vaultRes = await pool.query(
      'SELECT extracted_text FROM vault_documents WHERE id = $1',
      [review.rfp_vault_doc_id]
    );

    if (vaultRes.rows.length === 0 || !(vaultRes.rows[0] as { extracted_text: string | null }).extracted_text) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'RFP document has no extracted text', req.requestId));
    }

    // Placeholder: in production this would call the LLM to extract Section L/M
    // For now, create placeholder sections
    const placeholderSections = [
      { name: 'Technical Approach', criterion: 'M.1 Technical Approach', weight: 35 },
      { name: 'Management Approach', criterion: 'M.2 Management Approach', weight: 25 },
      { name: 'Past Performance', criterion: 'M.3 Past Performance', weight: 20 },
      { name: 'Staffing Plan', criterion: 'M.4 Staffing/Key Personnel', weight: 15 },
      { name: 'Small Business', criterion: 'M.5 Small Business Participation', weight: 5 },
    ];

    for (let i = 0; i < placeholderSections.length; i++) {
      const s = placeholderSections[i];
      await pool.query(
        `INSERT INTO color_review_sections (review_id, section_name, section_m_criterion, weight_pct, display_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [reviewId, s.name, s.criterion, s.weight, i + 1]
      );
    }

    // Add sample compliance items
    const complianceItems = [
      { shall: 'Contractor shall provide qualified key personnel', ref: 'L.5.2.1' },
      { shall: 'Contractor shall demonstrate relevant past performance', ref: 'L.5.3.1' },
      { shall: 'Contractor shall submit a detailed transition plan', ref: 'L.5.4.1' },
    ];

    for (const item of complianceItems) {
      await pool.query(
        `INSERT INTO color_review_compliance (review_id, shall_statement, rfp_reference)
         VALUES ($1, $2, $3)`,
        [reviewId, item.shall, item.ref]
      );
    }

    return reply.status(200).send(successEnvelope({
      sections_created: placeholderSections.length,
      compliance_items_created: complianceItems.length,
    }, req.requestId));
  });
}
