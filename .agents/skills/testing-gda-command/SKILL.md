---
name: testing-gda-command
description: Test GDA Command v2 end-to-end. Use when verifying UI pages, API endpoints, or new milestone features.
---

# Testing GDA Command v2

## Environment Setup

### Local Development
- Frontend: `http://localhost:3000` (SvelteKit)
- Backend: `http://localhost:3001` (Express/Node)
- Database: PostgreSQL at `localhost:5432/gda_command`
- Start backend with: `DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command AUTH_REQUIRED=false JWT_SECRET=dev-secret-key OPENAI_API_KEY=$OPENAI_API_KEY GDA_WEBHOOK_KEY=test-webhook-key npm run dev` (from `packages/backend`)
- Start frontend with: `npm run dev` (from `packages/frontend`)
- Auth is disabled in dev (`AUTH_REQUIRED=false`) but the login page still appears — use `admin@gda-command.local` / `admin123`

### Production
- URL: `https://gda.csr-llc.tech`
- Deploy via: `docker-compose -f docker-compose.prod.yml up -d --build` on the production server
- SSH may be needed to run migrations on the production database

### Staging Environment (F-036)
- **Container**: `gda-postgres-staging` on VPS (187.77.206.105)
- **Port**: `127.0.0.1:5433` (localhost-only, no Traefik exposure)
- **User/Pass**: `gda_staging` / `staging_only_not_prod`
- **Databases**: `n8n_staging` (clone of n8n prod), `gda_command_staging` (clone of gda_command)
- **PostgreSQL**: 16.14 with pgvector 0.8.2 (matches prod exactly)
- **Resource limits**: 256MB RAM, 0.5 CPU
- **Refresh**: Nightly at 3 AM EST via `/root/refresh-staging.sh` (cron with `CRON_TZ=America/New_York`)
- **Backup**: `/root/backup-before-migration.sh <db_name>` — creates timestamped dump in `/root/backups/`
- **Docker networks**: `gda-command-v2_gda` + `n8n_default` (NOT on `n8n-envision_envision-internal`)
- **SSH access**: `sshpass -p '$HOSTINGER_VPS_PASSWORD' ssh root@$HOSTINGER_VPS_IP`
- **Connect via psql**: `PGPASSWORD=staging_only_not_prod psql -h 127.0.0.1 -p 5433 -U gda_staging -d gda_command_staging`
- **Connect via docker exec**: `docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging`

### Database Notes
- The `description` column may not exist locally — run `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS description TEXT;` if backend returns empty results
- The `capture_stage` column stores explicit Shipley stage overrides — check it exists if stage dropdown tests fail
- Run pending migrations from `packages/backend/src/db/migrations/` if features are missing
- PostgreSQL returns NUMERIC columns as strings — always use `Number()` for comparisons in backend code
- Test data: 5 seeded opportunities (opp-test-001 through opp-test-005) plus ~42 n8n webhook-injected opportunities

### Port Management
- If port 3001 is already in use: `ss -tlnp | grep 3001` to find the PID, then `kill <PID>`
- `lsof` may not be available — use `ss` instead

## Devin Secrets Needed
- `HOSTINGER_VPS_PASSWORD` — VPS root password (also available as env var `HOSTINGER_VPS_PASSWORD`)
- `HOSTINGER_VPS_IP` — VPS IP address (also available as env var `HOSTINGER_VPS_IP`)
- `OPENAI_API_KEY` — for AI analysis features (OODA, Capture Coach, AI Gateway summarizer)

## VPS Access
- IP and password are available as environment variables: `HOSTINGER_VPS_IP`, `HOSTINGER_VPS_PASSWORD`
- Use `sshpass` for non-interactive SSH: `sshpass -p "$HOSTINGER_VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$HOSTINGER_VPS_IP" "<command>"`
- For multi-line scripts, write to a local file first and `scp` it, then execute remotely — heredocs with complex quoting often break over SSH
- VPS timezone is UTC; cron uses `CRON_TZ=America/New_York` for EST scheduling

## Key Testing Flows

### Staging Infrastructure (F-036)
**Test procedure (all shell-based, no recording needed):**
1. Verify container: `docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep staging` — should show "Up" with `127.0.0.1:5433->5432/tcp`
2. Verify PG version: `docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging -t -c "SELECT version();"` — should contain `16.`
3. Verify pgvector: `SELECT extversion FROM pg_extension WHERE extname='vector';` — should be `0.8.2`
4. Verify resource limits: `docker inspect gda-postgres-staging --format '{{.HostConfig.Memory}}'` → 268435456 (256MB)
5. Count tables: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public';` — gda_command_staging ≥84, n8n_staging ≥154
6. Key parity checks: `gda_opportunity_tracker` ~1780, `gda_embeddings` ~821, `sam_opportunities` ~13472, `schema_migrations` = number of migration files
7. Refresh script: `/root/refresh-staging.sh` — should exit 0, log parity verification. Run twice to test idempotency.
8. Backup script: `/root/backup-before-migration.sh gda_command_staging` — should create `.dump` file >0 bytes in `/root/backups/`
9. Cron: `crontab -l | grep -B1 refresh-staging` — should show `CRON_TZ=America/New_York` and `0 3 * * *`
10. Network: `ss -tlnp | grep 5433` — should show docker-proxy listening on 127.0.0.1

**Known issue**: `n8n-envision-postgres-1` is on `n8n-envision_envision-internal` network, staging is on `n8n_default`. Cross-container DNS resolution from n8n postgres to staging may fail. This is expected — CI uses SSH tunnel, not cross-container DNS.

### W6: Capture Discipline Dashboard
**Test procedure:**
1. Navigate to `/capture-discipline` via sidebar (Intelligence > Capture Discipline)
2. Verify KPI cards: Active Opportunities, With Gate Reviews, Overdue, At Risk
3. Verify Stage Funnel bar chart (Interest, Pursue, Won stages)
4. Verify Gate Review Summary matrix (5 gates × 5 statuses)
5. Verify Guardrail Alerts section

### W6: Guardrail Check API
**Test procedure:**
1. `POST /api/capture-discipline/check-guardrails/opp-test-003` — should return overdue alert (critical) since due_date is 2025-04-01
2. Verify `checked: 4` (all 4 guardrail rules evaluated)
3. Verify score=45 does NOT trigger missing_score (Number() fix)
4. Reload `/capture-discipline` — At Risk metric should update
5. Guardrail 4 (stage_without_gate) uses allowlist: only `["passed", "waived"]` gate statuses suppress the alert

### W8: AI Gateway
**Test procedure:**
1. Navigate to `/ai-gateway` via sidebar
2. Verify status cards: Status=Online, Fast Model=gpt-4o
3. Type text into summarizer textarea, click Summarize
4. Verify 3-sentence summary appears, Recent Activity table updates
5. `GET /api/ai-gateway/status` — verify `available: true`, `fast_model: "gpt-4o"`

**Notes:**
- Summarizer requires OPENAI_API_KEY to be set
- LLM may fall back to Anthropic ("deep" tier); actual tier returned in `result.tier`
- Usage logging stores tier from `result.tier`, not the requested tier

### W5: Opportunity Detail Tabs
**Test procedure:**
1. Navigate to any opportunity detail (e.g., `/opportunities/opp-test-001`)
2. Click through all 5 tabs: Overview, Analysis, Intelligence, Strategy, History
3. **History tab is critical** — it queries `record_version` table for timeline data
4. Verify Activity Timeline shows events and Version History shows version entries

### Sidebar Navigation — All Sprint v3 Pages
**Test procedure:**
1. Click each new nav item in sidebar:
   - Vehicles → `/vehicles` (W1)
   - Data Sources → `/sources` (W2)
   - M&A Context → `/mergers` (W4)
   - Capture Discipline → `/capture-discipline` (W6)
   - AI Gateway → `/ai-gateway` (W8)
2. Verify each page loads without error (no NotFound page)

### OpsTracker Stage Dropdown (capture_stage)
**Why adversarial:** Multiple Shipley stages map to the same DB status. "Solicitation" and "Post Submittal" both map to `"pipeline"`. Without the `capture_stage` fix, `statusToShipley("pipeline")` returns `"pursue"`, silently reverting the user's choice.

**Test procedure:**
1. Navigate to `/ops-tracker`
2. Find an opportunity (e.g., opp-004)
3. Change dropdown to "Solicitation" — wait for page data refresh
4. Press F5 for full page reload
5. Verify dropdown still shows "Solicitation" (not "Pursue")
6. Repeat with "Post Submittal" — same verification
7. Click the opportunity row to open `/opportunities/{id}`
8. Verify the detail page dropdown matches the OpsTracker dropdown

**What to check in HTML:** The `<select>` element's `selectedindex` attribute and the `selected="true"` option value.

## General Testing Tips
- Infrastructure/VPS testing is shell-only — no screen recording needed
- UI testing requires recording — maximize browser window before starting
- For SSH commands with complex quoting (heredocs, nested quotes), write script to local file first, SCP to VPS, then execute
- VPS password is in env var `HOSTINGER_VPS_PASSWORD` — do not hardcode in scripts
- When testing staging DB operations, always verify row counts against known baselines (check PR descriptions or audit docs for expected values)
- CI staging job requires `VPS_SSH_KEY` and `VPS_HOST` GitHub Actions secrets — without them it gracefully skips with environmental warning
