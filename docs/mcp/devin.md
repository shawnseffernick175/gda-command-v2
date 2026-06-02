# Devin — GDA MCP Session Config

Enable Devin sessions to use the GDA MCP server. This lets Devin call all 10 `gda_*` tools to query opportunities, run doctrine scoring, estimate pwin, and more.

## Prerequisites

- GDA MCP server live at `https://gda-mcp.csr-llc.tech`
- A valid JWT signed with the shared `JWT_SECRET` (see [Getting a JWT](./claude-desktop.md#getting-a-jwt))
- The JWT should be stored as an org or session secret named `GDA_MCP_JWT`

## Session prompt template

When starting a Devin session that should use the GDA MCP tools, include this in the prompt:

```
This session has access to the GDA MCP server at https://gda-mcp.csr-llc.tech/mcp.

Auth: Bearer JWT via the GDA_MCP_JWT secret (HS256, shared JWT_SECRET with backend-v3).

Available tools (10):
  gda_search_opportunities — Search opportunities with filters (stage, agency, keyword)
  gda_get_opportunity      — Fetch a single opportunity by ID
  gda_score_doctrine       — Score an opportunity against GDA doctrine criteria
  gda_get_pwin             — Estimate probability of win for an opportunity
  gda_query_rag            — Query the RAG knowledge base
  gda_list_action_items    — List action items with optional filters
  gda_get_pipeline         — Get pipeline summary by stage
  gda_run_color_team       — Run a color-team review (Pink/Red/Gold)
  gda_get_launchpad_summary — Get launchpad summary dashboard data
  gda_recall_decisions     — Recall past capture decisions from memory

Use these tools to answer questions about GDA opportunities, pipeline, and capture status.
Do NOT hardcode any JWT or secret value — use the ${GDA_MCP_JWT} environment variable.
```

## Sample prompt

```
Use the gda-mcp server to fetch a merged opportunity and run doctrine + pwin against it.

Steps:
1. Call gda_search_opportunities to find a recent solicitation-stage opportunity
2. Call gda_get_opportunity with the returned ID to get full details
3. Call gda_score_doctrine with the opportunity ID
4. Call gda_get_pwin with the opportunity ID
5. Summarize the doctrine score and pwin estimate
```

## MCP server connection (for Devin MCP integration)

If configuring the GDA MCP server as a Devin MCP integration:

- **Server URL:** `https://gda-mcp.csr-llc.tech/mcp`
- **Transport:** Streamable HTTP
- **Auth header:** `Authorization: Bearer ${GDA_MCP_JWT}`

## Expected result

After providing the prompt and a valid JWT:

1. Devin should discover all 10 `gda_*` tools.
2. Tool calls hit `https://gda-mcp.csr-llc.tech/mcp` with the Bearer token.
3. Responses follow the standard MCP content format (`{ content: [{ type: 'text', text: '...' }] }`).
