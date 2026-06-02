/**
 * Dup-candidate service (F-440).
 *
 * Loads opportunity rows, runs the pure findDupCandidates() algorithm,
 * and hydrates each candidate pair with display context.
 *
 * Read-only — no INSERT/UPDATE/DELETE in this module.
 */

import type pg from 'pg';
import {
  findDupCandidates,
  type DupCandidate,
  type DupOpportunity,
  type DupTier,
} from '../../matching/dup-candidates.js';
import { clampLimit } from './match-suggestions.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DupCandidateDisplay {
  id: number;
  title: string | null;
  agency: string | null;
  naics: string | null;
  solicitation_number: string | null;
}

export interface ListDupCandidatesResult {
  items: Array<DupCandidate & {
    left: DupCandidateDisplay;
    right: DupCandidateDisplay;
  }>;
  meta: { scanned: number; strong: number; weak: number; limit: number };
}

// ─── Query ──────────────────────────────────────────────────────────────────

const CANDIDATE_COLUMNS_SQL = `
  SELECT id, title, agency, naics, solicitation_number,
         sam_notice_id, value_min, value_max
    FROM opportunities
   WHERE deleted_at IS NULL`;

// ─── Service ────────────────────────────────────────────────────────────────

export async function listDupCandidates(
  pool: pg.Pool,
  opts?: { limit?: number; tier?: DupTier },
): Promise<ListDupCandidatesResult> {
  const limit = clampLimit(opts?.limit);
  const tierFilter = opts?.tier ?? null;

  const res = await pool.query(CANDIDATE_COLUMNS_SQL);
  const rows = res.rows as Array<Record<string, unknown>>;

  // Coerce bigint ids (PG returns string for bigint) at the service boundary.
  const opps: DupOpportunity[] = rows.map((r) => ({
    id: Number(r.id),
    title: (r.title as string) ?? null,
    agency: (r.agency as string) ?? null,
    naics: (r.naics as string) ?? null,
    solicitation_number: (r.solicitation_number as string) ?? null,
    sam_notice_id: (r.sam_notice_id as string) ?? null,
    value_min: r.value_min != null ? Number(r.value_min) : null,
    value_max: r.value_max != null ? Number(r.value_max) : null,
  }));

  // Build a lookup map for hydration (no extra queries).
  const byId = new Map<number, DupOpportunity>();
  for (const opp of opps) byId.set(opp.id, opp);

  const allCandidates = findDupCandidates(opps);

  // Total counts before any filtering (always show the full picture).
  const strong = allCandidates.filter((c) => c.tier === 'STRONG').length;
  const weak = allCandidates.filter((c) => c.tier === 'WEAK').length;

  // Optional tier filter, then limit.
  const filtered = tierFilter
    ? allCandidates.filter((c) => c.tier === tierFilter)
    : allCandidates;
  const sliced = filtered.slice(0, limit);

  const items = sliced.map((c) => {
    const left = byId.get(c.left_id)!;
    const right = byId.get(c.right_id)!;
    return {
      ...c,
      left: {
        id: left.id,
        title: left.title,
        agency: left.agency,
        naics: left.naics,
        solicitation_number: left.solicitation_number,
      },
      right: {
        id: right.id,
        title: right.title,
        agency: right.agency,
        naics: right.naics,
        solicitation_number: right.solicitation_number,
      },
    };
  });

  return {
    items,
    meta: { scanned: opps.length, strong, weak, limit },
  };
}
