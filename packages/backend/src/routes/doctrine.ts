import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { MOCK_DRAFTS, MOCK_PUBLISH_RUNS } from "../data/doctrine-mock";
import type { DoctrineDraft, GateCheckResult } from "@gda/shared";

const router = Router();

// GET /api/doctrine/drafts — list doctrine drafts with optional filtering
router.get("/drafts", (req, res) => {
  let drafts: DoctrineDraft[] = [...MOCK_DRAFTS];

  const { sprint, component, doc_type, status, search, sortBy, sortDir } = req.query;

  if (sprint && typeof sprint === "string") {
    drafts = drafts.filter((d) => d.sprint_id === sprint);
  }
  if (component && typeof component === "string") {
    drafts = drafts.filter((d) =>
      d.component.toLowerCase().includes(component.toLowerCase())
    );
  }
  if (doc_type && typeof doc_type === "string") {
    drafts = drafts.filter((d) => d.doc_type === doc_type);
  }
  if (status && typeof status === "string") {
    drafts = drafts.filter((d) => d.status === status);
  }
  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    drafts = drafts.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.component.toLowerCase().includes(q)
    );
  }

  // Sorting
  const field = typeof sortBy === "string" ? sortBy : "updated_at";
  const dir = sortDir === "asc" ? 1 : -1;
  drafts.sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[field];
    const bv = (b as unknown as Record<string, unknown>)[field];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return 0;
  });

  // Compute stats
  const sprints = [...new Set(MOCK_DRAFTS.map((d) => d.sprint_id))];
  const statusCounts = {
    draft: MOCK_DRAFTS.filter((d) => d.status === "draft").length,
    finalized: MOCK_DRAFTS.filter((d) => d.status === "finalized").length,
    superseded: MOCK_DRAFTS.filter((d) => d.status === "superseded").length,
    blocked: MOCK_DRAFTS.filter((d) => d.status === "blocked").length,
  };

  res.json(
    successEnvelope("GDA.doctrine", "list-drafts", {
      drafts,
      total: MOCK_DRAFTS.length,
      filtered: drafts.length,
      sprints,
      statusCounts,
      source: "mock" as const,
    })
  );
});

// GET /api/doctrine/drafts/:id — get a single draft
router.get("/drafts/:id", (req, res) => {
  const draft = MOCK_DRAFTS.find((d) => d.id === req.params.id);
  if (!draft) {
    res.status(404).json(
      errorEnvelope("GDA.doctrine", "get-draft", {
        code: "NOT_FOUND",
        message: `Draft not found: ${req.params.id}`,
        detail: null,
      })
    );
    return;
  }
  res.json(
    successEnvelope("GDA.doctrine", "get-draft", {
      draft,
      source: "mock" as const,
    })
  );
});

// GET /api/doctrine/publish-runs — list publish run history
router.get("/publish-runs", (req, res) => {
  let runs = [...MOCK_PUBLISH_RUNS];

  const { sprint } = req.query;
  if (sprint && typeof sprint === "string") {
    runs = runs.filter((r) => r.sprint_id === sprint);
  }

  // Sort by started_at DESC (most recent first)
  runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  res.json(
    successEnvelope("GDA.doctrine", "list-publish-runs", {
      runs,
      total: MOCK_PUBLISH_RUNS.length,
      source: "mock" as const,
    })
  );
});

// POST /api/doctrine/finalize — trigger sprint finalization with gate checks
router.post("/finalize", (req, res) => {
  const { sprintId } = req.body as { sprintId?: string };

  if (!sprintId) {
    res.status(400).json(
      errorEnvelope("GDA.doctrine", "finalize", {
        code: "MISSING_SPRINT_ID",
        message: "sprintId is required in request body.",
        detail: null,
      })
    );
    return;
  }

  const sprintDrafts = MOCK_DRAFTS.filter(
    (d) => d.sprint_id === sprintId && d.status === "draft"
  );

  if (sprintDrafts.length === 0) {
    res.status(404).json(
      errorEnvelope("GDA.doctrine", "finalize", {
        code: "NO_DRAFTS",
        message: `No draft-status records found for sprint ${sprintId}.`,
        detail: null,
      })
    );
    return;
  }

  // Simulate gate checks
  const gateResults: GateCheckResult[] = [
    {
      name: "React Build / CI",
      status: "pass",
      message: "Build succeeded — no CI configured, local build clean.",
      required: true,
    },
    {
      name: "QA Center Health",
      status: "pass",
      message: "Platform health checks passing.",
      required: true,
    },
    {
      name: "Dry-Run: Qualify Write",
      status: "pass",
      message: "Dry-run executed successfully.",
      required: true,
    },
    {
      name: "Frozen Workflow Guard",
      status: "pass",
      message: "No frozen workflows modified.",
      required: true,
    },
  ];

  // Check for blocked drafts
  const blockedDrafts = sprintDrafts.filter((d) => d.status === "blocked");
  if (blockedDrafts.length > 0) {
    gateResults.push({
      name: "Blocked Drafts Check",
      status: "fail",
      message: `${blockedDrafts.length} draft(s) are in blocked status and cannot be finalized.`,
      required: true,
    });
  }

  const allPassed = gateResults.every(
    (g) => g.status === "pass" || g.status === "skip" || !g.required
  );

  const correlationId = `GDA-DOC-${crypto.randomUUID().slice(0, 8)}`;

  if (!allPassed) {
    const failedGates = gateResults.filter((g) => g.status === "fail" && g.required);
    res.json(
      successEnvelope(
        "GDA.doctrine",
        "finalize",
        {
          sprintId,
          status: "blocked" as const,
          correlationId,
          draftsCount: sprintDrafts.length,
          gateResults,
          reason: `Finalization blocked: ${failedGates.map((g) => g.name).join(", ")} failed.`,
          dryRun: true,
        },
        {},
        true
      )
    );
    return;
  }

  // Simulate successful finalization (dry-run by default)
  res.json(
    successEnvelope(
      "GDA.doctrine",
      "finalize",
      {
        sprintId,
        status: "success" as const,
        correlationId,
        draftsCount: sprintDrafts.length,
        draftsFinalized: sprintDrafts.map((d) => d.title),
        gateResults,
        commitSha: null,
        reason: null,
        dryRun: true,
        note: "Dry-run only — no documents were actually published. Set dryRun:false to publish.",
      },
      {},
      true
    )
  );
});

export default router;
