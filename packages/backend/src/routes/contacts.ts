import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_CONTACTS } from "../data/contacts-mock";
import type { Contact, ContactStatus } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/contacts — list contacts with filters
// ---------------------------------------------------------------------------
router.get("/", (req, res) => {
  try {
    let items: Contact[] = [...MOCK_CONTACTS];
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
          c.title.toLowerCase().includes(q) ||
          c.agency.toLowerCase().includes(q) ||
          c.department.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sorting
    if (sortBy && typeof sortBy === "string") {
      const dir = sortDir === "asc" ? 1 : -1;
      items.sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[sortBy];
        const bVal = (b as unknown as Record<string, unknown>)[sortBy];
        if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
        return String(aVal ?? "").localeCompare(String(bVal ?? "")) * dir;
      });
    }

    // Summary stats from full set
    const all = MOCK_CONTACTS;
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
      return sum + c.meeting_notes.reduce((mSum, mn) => {
        return mSum + mn.action_items.filter((ai) => ai.status === "open").length;
      }, 0);
    }, 0);

    const teamingGaps = all.filter(
      (c) => c.status === "active" && c.teaming_records.length === 0 && c.linked_opportunities.length > 0,
    ).length;

    const agencies = Array.from(new Set(all.map((c) => c.agency))).sort();

    res.json(
      successEnvelope("GDA.contacts", "list", {
        contacts: items,
        total: all.length,
        filtered: items.length,
        summary: {
          statusCounts,
          strengthCounts,
          activeRelationships,
          pendingMeetings,
          teamingGaps,
          agencies,
        },
        source: "mock" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.contacts", "list", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/contacts/:id — single contact detail
// ---------------------------------------------------------------------------
router.get("/:id", (req, res) => {
  try {
    const contact = MOCK_CONTACTS.find((c) => c.id === req.params.id);
    if (!contact) {
      return res.status(404).json(
        errorEnvelope("GDA.contacts", "get-detail", {
          code: "NOT_FOUND",
          message: `Contact ${req.params.id} not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope("GDA.contacts", "get-detail", { contact, source: "mock" as const }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.contacts", "get-detail", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
