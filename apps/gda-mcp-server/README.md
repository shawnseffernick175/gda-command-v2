# gda-mcp-server

MCP (Model Context Protocol) server for GDA Command — exposes internal GDA services as MCP tools over Streamable HTTP transport with Bearer JWT authentication. Part of the F-500 epic.

## Dev Commands

```bash
# Development (hot-reload)
npm run dev --workspace=@gda/mcp-server

# Build
npm run build --workspace=@gda/mcp-server

# Typecheck
npm run typecheck --workspace=@gda/mcp-server

# Run tests
npm run test --workspace=@gda/mcp-server

# Start (production)
npm run start --workspace=@gda/mcp-server
```

## Environment Variables

| Variable       | Required | Default                                    | Description                                |
| -------------- | -------- | ------------------------------------------ | ------------------------------------------ |
| `JWT_SECRET`   | Yes      | `dev-jwt-secret-change-in-production`      | Shared secret for HS256 JWT verification   |
| `MCP_PORT`     | No       | `4100`                                     | Port the MCP server listens on             |
| `DATABASE_URL` | No       | —                                          | PostgreSQL connection string (future use)  |
