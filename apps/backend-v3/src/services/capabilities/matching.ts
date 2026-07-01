/**
 * Capability matching — scores each Envision capability against an opportunity.
 *
 * Scoring strategy:
 * - NAICS exact match: 0.4 weight
 * - PSC code overlap: 0.15 weight
 * - Agency overlap: 0.15 weight
 * - Description keyword similarity: 0.2 weight
 * - Evidence grade bonus: 0.1 weight (A=1.0, B=0.6, C=0.2)
 *
 * Only active Envision (OU3) capabilities are scored for qualification.
 * OU1/OU2 matches are returned as teaming context but do not qualify.
 */

import { pool } from '../../lib/db.js';
import type { Capability } from './crud.js';

export interface CapabilityMatch {
  opportunity_id: string;
  capability_id: string;
  capability_name: string;
  capability_category: string;
  capability_ou: string;
  match_score: number;
  match_reasons: MatchReason[];
  evidence_grade: string | null;
  computed_at: string;
}

interface MatchReason {
  factor: string;
  score: number;
  detail: string;
}

interface OpportunityMatchContext {
  id: string;
  title: string;
  description: string | null;
  naics: string | null;
  psc_code: string | null;
  agency: string | null;
  department: string | null;
  set_aside: string | null;
}

const WEIGHTS = {
  naics: 0.40,
  psc: 0.15,
  agency: 0.15,
  description: 0.20,
  evidence: 0.10,
};

function normalizeNaics(code: string | null): string | null {
  if (!code) return null;
  return code.replace(/[^0-9]/g, '').slice(0, 6);
}

function computeNaicsScore(oppNaics: string | null, capNaics: string[]): { score: number; detail: string } {
  if (!oppNaics || capNaics.length === 0) {
    return { score: 0, detail: 'No NAICS data to compare' };
  }

  const normalized = normalizeNaics(oppNaics);
  if (!normalized) return { score: 0, detail: 'Invalid NAICS format' };

  for (const cn of capNaics) {
    const capNorm = normalizeNaics(cn);
    if (capNorm && capNorm === normalized) {
      return { score: 1.0, detail: `Exact NAICS match: ${normalized}` };
    }
  }

  // Prefix match (first 4 digits = same industry group)
  for (const cn of capNaics) {
    const capNorm = normalizeNaics(cn);
    if (capNorm && normalized.length >= 4 && capNorm.slice(0, 4) === normalized.slice(0, 4)) {
      return { score: 0.6, detail: `NAICS industry group match: ${normalized.slice(0, 4)}xx` };
    }
  }

  // Sector match (first 2 digits)
  for (const cn of capNaics) {
    const capNorm = normalizeNaics(cn);
    if (capNorm && normalized.length >= 2 && capNorm.slice(0, 2) === normalized.slice(0, 2)) {
      return { score: 0.3, detail: `NAICS sector match: ${normalized.slice(0, 2)}xxxx` };
    }
  }

  return { score: 0, detail: 'No NAICS overlap' };
}

function computePscScore(oppPsc: string | null, capPscs: string[]): { score: number; detail: string } {
  if (!oppPsc || capPscs.length === 0) {
    return { score: 0, detail: 'No PSC data to compare' };
  }

  const norm = oppPsc.trim().toUpperCase();
  for (const cp of capPscs) {
    if (cp.trim().toUpperCase() === norm) {
      return { score: 1.0, detail: `Exact PSC match: ${norm}` };
    }
  }

  // Prefix match (first 2 chars)
  for (const cp of capPscs) {
    if (cp.trim().toUpperCase().slice(0, 2) === norm.slice(0, 2)) {
      return { score: 0.5, detail: `PSC group match: ${norm.slice(0, 2)}` };
    }
  }

  return { score: 0, detail: 'No PSC overlap' };
}

function computeAgencyScore(
  oppAgency: string | null,
  oppDept: string | null,
  capAgencies: string[],
): { score: number; detail: string } {
  if (capAgencies.length === 0) {
    return { score: 0, detail: 'No agency data in capability' };
  }

  const targets = [oppAgency, oppDept].filter(Boolean).map((s) => s!.toLowerCase());
  if (targets.length === 0) {
    return { score: 0, detail: 'No agency data on opportunity' };
  }

  for (const ca of capAgencies) {
    const capLower = ca.toLowerCase();
    for (const t of targets) {
      if (capLower === t || t.includes(capLower) || capLower.includes(t)) {
        return { score: 1.0, detail: `Agency match: ${ca}` };
      }
    }
  }

  return { score: 0, detail: 'No agency overlap' };
}

function computeDescriptionScore(
  oppTitle: string,
  oppDesc: string | null,
  capName: string,
  capDesc: string,
): { score: number; detail: string } {
  const oppText = `${oppTitle} ${oppDesc ?? ''}`.toLowerCase();
  const capWords = `${capName} ${capDesc}`
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  if (capWords.length === 0) {
    return { score: 0, detail: 'No capability keywords' };
  }

  const uniqueWords = [...new Set(capWords)];
  const matchedWords = uniqueWords.filter((w) => oppText.includes(w));
  const ratio = matchedWords.length / uniqueWords.length;

  if (ratio >= 0.5) {
    return { score: Math.min(ratio, 1.0), detail: `Strong keyword overlap (${matchedWords.length}/${uniqueWords.length} terms)` };
  }
  if (ratio >= 0.2) {
    return { score: ratio, detail: `Partial keyword overlap (${matchedWords.length}/${uniqueWords.length} terms)` };
  }
  return { score: ratio, detail: `Weak keyword overlap (${matchedWords.length}/${uniqueWords.length} terms)` };
}

function computeEvidenceScore(grade: string | null): { score: number; detail: string } {
  if (grade === 'A') return { score: 1.0, detail: 'Evidence grade A — past performance documented' };
  if (grade === 'B') return { score: 0.6, detail: 'Evidence grade B — moderate evidence' };
  if (grade === 'C') return { score: 0.2, detail: 'Evidence grade C — minimal evidence' };
  return { score: 0, detail: 'No evidence grade assigned' };
}

function scoreCapability(opp: OpportunityMatchContext, cap: Capability): { score: number; reasons: MatchReason[] } {
  const naics = computeNaicsScore(opp.naics, cap.naics_codes);
  const psc = computePscScore(opp.psc_code, cap.psc_codes);
  const agency = computeAgencyScore(opp.agency, opp.department, cap.agencies_strong_in);
  const desc = computeDescriptionScore(opp.title, opp.description, cap.name, cap.description);
  const evidence = computeEvidenceScore(cap.evidence_grade);

  const weightedScore =
    naics.score * WEIGHTS.naics +
    psc.score * WEIGHTS.psc +
    agency.score * WEIGHTS.agency +
    desc.score * WEIGHTS.description +
    evidence.score * WEIGHTS.evidence;

  const reasons: MatchReason[] = [
    { factor: 'naics', score: naics.score, detail: naics.detail },
    { factor: 'psc', score: psc.score, detail: psc.detail },
    { factor: 'agency', score: agency.score, detail: agency.detail },
    { factor: 'description', score: desc.score, detail: desc.detail },
    { factor: 'evidence', score: evidence.score, detail: evidence.detail },
  ];

  return { score: Math.round(weightedScore * 1000) / 1000, reasons };
}

export async function computeCapabilityMatches(opportunityId: string): Promise<CapabilityMatch[]> {
  // Fetch opportunity context
  const oppRes = await pool.query<OpportunityMatchContext>(
    `SELECT id::text, title, description, naics, psc_code, agency, department, set_aside
     FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
    [opportunityId],
  );

  const opp = oppRes.rows[0];
  if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

  // Fetch all active capabilities
  const capRes = await pool.query<Capability>(
    'SELECT * FROM capabilities WHERE active = true ORDER BY ou, category, name',
  );

  const matches: CapabilityMatch[] = [];
  const now = new Date().toISOString();

  for (const cap of capRes.rows) {
    const { score, reasons } = scoreCapability(opp, cap);

    // Only persist matches with non-zero scores
    if (score > 0) {
      matches.push({
        opportunity_id: opportunityId,
        capability_id: cap.id,
        capability_name: cap.name,
        capability_category: cap.category,
        capability_ou: cap.ou,
        match_score: score,
        match_reasons: reasons,
        evidence_grade: cap.evidence_grade,
        computed_at: now,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.match_score - a.match_score);

  // Persist matches (upsert)
  if (matches.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const m of matches) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, now())`);
      values.push(m.opportunity_id, m.capability_id, m.match_score, JSON.stringify(m.match_reasons));
      idx += 4;
    }

    await pool.query(
      `INSERT INTO opportunity_capability_matches (opportunity_id, capability_id, match_score, match_reasons, computed_at)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (opportunity_id, capability_id) DO UPDATE
         SET match_score = EXCLUDED.match_score,
             match_reasons = EXCLUDED.match_reasons,
             computed_at = EXCLUDED.computed_at`,
      values,
    );
  }

  return matches;
}

export async function getOpportunityCapabilityMatches(opportunityId: string): Promise<CapabilityMatch[]> {
  const res = await pool.query<{
    opportunity_id: string;
    capability_id: string;
    match_score: number;
    match_reasons: MatchReason[];
    computed_at: string;
    name: string;
    category: string;
    ou: string;
    evidence_grade: string | null;
  }>(
    `SELECT
       m.opportunity_id::text,
       m.capability_id::text,
       m.match_score,
       m.match_reasons,
       m.computed_at,
       c.name,
       c.category,
       c.ou,
       c.evidence_grade
     FROM opportunity_capability_matches m
     JOIN capabilities c ON c.id = m.capability_id
     WHERE m.opportunity_id = $1
     ORDER BY m.match_score DESC`,
    [opportunityId],
  );

  return res.rows.map((r) => ({
    opportunity_id: r.opportunity_id,
    capability_id: r.capability_id,
    capability_name: r.name,
    capability_category: r.category,
    capability_ou: r.ou,
    match_score: Number(r.match_score),
    match_reasons: r.match_reasons,
    evidence_grade: r.evidence_grade,
    computed_at: r.computed_at,
  }));
}
