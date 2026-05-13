/**
 * Morning Commander Agent
 *
 * Generates a daily executive briefing by:
 *   1. OBSERVE — querying overnight changes across all data tables
 *   2. ORIENT — AI synthesis via GPT-4o into a structured command brief
 *   3. ACT — storing the briefing, creating intel feed entry, optionally emailing
 *
 * Trigger: cron (0 6 * * *) or manual via POST /api/agents/morning-commander/trigger
 */

import { runAgent, type AgentContext, type AgentResult } from "../lib/agent-runner";
import { chatCompletion, type ChatMessage } from "../lib/llm";
import { getPool } from "../lib/db";
import { sendEmail, isEmailConfigured } from "../lib/email";
import { log } from "../lib/logger";

// ---------------------------------------------------------------------------
// Data gathering queries
// ---------------------------------------------------------------------------

interface BriefingData {
  newOpportunities: Record<string, unknown>[];
  upcomingDeadlines: Record<string, unknown>[];
  pipelineSummary: { total: number; totalValue: number; avgPwin: number; byStatus: Record<string, number> };
  stalledCaptures: Record<string, unknown>[];
  highRisks: Record<string, unknown>[];
  pendingApprovals: number;
  competitorMovements: Record<string, unknown>[];
  recentAgentRuns: Record<string, unknown>[];
  failedAgentRuns: Record<string, unknown>[];
}

async function gatherBriefingData(): Promise<BriefingData> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString();

  // Run all queries in parallel
  const [
    newOppsResult,
    deadlinesResult,
    pipelineResult,
    stalledResult,
    risksResult,
    approvalsResult,
    competitorResult,
    agentRunsResult,
    failedRunsResult,
  ] = await Promise.all([
    // New opportunities in last 24 hours
    pool.query(
      `SELECT id, title, agency, value_estimated, score, due_date, set_aside
       FROM opportunities WHERE created_at > $1 ORDER BY score DESC LIMIT 10`,
      [yesterdayISO],
    ),
    // Opportunities with deadlines in next 7 days
    pool.query(
      `SELECT id, title, agency, due_date, status, value_estimated
       FROM opportunities
       WHERE due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
       ORDER BY due_date ASC`,
    ),
    // Pipeline summary
    pool.query(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(value_estimated), 0) as total_value,
              COALESCE(AVG(probability_of_win), 0) as avg_pwin
       FROM opportunities GROUP BY status`,
    ),
    // Stalled capture plans (no update in 14+ days)
    pool.query(
      `SELECT id, opportunity_title, agency, phase, updated_at
       FROM capture_plans
       WHERE updated_at < NOW() - INTERVAL '14 days'
       ORDER BY updated_at ASC LIMIT 5`,
    ),
    // High/critical risks
    pool.query(
      `SELECT id, title, severity, status, opportunity_id
       FROM risk_register
       WHERE severity IN ('critical', 'high') AND status = 'open'
       ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END, created_at DESC LIMIT 10`,
    ),
    // Pending approvals count
    pool.query("SELECT COUNT(*) as count FROM approval_queue WHERE status = 'pending'"),
    // Recent competitor movements (last 48 hours)
    pool.query(
      `SELECT id, competitor_name, movement_type, summary, significance
       FROM competitor_movements
       WHERE detected_at > NOW() - INTERVAL '48 hours'
       ORDER BY detected_at DESC LIMIT 5`,
    ),
    // Recent agent runs (last 24 hours)
    pool.query(
      `SELECT agent, status, started_at, duration_ms, items_processed, items_flagged
       FROM agent_runs WHERE started_at > $1
       ORDER BY started_at DESC LIMIT 10`,
      [yesterdayISO],
    ),
    // Failed agent runs (last 24 hours)
    pool.query(
      `SELECT agent, error, started_at
       FROM agent_runs WHERE started_at > $1 AND status = 'failed'
       ORDER BY started_at DESC`,
      [yesterdayISO],
    ),
  ]);

  // Aggregate pipeline summary
  let totalOpps = 0;
  let totalValue = 0;
  let totalPwin = 0;
  let pwinCount = 0;
  const byStatus: Record<string, number> = {};
  for (const row of pipelineResult.rows) {
    const count = parseInt(row.count);
    totalOpps += count;
    totalValue += parseFloat(row.total_value) || 0;
    if (parseFloat(row.avg_pwin) > 0) {
      totalPwin += parseFloat(row.avg_pwin) * count;
      pwinCount += count;
    }
    byStatus[row.status] = count;
  }

  return {
    newOpportunities: newOppsResult.rows,
    upcomingDeadlines: deadlinesResult.rows,
    pipelineSummary: {
      total: totalOpps,
      totalValue,
      avgPwin: pwinCount > 0 ? totalPwin / pwinCount : 0,
      byStatus,
    },
    stalledCaptures: stalledResult.rows,
    highRisks: risksResult.rows,
    pendingApprovals: parseInt(approvalsResult.rows[0]?.count ?? "0"),
    competitorMovements: competitorResult.rows,
    recentAgentRuns: agentRunsResult.rows,
    failedAgentRuns: failedRunsResult.rows,
  };
}

// ---------------------------------------------------------------------------
// AI synthesis
// ---------------------------------------------------------------------------

function buildBriefingPrompt(data: BriefingData): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `Generate the GDA Command morning brief for ${today}.

DATA:

PIPELINE:
- ${data.pipelineSummary.total} total opportunities worth $${(data.pipelineSummary.totalValue / 1_000_000).toFixed(1)}M
- Average Pwin: ${(data.pipelineSummary.avgPwin * 100).toFixed(0)}%
- By status: ${JSON.stringify(data.pipelineSummary.byStatus)}

NEW OPPORTUNITIES (last 24h): ${data.newOpportunities.length > 0 ? JSON.stringify(data.newOpportunities) : "None"}

UPCOMING DEADLINES (next 7 days): ${data.upcomingDeadlines.length > 0 ? JSON.stringify(data.upcomingDeadlines) : "None"}

HIGH/CRITICAL RISKS: ${data.highRisks.length > 0 ? JSON.stringify(data.highRisks) : "None open"}

STALLED CAPTURES (14+ days no update): ${data.stalledCaptures.length > 0 ? JSON.stringify(data.stalledCaptures) : "None"}

PENDING APPROVALS: ${data.pendingApprovals}

COMPETITOR ACTIVITY (last 48h): ${data.competitorMovements.length > 0 ? JSON.stringify(data.competitorMovements) : "No new movements"}

SYSTEM HEALTH:
- Agent runs (last 24h): ${data.recentAgentRuns.length}
- Failed runs: ${data.failedAgentRuns.length > 0 ? JSON.stringify(data.failedAgentRuns) : "None"}`;
}

const MORNING_COMMANDER_SYSTEM_PROMPT = `You are the GDA Morning Commander for Envision Innovative Solutions (SDVOSB, defense IT/cybersecurity, Army SETA, C5ISR).

Generate a concise executive morning briefing. Format as markdown:

## Priority Actions
Numbered list (max 5) of what Shawn should act on TODAY. Be specific — include opportunity names, deadlines, dollar values.

## Pipeline Status
One line: X opportunities worth $YM, Z due this week, avg Pwin W%.

## New Opportunities
Top new opportunities (if any) with score, agency, value, and one-line assessment. Skip if none.

## Risk & Deadline Alerts
Deadlines within 7 days, high/critical risks, stalled captures. Skip if none.

## Competitor Activity
Significant competitor moves in last 48 hours. Skip if none.

## System Health
Agent status, any failed workflows. One line if all healthy.

RULES:
- Keep total under 400 words
- Lead with what needs action
- Use dollar amounts and dates, not vague language
- If a section has no data, skip it entirely
- Be direct — this is a command brief, not a report`;

async function synthesizeBriefing(data: BriefingData): Promise<{ headline: string; content: string; metrics: Record<string, unknown>[] }> {
  const messages: ChatMessage[] = [
    { role: "system", content: MORNING_COMMANDER_SYSTEM_PROMPT },
    { role: "user", content: buildBriefingPrompt(data) },
  ];

  const result = await chatCompletion(messages, {
    tier: "fast",
    temperature: 0.4,
    max_tokens: 1500,
  });

  // Extract headline from first line or generate one
  const lines = result.content.split("\n").filter((l) => l.trim());
  const headline = lines[0]?.replace(/^#+\s*/, "").trim() || `Morning Brief — ${new Date().toLocaleDateString()}`;

  const metrics = [
    { label: "Pipeline", value: `${data.pipelineSummary.total} opps / $${(data.pipelineSummary.totalValue / 1_000_000).toFixed(1)}M` },
    { label: "Deadlines", value: `${data.upcomingDeadlines.length} this week` },
    { label: "Risks", value: `${data.highRisks.length} open` },
    { label: "Approvals", value: `${data.pendingApprovals} pending` },
  ];

  return { headline, content: result.content, metrics };
}

// ---------------------------------------------------------------------------
// Store briefing
// ---------------------------------------------------------------------------

async function storeBriefing(
  headline: string,
  content: string,
  metrics: Record<string, unknown>[],
  data: BriefingData,
): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("Database not available");

  const id = `brief-${Date.now()}`;
  const today = new Date().toISOString().split("T")[0];

  // Store in morning_briefings
  await pool.query(
    `INSERT INTO morning_briefings (id, date, headline, key_metrics, alerts, action_items, market_snapshot, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      today,
      headline,
      JSON.stringify(metrics),
      JSON.stringify(data.highRisks.map((r) => ({ id: r.id, title: r.title, severity: r.severity }))),
      JSON.stringify(data.upcomingDeadlines.map((d) => ({ id: d.id, title: d.title, due: d.due_date }))),
      content,
    ],
  );

  // Also create intel feed entry
  const intelId = `intel-brief-${Date.now()}`;
  await pool.query(
    `INSERT INTO intel_items (id, title, summary, category, priority, source, tags, created_at)
     VALUES ($1, $2, $3, 'market', 'high', 'manual', $4, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      intelId,
      `Morning Brief — ${today}`,
      content.substring(0, 500),
      ["morning-brief", "ai-generated"],
    ],
  );

  return id;
}

// ---------------------------------------------------------------------------
// Email briefing (optional)
// ---------------------------------------------------------------------------

async function emailBriefing(headline: string, content: string): Promise<boolean> {
  if (!isEmailConfigured()) {
    log.info("morning_commander_email_skip", { reason: "smtp_not_configured" });
    return false;
  }

  const pool = getPool();
  if (!pool) return false;

  // Get admin users to email
  const { rows } = await pool.query(
    "SELECT email FROM users WHERE role = 'admin' AND is_active = true LIMIT 5",
  );

  if (rows.length === 0) {
    log.info("morning_commander_email_skip", { reason: "no_admin_users" });
    return false;
  }

  const htmlContent = content
    .replace(/## (.*)/g, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  for (const user of rows) {
    await sendEmail(user.email, "generic", {
      title: headline,
      message: htmlContent,
    });
  }

  log.info("morning_commander_email_sent", { recipients: rows.length });
  return true;
}

// ---------------------------------------------------------------------------
// Main agent execution
// ---------------------------------------------------------------------------

export async function executeMorningCommander(
  trigger: "cron" | "manual" | "webhook" = "manual",
): Promise<AgentResult> {
  return runAgent("morning-commander", trigger, async (ctx: AgentContext) => {
    log.info("morning_commander_observe", { runId: ctx.runId });

    // 1. OBSERVE — gather data
    const data = await gatherBriefingData();

    // 2. ORIENT — AI synthesis
    const { headline, content, metrics } = await synthesizeBriefing(data);

    // 3. ACT — store and notify
    const briefingId = await storeBriefing(headline, content, metrics, data);

    // Try to send email (non-blocking)
    let emailSent = false;
    try {
      emailSent = await emailBriefing(headline, content);
    } catch (e) {
      log.warn("morning_commander_email_error", { error: (e as Error).message });
    }

    return {
      items_processed: 1,
      items_flagged: data.highRisks.length + data.upcomingDeadlines.length,
      summary: {
        briefingId,
        headline,
        emailSent,
        pipeline: data.pipelineSummary,
        newOpportunities: data.newOpportunities.length,
        upcomingDeadlines: data.upcomingDeadlines.length,
        highRisks: data.highRisks.length,
        pendingApprovals: data.pendingApprovals,
        competitorMovements: data.competitorMovements.length,
        failedAgentRuns: data.failedAgentRuns.length,
      },
    };
  });
}
