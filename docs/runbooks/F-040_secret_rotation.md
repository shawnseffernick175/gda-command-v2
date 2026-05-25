# F-040 — Secret Rotation Runbook

**Created:** 2026-05-19  
**Status:** Phase 1 scripted, Phase 2 manual  
**Risk:** HIGH — credentials treated as compromised

---

## Phase 1 — In-Cluster Secrets (Automated Script)

Phase 1 rotates 5 in-cluster secrets via a single paste-ready script.

**Script:** `scripts/f040/rotate-phase1.sh`

### Usage

```bash
# On VPS (root@srv1397562)
cd /root/gda-command-v2
git pull origin main
bash scripts/f040/rotate-phase1.sh
```

### What it rotates (in order)

| # | Secret | Length | Locations |
|---|--------|--------|-----------|
| 1 | `POSTGRES_PASSWORD` (user `gda`) | 32 hex | gda-postgres ALTER USER + `.env` |
| 2 | `MIGRATION_DATABASE_URL` (user `gda_app`) | 32 hex | gda-postgres ALTER USER + `.env` |
| 3 | `GDA_WEBHOOK_KEY` | 64 hex | `.env` + n8n credential `F4J3vYsPrJrYiO49` |
| 4 | `JWT_SECRET` | 64 hex | `.env` only (invalidates all user sessions) |
| 5 | n8n Postgres password (user `n8n`) | 32 hex | n8n-envision-postgres + n8n env + `.env` `N8N_DATABASE_URL` |

### Behavior

- Generates cryptographically random values via `openssl rand -hex`
- Backs up `.env` to `.env.bak.YYYYMMDD-HHMM` before each change
- Restarts only affected containers after each secret
- Runs `GET /health` + `GET /api/admin/health` after each rotation
- Reconnects `n8n_default` network if `docker compose up` drops it
- Stops on first failure with rollback instructions
- Logs to `/var/log/f040-rotation.log`
- **Never prints new secret values** — only writes to `.env` files

### Rollback

If any step fails, the script prints exact rollback commands. General pattern:

```bash
# Restore .env from backup
cp /path/to/.env.bak.YYYYMMDD-HHMM /path/to/.env

# Revert Postgres password
docker exec gda-postgres psql -U gda -d gda -c "ALTER USER gda PASSWORD 'OLD_PASSWORD';"

# Restart affected containers
docker compose -f docker-compose.prod.yml up -d postgres backend
```

### Post-Phase-1 verification

After the script completes, manually verify:

```bash
# Tail the log
tail -50 /var/log/f040-rotation.log

# Verify all 5 "rotated — verified" lines present
grep "rotated — verified" /var/log/f040-rotation.log

# Check canary fired successfully after rotation
docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -c "
  SELECT id, status, \"startedAt\"
  FROM execution_entity
  WHERE \"workflowId\" = 'LPUSYd4Vpph1Qg7n'
  ORDER BY id DESC LIMIT 3;"

# Hit the app
curl -sf https://gda.csr-llc.tech/api/health | jq .
```

---

## Phase 2 — Third-Party API Keys (Manual)

These keys require provider-side rotation. Rotate each one independently.

### General procedure per key

```bash
# 1. Generate or obtain new key from provider (see per-key steps below)
# 2. Backup .env
cp /root/gda-command-v2/.env /root/gda-command-v2/.env.bak.$(date +%Y%m%d-%H%M)
# 3. Update the env var
sed -i "s|^VAR_NAME=.*|VAR_NAME=NEW_VALUE|" /root/gda-command-v2/.env
# 4. Restart backend
cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml up -d backend
# 5. Reconnect n8n_default network if dropped
docker network connect n8n_default gda-backend 2>/dev/null || true
# 6. Verify
curl -sf http://localhost:3001/health && echo " OK"
```

---

### 2.1 — `SAM_API_KEY`

| Field | Value |
|-------|-------|
| **Provider** | SAM.gov (General Services Administration) |
| **Login URL** | https://sam.gov/profile |
| **Where to generate** | Login → Profile → API Keys → Generate New Key |
| **Env var** | `SAM_API_KEY` |
| **Container** | `gda-backend` |
| **Notes** | Known issue: Contract Opportunities entitlement may be missing. File FSD ticket at https://fsd.gov if search returns 0 results after rotation. |

**Smoke test:**

```bash
# After updating .env and restarting backend:
NEW_KEY=$(grep '^SAM_API_KEY=' /root/gda-command-v2/.env | cut -d= -f2)
curl -sf "https://api.sam.gov/opportunities/v2/search?api_key=${NEW_KEY}&limit=1&postedFrom=01/01/2026&postedTo=12/31/2026" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'totalRecords={d.get(\"totalRecords\",\"MISSING\")}')"
```

**VPS commands:**

```bash
cp /root/gda-command-v2/.env /root/gda-command-v2/.env.bak.$(date +%Y%m%d-%H%M)
sed -i "s|^SAM_API_KEY=.*|SAM_API_KEY=PASTE_NEW_KEY_HERE|" /root/gda-command-v2/.env
cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml up -d backend
docker network connect n8n_default gda-backend 2>/dev/null || true
sleep 10 && curl -sf http://localhost:3001/health && echo " OK"
```

---

### 2.2 — `ANTHROPIC_API_KEY`

| Field | Value |
|-------|-------|
| **Provider** | Anthropic |
| **Login URL** | https://console.anthropic.com/settings/keys |
| **Where to generate** | Console → Settings → API Keys → Create Key |
| **Env var** | `ANTHROPIC_API_KEY` |
| **Container** | `gda-backend` |
| **Notes** | Revoke old key after verifying new one works. |

**Smoke test:**

```bash
# After updating .env and restarting backend:
NEW_KEY=$(grep '^ANTHROPIC_API_KEY=' /root/gda-command-v2/.env | cut -d= -f2)
curl -sf https://api.anthropic.com/v1/messages \
  -H "x-api-key: ${NEW_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('type','ERROR'))"
# Expected: "message"
```

**VPS commands:**

```bash
cp /root/gda-command-v2/.env /root/gda-command-v2/.env.bak.$(date +%Y%m%d-%H%M)
sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=PASTE_NEW_KEY_HERE|" /root/gda-command-v2/.env
cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml up -d backend
docker network connect n8n_default gda-backend 2>/dev/null || true
sleep 10 && curl -sf http://localhost:3001/health && echo " OK"
```

---

### 2.3 — `OPENAI_API_KEY`

| Field | Value |
|-------|-------|
| **Provider** | OpenAI |
| **Login URL** | https://platform.openai.com/api-keys |
| **Where to generate** | Dashboard → API Keys → Create new secret key |
| **Env var** | `OPENAI_API_KEY` |
| **Container** | `gda-backend` |
| **Notes** | Used by embeddings (Knowledge auto-vectorize) and RFP shredder. Verify embedding works after rotation. |

**Smoke test:**

```bash
# After updating .env and restarting backend:
NEW_KEY=$(grep '^OPENAI_API_KEY=' /root/gda-command-v2/.env | cut -d= -f2)
curl -sf https://api.openai.com/v1/models \
  -H "Authorization: Bearer ${NEW_KEY}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'models={len(d.get(\"data\",[]))}')"
# Expected: models=N (some positive number)
```

**VPS commands:**

```bash
cp /root/gda-command-v2/.env /root/gda-command-v2/.env.bak.$(date +%Y%m%d-%H%M)
sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=PASTE_NEW_KEY_HERE|" /root/gda-command-v2/.env
cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml up -d backend
docker network connect n8n_default gda-backend 2>/dev/null || true
sleep 10 && curl -sf http://localhost:3001/health && echo " OK"
```

---

### 2.4 — `GOVWIN_CLIENT_SECRET`

| Field | Value |
|-------|-------|
| **Provider** | Deltek GovWin IQ |
| **Login URL** | Provider portal (contact account admin) |
| **Where to generate** | Coordinate with Deltek account admin for WSAPI OAuth2 client credentials |
| **Env vars** | `GOVWIN_CLIENT_SECRET` (may also need `GOVWIN_CLIENT_ID` if regenerated as a pair) |
| **Container** | `gda-backend` |
| **Notes** | OAuth2 client credentials flow. If only secret is rotated, `GOVWIN_CLIENT_ID` stays the same. Also verify `GOVWIN_USERNAME` and `GOVWIN_PASSWORD` if those are separate user-level credentials. |

**Smoke test:**

```bash
# After updating .env and restarting backend:
# Check that GovWin OAuth token acquisition works
curl -sf http://localhost:3001/api/admin/health | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('govwin:', d.get('sources',{}).get('govwin',{}).get('status','NOT_FOUND'))
"
# Expected: govwin: healthy (or degraded if no saved searches configured)
```

**VPS commands:**

```bash
cp /root/gda-command-v2/.env /root/gda-command-v2/.env.bak.$(date +%Y%m%d-%H%M)
sed -i "s|^GOVWIN_CLIENT_SECRET=.*|GOVWIN_CLIENT_SECRET=PASTE_NEW_SECRET_HERE|" /root/gda-command-v2/.env
cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml up -d backend
docker network connect n8n_default gda-backend 2>/dev/null || true
sleep 10 && curl -sf http://localhost:3001/health && echo " OK"
```

---

### 2.5 — `GOVTRIBE_API_KEY`

| Field | Value |
|-------|-------|
| **Provider** | GovTribe |
| **Login URL** | N/A — email request |
| **Where to generate** | Email support@govtribe.com to request a new API key |
| **Env var** | `GOVTRIBE_API_KEY` |
| **Container** | `gda-backend` |
| **Notes** | May require email request. Response time varies. Keep old key active until new one is confirmed working. |

**Smoke test:**

```bash
# After updating .env and restarting backend:
curl -sf http://localhost:3001/api/admin/health | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('govtribe:', d.get('sources',{}).get('govtribe',{}).get('status','NOT_FOUND'))
"
```

**VPS commands:**

```bash
cp /root/gda-command-v2/.env /root/gda-command-v2/.env.bak.$(date +%Y%m%d-%H%M)
sed -i "s|^GOVTRIBE_API_KEY=.*|GOVTRIBE_API_KEY=PASTE_NEW_KEY_HERE|" /root/gda-command-v2/.env
cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml up -d backend
docker network connect n8n_default gda-backend 2>/dev/null || true
sleep 10 && curl -sf http://localhost:3001/health && echo " OK"
```

---

### 2.6 — `N8N_API_KEY`

| Field | Value |
|-------|-------|
| **Provider** | n8n (self-hosted) |
| **Login URL** | https://n8n.csr-llc.tech/settings/api (or your n8n domain) |
| **Where to generate** | n8n UI → Settings → API → Create API Key |
| **Env vars** | `N8N_API_KEY` |
| **Container** | `gda-backend` |
| **Notes** | Self-hosted — you control the generation. Revoke old key in n8n UI after verifying new one works. Used by backend for n8n API calls (workflow listing, credential updates, etc.). |

**Smoke test:**

```bash
# After updating .env and restarting backend:
NEW_KEY=$(grep '^N8N_API_KEY=' /root/gda-command-v2/.env | cut -d= -f2)
N8N_BASE=$(grep '^N8N_BASE_URL=' /root/gda-command-v2/.env | cut -d= -f2)
curl -sf "${N8N_BASE}/api/v1/workflows?limit=1" \
  -H "X-N8N-API-KEY: ${NEW_KEY}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'workflows accessible: {len(d.get(\"data\",[]))>0}')"
# Expected: "workflows accessible: True"
```

**VPS commands:**

```bash
cp /root/gda-command-v2/.env /root/gda-command-v2/.env.bak.$(date +%Y%m%d-%H%M)
sed -i "s|^N8N_API_KEY=.*|N8N_API_KEY=PASTE_NEW_KEY_HERE|" /root/gda-command-v2/.env
cd /root/gda-command-v2 && docker compose -f docker-compose.prod.yml up -d backend
docker network connect n8n_default gda-backend 2>/dev/null || true
sleep 10 && curl -sf http://localhost:3001/health && echo " OK"
```

---

## Appendix: Secret Inventory

| Secret | Phase | Auto/Manual | Rotated? |
|--------|-------|-------------|----------|
| `POSTGRES_PASSWORD` | 1 | Auto (script) | ☐ |
| `MIGRATION_DATABASE_URL` | 1 | Auto (script) | ☐ |
| `GDA_WEBHOOK_KEY` | 1 | Auto (script) | ☐ |
| `JWT_SECRET` | 1 | Auto (script) | ☐ |
| n8n Postgres password | 1 | Auto (script) | ☐ |
| `SAM_API_KEY` | 2 | Manual | ☐ |
| `ANTHROPIC_API_KEY` | 2 | Manual | ☐ |
| `OPENAI_API_KEY` | 2 | Manual | ☐ |
| `GOVWIN_CLIENT_SECRET` | 2 | Manual | ☐ |
| `GOVTRIBE_API_KEY` | 2 | Manual | ☐ |
| `N8N_API_KEY` | 2 | Manual | ☐ |

## Critical — Do NOT Touch

- Canary workflow `LPUSYd4Vpph1Qg7n`
- Amendment-monitor `1o8h7yGhLKLoNP0S`
- n8n internal credential `yK1VVsSN3tn0baVm`
