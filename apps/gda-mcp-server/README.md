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

## Production Deploy

- **Public URL:** `https://gda-mcp.csr-llc.tech`
- **Health check:** `https://gda-mcp.csr-llc.tech/health`
- **Container:** `gda-mcp-server` (port 4100, behind Traefik)
- **Compose service:** `gda-mcp-server` in `docker-compose.prod.yml`

### Required env on VPS (`.env.prod`)

| Variable | Notes |
|----------|-------|
| `JWT_SECRET` | Must match backend-v3's value (shared auth) |
| `STAGING_POSTGRES_USER` | Defaults to `gda_staging` |
| `STAGING_POSTGRES_PASSWORD` | Required |
| `STAGING_POSTGRES_DB` | Defaults to `gda_staging` |

### Deploy

Automatic on push to `main` when `apps/gda-mcp-server/**` or `docker-compose.prod.yml` changes (`.github/workflows/deploy-mcp-server.yml`).

Manual deploy from VPS:

```bash
cd /root/gda-command-v2
git fetch origin && git reset --hard origin/main
docker compose -f docker-compose.prod.yml build gda-mcp-server
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps gda-mcp-server
```

### Rollback

```bash
cd /root/gda-command-v2
# Find previous good commit
git log --oneline -10

# Revert to that commit
git checkout <sha>
docker compose -f docker-compose.prod.yml build gda-mcp-server
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps gda-mcp-server

# Return to main when ready
git checkout main
```

### Verify

```bash
# Container health
docker inspect gda-mcp-server --format '{{.State.Health.Status}}'

# Logs
docker logs gda-mcp-server --tail 50

# Health endpoint
curl https://gda-mcp.csr-llc.tech/health
```

## Generating a test JWT

The MCP server shares `JWT_SECRET` with backend-v3. Both verify tokens using **HS256**.

### Quick one-liner (Node.js)

```bash
node -e "console.log(require('jsonwebtoken').sign({ sub: 'test-user', role: 'admin' }, process.env.JWT_SECRET || 'YOUR_JWT_SECRET', { algorithm: 'HS256', expiresIn: '1h' }))"
```

> Replace `YOUR_JWT_SECRET` with the actual `JWT_SECRET` from `.env.prod` — or ensure the `JWT_SECRET` environment variable is set in your shell.

### Programmatic (TypeScript)

```typescript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { sub: 'test-user', role: 'admin' },
  process.env.JWT_SECRET!,
  { algorithm: 'HS256', expiresIn: '1h' }
);
```

### JWT claims

| Claim   | Required | Description                        |
| ------- | -------- | ---------------------------------- |
| `sub`   | Yes      | User or service identifier         |
| `role`  | No       | `admin`, `analyst`, `service`      |
| `email` | No       | User email for audit logging       |
| `exp`   | Auto     | Set via `expiresIn`                |

### Verify the token works

```bash
curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer YOUR_JWT_HERE" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  https://gda-mcp.csr-llc.tech/mcp
```

- `200` — token is valid, tools/list returned successfully
- `401` — token is invalid, expired, or missing

## Client configuration

See [docs/mcp/](../../docs/mcp/README.md) for copy-paste config snippets for:

- [Claude Desktop](../../docs/mcp/claude-desktop.md)
- [Cursor](../../docs/mcp/cursor.md)
- [Devin](../../docs/mcp/devin.md)
- [Frontend / Agent (internal)](../../docs/mcp/frontend.md)
