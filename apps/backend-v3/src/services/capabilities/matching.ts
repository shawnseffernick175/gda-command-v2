/**
 * Capability matching engine — scores opportunity against the Envision catalog.
 *
 * Scoring weights (tuned to avoid over-matching on generic capabilities):
 *   NAICS exact match:    0.40  (highest — verifiable, objective)
 *   PSC code match:       0.15
 *   Agency match:         0.15
 *   Description overlap:  0.20  (keyword/phrase similarity)
 *   Certification match:  0.10
 */

import { pool } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { Capability, CapabilityMatch, MatchReason } from './types.js';

const NAICS_WEIGHT = 0.40;
const PSC_WEIGHT = 0.15;
const AGENCY_WEIGHT = 0.15;
const DESCRIPTION_WEIGHT = 0.20;
const CERT_WEIGHT = 0.10;

interface OpportunityContext {
  id: string;
  title: string | null;
  description: string | null;
  naics: string | null;
  psc: string | null;
  agency: string | null;
  set_aside: string | null;
}

function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function computeKeywordOverlap(textA: string, textB: string): number {
  const wordsA = new Set(normalizeText(textA));
  const wordsB = new Set(normalizeText(textB));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

function scoreCapabilityMatch(
  opp: OpportunityContext,
  cap: Capability,
): { score: number; reasons: MatchReason[] } {
  const reasons: MatchReason[] = [];
  let totalScore = 0;

  // NAICS match (exact prefix match on first 4+ digits)
  if (opp.naics && cap.naics_codes.length > 0) {
    const oppNaics = opp.naics.trim();
    const exactMatch = cap.naics_codes.some((c) => c === oppNaics);
    const prefixMatch = !exactMatch && cap.naics_codes.some(
      (c) => oppNaics.startsWith(c.slice(0, 4)) || c.startsWith(oppNaics.slice(0, 4)),
    );
    if (exactMatch) {
      totalScore += NAICS_WEIGHT;
      reasons.push({ factor: 'naics_exact', weight: NAICS_WEIGHT, detail: `NAICS ${oppNaics} exact match` });
    } else if (prefixMatch) {
      const partial = NAICS_WEIGHT * 0.5;
      totalScore += partial;
      reasons.push({ factor: 'naics_prefix', weight: partial, detail: `NAICS ${oppNaics} prefix match` });
    }
  }

  // PSC code match
  if (opp.psc && cap.psc_codes.length > 0) {
    const oppPsc = opp.psc.trim().toUpperCase();
    const match = cap.psc_codes.some((c) => c.toUpperCase() === oppPsc);
    if (match) {
      totalScore += PSC_WEIGHT;
      reasons.push({ factor: 'psc_match', weight: PSC_WEIGHT, detail: `PSC ${oppPsc} match` });
    }
  }

  // Agency match
  if (opp.agency && cap.agencies_strong_in.length > 0) {
    const oppAgency = opp.agency.toLowerCase();
    const match = cap.agencies_strong_in.some((a) =>
      oppAgency.includes(a.toLowerCase()) || a.toLowerCase().includes(oppAgency),
    );
    if (match) {
      totalScore += AGENCY_WEIGHT;
      reasons.push({ factor: 'agency_match', weight: AGENCY_WEIGHT, detail: `Agency match: ${opp.agency}` });
    }
  }

  // Description/title keyword overlap
  const oppText = [opp.title, opp.description].filter(Boolean).join(' ');
  const capText = [cap.name, cap.description].join(' ');
  if (oppText && capText) {
    const overlap = computeKeywordOverlap(oppText, capText);
    const descScore = overlap * DESCRIPTION_WEIGHT;
    if (descScore > 0.01) {
      totalScore += descScore;
      reasons.push({
        factor: 'description_overlap',
        weight: parseFloat(descScore.toFixed(4)),
        detail: `Keyword overlap: ${(overlap * 100).toFixed(0)}%`,
      });
    }
  }

  // Certification relevance (if opp is set-aside and cap has matching certs)
  if (opp.set_aside && cap.certifications.length > 0) {
    const setAside = opp.set_aside.toLowerCase();
    const certMatch = cap.certifications.some((c) => {
      const cl = c.toLowerCase();
      return setAside.includes(cl) || cl.includes(setAside) ||
        (setAside.includes('small') && cl.includes('sdb')) ||
        (setAside.includes('hubzone') && cl.includes('hubzone')) ||
        (setAside.includes('sdvosb') && cl.includes('sdvosb'));
    });
    if (certMatch) {
      totalScore += CERT_WEIGHT;
      reasons.push({ factor: 'cert_match', weight: CERT_WEIGHT, detail: `Certification aligns with set-aside: ${opp.set_aside}` });
    }
  }

  return { score: Math.min(totalScore, 1), reasons };
}

export async function matchOpportunityCapabilities(
  opportunityId: string,
): Promise<CapabilityMatch[]> {
  const oppRes = await pool.query<OpportunityContext>(
    `SELECT id, title, description, naics, psc, agency, set_aside
     FROM opportunities WHERE id = $1 AND deleted_at IS NULL`,
    [opportunityId],
  );
  if (oppRes.rows.length === 0) {
    throw new Error(`Opportunity ${opportunityId} not found`);
  }
  const opp = oppRes.rows[0]!;

  // Fetch all active Envision capabilities (OU3 is the only qualification gate)
  const capRes = await pool.query<Capability>(
    `SELECT * FROM capabilities WHERE active = true ORDER BY ou, name`,
  );
  const capabilities = capRes.rows;

  const matches: CapabilityMatch[] = [];
  for (const cap of capabilities) {
    const { score, reasons } = scoreCapabilityMatch(opp, cap);
    if (score > 0) {
      matches.push({
        opportunity_id: opportunityId,
        capability_id: cap.id,
        match_score: parseFloat(score.toFixed(4)),
        match_reasons: reasons,
        computed_at: new Date().toISOString(),
        capability: cap,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.match_score - a.match_score);

  // Persist matches (upsert)
  if (matches.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM opportunity_capability_matches WHERE opportunity_id = $1',
        [opportunityId],
      );
      for (const m of matches) {
        await client.query(
          `INSERT INTO opportunity_capability_matches
           (opportunity_id, capability_id, match_score, match_reasons, computed_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [m.opportunity_id, m.capability_id, m.match_score, JSON.stringify(m.match_reasons), m.computed_at],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, opportunityId }, 'Failed to persist capability matches');
      throw err;
    } finally {
      client.release();
    }
  }

  return matches;
}

export async function getOpportunityCapabilityMatches(
  opportunityId: string,
): Promise<CapabilityMatch[]> {
  const res = await pool.query<{
    opportunity_id: string;
    capability_id: string;
    match_score: string;
    match_reasons: MatchReason[];
    computed_at: string;
  }>(
    `SELECT m.opportunity_id, m.capability_id, m.match_score, m.match_reasons, m.computed_at
     FROM opportunity_capability_matches m
     WHERE m.opportunity_id = $1
     ORDER BY m.match_score DESC`,
    [opportunityId],
  );

  if (res.rows.length === 0) return [];

  // Hydrate with capability details
  const capIds = res.rows.map((r) => r.capability_id);
  const capRes = await pool.query<Capability>(
    `SELECT * FROM capabilities WHERE id = ANY($1)`,
    [capIds],
  );
  const capMap = new Map(capRes.rows.map((c) => [c.id, c]));

  return res.rows.map((r) => ({
    opportunity_id: r.opportunity_id,
    capability_id: r.capability_id,
    match_score: parseFloat(String(r.match_score)),
    match_reasons: r.match_reasons,
    computed_at: r.computed_at,
    capability: capMap.get(r.capability_id),
  }));
}
