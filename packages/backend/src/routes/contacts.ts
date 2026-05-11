import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_CONTACTS } from "../data/contacts-mock";
import { getPool } from "../lib/db";
import type { Contact } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/contacts — list contacts with filters
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    let items: Contact[];
    let source: "db" | "mock" = "mock";
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
          items = [...MOCK_CONTACTS];
        }
      } catch {
        items = [...MOCK_CONTACTS];
      }
    } else {
      items = [...MOCK_CONTACTS];
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
    let source: "db" | "mock" = "mock";
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
      contact = MOCK_CONTACTS.find((c) => c.id === req.params.id);
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

export default router;
