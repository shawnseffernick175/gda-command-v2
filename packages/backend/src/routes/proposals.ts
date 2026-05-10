import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_PROPOSALS } from "../data/proposals-mock";
import type { Proposal, ProposalStatus } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/proposals — list proposals with filters
// ---------------------------------------------------------------------------
router.get("/", (req, res) => {
  try {
    let items: Proposal[] = [...MOCK_PROPOSALS];
    const { status, agency, search, sortBy, sortDir } = req.query;

    if (status && typeof status === "string") {
      items = items.filter((p) => p.status === status);
    }
    if (agency && typeof agency === "string") {
      items = items.filter((p) => p.agency === agency);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.solicitation_title.toLowerCase().includes(q) ||
          p.agency.toLowerCase().includes(q) ||
          p.proposal_manager.toLowerCase().includes(q),
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
    const all = MOCK_PROPOSALS;
    const statusCounts: Record<string, number> = {};
    for (const p of all) {
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
    }

    const totalValue = all.reduce((sum, p) => sum + p.value_estimated, 0);
    const activeProposals = all.filter((p) => !["submitted", "archived"].includes(p.status));
    const avgCompliance = activeProposals.length > 0
      ? Math.round(activeProposals.reduce((sum, p) => sum + p.compliance_score, 0) / activeProposals.length)
      : 0;

    const totalRedTeamOpen = all.reduce(
      (sum, p) => sum + p.red_team_findings.filter((f) => f.status === "open").length,
      0,
    );

    const agencies = Array.from(new Set(all.map((p) => p.agency)));

    res.json(
      successEnvelope("GDA.proposals", "list", {
        proposals: items,
        total: all.length,
        filtered: items.length,
        summary: {
          statusCounts,
          totalValue,
          avgCompliance,
          totalRedTeamOpen,
          agencies,
        },
        source: "mock" as const,
      }),
    );
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "list", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

// ---------------------------------------------------------------------------
// GET /api/proposals/:id — single proposal detail
// ---------------------------------------------------------------------------
router.get("/:id", (req, res) => {
  try {
    const proposal = MOCK_PROPOSALS.find((p) => p.id === req.params.id);
    if (!proposal) {
      return res.status(404).json(
        errorEnvelope("GDA.proposals", "get-detail", {
          code: "NOT_FOUND",
          message: `Proposal ${req.params.id} not found`,
          detail: null,
        }),
      );
    }
    res.json(successEnvelope("GDA.proposals", "get-detail", { proposal, source: "mock" as const }));
  } catch (err) {
    res.status(500).json(errorEnvelope("GDA.proposals", "get-detail", { code: "INTERNAL", message: String(err), detail: null }));
  }
});

export default router;
