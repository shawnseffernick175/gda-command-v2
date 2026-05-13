/**
 * Competitive Intel Agent
 *
 * Autonomous scanner that monitors tracked competitors for significant movements:
 *   1. OBSERVE — query USAspending (FPDS) for recent contract awards to tracked competitors
 *   2. ORIENT — GPT-4o assesses each award's significance for Envision
 *   3. DECIDE — filter noise, keep only high/medium significance items
 *   4. ACT — insert competitor_movements + intel_items, queue critical items for approval
 *
 * Trigger: cron (daily 5 AM) or manual via POST /api/agents/competitive-intel/trigger
 */

import { runAgent, type AgentContext, type AgentResult } from "../lib/agent-runner";
import { chatCompletion, isLLMAvailable, type ChatMessage } from "../lib/llm";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { searchAwards, type USASpendingAward } from "../lib/fpds-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedCompetitor {
  id: string;
  name: string;
  primary_naics: string[];
  threat_score: number;
  watch_status: string;
}

interface CompanyProfile {
  name: string;
  naics_codes: string[];
  capabilities: string[];
  core_competencies: string[];
}

interface AwardAnalysis {
  significance: "high" | "medium" | "low";
  impact_on_envision: string;
  teaming_opportunity: boolean;
  teaming_rationale: string;
  alert_summary: string;
  threat_level: "critical" | "high" | "medium" | "low";
  movement_type: string;
}

interface ProcessedMovement {
  competitor: TrackedCompetitor;
  award: USASpendingAward;
  analysis: AwardAnalysis;
}

// ---------------------------------------------------------------------------
// Data gathering
// ---------------------------------------------------------------------------

async function getTrackedCompetitors(): Promise<TrackedCompetitor[]> {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT id, name, primary_naics, threat_score, watch_status
     FROM competitor_profiles
     WHERE watch_status IN ('active', 'monitoring')
     ORDER BY threat_score DESC`,
  );
  return result.rows as TrackedCompetitor[];
}

async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const pool = getPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT name, naics_codes, capabilities, core_competencies
     FROM company_profile LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

async function getActivePursuits(): Promise<string[]> {
  const pool = getPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT title, agency FROM sam_opportunities
     WHERE scan_status IN ('tracked', 'qualified')
     ORDER BY created_at DESC LIMIT 20`,
  );
  return result.rows.map(
    (r) => `${r.title as string} (${r.agency as string})`,
  );
}

// ---------------------------------------------------------------------------
// FPDS scanning per competitor
// ---------------------------------------------------------------------------

async function scanCompetitorAwards(
  competitor: TrackedCompetitor,
  lookbackDays = 30,
): Promise<USASpendingAward[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);

  try {
    const result = await searchAwards({
      keywords: [competitor.name],
      dateRange: {
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
      },
      limit: 25,
    });
    return result.results ?? [];
  } catch (e) {
    log.warn("competitive_intel_scan_error", {
      competitor: competitor.name,
      error: (e as Error).message,
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// AI significance analysis
// ---------------------------------------------------------------------------

async function analyzeAward(
  award: USASpendingAward,
  competitor: TrackedCompetitor,
  profile: CompanyProfile | null,
  activePursuits: string[],
): Promise<AwardAnalysis | null> {
  const amount = award["Award Amount"] ?? 0;
  const agency = award["Awarding Agency"] ?? "Unknown";
  const description = award.Description ?? "No description";
  const awardId = award["Award ID"] ?? "N/A";

  const systemPrompt = `You are a competitive intelligence analyst for Envision Innovative Solutions (SDVOSB, defense IT/cybersecurity).

Given a competitor's contract award, assess its significance for Envision.

Company capabilities: ${profile ? profile.capabilities.join(", ") : "Defense IT, cybersecurity, SETA, C5ISR"}
NAICS codes: ${profile ? profile.naics_codes.join(", ") : "541512, 541519, 541330, 541611"}
Active pursuits: ${activePursuits.length > 0 ? activePursuits.slice(0, 5).join("; ") : "None currently tracked"}

Respond in JSON only:
{
  "significance": "high" | "medium" | "low",
  "impact_on_envision": "one sentence on how this affects Envision's competitive position",
  "teaming_opportunity": true/false,
  "teaming_rationale": "why teaming makes sense (or empty if not)",
  "alert_summary": "one-line alert for the intel feed",
  "threat_level": "critical" | "high" | "medium" | "low",
  "movement_type": "contract_win" | "capability_expansion" | "market_entry"
}

Significance criteria:
- HIGH: Award >$5M in a capability area Envision competes in, or displaces Envision from a recompete
- MEDIUM: Award >$1M in adjacent capability area, or indicates competitor growing in Envision's market
- LOW: Small awards, unrelated agencies, no overlap with Envision's capabilities`;

  const userPrompt = `Competitor: ${competitor.name} (threat score: ${competitor.threat_score}/100)
NAICS focus: ${competitor.primary_naics.join(", ") || "Various"}

Award details:
- Award ID: ${awardId}
- Agency: ${agency}
- Amount: $${amount.toLocaleString()}
- Description: ${description}
- Recipient: ${award["Recipient Name"] ?? competitor.name}
- Start: ${award["Start Date"] ?? "N/A"}
- End: ${award["End Date"] ?? "N/A"}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await chatCompletion(messages, { tier: "fast" });
    const text = result.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as AwardAnalysis;
  } catch (e) {
    log.warn("competitive_intel_llm_error", {
      competitor: competitor.name,
      awardId,
      error: (e as Error).message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// DB writes
// ---------------------------------------------------------------------------

async function writeMovement(
  ctx: AgentContext,
  movement: ProcessedMovement,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const { competitor, award, analysis } = movement;
  const amount = award["Award Amount"] ?? 0;
  const movementId = `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Insert competitor_movement
  await pool.query(
    `INSERT INTO competitor_movements
       (id, competitor_name, movement_type, title, description, impact_assessment,
        threat_level, source, source_url, detected_at, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), false)
     ON CONFLICT (id) DO NOTHING`,
    [
      movementId,
      competitor.name,
      analysis.movement_type,
      analysis.alert_summary,
      `${award["Awarding Agency"] ?? "Unknown"} awarded $${amount.toLocaleString()} contract: ${award.Description ?? "N/A"}`,
      analysis.impact_on_envision,
      analysis.threat_level,
      "fpds",
      `https://www.usaspending.gov/award/${award.generated_internal_id ?? award["Award ID"] ?? ""}`,
    ],
  );

  // 2. Insert intel_item (category='competitive')
  const intelId = `intel-ci-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const priority = analysis.threat_level;

  await pool.query(
    `INSERT INTO intel_items
       (id, title, summary, category, priority, source, source_url,
        related_competitor, tags, read, created_at)
     VALUES ($1, $2, $3, 'competitive', $4, 'fpds', $5, $6, $7, false, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      intelId,
      `${competitor.name}: ${analysis.alert_summary}`,
      `${analysis.impact_on_envision}${analysis.teaming_opportunity ? ` Teaming opportunity: ${analysis.teaming_rationale}` : ""}`,
      priority,
      `https://www.usaspending.gov/award/${award.generated_internal_id ?? award["Award ID"] ?? ""}`,
      competitor.name,
      [
        "competitive-intel",
        analysis.movement_type,
        ...(analysis.teaming_opportunity ? ["teaming"] : []),
      ],
    ],
  );

  // 3. Update competitor profile stats
  await pool.query(
    `UPDATE competitor_profiles
     SET contracts_won = contracts_won + 1,
         contracts_value = contracts_value + $2,
         recent_wins = array_prepend($3, recent_wins[1:4]),
         last_updated = NOW()
     WHERE id = $1`,
    [
      competitor.id,
      amount,
      analysis.alert_summary,
    ],
  );

  // 4. Queue critical/high items for approval
  if (analysis.threat_level === "critical" || analysis.threat_level === "high") {
    await ctx.addApproval({
      type: "competitor_response",
      title: `Respond to ${competitor.name} movement`,
      summary: analysis.alert_summary,
      priority: priority as "critical" | "high" | "medium" | "low",
      data: {
        competitor_id: competitor.id,
        competitor_name: competitor.name,
        movement_id: movementId,
        intel_id: intelId,
        award_amount: amount,
        agency: award["Awarding Agency"] ?? "Unknown",
        significance: analysis.significance,
        teaming_opportunity: analysis.teaming_opportunity,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

async function competitiveIntelScan(ctx: AgentContext): Promise<AgentResult> {
  const competitors = await getTrackedCompetitors();
  if (competitors.length === 0) {
    return {
      items_processed: 0,
      items_flagged: 0,
      summary: { message: "No tracked competitors found", competitors: 0 },
    };
  }

  const profile = await getCompanyProfile();
  const activePursuits = await getActivePursuits();

  let totalAwardsScanned = 0;
  let significantItems = 0;
  let approvalItems = 0;
  const competitorSummaries: Record<string, { scanned: number; significant: number }> = {};

  for (const competitor of competitors) {
    log.info("competitive_intel_scanning", { competitor: competitor.name });

    const awards = await scanCompetitorAwards(competitor);
    totalAwardsScanned += awards.length;
    competitorSummaries[competitor.name] = { scanned: awards.length, significant: 0 };

    if (awards.length === 0) continue;

    // Analyze each award with AI
    for (const award of awards) {
      const analysis = await analyzeAward(award, competitor, profile, activePursuits);
      if (!analysis) continue;

      // Filter noise — only keep high/medium significance
      if (analysis.significance === "low") continue;

      significantItems++;
      competitorSummaries[competitor.name].significant++;

      await writeMovement(ctx, { competitor, award, analysis });

      if (analysis.threat_level === "critical" || analysis.threat_level === "high") {
        approvalItems++;
      }
    }

    // Rate limit between competitors
    if (competitors.indexOf(competitor) < competitors.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return {
    items_processed: totalAwardsScanned,
    items_flagged: significantItems,
    summary: {
      competitors_scanned: competitors.length,
      total_awards_found: totalAwardsScanned,
      significant_movements: significantItems,
      approval_items_queued: approvalItems,
      by_competitor: competitorSummaries,
    },
  };
}

// ---------------------------------------------------------------------------
// Exported trigger
// ---------------------------------------------------------------------------

export async function runCompetitiveIntel(
  trigger: "cron" | "manual" | "webhook" = "manual",
): Promise<AgentResult> {
  return runAgent("competitive-intel", trigger, competitiveIntelScan);
}
