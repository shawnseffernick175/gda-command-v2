/**
 * SAM.gov Enrichment Service
 * Cross-references GovTribe-delivered opportunities against SAM.gov
 * to fill missing fields: NAICS, agency, PSC, value, place of performance, incumbent.
 *
 * All enrichment is FREE — SAM API and USAspending require no credits.
 *
 * Match precedence for incumbent:
 *   1. SAM award notice by solicitation_number → confidence: high
 *   2. USAspending by Award ID (PIID)          → confidence: high
 *   3. USAspending keyword+agency+NAICS fuzzy  → confidence: medium/low
 */

import { searchOpportunities, type SAMOpportunityRaw } from "./sam-api";
import { searchAwards, type USASpendingAward } from "./fpds-api";
import { log } from "./logger";
import { logEnrichmentCall } from "./enrichment-logger";

export interface EnrichmentResult {
  enriched: boolean;
  fields: Record<string, unknown>;
  incumbent?: string | null;
  incumbent_confidence?: "high" | "medium" | "low" | null;
  incumbent_source?: string | null;
  sam_match?: boolean;
  usaspending_match?: boolean;
  error?: string;
}

/** Minimum relevance score for auto-incumbent-enrichment via USAspending fallback */
const ENRICHMENT_SCORE_THRESHOLD = 70;

/** Core NAICS codes that trigger auto-enrichment regardless of score */
const CORE_NAICS = new Set(["541511", "541512", "541519", "541330", "541611", "541690"]);

/** Core keywords that trigger auto-enrichment regardless of score */
const CORE_KEYWORDS = ["SETA", "C5ISR", "PEO IEW&S", "cybersecurity", "systems engineering"];

function matchesCoreKeyword(title: string, description?: string | null): boolean {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  return CORE_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

/**
 * Enrich an opportunity with data from SAM.gov.
 * Returns the fields that should be updated on the opportunity record.
 */
export async function enrichFromSAM(opp: {
  solicitation_number?: string | null;
  title: string;
  description?: string | null;
  agency?: string | null;
  naics?: string | null;
  score?: number;
  lookbackYears?: number;
}): Promise<EnrichmentResult> {
  if (!opp.solicitation_number) {
    return { enriched: false, fields: {}, error: "no_solicitation_number" };
  }

  if (!process.env.SAM_API_KEY) {
    return { enriched: false, fields: {}, error: "no_sam_api_key" };
  }

  const samCallStart = Date.now();
  try {
    const now = new Date();
    const lookbackYears = opp.lookbackYears ?? 5;
    const startDate = new Date(now);
    startDate.setFullYear(startDate.getFullYear() - lookbackYears);

    const toSAMDate = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

    const result = await searchOpportunities({
      postedFrom: toSAMDate(startDate),
      postedTo: toSAMDate(now),
      solnum: opp.solicitation_number,
      limit: 10,
    });

    if (!result.opportunitiesData?.length) {
      logEnrichmentCall({ source: "sam_gov", success: true, duration_ms: Date.now() - samCallStart });
      return { enriched: false, fields: {}, sam_match: false };
    }

    const fields: Record<string, unknown> = {};
    let incumbent: string | null = null;
    let incumbent_confidence: "high" | "medium" | "low" | null = null;
    let incumbent_source: string | null = null;

    // Find the best matching SAM record — prefer the most recent with richest data
    const sorted = [...result.opportunitiesData].sort((a, b) => {
      const dateA = a.postedDate ? new Date(a.postedDate).getTime() : 0;
      const dateB = b.postedDate ? new Date(b.postedDate).getTime() : 0;
      return dateB - dateA;
    });

    // Collect enrichment fields from the best match
    for (const sam of sorted) {
      if (!fields.naics && (sam.naicsCode || sam.naicsCodes?.[0])) {
        fields.naics = sam.naicsCode ?? sam.naicsCodes?.[0];
      }
      if (!fields.agency && sam.fullParentPathName) {
        const orgParts = sam.fullParentPathName.split(".");
        fields.agency = orgParts[0]?.trim() ?? null;
        fields.department = orgParts.slice(1).join(" / ").trim() || null;
      }
      if (!fields.psc && sam.classificationCode) {
        fields.psc = sam.classificationCode;
      }
      if (!fields.value_estimated && sam.award?.amount) {
        fields.value_estimated = parseFloat(sam.award.amount);
      }
      if (!fields.place_of_performance && sam.placeOfPerformance) {
        const parts: string[] = [];
        if (sam.placeOfPerformance.city?.name) parts.push(sam.placeOfPerformance.city.name);
        if (sam.placeOfPerformance.state?.name) parts.push(sam.placeOfPerformance.state.name);
        if (sam.placeOfPerformance.country?.name && sam.placeOfPerformance.country.name !== "UNITED STATES") {
          parts.push(sam.placeOfPerformance.country.name);
        }
        if (parts.length > 0) fields.place_of_performance = parts.join(", ");
      }

      // Check for incumbent from award notices
      if (!incumbent && sam.award?.awardee?.name) {
        incumbent = sam.award.awardee.name;
        incumbent_confidence = "high";
        incumbent_source = "sam_award";
      }
    }

    const enriched = Object.keys(fields).length > 0 || incumbent != null;

    log.info("sam_enrichment_result", {
      solicitation_number: opp.solicitation_number,
      enriched,
      fields_filled: Object.keys(fields),
      incumbent_found: incumbent != null,
      sam_records: result.opportunitiesData.length,
    });

    logEnrichmentCall({ source: "sam_gov", success: true, duration_ms: Date.now() - samCallStart });

    return {
      enriched,
      fields,
      incumbent,
      incumbent_confidence,
      incumbent_source,
      sam_match: true,
    };
  } catch (e) {
    log.warn("sam_enrichment_error", {
      solicitation_number: opp.solicitation_number,
      error: (e as Error).message,
    });
    logEnrichmentCall({ source: "sam_gov", success: false, error_message: (e as Error).message, duration_ms: Date.now() - samCallStart });
    return { enriched: false, fields: {}, error: (e as Error).message };
  }
}

/**
 * Determine incumbent confidence from USAspending score gap.
 * Exported so tests can call the real function instead of duplicating logic.
 *
 * - ratio >= 1.2 (clear leader) → medium
 * - ratio < 1.2 (ambiguous, within 20%) → low (flag for review)
 * - single candidate (no second score) → medium
 */
export function assignConfidence(
  bestScore: number,
  secondBestScore: number | null,
): "high" | "medium" | "low" {
  if (secondBestScore != null && secondBestScore > 0) {
    const ratio = bestScore / secondBestScore;
    return ratio >= 1.2 ? "medium" : "low";
  }
  return "medium";
}

/**
 * USAspending incumbent fallback — keyword + agency + NAICS fuzzy match.
 * Only runs for high-scoring opportunities (relevance ≥70 or core keyword/NAICS match).
 */
export async function enrichIncumbentFromUSAspending(opp: {
  title: string;
  description?: string | null;
  agency?: string | null;
  naics?: string | null;
  score?: number;
}): Promise<{
  incumbent: string | null;
  incumbent_confidence: "high" | "medium" | "low" | null;
  incumbent_source: string | null;
}> {
  // Gate: only auto-enrich above threshold
  const score = opp.score ?? 0;
  const coreNaicsMatch = opp.naics != null && CORE_NAICS.has(opp.naics);
  const coreKeywordMatch = matchesCoreKeyword(opp.title, opp.description);

  if (score < ENRICHMENT_SCORE_THRESHOLD && !coreNaicsMatch && !coreKeywordMatch) {
    return { incumbent: null, incumbent_confidence: null, incumbent_source: null };
  }

  const usaCallStart = Date.now();
  try {
    // Build search parameters — extract meaningful keywords, skip stop words
    const STOP_WORDS = new Set([
      "the", "for", "and", "of", "to", "in", "a", "an", "is", "at", "by",
      "on", "with", "from", "this", "that", "are", "was", "will", "be",
      "contract", "award", "solicitation", "notice", "amendment",
      "usace", "navsea", "modification", "sources", "sought",
    ]);
    const allText = `${opp.title} ${opp.description ?? ""}`;
    const keywords = allText
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .slice(0, 8);
    const params: {
      keywords?: string[];
      agencies?: string[];
      naicsCodes?: string[];
      limit?: number;
    } = {
      keywords,
      limit: 10,
    };

    if (opp.agency) {
      params.agencies = [opp.agency];
    }
    if (opp.naics) {
      params.naicsCodes = [opp.naics];
    }

    const result = await searchAwards(params);

    if (!result.results?.length) {
      logEnrichmentCall({ source: "usaspending", success: true, duration_ms: Date.now() - usaCallStart });
      return { incumbent: null, incumbent_confidence: null, incumbent_source: null };
    }

    // Score candidates by relevance
    const titleLower = opp.title.toLowerCase();
    const descLower = (opp.description ?? "").toLowerCase();

    const scored = result.results.map((award: USASpendingAward) => {
      let matchScore = 0;
      const awardDesc = (award.Description ?? "").toLowerCase();

      // Word overlap scoring
      const titleWords = titleLower.split(/\s+/).filter((w) => w.length > 3);
      for (const word of titleWords) {
        if (awardDesc.includes(word)) matchScore += 2;
      }
      if (descLower) {
        const descWords = descLower.split(/\s+/).filter((w) => w.length > 4);
        for (const word of descWords.slice(0, 20)) {
          if (awardDesc.includes(word)) matchScore += 1;
        }
      }

      // Agency match bonus
      if (opp.agency && (award["Awarding Agency"] ?? "").toLowerCase().includes(opp.agency.toLowerCase())) {
        matchScore += 5;
      }

      return { award, matchScore };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);

    if (scored[0].matchScore === 0) {
      logEnrichmentCall({ source: "usaspending", success: true, duration_ms: Date.now() - usaCallStart });
      return { incumbent: null, incumbent_confidence: null, incumbent_source: null };
    }

    const best = scored[0];
    const secondBest = scored.length > 1 ? scored[1] : null;

    const confidence = assignConfidence(best.matchScore, secondBest?.matchScore ?? null);

    const recipientName = best.award["Recipient Name"];

    log.info("usaspending_incumbent_result", {
      title: opp.title.slice(0, 80),
      incumbent: recipientName,
      confidence,
      match_score: best.matchScore,
      candidates: scored.filter((s) => s.matchScore > 0).length,
    });

    logEnrichmentCall({ source: "usaspending", success: true, duration_ms: Date.now() - usaCallStart });

    return {
      incumbent: recipientName,
      incumbent_confidence: confidence,
      incumbent_source: confidence === "low" ? "usaspending_fuzzy_weak" : "usaspending_fuzzy_strong",
    };
  } catch (e) {
    log.warn("usaspending_incumbent_error", { error: (e as Error).message });
    logEnrichmentCall({ source: "usaspending", success: false, error_message: (e as Error).message, duration_ms: Date.now() - usaCallStart });
    return { incumbent: null, incumbent_confidence: null, incumbent_source: null };
  }
}

/**
 * Full enrichment pipeline: SAM → USAspending fallback.
 * Returns all fields that should be updated on the opportunity record.
 */
export async function enrichOpportunity(opp: {
  solicitation_number?: string | null;
  title: string;
  description?: string | null;
  agency?: string | null;
  naics?: string | null;
  score?: number;
  incumbent?: string | null;
}): Promise<EnrichmentResult> {
  // Step 1: SAM enrichment (NAICS, agency, PSC, value, place of performance, incumbent)
  const samResult = await enrichFromSAM(opp);

  // Merge SAM-enriched fields into opportunity context for USAspending fallback
  const enrichedOpp = {
    ...opp,
    agency: (samResult.fields.agency as string) ?? opp.agency,
    naics: (samResult.fields.naics as string) ?? opp.naics,
  };

  // Step 2: USAspending incumbent fallback (only if SAM didn't find one AND opp has no incumbent)
  let incumbentResult = {
    incumbent: samResult.incumbent,
    incumbent_confidence: samResult.incumbent_confidence,
    incumbent_source: samResult.incumbent_source,
  };

  if (!samResult.incumbent && !opp.incumbent) {
    const usaResult = await enrichIncumbentFromUSAspending(enrichedOpp);
    if (usaResult.incumbent) {
      incumbentResult = usaResult;
    }
  }

  return {
    enriched: samResult.enriched || incumbentResult.incumbent != null,
    fields: samResult.fields,
    incumbent: incumbentResult.incumbent,
    incumbent_confidence: incumbentResult.incumbent_confidence ?? null,
    incumbent_source: incumbentResult.incumbent_source ?? null,
    sam_match: samResult.sam_match,
    usaspending_match: incumbentResult.incumbent_source?.startsWith("usaspending") ?? false,
  };
}
