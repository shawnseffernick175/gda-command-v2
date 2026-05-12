import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { notify } from "../lib/email";
import { requireRole } from "../lib/auth";
import type { ApprovalItem } from "@gda/shared";

const router = Router();

function rowToApproval(r: Record<string, unknown>): ApprovalItem {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as ApprovalItem["category"],
    priority: r.priority as ApprovalItem["priority"],
    status: r.status as ApprovalItem["status"],
    requester: r.requester as string,
    assignee: r.assignee as string,
    correlation_id: (r.correlation_id as string) ?? null,
    related_entity_id: (r.related_entity_id as string) ?? null,
    related_entity_type: (r.related_entity_type as string) ?? null,
    dry_run_result: (r.dry_run_result as ApprovalItem["dry_run_result"]) ?? null,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    expires_at: r.expires_at instanceof Date ? r.expires_at.toISOString() : r.expires_at ? String(r.expires_at) : null,
    resolved_at: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at ? String(r.resolved_at) : null,
    resolved_by: (r.resolved_by as string) ?? null,
    resolution_notes: (r.resolution_notes as string) ?? null,
    data_source: (r.data_source as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/approvals — list all approval items with optional filters
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const pool = getPool();
    let allItems: ApprovalItem[];
    let source: "db" = "db";

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM approvals ORDER BY created_at DESC");
        allItems = result.rows.map(rowToApproval);
        source = "db";
      } catch {
        allItems = [];
      }
    } else {
      allItems = [];
    }

    let items = [...allItems];
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

    const pending = allItems.filter((a) => a.status === "pending").length;
    const approved = allItems.filter((a) => a.status === "approved").length;
    const rejected = allItems.filter((a) => a.status === "rejected").length;
    const expired = allItems.filter((a) => a.status === "expired").length;
    const critical = allItems.filter((a) => a.status === "pending" && a.priority === "critical").length;
    const expiringSoon = allItems.filter((a) => {
      if (a.status !== "pending" || !a.expires_at) return false;
      const diff = new Date(a.expires_at).getTime() - Date.now();
      return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
    }).length;

    const categories: Record<string, number> = {};
    for (const a of allItems.filter((x) => x.status === "pending")) {
      categories[a.category] = (categories[a.category] || 0) + 1;
    }

    res.json(
      successEnvelope("GDA.approvals", "list", {
        approvals: items,
        total: items.length,
        summary: { pending, approved, rejected, expired, critical, expiringSoon },
        categories,
        source,
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
router.get("/:id", async (req, res) => {
  try {
    const pool = getPool();
    let item: ApprovalItem | undefined;
    let source: "db" = "db";

    if (pool) {
      try {
        const result = await pool.query("SELECT * FROM approvals WHERE id = $1", [req.params.id]);
        if (result.rows.length > 0) {
          item = rowToApproval(result.rows[0]);
          source = "db";
        }
      } catch { /* fall through */ }
    }

    if (!item) {
      return res.status(404).json(
        errorEnvelope("GDA.approvals", "get", { code: "NOT_FOUND", message: `Approval ${req.params.id} not found`, detail: null }),
      );
    }
    res.json(successEnvelope("GDA.approvals", "get", { approval: item, source }));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("GDA.approvals", "get", { code: "APPROVALS_ERROR", message: String(err), detail: null }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/approvals/:id/resolve — approve or reject
// ---------------------------------------------------------------------------
router.post("/:id/resolve", requireRole("admin", "bd_manager"), async (req, res) => {
  const { action, notes } = req.body as { action?: string; notes?: string };
  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json(
      errorEnvelope("GDA.approvals", "resolve", { code: "INVALID_ACTION", message: "action must be 'approve' or 'reject'", detail: null }),
    );
  }

  const correlationId = `GDA-RESOLVE-${Date.now()}`;
  const newStatus = action === "approve" ? "approved" : "rejected";
  const now = new Date().toISOString();
  const resolvedBy = (req as unknown as { user?: { email?: string } }).user?.email ?? "system";
  const pool = getPool();

  if (pool) {
    try {
      const current = await pool.query("SELECT * FROM approvals WHERE id = $1", [req.params.id]);
      if (current.rows.length === 0) {
        return res.status(404).json(
          errorEnvelope("GDA.approvals", "resolve", { code: "NOT_FOUND", message: `Approval ${req.params.id} not found`, detail: null }),
        );
      }

      const prev = rowToApproval(current.rows[0]);

      await pool.query(
        `UPDATE approvals SET status = $1, resolved_at = $2, resolved_by = $3, resolution_notes = $4, updated_at = $2 WHERE id = $5`,
        [newStatus, now, resolvedBy, notes ?? null, req.params.id],
      );

      // Send email notification for resolved approval
      notify({
        title: `Approval ${newStatus}: ${prev.title}`,
        message: `${prev.title} was ${newStatus} by ${resolvedBy}.${notes ? ` Notes: ${notes}` : ""}`,
        severity: newStatus === "approved" ? "success" : "warning",
        category: "approval",
        link: "/approvals",
        emailTemplate: "approval_resolved",
        emailData: { title: prev.title, decision: newStatus, notes: notes ?? "" },
      }).catch(() => {});

      return res.json(
        successEnvelope("GDA.approvals", "resolve", {
          approval_id: prev.id,
          previous_status: prev.status,
          new_status: newStatus,
          resolved_by: resolvedBy,
          resolved_at: now,
          resolution_notes: notes ?? null,
          correlation_id: correlationId,
        }),
      );
    } catch (err) {
      process.stderr.write(`[approvals] resolve error: ${(err as Error).message}\n`);
      return res.status(500).json(
        errorEnvelope("GDA.approvals", "resolve", { code: "DB_ERROR", message: "Failed to resolve approval", detail: null }),
      );
    }
  }

  return res.status(404).json(
    errorEnvelope("GDA.approvals", "resolve", { code: "NOT_FOUND", message: `Approval ${req.params.id} not found`, detail: null }),
  );
});

export default router;
