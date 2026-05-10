import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_APPROVALS } from "../data/approvals-mock";
import type { ApprovalItem, ApprovalStatus, ApprovalCategory } from "@gda/shared";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/approvals — list all approval items with optional filters
// ---------------------------------------------------------------------------
router.get("/", (req, res) => {
  try {
    let items: ApprovalItem[] = [...MOCK_APPROVALS];

    const { status, category, priority, search } = req.query;

    if (status && typeof status === "string") {
      items = items.filter((a) => a.status === status);
    }
    if (category && typeof category === "string") {
      items = items.filter((a) => a.category === category);
    }
    if (priority && typeof priority === "string") {
      items = items.filter((a) => a.priority === priority);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.requester.toLowerCase().includes(q),
      );
    }

    // Summary stats from full set (before filtering)
    const all = MOCK_APPROVALS;
    const pending = all.filter((a) => a.status === "pending").length;
    const approved = all.filter((a) => a.status === "approved").length;
    const rejected = all.filter((a) => a.status === "rejected").length;
    const expired = all.filter((a) => a.status === "expired").length;
    const critical = all.filter((a) => a.status === "pending" && a.priority === "critical").length;
    const expiringSoon = all.filter((a) => {
      if (a.status !== "pending" || !a.expires_at) return false;
      const diff = new Date(a.expires_at).getTime() - Date.now();
      return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000; // within 3 days
    }).length;

    // Categories breakdown
    const categories: Record<string, number> = {};
    for (const a of all.filter((x) => x.status === "pending")) {
      categories[a.category] = (categories[a.category] || 0) + 1;
    }

    res.json(
      successEnvelope("GDA.approvals", "list", {
        approvals: items,
        total: items.length,
        summary: { pending, approved, rejected, expired, critical, expiringSoon },
        categories,
        source: "mock",
      }),
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("GDA.approvals", "list", { code: "APPROVALS_ERROR", message: String(err), detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/approvals/:id — single approval detail
// ---------------------------------------------------------------------------
router.get("/:id", (req, res) => {
  const item = MOCK_APPROVALS.find((a) => a.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("GDA.approvals", "get", { code: "NOT_FOUND", message: `Approval ${req.params.id} not found`, detail: null }),
    );
  }
  res.json(successEnvelope("GDA.approvals", "get", { approval: item, source: "mock" }));
});

// ---------------------------------------------------------------------------
// POST /api/approvals/:id/resolve — approve or reject (dry-run by default)
// ---------------------------------------------------------------------------
router.post("/:id/resolve", (req, res) => {
  const item = MOCK_APPROVALS.find((a) => a.id === req.params.id);
  if (!item) {
    return res.status(404).json(
      errorEnvelope("GDA.approvals", "resolve", { code: "NOT_FOUND", message: `Approval ${req.params.id} not found`, detail: null }),
    );
  }

  const { action, notes } = req.body as { action?: string; notes?: string };
  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json(
      errorEnvelope("GDA.approvals", "resolve", { code: "INVALID_ACTION", message: "action must be 'approve' or 'reject'", detail: null }),
    );
  }

  const dryRun = req.query.dryRun !== "false";
  const correlationId = `GDA-RESOLVE-${Date.now()}`;

  if (dryRun) {
    res.json(
      successEnvelope(
        "GDA.approvals",
        "resolve",
        {
          approval_id: item.id,
          proposed_action: action,
          current_status: item.status,
          would_change_to: action === "approve" ? "approved" : "rejected",
          dry_run_result: item.dry_run_result,
          correlation_id: correlationId,
        },
        { dryRun: true },
      ),
    );
  } else {
    // In production this would mutate DB; for mock we return simulated result
    res.json(
      successEnvelope("GDA.approvals", "resolve", {
        approval_id: item.id,
        previous_status: item.status,
        new_status: action === "approve" ? "approved" : "rejected",
        resolved_by: "Shawn Seffernick",
        resolved_at: new Date().toISOString(),
        resolution_notes: notes ?? null,
        correlation_id: correlationId,
      }),
    );
  }
});

export default router;
