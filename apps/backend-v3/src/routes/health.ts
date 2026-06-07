import type { FastifyInstance } from "fastify";
import { pool } from "../lib/db.js";

export async function systemHealthRoutes(fastify: FastifyInstance) {
  fastify.get("/v3/system/health", async (_req, reply) => {
    const checks = await Promise.allSettled([
      pool.query("SELECT 1").then(() => ({ service: "database", status: "up" as const })),
      fetch("http://gda-agent-v3:8001/healthz", { signal: AbortSignal.timeout(3000) })
        .then((r) => ({ service: "agent_service", status: (r.ok ? "up" : "down") as "up" | "down" }))
        .catch(() => ({ service: "agent_service", status: "down" as const })),
      fetch("http://gda-mcp-server:4100/health", { signal: AbortSignal.timeout(3000) })
        .then((r) => ({ service: "mcp_server", status: (r.ok ? "up" : "down") as "up" | "down" }))
        .catch(() => ({ service: "mcp_server", status: "down" as const })),
    ]);

    const results: Record<string, string> = { backend_api: "up" };
    for (const c of checks) {
      if (c.status === "fulfilled") {
        results[c.value.service] = c.value.status;
      } else {
        results["unknown"] = "down";
      }
    }

    return reply.send({ success: true, data: results });
  });
}
