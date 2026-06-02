# GDA MCP — Client Configuration Docs

**Production URL:** `https://gda-mcp.csr-llc.tech`
**Health check:** `https://gda-mcp.csr-llc.tech/health`
**Transport:** Streamable HTTP (`POST /mcp`)
**Auth:** Bearer JWT (HS256, shared `JWT_SECRET` with backend-v3)

## Client guides

| Client | Config file | Guide |
| --- | --- | --- |
| Claude Desktop | `claude_desktop_config.json` | [claude-desktop.md](./claude-desktop.md) |
| Cursor | `.cursor/mcp.json` | [cursor.md](./cursor.md) |
| Devin | Session prompt | [devin.md](./devin.md) |
| Frontend / Agent (internal) | TypeScript / Docker | [frontend.md](./frontend.md) |

## Tool catalog (11 tools)

All tools are prefixed `gda_` and registered in [`apps/gda-mcp-server/src/tools/index.ts`](../../apps/gda-mcp-server/src/tools/index.ts).

| # | Tool | Source | Description |
|---|------|--------|-------------|
| 1 | `gda_search_opportunities` | F-502 | Search opportunities with filters (stage, agency, keyword) |
| 2 | `gda_get_opportunity` | F-502 | Fetch a single opportunity by ID |
| 3 | `gda_score_doctrine` | F-502 | Score an opportunity against GDA doctrine criteria |
| 4 | `gda_get_pwin` | F-502 | Estimate probability of win |
| 5 | `gda_query_rag` | F-502 | Query the RAG knowledge base |
| 6 | `gda_list_action_items` | F-503 | List action items with optional filters |
| 7 | `gda_get_pipeline` | F-503 | Pipeline summary by stage |
| 8 | `gda_run_color_team` | F-503 | Run a color-team review (Pink/Red/Gold) |
| 9 | `gda_get_launchpad_summary` | F-503 | Launchpad summary dashboard data |
| 10 | `gda_recall_decisions` | F-503 | Recall past capture decisions from memory |
| 11 | `gda_search_bills` | F-506 | Search federal + state legislation via LegiScan |

## Generating a JWT

See the [Getting a JWT](./claude-desktop.md#getting-a-jwt) section or the [MCP server README](../../apps/gda-mcp-server/README.md#generating-a-test-jwt).

## Smoke test (expected results)

After configuring any client with a valid JWT:

1. The client connects to `https://gda-mcp.csr-llc.tech/mcp` via Streamable HTTP.
2. Running `tools/list` returns exactly **11 tools** starting with `gda_`.
3. Each tool can be invoked via `tools/call` with the appropriate arguments.
4. Invalid or expired tokens return HTTP 401.
