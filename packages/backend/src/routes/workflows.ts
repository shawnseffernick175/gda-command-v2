import { Router } from "express";
import { successEnvelope, notConfiguredEnvelope, errorEnvelope } from "../middleware/envelope";
import { fetchWorkflows, apiConfig } from "../lib/n8n-client";

const router = Router();

interface SimplifiedWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number | null;
  updatedAt: string | null;
}

function simplifyWorkflow(w: Record<string, unknown>): SimplifiedWorkflow {
  return {
    id: w.id as string,
    name: w.name as string,
    active: !!w.active,
    nodeCount: Array.isArray(w.nodes) ? w.nodes.length : ((w.nodeCount as number) ?? null),
    updatedAt: (w.updatedAt as string) ?? null,
  };
}

/**
 * GET /api/workflows/registry
 * Returns all n8n workflows. Pass ?refresh=true to force a live fetch.
 */
router.get("/registry", async (_req, res) => {
  const cfg = apiConfig();

  if (cfg.missing.length > 0) {
    return res.json(
      notConfiguredEnvelope("GDA.gateway.workflows-registry", "list", cfg.missing, {
        hint: "Set N8N_API_BASE and N8N_API_KEY in .env to fetch workflows from n8n.",
      })
    );
  }

  try {
    const result = await fetchWorkflows();
    if (!result.configured) {
      return res.json(
        notConfiguredEnvelope("GDA.gateway.workflows-registry", "list", result.missing ?? cfg.missing)
      );
    }
    if (result.error) {
      return res.json(
        errorEnvelope("GDA.gateway.workflows-registry", "list", {
          code: "UPSTREAM_ERROR",
          message: "n8n REST API returned an error",
          detail: result.error,
        })
      );
    }
    const workflows = (result.workflows as Record<string, unknown>[]).map(simplifyWorkflow);
    const summary = {
      total: workflows.length,
      active: workflows.filter((w) => w.active).length,
    };
    res.json(
      successEnvelope(
        "GDA.gateway.workflows-registry",
        "list",
        { source: "n8n-live", summary, workflows },
        { count: workflows.length }
      )
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.gateway.workflows-registry", "list", {
        code: "INTERNAL",
        message: (e as Error).message ?? "Failed to fetch workflows",
        detail: null,
      })
    );
  }
});

export default router;
