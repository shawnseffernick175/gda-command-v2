# GDA Command v2 — Master Document

**Last Updated:** May 13, 2026
**Production:** https://gda.csr-llc.tech
**Repository:** https://github.com/shawnseffernick175/gda-command-v2
**n8n:** https://n8n.csr-llc.tech

---

## 1. What GDA Command Is

GDA Command is an **operating system for running a defense contracting business**. It is NOT a dashboard. It is NOT a collection of tools. It is a single integrated platform that removes the operator from day-to-day operations while keeping them in control of every decision.

**The company:** Envision Innovative Solutions — defense IT, cyber, C5ISR, SETA support. Large business by revenue (~$382M), small by headcount (~41 employees). Full and open competition (no small business set-asides).

**The operator:** Shawn Seffernick — validates every opportunity, approves every pipeline entry, makes every go/no-go decision. The system does the work; Shawn makes the calls.

---

## 2. Core Rules (Non-Negotiable)

1. **Nothing is in Pipeline until Shawn approves it.** Enforced in data model, API, and UI. The `approved_at` column must be non-null for an opportunity to appear in Pipeline.
2. **All opportunities live in Ops Tracker.** That is the full universe. Pipeline is a filtered, approved subset.
3. **No secrets in the browser.** React only calls `/api/...` routes. Never call n8n directly from frontend.
4. **Standard JSON envelope on every endpoint:**
   ```json
   { "success": true, "action": "...", "dryRun": false, "data": {}, "meta": {}, "error": null }
   ```
5. **No charts until data logic is proven correct.**
6. **Human-in-the-loop for all risky actions** — sends, deploys, writes, paid AI calls.
7. **PostgreSQL is truth.** GitHub holds docs. n8n runs automation. React shows results.
8. **A feature isn't done until it survives deploy, passes tests, and fails visibly when something breaks.**
9. **The platform removes you from operations while keeping you in control of decisions.**
10. **If the same data appears in multiple places, it must be identical everywhere.** One source of truth.

---

## 3. Sprint Dev Cycle

Every sprint follows this exact process. No exceptions.

### Step 1: Identify Work
Shawn identifies what needs to happen — walkthrough feedback, new features, bugs found on production, new business requirements.

### Step 2: Compile Punch List
Devin compiles feedback into a prioritized list:
- **Critical** — blocking core workflow
- **High** — feature completeness
- **Medium** — data & integration
- **Low** — polish & admin

Each item has an effort estimate and clear acceptance criteria.

### Step 3: Shawn Approves
Shawn reviews the list, picks what goes into the sprint. **Devin does not start building until Shawn says go.**

### Step 4: Build
For each approved item:
1. Create feature branch off `main`
2. Write code (backend routes + frontend pages + DB migrations if needed)
3. Run lint/typecheck locally — must pass before pushing
4. Push and create PR on GitHub
5. CI runs automatically (Build & Typecheck + Tests)
6. Devin Review checks PR for bugs
7. Fix any CI failures or review findings
8. Test end-to-end (Playwright + API tests, recorded walkthroughs when UI changes)

### Step 5: PR Merges to Main
Only after CI passes and tests pass.

### Step 6: Deploy to Production VPS
1. SSH into VPS (187.77.206.105)
2. `cd /root/gda-command-v2 && git pull origin main`
3. `docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d`
4. Run any new DB migrations
5. Verify all containers healthy + API responding

### Step 7: Shawn Verifies on Production
Live walkthrough together on the actual production site. Shawn calls out anything wrong.

### Step 8: Repeat
Next sprint items. No moving forward until current sprint is verified.

**The rule:** Nothing ships without passing CI, passing tests, and Shawn's approval.

---

## 4. Architecture

```
User (Browser)
  │
  ▼
React Frontend (nginx, port 80)
  │  Only calls /api/... routes
  ▼
Express Backend (Node.js, port 3001)
  │  ├── Routes (47 route files)
  │  ├── Agents (5 AI agents)
  │  ├── LLM Client (GPT-4o fast + Claude Sonnet deep)
  │  └── Middleware (JWT auth, RBAC, audit logging)
  │
  ├──▶ PostgreSQL 16 + pgvector (source of truth)
  │     └── 15 migrations, 30+ tables
  │
  ├──▶ n8n (workflow automation)
  │     └── SAM.gov pulls, FPDS scanning, GovWin/GovTribe feeds
  │
  └──▶ OpenAI API / Anthropic API
        └── Opportunity scoring, strategy generation, briefings, color reviews
```

### Infrastructure
- **VPS:** Hostinger, IP 187.77.206.105, SSH as root
- **Docker:** Multi-container (frontend + backend + postgres), docker-compose.prod.yml
- **SSL:** Traefik reverse proxy with Let's Encrypt
- **Domain:** gda.csr-llc.tech (app), n8n.csr-llc.tech (automation)
- **Database:** PostgreSQL 16 with pgvector extension for semantic search

### AI Models
| Model | Role | Used For |
|-------|------|----------|
| GPT-4o | Fast / Structured | Opportunity scoring, morning briefings, competitor filtering, QA diagnosis, quick enrichments |
| Claude Sonnet | Deep / Analysis | RFP shredding, proposal drafting, capture strategy, go/no-go assessments, document summarization |

### Auth
- JWT tokens
- 5-tier RBAC: Administrator, BD Manager, Capture Lead, Analyst, Viewer
- Shawn's login: shawn.seffernick@envision-is.com (admin)

---

## 5. The Opportunity Lifecycle (Shipley-Based)

```
Sources (SAM.gov, GovWin, GovTribe, FPDS, Manual)
  │
  ▼
OPS TRACKER (all opportunities — the full universe)
  │  Status: Interest (default for all new opps)
  │  User can: Qualify, Pass, or leave as Interest
  │
  ├──▶ [Shawn qualifies] → Status: Qualified
  │     │
  │     ▼
  │   APPROVALS QUEUE → Shawn reviews and approves
  │     │
  │     ▼
  │   PIPELINE (only approved opportunities appear here)
  │     │
  │     ▼
  │   Shipley stages: Interest → Qualify → Pursue → Solicitation → Post Submittal
  │     │
  │     ├──▶ Won
  │     ├──▶ Lost
  │     └──▶ No Bid
  │
  └──▶ [Past due or ≤30 days to deadline, unqualified] → Auto No Bid
```

**Key rule:** Past-due or near-expiry unqualified opportunities are automatically routed to No Bid. They never clutter the pipeline.

---

## 6. Pages Built (36 total)

### Operations
| Page | Route | Purpose |
|------|-------|---------|
| Launchpad | `/` | Executive dashboard — KPIs, top opps, funnel, accelerators, signals |
| Fast Track | `/fast-track` | Early-stage signals from data feeds before they become opportunities |
| Ops Tracker | `/ops-tracker` | The full universe of opportunities — all sources, all statuses |
| Pipeline | `/pipeline` | Approved opportunities only — Shipley stages, filtered view |

### Capture
| Page | Route | Purpose |
|------|-------|---------|
| Capture Planner | `/capture` | Capture plans, BD activities, Shipley stages, KPI drill-down |
| Approvals | `/approvals` | Agent Command Center — approve/reject AI recommendations + agent runs |
| RFP Shredder | `/rfp-shredder` | Upload RFP → AI extracts requirements (PDF, DOCX, XLSX, PPTX) |
| Compliance Matrix | `/compliance` | Track compliance against solicitation requirements |
| Proposal Review | `/proposals` | Proposal volumes, findings, compliance scores, timelines |
| Color Review | `/color-review` | Shipley color reviews (Blue→Pink→Red→Green→Gold→White + Black Hat + White Glove) |
| Opportunity Detail | `/opportunity/:id` | Per-opportunity deep dive — analysis, OODA, Capture Coach strategy |

### Intelligence
| Page | Route | Purpose |
|------|-------|---------|
| Intel Hub | `/intel` | Morning Briefing, Intel Feed, Deep Research, Competitor Watch |
| SAM.gov Monitor | `/sam-monitor` | SAM.gov opportunity scanner with AI relevance scoring |
| FPDS Monitor | `/fpds-monitor` | Federal contract award monitoring |
| GovWin IQ | `/govwin` | GovWin market intelligence integration |
| Contacts | `/contacts` | CRM — government customers, teaming partners, auto-discovered POCs |
| Anomaly Detection | `/anomalies` | Early warning system — pipeline anomalies, competitor movements |
| Predictive Analytics | `/predictive` | ML Pwin, revenue forecast, bid/no-bid, win/loss patterns |
| Knowledge Base | `/knowledge` | Document store with pgvector semantic search — the AI's brain |

### Reporting
| Page | Route | Purpose |
|------|-------|---------|
| Financial Bible | `/financials` | Drill-down behind every KPI — ON HOLD waiting for Shawn's data |
| Reports & Export | `/reports` | Report templates, scheduling, bulk exports, AI Report Builder (planned) |
| Charts & Analytics | `/charts` | Pipeline by phase, Pwin distribution, by agency, value analysis |
| CPARS Builder | `/cpars` | AI-assisted past performance narratives |
| Risk Register | `/risk-register` | If-this-then-that risk tracking, heat map, scenario evaluator |
| Discussions | `/discussions` | Team collaboration — threaded conversations tied to opps/proposals |

### Admin
| Page | Route | Purpose |
|------|-------|---------|
| Settings | `/settings` | Connectors, API keys, feature flags, data feeds |
| QA Center | `/qa` | System health, failure diagnosis, fix proposals |
| Workflows | `/workflows` | n8n workflow registry and execution history |
| Users | `/users` | User management, roles, permissions |
| Audit Log | `/audit` | Activity history — who did what, when |
| Doctrine | `/doctrine` | Versioned architecture decisions, sprint notes, business rules |
| Prompt Architect | `/prompts` | Versioned, tagged prompt library for repeatable AI operations |
| Book of Truths | `/book-of-truths` | Auto-generated data dictionary — entities, business rules, glossary |
| User Manual | `/help` | Searchable docs for all pages |

---

## 7. AI Agents (6 Built)

| Agent | Trigger | What It Does |
|-------|---------|--------------|
| Morning Commander | Daily / manual | Generates executive briefing — pipeline risks, deadlines, competitor movements, system health |
| Opportunity Watch | Daily / manual | Scores SAM.gov opportunities against Envision's profile — pursue/evaluate/pass |
| Competitive Intel | Daily / manual | Scans USAspending/FPDS for competitor contract awards, assesses significance |
| Capture Coach | Per-opportunity / manual | Generates win probability, capture strategy, gap analysis, risk assessment, next actions |
| Controlled Fix | Manual | Scans failed agent runs, diagnoses root cause, proposes fixes for approval |
| Agent Command Center | Always on | Universal approval queue — all agent recommendations go here for Shawn's approval |

---

## 8. Database

**PostgreSQL 16 + pgvector** — 15 migrations, 30+ tables.

Key tables:
- `opportunities` — the core entity, all opportunities from all sources
- `approvals` — approval gate records (approved_at determines Pipeline membership)
- `capture_plans` — Shipley-stage capture plans per opportunity
- `intel_items` — intelligence feed items from all sources
- `competitor_profiles` / `competitor_movements` — competitive intelligence
- `color_reviews` — Shipley color team review results
- `agent_runs` — execution tracking for all AI agents
- `agent_approvals` — universal approval queue for agent recommendations
- `fix_proposals` — AI-generated fix proposals from Controlled Fix agent
- `document_embeddings` — pgvector semantic search index (HNSW)
- `audit_log` — every write operation tracked
- `users` — 5-tier RBAC

---

## 9. What's Working on Production (as of last verified deploy)

**Working:**
- Launchpad with live n8n data (287+ opps, $2.3B pipeline)
- Ops Tracker with n8n-sourced opportunities
- Pipeline with approval gate
- KPI strip on all pages
- Clickable Launchpad KPIs and Accelerators
- Risk Register, Book of Truths, GovWin IQ
- Opportunity detail (falls back to n8n for non-local IDs)
- NAICS size classification (Small/Large filter)
- Source attribution badges
- Color Review (Shipley sequence)
- User Manual, Charts
- Docker containers healthy (frontend, backend, postgres)

**Not working / issues found in last walkthrough (Greeting session):**
- Financial KPIs showing "unavailable" (waiting on Shawn's data)
- Fast Track 502 (was fixed in PR #102/103 — needs re-verification)
- Some opportunity detail pages show no analysis (Capture Coach needs to run)
- Top Opportunities by Score showing score = 0, value = $0
- Opportunity Funnel only 2 stages, Avg Pwin 0%

---

## 10. Walkthrough Feedback — Full List

All feedback collected during the page-by-page walkthrough across all sessions.

### Already Done (Deployed)
| # | Item | PR |
|---|------|----|
| 1 | KPI strip: "Backlog" → "Contract Backlog", reordered | #79 |
| 2 | Info badges (black circle, yellow ?) on KPIs — 7 pages | #79 |
| 3 | Sidebar restructured into 5 groups (Operations, Capture, Intelligence, Reporting, Admin) | #79 |
| 4 | SAM.gov Monitor & FPDS Monitor removed from sidebar (data feeds into Ops Tracker) | #79 |
| 5 | Source badges on Ops Tracker opportunities | #79 |
| 6 | Workflows graceful fallback when n8n unavailable | #79 |
| 7 | Launchpad KPI cards clickable → navigate to source pages | #102 |
| 8 | Launchpad accelerators clickable → Ops Tracker search | #102 |
| 9 | Active Risks / Decisions / Due Soon → no more 404 | #102 |
| 10 | Opportunity detail empty analysis → shows informational message | #102 |
| 11 | Pipeline approval gate — only approved opps shown | #103 |
| 12 | Universal opportunity component — same look everywhere | #103 |
| 13 | Sidebar reorder — match capture workflow | #103 |
| 14 | Pipeline KPI cards | #103 |
| 15 | Proposals KPI — all 8 color teams | #103 |
| 16 | Competitor Watch — rich intel, movements, teaming alerts | #104 |
| 17 | Company profile loaded — Envision Innovative Solutions | #105 |
| 18 | Morning Briefing content — AI-generated executive digest | #106 |
| 19 | Intel Feed populated from intel_items table | #106 |
| 20 | All mock data removed — live DB only | #96 |
| 21 | NAICS size classification — Small/Large filter on Ops Tracker | #96 |
| 22 | Envision-relevant opportunities (defense IT/cyber) | #95 |
| 23 | All opportunities set to Interest status by default | #95 |
| 24 | Opportunity detail 404 fixed (n8n fallback) | #101 |
| 25 | Launchpad funnel chart spacing improved | #100 |
| 26 | Predictive Analytics crash fixed (empty DB handling) | #99 |
| 27 | FPDS Monitor $NaN / null% fixed | #99 |
| 28 | User Manual at /help | #85 |
| 29 | Charts & Analytics at /charts | #85 |
| 30 | Shipley Timeline in Capture Planner | #85 |
| 31 | Book of Truths data dictionary | #87 |
| 32 | GovWin IQ integration | #88 |
| 33 | Source attribution badges on all 10 data pages | #90 |
| 34 | Risk Register with heat map, scenario evaluator | #92 |
| 35 | Capture Plan KPIs clickable (drill-down filter) | #92 |
| 36 | RFP Shredder handles PDF, DOCX, XLSX, PPTX | #93 |
| 37 | Fast Track 502 nginx fix | #102/103 |
| 38 | 6 AI agents built and tested (Phases 0-6) | #108-120 |

### Still TODO
| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | **Auto-run Capture Coach** on new/updated opportunities | HIGH | No manual "Generate Strategy" click — should be automatic |
| 2 | **Consolidate RFP Shredder + Compliance + Color Review → "Proposal Center"** under Capture | HIGH | Single page with tabs: Shred, Compliance, Color Review |
| 3 | **Company Intelligence Database** | HIGH | Team/Threat/Neutral classification. Search any company — if not in DB, AI analyzes on the spot and saves |
| 4 | **Shipley stage dropdown** in Ops Tracker and Capture | HIGH | Interest → Qualify → Pursue → Solicitation → Post Submittal → Won/Lost/No Bid |
| 5 | **"Ask AI about this opportunity"** chat on every opp detail | HIGH | Chat box at bottom of every opportunity detail page |
| 6 | **Color Review exportable report** | HIGH | PDF/Word output for proposal team — findings, fixes, action items, scoring breakdown |
| 7 | **Auto No-Bid rule** | MEDIUM | Unqualified opps due ≤30 days → automatic No Bid bucket |
| 8 | **Federal Acquisition Reference Library** in Knowledge Base | MEDIUM | FAR, DFARS, NDAA, Executive Orders, DAU guidance — AI-populated, user-editable |
| 9 | **AI Report Builder** in Reports | MEDIUM | Upload raw data + describe what you need → military-style briefing (BLUF, no pictures, navy blue accent, Pentagon-ready, consistent slide-to-slide) |
| 10 | **Auto-discover contacts** from data sources | MEDIUM | When SAM.gov/FPDS/GovWin shows a new POC, auto-add to Contacts with source attribution |
| 11 | **Knowledge Base → CPARS auto-extract** | MEDIUM | Upload past eval PDFs → AI extracts ratings/narratives into CPARS Builder records |
| 12 | **Scalable storage** | LOW | S3 for document files, managed Postgres for production scale |
| 13 | **Consolidate Settings/QA/Workflows/Audit/Users → Admin page** | LOW | 5 sidebar items → 1 page with tabs |
| 14 | **Report style guide** | LOW | Military briefing format: minimal color, no pictures, charts OK, same margins/fonts/positions slide-to-slide, BLUF, SITREP/EXSUM style |
| 15 | **Per-opp Pwin on opportunity detail** | LOW | ML Pwin + confidence + trend visible on the opp itself (Predictive stays as portfolio page) |

### ON HOLD (Waiting on Shawn)
| # | Item | Blocker |
|---|------|---------|
| 1 | **Financial Bible / KPIs** | Waiting for Shawn's financial data (end of week) |
| 2 | **Contract waterfall** — ceiling by year for current contracts | Part of Financial Bible |
| 3 | **Real opportunity data** — replace seed data with actual SAM.gov pulls | Need to wire live feeds and validate against Envision's real pipeline |
| 4 | **AI Agent Architecture discussion** — model selection, RAG quality, guardrails, fine-tuning | Shawn wants to discuss after current sprint |
| 5 | **Import data from v1 tool** | Need access to previous tool |

---

## 11. Environment Variables (Production .env)

```
POSTGRES_USER=gda
POSTGRES_PASSWORD=<set>
POSTGRES_DB=gda_command
JWT_SECRET=<set>
GDA_WEBHOOK_KEY=<set>
OPENAI_API_KEY=<set>
ANTHROPIC_API_KEY=<set>
N8N_BASE_URL=https://n8n.csr-llc.tech
N8N_API_BASE=https://n8n.csr-llc.tech/api/v1
APP_URL=https://gda.csr-llc.tech
```

---

## 12. Pull Request History

### Session 1 (Main Build — PRs #75-120)
| PR | Description | Status |
|----|-------------|--------|
| #75-77 | Color Review document upload + AI reviews | Merged |
| #79 | Phase 1+2: KPI rename, info badges, sidebar restructure | Merged |
| #80 | Bug fixes: data_source column, auth headers | Merged |
| #81 | Fast Track promote tags fix | Merged |
| #83 | Phase 3: Color Review Shipley overhaul | Merged |
| #84 | Bug fixes: wrong proposal grouping, tooltip text, grid overflow | Merged |
| #85 | User Manual, Charts, Shipley Timeline, Approvals grouping | Merged |
| #86 | Mock fallback fix for opportunities route | Merged |
| #87 | Book of Truths data dictionary | Merged |
| #88-89 | GovWin IQ integration + sort/pipeline value fix | Merged |
| #90 | Source attribution badges on all pages | Merged |
| #92 | Risk Register + Capture KPIs clickable | Merged |
| #93-94 | RFP Shredder full document parsing (PDF/DOCX/XLSX/PPTX) | Merged |
| #95 | Envision-relevant opps, Interest status, detail 404 fix | Merged |
| #96 | Remove all mock data, NAICS size classification | Merged |
| #99 | Predictive Analytics crash fix + FPDS $NaN fix | Merged |
| #100 | Launchpad funnel chart spacing | Merged |
| #101 | Opportunity detail n8n fallback | Merged |
| #102 | Launchpad clickability fixes (KPIs, accelerators, 404s) | Merged |
| #103 | Sidebar reorder, universal opp component, pipeline approval gate | Merged |
| #104 | Competitor Watch enhancement | Merged |
| #105 | Data integration: company profile, risk register, fast track DB | Merged |
| #106 | Intel Hub content pipeline: Morning Briefing + Intel Feed | Merged |
| #107 | Replace environmental data with defense IT/cyber | Merged |
| #108 | Phase 0: Agent infrastructure — dual-model LLM, agent runner | Merged |
| #109 | Phase 2: Morning Commander Agent | Merged |
| #110 | Phase 1: Agent Command Center | Merged |
| #111-113 | Phase 3: Opportunity Watch Agent + fixes | Merged |
| #115 | Phase 4: Competitive Intel Agent + dedup fix | Merged |
| #117 | Phase 5: Capture Coach Agent | Merged |
| #119-120 | Phase 6: Controlled Fix Agent + pending filter fix | Merged |

---

## 13. Known Issues & Technical Debt

1. **Some frontend routes may still call n8n directly** — Deep Research, Financial Bible. Should go through Express API gateway.
2. **n8n webhook auth** — QA Center shows HTTP 403 on some webhooks. GDA_WEBHOOK_KEY needs to match on both sides.
3. **Seed data vs. live data** — Production has n8n-sourced live opportunities (287+) but also older seed data. Need to reconcile.
4. **SSH key not persisted across Devin sessions** — VPS password is saved as a secret, but SSH key needs regeneration each session.
5. **4 stale SKILL PRs** (#29, #82, #91, #97) — housekeeping, close or rebase.

---

## 14. Key Design Decisions

1. **Persistent financial KPI strip** on every page — Orders, Sales, EBIT, Gross Profit, ROS, Funded Backlog, Contract Backlog
2. **Info badge pattern** — black circle with bold yellow "?" — universal across all pages for KPI definitions/calculations (What it is, Why it matters, How it's calculated)
3. **Color Review organized by opportunity, not by color** — click an opportunity, see all its review phases
4. **Blue Team review** added as first step — strategy/capture fit assessment before any writing begins
5. **Predictive Analytics stays separate** — portfolio-level view, but per-opp Pwin also shows on opportunity detail
6. **Contacts auto-populate** — POCs discovered from SAM.gov, FPDS, GovWin automatically added with source attribution
7. **Knowledge Base feeds CPARS** — upload past eval PDFs → AI auto-extracts into CPARS Builder
8. **Military-style reports** — minimal color, no pictures, charts OK, Pentagon-ready format, BLUF at top, consistent slide-to-slide alignment
9. **AI Report Builder** — upload raw data + describe what you need → polished presentation
10. **Federal Acquisition Reference Library** — AI-populated (FAR, DFARS, NDAA, EOs), user-editable

---

*This document is the single source of truth for what GDA Command is, how it works, and what needs to happen next. Update it every sprint.*
