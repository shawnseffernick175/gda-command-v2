/**
 * MatcherV1 — cross-source opportunity linking engine (F-403).
 *
 * Confidence tiers:
 *   HIGH   — exact match on a strong key (notice_id, or solicitation_number + agency).
 *            Auto-link, no review required.
 *   MEDIUM — fuzzy: title similarity ≥ 0.85 AND agency exact AND
 *            (naics exact OR dollar band overlap within 20%).
 *            Auto-link with confidence='MEDIUM', surfaces in review queue.
 *
 * Used by the backfill script and by future real-time ingest.
 */

import type { NormalizedOpportunity } from '../ingest/adapter/types.js';

export type MatchConfidence = 'HIGH' | 'MEDIUM';

export interface MatchCandidate {
  internalId: string;
  confidence: MatchConfidence;
  matchMethod: string;
  score: number;
}

export interface UnifiedRecord {
  internalId: string;
  title: string | null;
  agency: string | null;
  solicitationNumber: string | null;
  naics: string | null;
  estimatedValueCents: number | null;
  source: string;
  sourceNativeId: string;
}

/**
 * Jaro-Winkler similarity — pure TypeScript implementation.
 * Returns a value in [0, 1] where 1 = identical strings.
 */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

  let prefixLen = 0;
  for (let i = 0; i < Math.min(4, Math.min(a.length, b.length)); i++) {
    if (a[i] === b[i]) prefixLen++;
    else break;
  }

  return jaro + prefixLen * 0.1 * (1 - jaro);
}

/**
 * Check if two dollar amounts are within 20% of each other.
 */
function dollarBandOverlap(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  if (a === 0 && b === 0) return true;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return true;
  return Math.abs(a - b) / max <= 0.2;
}

export class MatcherV1 {
  private readonly byNoticeId = new Map<string, UnifiedRecord>();
  private readonly bySolAgency = new Map<string, UnifiedRecord>();
  private readonly byAgency = new Map<string, UnifiedRecord[]>();

  /**
   * Index an existing unified record so future normalized records can match.
   */
  index(record: UnifiedRecord): void {
    if (record.sourceNativeId) {
      this.byNoticeId.set(this.normalizeKey(record.sourceNativeId), record);
    }
    if (record.solicitationNumber) {
      this.byNoticeId.set(this.normalizeKey(record.solicitationNumber), record);
    }
    if (record.solicitationNumber && record.agency) {
      const key = this.solAgencyKey(record.solicitationNumber, record.agency);
      this.bySolAgency.set(key, record);
    }
    if (record.agency) {
      const agencyKey = record.agency.toLowerCase().trim();
      const list = this.byAgency.get(agencyKey) ?? [];
      list.push(record);
      this.byAgency.set(agencyKey, list);
    }
  }

  /**
   * Find the best candidate match for a normalized opportunity.
   * Returns null if no match meets the minimum threshold.
   */
  findCandidate(normalized: NormalizedOpportunity): MatchCandidate | null {
    const high = this.findHigh(normalized);
    if (high) return high;

    const medium = this.findMedium(normalized);
    if (medium) return medium;

    return null;
  }

  private findHigh(n: NormalizedOpportunity): MatchCandidate | null {
    // Match on solicitation_number shared across sources (e.g. SAM sol# = GovTribe sol#)
    if (n.solicitationNumber && n.agency) {
      const key = this.solAgencyKey(n.solicitationNumber, n.agency);
      const existing = this.bySolAgency.get(key);
      if (existing && existing.source !== n.source) {
        return {
          internalId: existing.internalId,
          confidence: 'HIGH',
          matchMethod: 'exact_sol_agency',
          score: 1.0,
        };
      }
    }

    // Match on solicitation_number appearing as another source's native ID
    if (n.solicitationNumber) {
      const existing = this.byNoticeId.get(this.normalizeKey(n.solicitationNumber));
      if (existing && existing.source !== n.source) {
        return {
          internalId: existing.internalId,
          confidence: 'HIGH',
          matchMethod: 'exact_notice_id',
          score: 1.0,
        };
      }
    }

    // Match on this record's native ID already indexed from another source
    if (n.sourceNativeId) {
      const existing = this.byNoticeId.get(this.normalizeKey(n.sourceNativeId));
      if (existing && existing.source !== n.source) {
        return {
          internalId: existing.internalId,
          confidence: 'HIGH',
          matchMethod: 'exact_notice_id',
          score: 1.0,
        };
      }
    }

    return null;
  }

  private findMedium(n: NormalizedOpportunity): MatchCandidate | null {
    if (!n.agency || !n.title) return null;

    const agencyKey = n.agency.toLowerCase().trim();
    const candidates = this.byAgency.get(agencyKey);
    if (!candidates) return null;

    let bestMatch: MatchCandidate | null = null;
    let bestScore = 0;

    for (const c of candidates) {
      if (c.source === n.source && c.sourceNativeId === n.sourceNativeId) continue;
      if (!c.title) continue;

      const titleSim = jaroWinkler(n.title, c.title);
      if (titleSim < 0.85) continue;

      const naicsMatch = n.naics !== null && c.naics !== null && n.naics === c.naics;
      const dollarMatch = dollarBandOverlap(n.estimatedValueCents, c.estimatedValueCents);

      if (!naicsMatch && !dollarMatch) continue;

      const score = titleSim;
      if (score > bestScore) {
        bestScore = score;
        const signals: string[] = [`title=${titleSim.toFixed(3)}`];
        if (naicsMatch) signals.push('naics_exact');
        if (dollarMatch) signals.push('dollar_band');

        bestMatch = {
          internalId: c.internalId,
          confidence: 'MEDIUM',
          matchMethod: `fuzzy_title_agency(${signals.join(',')})`,
          score,
        };
      }
    }

    return bestMatch;
  }

  private normalizeKey(id: string): string {
    return id.toLowerCase().trim();
  }

  private solAgencyKey(sol: string, agency: string): string {
    return `${sol.toLowerCase().trim()}::${agency.toLowerCase().trim()}`;
  }
}
