/**
 * FasTrac pre-SAM boundary filter.
 *
 * FasTrac is pre-SAM by doctrine: it senses *leading indicators* of demand
 * before a formal solicitation exists. Formal solicitations, combined
 * synopsis/solicitations, and award notices are post-solicitation and belong in
 * the Ops Tracker / Pipeline, not FasTrac. Ingesting them turns FasTrac into a
 * SAM watchlist (the exact drift flagged in the operational-integrity review).
 *
 * This classifies a SAM.gov notice `type` and rejects formal/post-solicitation
 * types so only pre-solicitation leading indicators (sources sought,
 * presolicitation, special notices / RFIs, industry days) reach the requirement
 * pipeline. Unknown/blank types are kept (fail-open) to avoid dropping genuine
 * signals on an unrecognized label.
 */

export interface NoticeTypeFilterResult {
  /** True if the notice is post-/formal-solicitation and must not enter FasTrac. */
  rejected: boolean;
  /** Normalized category (for logging/metrics). */
  category: string;
  /** Human-readable reason when rejected. */
  reason: string | null;
}

/**
 * Classify a raw SAM.gov Opportunities API v2 `type` string against the
 * pre-SAM boundary.
 */
export function classifyNoticeType(type: string | null | undefined): NoticeTypeFilterResult {
  const n = (type ?? '').trim().toLowerCase();

  if (!n) return { rejected: false, category: 'unknown', reason: null };

  // Pre-solicitation leading indicators — the signals FasTrac exists to sense.
  if (n === 'sources sought') return { rejected: false, category: 'sources_sought', reason: null };
  if (n.startsWith('presolicitation') || n.startsWith('pre-solicitation')) {
    return { rejected: false, category: 'presolicitation', reason: null };
  }
  if (n === 'special notice') return { rejected: false, category: 'special_notice', reason: null };
  if (n.includes('request for information')) return { rejected: false, category: 'rfi', reason: null };
  if (n.includes('intent to bundle')) return { rejected: false, category: 'intent_to_bundle', reason: null };

  // Formal / post-solicitation — belongs in Ops Tracker / Pipeline, not FasTrac.
  // Order matters: check "combined synopsis" before the bare "solicitation".
  if (n.includes('combined synopsis')) {
    return { rejected: true, category: 'combined_synopsis', reason: 'formal solicitation (post-SAM)' };
  }
  if (n === 'solicitation') {
    return { rejected: true, category: 'solicitation', reason: 'formal solicitation (post-SAM)' };
  }
  if (n.includes('award')) return { rejected: true, category: 'award', reason: 'award notice (post-award)' };
  if (n.includes('justification')) {
    return { rejected: true, category: 'justification', reason: 'justification & approval (post-SAM)' };
  }
  if (n.includes('sale of surplus')) {
    return { rejected: true, category: 'sale', reason: 'surplus property sale (not a demand signal)' };
  }

  // Unknown label — keep it rather than silently dropping a real signal.
  return { rejected: false, category: 'other', reason: null };
}
