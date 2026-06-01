/**
 * OpportunityRepo — CRUD + query helpers for the unified opportunity model.
 *
 * Operates on: unified_opportunities, unified_opportunity_links,
 * unified_opportunity_field_overrides, unified_opportunity_signals tables (v3_026).
 */

import type pg from 'pg';
import type {
  Opportunity,
  OpportunityInsert,
  OpportunityUpdate,
  OpportunityLink,
  OpportunityLinkInsert,
  OpportunityFieldOverride,
  OpportunityFieldOverrideInsert,
  OpportunitySignal,
  OpportunitySignalInsert,
  LifecycleStage,
  FindStageOptions,
} from '../types/opportunity.js';

const UPDATABLE_FIELDS = new Set([
  'lifecycle_stage',
  'primary_source',
  'title',
  'agency',
  'office',
  'naics',
  'psc',
  'set_aside',
  'estimated_value_cents',
  'posted_at',
  'response_due_at',
  'award_at',
  'pwin',
  'doctrine_status',
]);

export class OpportunityRepo {
  constructor(private pool: pg.Pool) {}

  // ─── opportunities CRUD ──────────────────────────────────────────────────

  async create(input: OpportunityInsert): Promise<Opportunity> {
    const fields: string[] = ['lifecycle_stage'];
    const values: unknown[] = [input.lifecycle_stage];
    let idx = 2;

    const optional: Array<[string, unknown]> = [
      ['internal_id', input.internal_id],
      ['primary_source', input.primary_source],
      ['title', input.title],
      ['agency', input.agency],
      ['office', input.office],
      ['naics', input.naics],
      ['psc', input.psc],
      ['set_aside', input.set_aside],
      ['estimated_value_cents', input.estimated_value_cents],
      ['posted_at', input.posted_at],
      ['response_due_at', input.response_due_at],
      ['award_at', input.award_at],
      ['pwin', input.pwin],
      ['doctrine_status', input.doctrine_status],
    ];

    for (const [field, value] of optional) {
      if (value !== undefined) {
        fields.push(field);
        values.push(value);
        idx++;
      }
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `
      INSERT INTO unified_opportunities (${fields.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.pool.query(sql, values);
    return result.rows[0] as Opportunity;
  }

  async findById(internalId: string): Promise<Opportunity | null> {
    const result = await this.pool.query(
      `SELECT * FROM unified_opportunities WHERE internal_id = $1`,
      [internalId],
    );
    return (result.rows[0] as Opportunity) ?? null;
  }

  async update(internalId: string, input: OpportunityUpdate): Promise<Opportunity | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const entries = Object.entries(input).filter(
      ([k, v]) => v !== undefined && UPDATABLE_FIELDS.has(k),
    );
    if (entries.length === 0) return this.findById(internalId);

    for (const [key, value] of entries) {
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(internalId);

    const sql = `
      UPDATE unified_opportunities
      SET ${setClauses.join(', ')}
      WHERE internal_id = $${idx}
      RETURNING *
    `;

    const result = await this.pool.query(sql, values);
    return (result.rows[0] as Opportunity) ?? null;
  }

  async delete(internalId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM unified_opportunities WHERE internal_id = $1`,
      [internalId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Stage-based queries ─────────────────────────────────────────────────

  async findStage(stage: LifecycleStage, opts?: FindStageOptions): Promise<Opportunity[]> {
    const conditions: string[] = ['lifecycle_stage = $1'];
    const values: unknown[] = [stage];
    let idx = 2;

    if (opts?.agency) {
      conditions.push(`agency = $${idx}`);
      values.push(opts.agency);
      idx++;
    }
    if (opts?.naics) {
      conditions.push(`naics = $${idx}`);
      values.push(opts.naics);
      idx++;
    }
    if (opts?.due_before) {
      conditions.push(`response_due_at <= $${idx}`);
      values.push(opts.due_before);
      idx++;
    }
    if (opts?.due_after) {
      conditions.push(`response_due_at >= $${idx}`);
      values.push(opts.due_after);
      idx++;
    }

    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    const sql = `
      SELECT * FROM unified_opportunities
      WHERE ${conditions.join(' AND ')}
      ORDER BY response_due_at ASC NULLS LAST
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);

    const result = await this.pool.query(sql, values);
    return result.rows as Opportunity[];
  }

  // ─── Link operations ─────────────────────────────────────────────────────

  async findByLink(source: string, sourceNativeId: string): Promise<Opportunity | null> {
    const sql = `
      SELECT o.* FROM unified_opportunities o
      JOIN unified_opportunity_links l ON l.internal_id = o.internal_id
      WHERE l.source = $1 AND l.source_native_id = $2
    `;
    const result = await this.pool.query(sql, [source, sourceNativeId]);
    return (result.rows[0] as Opportunity) ?? null;
  }

  async createLink(input: OpportunityLinkInsert): Promise<OpportunityLink> {
    const sql = `
      INSERT INTO unified_opportunity_links
        (internal_id, source, source_native_id, confidence, match_method, matched_at, confirmed_by, confirmed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const result = await this.pool.query(sql, [
      input.internal_id,
      input.source,
      input.source_native_id,
      input.confidence ?? null,
      input.match_method ?? null,
      input.matched_at ?? null,
      input.confirmed_by ?? null,
      input.confirmed_at ?? null,
    ]);
    return result.rows[0] as OpportunityLink;
  }

  async findLinksByInternalId(internalId: string): Promise<OpportunityLink[]> {
    const result = await this.pool.query(
      `SELECT * FROM unified_opportunity_links WHERE internal_id = $1`,
      [internalId],
    );
    return result.rows as OpportunityLink[];
  }

  // ─── Field overrides ─────────────────────────────────────────────────────

  async setFieldOverride(input: OpportunityFieldOverrideInsert): Promise<OpportunityFieldOverride> {
    const sql = `
      INSERT INTO unified_opportunity_field_overrides
        (internal_id, field_name, field_value_json, set_by, reason)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (internal_id, field_name)
      DO UPDATE SET
        field_value_json = EXCLUDED.field_value_json,
        set_by = EXCLUDED.set_by,
        set_at = NOW(),
        reason = EXCLUDED.reason
      RETURNING *
    `;
    const result = await this.pool.query(sql, [
      input.internal_id,
      input.field_name,
      JSON.stringify(input.field_value_json),
      input.set_by,
      input.reason ?? null,
    ]);
    return result.rows[0] as OpportunityFieldOverride;
  }

  async getFieldOverrides(internalId: string): Promise<OpportunityFieldOverride[]> {
    const result = await this.pool.query(
      `SELECT * FROM unified_opportunity_field_overrides WHERE internal_id = $1`,
      [internalId],
    );
    return result.rows as OpportunityFieldOverride[];
  }

  // ─── Signals ─────────────────────────────────────────────────────────────

  async addSignal(input: OpportunitySignalInsert): Promise<OpportunitySignal> {
    const sql = `
      INSERT INTO unified_opportunity_signals
        (internal_id, signal_type, signal_native_id, signal_payload_json, signal_score)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await this.pool.query(sql, [
      input.internal_id,
      input.signal_type,
      input.signal_native_id ?? null,
      input.signal_payload_json ? JSON.stringify(input.signal_payload_json) : null,
      input.signal_score ?? null,
    ]);
    return result.rows[0] as OpportunitySignal;
  }

  async getSignals(internalId: string): Promise<OpportunitySignal[]> {
    const result = await this.pool.query(
      `SELECT * FROM unified_opportunity_signals WHERE internal_id = $1 ORDER BY created_at DESC`,
      [internalId],
    );
    return result.rows as OpportunitySignal[];
  }
}
