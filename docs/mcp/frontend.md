# Frontend / Agent Integration — GDA MCP Client Config

How to wire `frontend-v3`, `agent-v3`, or any internal service to the GDA MCP server.

## Server URLs

| Context                         | URL                                        |
| ------------------------------- | ------------------------------------------ |
| Inside Docker network           | `http://gda-mcp-server:4100/mcp`           |
| Outside Docker (public)         | `https://gda-mcp.csr-llc.tech/mcp`        |
| Local development               | `http://localhost:4100/mcp`                |

Use the **internal Docker URL** for service-to-service calls within `docker-compose.prod.yml` — it avoids Traefik and is faster.

Use the **public URL** from outside the Docker network or from CI/CD.

## Authentication

The MCP server uses the same JWT auth as backend-v3: **HS256** with the shared `JWT_SECRET`.

### Signing a service JWT (Node.js)

```typescript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { sub: 'frontend-v3', role: 'service' },
  process.env.JWT_SECRET!,
  { algorithm: 'HS256', expiresIn: '1h' }
);
```

> Both `backend-v3` and `gda-mcp-server` read `JWT_SECRET` from the environment and verify with `HS256`. The token is interchangeable.

### Required JWT claims

| Claim | Required | Description                                |
| ----- | -------- | ------------------------------------------ |
| `sub` | Yes      | Service or user identifier                 |
| `role`| No       | `admin`, `service`, `analyst`, etc.        |
| `exp` | Auto     | Set via `expiresIn` (recommend ≤ 1h for services) |

## Calling MCP from TypeScript

```typescript
const MCP_URL = process.env.MCP_INTERNAL_URL ?? 'http://gda-mcp-server:4100/mcp';

async function callMcpTool(toolName: string, args: Record<string, unknown>) {
  const token = signServiceJwt(); // see above

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  if (!res.ok) throw new Error(`MCP ${res.status}: ${await res.text()}`);
  return res.json();
}

// Example: search for DoD solicitations
const result = await callMcpTool('gda_search_opportunities', {
  keyword: 'cybersecurity',
  stage: 'solicitation',
});
```

## Docker Compose networking

The `gda-mcp-server` service is already defined in `docker-compose.prod.yml`. Any service in the same Compose network can reach it at `http://gda-mcp-server:4100`.

```yaml
# In docker-compose.prod.yml, the service is already configured:
# gda-mcp-server:
#   build: ./apps/gda-mcp-server
#   ports: ["4100:4100"]
#   environment:
#     - JWT_SECRET=${JWT_SECRET}
```

No additional network configuration is needed — all services share the default Compose network.

## Available tools (10)

| # | Tool name                    | Description                                      |
|---|------------------------------|--------------------------------------------------|
| 1 | `gda_search_opportunities`   | Search opportunities with filters                |
| 2 | `gda_get_opportunity`        | Fetch a single opportunity by ID                 |
| 3 | `gda_score_doctrine`         | Score against GDA doctrine criteria              |
| 4 | `gda_get_pwin`               | Estimate probability of win                      |
| 5 | `gda_query_rag`              | Query the RAG knowledge base                     |
| 6 | `gda_list_action_items`      | List action items with optional filters          |
| 7 | `gda_get_pipeline`           | Pipeline summary by stage                        |
| 8 | `gda_run_color_team`         | Run a color-team review (Pink/Red/Gold)          |
| 9 | `gda_get_launchpad_summary`  | Launchpad summary dashboard data                 |
| 10| `gda_recall_decisions`       | Recall past capture decisions from memory         |

## Expected result

After wiring a service to call the MCP server with a valid JWT:

1. `POST /mcp` with a `tools/list` JSON-RPC request returns all 10 tools above.
2. `POST /mcp` with a `tools/call` request invokes the tool and returns `{ content: [{ type: 'text', text: '...' }] }`.
3. Invalid or expired JWTs return `401 Unauthorized`.
