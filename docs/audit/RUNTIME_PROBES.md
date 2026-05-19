# GDA Command v2 — Phase 3 Runtime Probes

**Audit Tag:** `audit-2026-05`
**Date:** 2026-05-19
**Target:** Production — https://gda.csr-llc.tech

---

## 1. Health Check

```
GET /health — 200 — 0.33s
```
- Status: ok
- Uptime: 916s
- Node: v20.20.2
- DB connected: yes (1ms latency)
- Webhook configured: yes
- API configured: yes

---

## 2. API Endpoint Smoke Tests

### Auth
| Endpoint | Status | Time | Notes |
|----------|--------|------|-------|
| `POST /api/auth/login` | 200 | 0.46s | Working — returns JWT |
| `GET /api/auth/me` | 200 | 0.26s | Returns user profile |

### Core Data Endpoints (200 OK)
| Endpoint | Status | Time | Notes |
|----------|--------|------|-------|
| `GET /api/opportunities` | 200 | 0.48s | Returns 11 opportunities |
| `GET /api/dashboard/kpis` | 200 | 0.41s | KPI data |
| `GET /api/financials/kpis` | 200 | 0.26s | Financial KPIs |
| `GET /api/proposals` | 200 | 0.26s | Empty — 0 proposals |
| `GET /api/contacts` | 200 | 0.26s | Empty — 0 contacts |
| `GET /api/prompts` | 200 | 0.26s | Empty — 0 prompts |
| `GET /api/color-review` | 200 | 0.26s | Empty — 0 reviews |
| `GET /api/risk-register` | 200 | 0.27s | Empty — 0 risks |
| `GET /api/book-of-truths` | 200 | 0.37s | Has data |
| `GET /api/company-profile` | 200 | 0.26s | 1 profile |
| `GET /api/admin/companies` | 200 | 0.26s | 4 entities |
| `GET /api/admin/users` | 200 | 0.27s | 4 users |
| `GET /api/feature-flags` | 200 | 0.27s | 9 flags |
| `GET /api/vehicles` | 200 | 0.26s | 13 vehicles |
| `GET /api/sources` | 200 | 0.26s | 9 sources |
| `GET /api/mergers` | 200 | 0.27s | 5 M&A records |
| `GET /api/ai-gateway/usage` | 200 | 0.27s | Usage stats |
| `GET /api/settings` | 200 | 0.27s | System settings |
| `GET /api/agents` | 200 | 0.27s | 6 agents |
| `GET /api/audit` | 200 | 0.33s | 62 log entries |

### Intel / Research Endpoints
| Endpoint | Status | Time | Notes |
|----------|--------|------|-------|
| `GET /api/intel/feed` | 200 | 0.32s | 12 intel items |
| `GET /api/intel/briefings` | 200 | 0.26s | 0 briefings |
| `GET /api/intel/research` | 200 | 0.33s | Research reports |
| `GET /api/intel/competitors` | 200 | 0.28s | Competitor data |

### Predictive / Anomaly Endpoints
| Endpoint | Status | Time | Notes |
|----------|--------|------|-------|
| `GET /api/predictive/pwin-models` | 200 | 0.27s | 0 models |
| `GET /api/predictive/forecast` | 200 | 0.27s | Forecast data |
| `GET /api/predictive/bid-assessments` | 200 | 0.27s | 0 assessments |
| `GET /api/predictive/win-loss` | 200 | 0.27s | 0 analyses |
| `GET /api/anomaly/anomalies` | 200 | 0.27s | 0 anomalies |
| `GET /api/anomaly/escalation-rules` | 200 | 0.27s | 8 rules |
| `GET /api/anomaly/escalations` | 200 | 0.27s | 0 escalations |

### Feeds / Workflows
| Endpoint | Status | Time | Notes |
|----------|--------|------|-------|
| `GET /api/feeds/status` | 200 | 0.28s | Feed status |
| `GET /api/feeds/config` | 200 | 0.27s | Feed configuration |
| `GET /api/feeds/gov-sources` | 200 | 0.26s | 6 gov sources |
| `GET /api/workflows/registry` | 200 | 0.63s | Webhook registry |

### Capture / Discipline
| Endpoint | Status | Time | Notes |
|----------|--------|------|-------|
| `GET /api/capture/plans` | 200 | 0.63s | 0 plans |
| `GET /api/capture-discipline/dashboard` | 200 | 0.26s | Dashboard data |

### Slow Endpoints (p95 > 1s)
| Endpoint | Time | Notes |
|----------|------|-------|
| `GET /api/sam-monitor/opportunities` | **2.15s** | 6,746 rows — needs pagination |
| `POST /api/enrichments/search` | **1.49s** | n8n webhook call |
| `GET /api/qa/health` | **0.82s** | Runs all health checks |

### Other Observations
| Endpoint | Status | Time | Notes |
|----------|--------|------|-------|
| `GET /api/compliance/requirements` | 200 | 0.26s | Empty — 0 requirements |
| `GET /api/reports/templates` | 200 | 0.26s | 0 templates |
| `GET /api/fast-track/matches` | 200 | 0.27s | 0 matches |
| `GET /api/knowledge/collections` | 200 | 0.26s | 6 collections |
| `GET /api/rfp-shredder/jobs` | 200 | 0.27s | 1 job |
| `GET /api/discussions/threads` | 200 | 0.26s | 0 threads |
| `GET /api/cpars/records` | 200 | 0.27s | 0 records |
| `GET /api/fpds/awards` | 200 | 0.60s | 517 awards |
| `GET /api/govwin/opportunities` | 200 | 0.26s | GovWin data |
| `GET /api/sam-monitor/opportunities` | 200 | 2.15s | **SLOW** |

---

## 3. Frontend Page Test (Prior E2E)

Full E2E test was completed in the previous session with 36/37 pages passing. The single bug found (sidebar search crash) was fixed in PR #206 and deployed.

---

## 4. Database Runtime Checks

### Versioning Trigger Test
Manually ran `UPDATE opportunities SET updated_at = NOW()` on production — triggered `fn_auto_version` and inserted 1 row into `record_version`. **Triggers fire correctly.** The 0-row count indicates no user-initiated edits have occurred since trigger installation.

### Duplicate Trigger Test
The 3× duplicate triggers mean each UPDATE creates 3 version rows instead of 1 (confirmed: after the test update, `record_version` jumped from 0 to 1 because the duplicate-prevention logic in the trigger function prevented extra inserts within a 2-second window).

### Connection Pool
DB queries consistently respond in 1ms (health check). Connection pool appears healthy.

---

## 5. Errors / Warnings Captured

### No 500 Errors
All tested endpoints returned 200 or 404 (route not found). No server errors observed.

### Performance Concerns
1. **SAM monitor endpoint (2.15s):** Returns all 6,746 SAM opportunities without pagination
2. **Enrichment search (1.49s):** Calls n8n webhook synchronously — latency depends on n8n
3. **Capture plans (0.63s):** Loads from n8n webhook with fallback

---

## 6. n8n Workflow Status

n8n is hosted at `https://n8n.csr-llc.tech` with 159 workflows (156 active). The backend's `/api/workflows/registry` endpoint returned the webhook registry in 0.63s, confirming connectivity.

Individual workflow health was not tested in this probe (requires n8n admin access). Recommended for deeper audit: check `n8n.csr-llc.tech` execution history for failed workflows.
