import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import type { Contact } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/contacts — list contacts with filters
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    let items: Contact[];
    let source: "db" = "db";
    const pool = getPool();

    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM contacts ORDER BY last_name, first_name");
        if (rows.length > 0) {
          items = rows.map((r: Record<string, unknown>) => ({
            ...r,
            meeting_notes: typeof r.meeting_notes === "string" ? JSON.parse(r.meeting_notes) : (r.meeting_notes ?? []),
            tags: r.tags ?? [],
            linked_opportunities: typeof r.linked_opportunities === "string" ? JSON.parse(r.linked_opportunities) : (r.linked_opportunities ?? []),
            teaming_records: typeof r.teaming_records === "string" ? JSON.parse(r.teaming_records) : (r.teaming_records ?? []),
          })) as Contact[];
          source = "db";
        } else {
          items = [];
        }
      } catch {
        items = [];
      }
    } else {
      items = [];
    }

    const all = [...items];
    const { status, agency, search, strength, sortBy, sortDir } = req.query;

    if (status && typeof status === "string") {
      items = items.filter((c) => c.status === status);
    }
    if (agency && typeof agency === "string") {
      items = items.filter((c) => c.agency === agency);
    }
    if (strength && typeof strength === "string") {
      items = items.filter((c) => c.relationship_strength === strength);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
          (c.title ?? "").toLowerCase().includes(q) ||
          (c.agency ?? "").toLowerCase().includes(q) ||
          (c.department ?? "").toLowerCase().includes(q) ||
          (c.tags ?? []).some((t: string) => t.toLowerCase().includes(q)),
      );
    }

    if (sortBy && typeof sortBy === "string") {
      const dir = sortDir === "asc" ? 1 : -1;
      items.sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[sortBy];
        const bVal = (b as unknown as Record<string, unknown>)[sortBy];
        if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
        return String(aVal ?? "").localeCompare(String(bVal ?? "")) * dir;
      });
    }

    const statusCounts: Record<string, number> = {};
    for (const c of all) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    }

    const strengthCounts: Record<string, number> = {};
    for (const c of all) {
      strengthCounts[c.relationship_strength] = (strengthCounts[c.relationship_strength] ?? 0) + 1;
    }

    const activeRelationships = all.filter((c) => c.status === "active").length;

    const pendingMeetings = all.reduce((sum, c) => {
      return sum + (c.meeting_notes ?? []).reduce((mSum: number, mn: { action_items: Array<{ status: string }> }) => {
        return mSum + (mn.action_items ?? []).filter((ai) => ai.status === "open").length;
      }, 0);
    }, 0);

    const teamingGaps = all.filter(
      (c) => c.status === "active" && (c.teaming_records ?? []).length === 0 && (c.linked_opportunities ?? []).length > 0,
    ).length;

    const agencies = Array.from(new Set(all.map((c) => c.agency).filter(Boolean))).sort();

    res.json(
      successEnvelope("GDA.contacts", "list", {
        contacts: items,
        total: all.length,
        filtered: items.length,
        summary: { statusCounts, strengthCounts, activeRelationships, pendingMeetings, teamingGaps, agencies },
        source,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.contacts", "list", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/contacts/:id — single contact detail
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    let contact: Contact | undefined;
    let source: "db" = "db";
    const pool = getPool();

    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM contacts WHERE id = $1", [req.params.id]);
        if (rows.length > 0) {
          const r = rows[0] as Record<string, unknown>;
          contact = {
            ...r,
            meeting_notes: typeof r.meeting_notes === "string" ? JSON.parse(r.meeting_notes) : (r.meeting_notes ?? []),
            tags: r.tags ?? [],
            linked_opportunities: typeof r.linked_opportunities === "string" ? JSON.parse(r.linked_opportunities) : (r.linked_opportunities ?? []),
            teaming_records: typeof r.teaming_records === "string" ? JSON.parse(r.teaming_records) : (r.teaming_records ?? []),
          } as Contact;
          source = "db";
        }
      } catch { /* fall through to mock */ }
    }

    if (!contact) {
      return res.status(404).json(
        errorEnvelope("GDA.contacts", "get-detail", { code: "NOT_FOUND", message: `Contact ${req.params.id} not found`, detail: null }),
      );
    }
    res.json(successEnvelope("GDA.contacts", "get-detail", { contact, source }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.contacts", "get-detail", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/contacts/quick-create — create a new contact (Quick Entry)
// ---------------------------------------------------------------------------
router.post("/quick-create", requireRole("admin", "bd_manager", "capture_lead"), async (req, res) => {
  const { first_name, last_name, title, agency, email, phone } = req.body as {
    first_name?: string;
    last_name?: string;
    title?: string;
    agency?: string;
    email?: string;
    phone?: string;
  };

  if (!first_name || !last_name) {
    return res.status(400).json(
      errorEnvelope("GDA.contacts", "quick-create", { code: "BAD_REQUEST", message: "first_name and last_name are required", detail: null }),
    );
  }

  const pool = getPool();
  if (!pool) {
    return res.status(500).json(
      errorEnvelope("GDA.contacts", "quick-create", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }),
    );
  }

  try {
    const id = `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO contacts (id, first_name, last_name, title, agency, email, phone, status, relationship_strength, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'new', $8, $8)`,
      [id, first_name, last_name, title ?? null, agency ?? null, email ?? null, phone ?? null, now],
    );
    res.json(successEnvelope("GDA.contacts", "quick-create", { id, name: `${first_name} ${last_name}` }));
  } catch (e) {
    res.status(500).json(
      errorEnvelope("GDA.contacts", "quick-create", { code: "INTERNAL", message: (e as Error).message, detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/contacts/auto-capture — extract POCs from SAM data and create contacts
// ---------------------------------------------------------------------------
router.post("/auto-capture", requireRole("admin", "bd_manager"), async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(
      errorEnvelope("GDA.contacts", "auto-capture", { code: "DB_UNAVAILABLE", message: "Database not available", detail: null }),
    );
  }

  try {
    // Extract POC data from SAM opportunities that have contact info
    const { rows: samOpps } = await pool.query(
      `SELECT id, title, agency, poc_name, poc_email, poc_phone, poc_title
       FROM sam_opportunities
       WHERE poc_name IS NOT NULL AND poc_name != ''
       AND NOT EXISTS (
         SELECT 1 FROM contacts c WHERE c.email = sam_opportunities.poc_email AND c.email IS NOT NULL
       )
       LIMIT 100`
    );

    let created = 0;
    for (const opp of samOpps) {
      const names = (opp.poc_name ?? "").split(/\s+/);
      const firstName = names[0] || "Unknown";
      const lastName = names.slice(1).join(" ") || "Unknown";
      const id = `contact-sam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      try {
        await pool.query(
          `INSERT INTO contacts (id, first_name, last_name, title, agency, email, phone, status, relationship_strength, notes, data_source, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'new', $8, 'sam.gov', NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          [
            id, firstName, lastName,
            opp.poc_title ?? null,
            opp.agency ?? null,
            opp.poc_email ?? null,
            opp.poc_phone ?? null,
            `Auto-captured from SAM.gov opportunity: ${opp.title}`,
          ]
        );
        created++;
      } catch { /* skip duplicates */ }
    }

    return res.json(successEnvelope("GDA.contacts", "auto-capture", {
      scanned: samOpps.length,
      created,
      message: `Scanned ${samOpps.length} SAM opportunities, created ${created} new contacts`,
    }));
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("GDA.contacts", "auto-capture", { code: "INTERNAL", message: (err as Error).message, detail: null }),
    );
  }
});

export default router;
