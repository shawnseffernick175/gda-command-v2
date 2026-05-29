import { Router } from "express";
import { log } from "../../lib/logger";
import { successEnvelope, errorEnvelope } from "../../middleware/envelope";
import { getPool } from "../../lib/db";
import { callWebhook, webhookConfig } from "../../lib/n8n-client";
import { n8nWebhookConfigured } from "../../lib/n8n-data";
import { fetchSourcesForOpportunity } from "../../db/queries/opportunity-sources";
import { samGovUrl, samGovSearchUrl } from "../../services/sources/sam-gov";
import { fpdsUrl } from "../../services/sources/fpds";
import { usaspendingUrl } from "../../services/sources/usaspending";
import { govwinUrl } from "../../services/sources/govwin";

const router = Router();

// ---------------------------------------------------------------------------
// SourceRef — universal citation object (R1)
// ---------------------------------------------------------------------------
export interface SourceRef {
  kind:
    | "sam_gov"
    | "fpds"
    | "usaspending"
    | "govwin"
    | "news"
    | "doctrine"
    | "partner_site"
    | "internal";
  title: string;
  url: string;
  retrieved_at: string;
}

// ---------------------------------------------------------------------------
// Helpers: build SourceRef from stored source rows
// ---------------------------------------------------------------------------
function buildSourceRef(row: {
  kind: string;
  title: string;
  url: string | null;
  retrieved_at: string | null;
}): SourceRef {
  const now = new Date().toISOString();
  const kind = normalizeKind(row.kind);
  return {
    kind,
    title: row.title || kindLabel(kind),
    url: row.url || "#",
    retrieved_at: row.retrieved_at || now,
  };
}

function normalizeKind(raw: string): SourceRef["kind"] {
  const map: Record<string, SourceRef["kind"]> = {
    "sam.gov": "sam_gov",
    sam_gov: "sam_gov",
    sam: "sam_gov",
    fpds: "fpds",
    usaspending: "usaspending",
    govwin: "govwin",
    govtribe: "govwin",
    news: "news",
    doctrine: "doctrine",
    partner_site: "partner_site",
    manual: "internal",
    internal: "internal",
  };
  return map[raw.toLowerCase()] ?? "internal";
}

function kindLabel(kind: SourceRef["kind"]): string {
  const labels: Record<string, string> = {
    sam_gov: "SAM.gov",
    fpds: "FPDS",
    usaspending: "USAspending",
    govwin: "GovWin",
    news: "News",
    doctrine: "Doctrine",
    partner_site: "Partner",
    internal: "Internal",
  };
  return labels[kind] ?? "Source";
}

// ---------------------------------------------------------------------------
// Per-panel n8n fetchers — mirrors existing enrichment routes but returns
// raw data + sources array, not GDA envelopes.
// ---------------------------------------------------------------------------

async function fetchPwin(oppId: string): Promise<Record<string, unknown> | null> {
  if (!n8nWebhookConfigured()) return null;
  try {
    const result = await callWebhook("gda-pwin-calculator", { body: { action: "calculate", opp_id: oppId } }, { timeoutMs: 15_000 });
    if (result.ok && result.body) return result.body as Record<string, unknown>;
  } catch (err) { log.warn("analysis_pwin_fail", { oppId, error: String(err) }); }
  return null;
}

async function fetchIncumbent(oppId: string): Promise<Record<string, unknown> | null> {
  if (!n8nWebhookConfigured()) return null;
  try {
    const result = await callWebhook("gda-incumbent-analysis", { opp_id: oppId }, { timeoutMs: 15_000 });
    if (result.ok && result.body) return result.body as Record<string, unknown>;
  } catch (err) { log.warn("analysis_incumbent_fail", { oppId, error: String(err) }); }
  return null;
}

async function fetchCompetitors(oppId: string): Promise<Record<string, unknown> | null> {
  if (!n8nWebhookConfigured()) return null;
  try {
    const result = await callWebhook("gda-competitor-field", { opp_id: oppId }, { timeoutMs: 15_000 });
    if (result.ok && result.body) return result.body as Record<string, unknown>;
  } catch (err) { log.warn("analysis_competitors_fail", { oppId, error: String(err) }); }
  return null;
}

async function fetchBlackhat(oppId: string): Promise<Record<string, unknown> | null> {
  if (!n8nWebhookConfigured()) return null;
  try {
    const result = await callWebhook("gda-black-hat", { opp_id: oppId }, { timeoutMs: 15_000 });
    if (result.ok && result.body) return result.body as Record<string, unknown>;
  } catch (err) { log.warn("analysis_blackhat_fail", { oppId, error: String(err) }); }
  return null;
}

async function fetchWargame(oppId: string): Promise<Record<string, unknown> | null> {
  if (!n8nWebhookConfigured()) return null;
  try {
    const result = await callWebhook("gda-wargame", { opp_id: oppId }, { timeoutMs: 15_000 });
    if (result.ok && result.body) return result.body as Record<string, unknown>;
  } catch (err) { log.warn("analysis_wargame_fail", { oppId, error: String(err) }); }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/opportunities/:id/analysis
//
// Combined endpoint — returns all analysis panels in ONE round-trip.
// ETag based on (opp_id, opp.updated_at). 304 if If-None-Match matches.
// ---------------------------------------------------------------------------
router.get("/:id/analysis", async (req, res) => {
  const { id } = req.params;

  const pool = getPool();
  let updatedAt: string | null = null;

  if (pool) {
    try {
      const result = await pool.query(
        "SELECT updated_at FROM opportunities WHERE id = $1",
        [id],
      );
      if (result.rows.length > 0) {
        const raw = result.rows[0].updated_at;
        updatedAt = raw instanceof Date ? raw.toISOString() : String(raw ?? "");
      }
    } catch (err) {
      log.warn("analysis_opp_lookup_fail", { id, error: String(err) });
    }
  }

  // Build ETag from (opp_id, updated_at)
  const etagSource = `${id}:${updatedAt ?? "unknown"}`;
  const etag = `"${Buffer.from(etagSource).toString("base64url")}"`;

  // 304 Not Modified
  const ifNoneMatch = req.headers["if-none-match"];
  if (ifNoneMatch === etag) {
    return res.status(304).end();
  }

  // Fetch all panels in parallel (Promise.all — single round-trip to client)
  const [pwinRaw, incumbentRaw, competitorsRaw, blackhatRaw, wargameRaw, storedSources] =
    await Promise.all([
      fetchPwin(id),
      fetchIncumbent(id),
      fetchCompetitors(id),
      fetchBlackhat(id),
      fetchWargame(id),
      fetchSourcesForOpportunity(id),
    ]);

  // Build sources array from stored rows
  const sources: SourceRef[] = storedSources.map(buildSourceRef);

  // Add default sources for the opportunity itself if we have no stored sources
  if (sources.length === 0) {
    sources.push({
      kind: "sam_gov",
      title: "SAM.gov Notice",
      url: samGovSearchUrl(id),
      retrieved_at: new Date().toISOString(),
    });
  }

  // Attach sources to each panel
  const pwin = pwinRaw ? { ...pwinRaw, sources } : null;
  const incumbent = incumbentRaw ? { ...incumbentRaw, sources } : null;
  const competitors = competitorsRaw ? { ...competitorsRaw, sources } : null;
  const blackhat = blackhatRaw ? { ...blackhatRaw, sources } : null;
  const wargame = wargameRaw ? { ...wargameRaw, sources } : null;

  // Timeline from DB
  let timeline: unknown[] = [];
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT id, event_type AS type, actor, occurred_at AS timestamp,
                summary, snapshot_keys
         FROM opportunity_timeline
         WHERE opportunity_id = $1
         ORDER BY occurred_at DESC
         LIMIT 50`,
        [id],
      );
      timeline = result.rows;
    } catch {
      // Table may not exist
    }
  }

  res.set("ETag", etag);
  res.set("Cache-Control", "private, must-revalidate");

  return res.json(
    successEnvelope("gda-opportunity-analysis", "read", {
      pwin,
      incumbent,
      competitors,
      blackhat,
      wargame,
      timeline,
      sources,
    }),
  );
});

export default router;

// Re-export source URL builders for use by other modules
export { samGovUrl, samGovSearchUrl, fpdsUrl, usaspendingUrl, govwinUrl };
