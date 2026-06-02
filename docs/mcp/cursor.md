# Cursor — GDA MCP Client Config

Connect Cursor IDE to the GDA MCP server so all 10 `gda_*` tools are available during AI-assisted coding.

## Prerequisites

- Cursor ≥ 0.48 (MCP support)
- A valid JWT signed with the shared `JWT_SECRET` (see [Getting a JWT](./claude-desktop.md#getting-a-jwt))

## Config snippet

Create or edit `.cursor/mcp.json` in your project root:

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

> **Note:** Replace `YOUR_JWT_HERE` with a real token. See the [JWT generation instructions](./claude-desktop.md#getting-a-jwt). Never commit tokens to version control — add `.cursor/mcp.json` to `.gitignore` if it contains a real token.

## Expected result

After saving the config:

1. Open the Cursor command palette → **MCP: List Tools** (or the MCP panel).
2. You should see **10 tools**:

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

Try asking Cursor: *"Use gda_get_pipeline to show the current pipeline by stage"* to verify the connection.
