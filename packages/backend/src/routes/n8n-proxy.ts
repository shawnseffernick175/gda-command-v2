/**
 * Generic n8n webhook proxy.
 *
 * POST /api/n8n/:webhook  → forwards body to n8n /webhook/:webhook
 * GET  /api/n8n/:webhook  → forwards query params as body to n8n
 *
 * This gives the frontend a single authenticated API surface to reach
 * any n8n workflow without knowing about n8n directly.
 */
import { Router, Request, Response } from "express";
import { callWebhook } from "../lib/n8n-client";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";

const router = Router();

const LONG_TIMEOUT = 60_000;

router.post("/:webhook", async (req: Request, res: Response) => {
  const { webhook } = req.params;
  const body = req.body ?? {};

  try {
    const result = await callWebhook(webhook, body, { timeoutMs: LONG_TIMEOUT });

    if (!result.ok) {
      const status = result.http || 502;
      return res.status(status).json(
        errorEnvelope("GDA.n8n-proxy", webhook, {
          code: "N8N_ERROR",
          message: result.error ?? `n8n returned HTTP ${result.http}`,
          detail: String(result.body ?? ""),
        }),
      );
    }

    return res.json(result.body);
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("GDA.n8n-proxy", webhook, {
        code: "PROXY_ERROR",
        message: String(err),
        detail: null,
      }),
    );
  }
});

router.get("/:webhook", async (req: Request, res: Response) => {
  const { webhook } = req.params;
  const body = { ...req.query };

  try {
    const result = await callWebhook(webhook, body, { timeoutMs: LONG_TIMEOUT });

    if (!result.ok) {
      const status = result.http || 502;
      return res.status(status).json(
        errorEnvelope("GDA.n8n-proxy", webhook, {
          code: "N8N_ERROR",
          message: result.error ?? `n8n returned HTTP ${result.http}`,
          detail: String(result.body ?? ""),
        }),
      );
    }

    return res.json(result.body);
  } catch (err) {
    return res.status(500).json(
      errorEnvelope("GDA.n8n-proxy", webhook, {
        code: "PROXY_ERROR",
        message: String(err),
        detail: null,
      }),
    );
  }
});

export default router;
