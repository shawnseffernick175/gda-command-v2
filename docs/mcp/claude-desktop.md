# Claude Desktop — GDA MCP Client Config

Connect Claude Desktop to the GDA MCP server so all 10 `gda_*` tools are available in-chat.

## Prerequisites

- Claude Desktop ≥ 0.8 (MCP support)
- A valid JWT signed with the shared `JWT_SECRET` (see [Generating a test JWT](#getting-a-jwt))

## Config snippet

Add the following to your `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows: `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gda": {
      "type": "streamableHttp",
      "url": "https://gda-mcp.csr-llc.tech/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_JWT_HERE"
      }
    }
  }
}
```

> **Note:** Replace `YOUR_JWT_HERE` with a real token. Never commit tokens to version control.

## Getting a JWT

The MCP server shares `JWT_SECRET` with backend-v3. Both use **HS256**.

Generate a token on any machine that has Node.js + the `jsonwebtoken` package:

```bash
node -e "console.log(require('jsonwebtoken').sign({ sub: 'your-user-id', role: 'admin' }, 'YOUR_JWT_SECRET', { algorithm: 'HS256', expiresIn: '8h' }))"
```

| Claim   | Required | Description                        |
| ------- | -------- | ---------------------------------- |
| `sub`   | Yes      | User or service identifier         |
| `role`  | No       | `admin`, `analyst`, etc.           |
| `email` | No       | User email for audit logging       |
| `exp`   | Auto     | Set via `expiresIn` (recommend 8h) |

Replace `YOUR_JWT_SECRET` with the production `JWT_SECRET` value from your `.env.prod` file.

## Expected result

After saving the config and restarting Claude Desktop:

1. Open a new conversation.
2. Run `tools/list` (or open the MCP tool picker).
3. You should see **10 tools**:

| # | Tool name                    |
|---|------------------------------|
| 1 | `gda_search_opportunities`   |
| 2 | `gda_get_opportunity`        |
| 3 | `gda_score_doctrine`         |
| 4 | `gda_get_pwin`               |
| 5 | `gda_query_rag`              |
| 6 | `gda_list_action_items`      |
| 7 | `gda_get_pipeline`           |
| 8 | `gda_run_color_team`         |
| 9 | `gda_get_launchpad_summary`  |
| 10| `gda_recall_decisions`       |

If you see all 10 tools, the connection is working. Try: *"Search for open DoD opportunities"* to exercise `gda_search_opportunities`.
