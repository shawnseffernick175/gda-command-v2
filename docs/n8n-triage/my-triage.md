# n8n Workflow Triage (Final)

**Total:** 160 workflows  
**Status:** all currently DEACTIVATED (snapshot in /root/archive/v2/)

## Summary

| Action | Count | Meaning |
|---|---:|---|
| **KILL_V2_API** | 82 | V2 REST API webhook surface — replaced by V3 backend routes |
| **KILL_V2_DEAD** | 2 | Utility/other workflow pointing at dead V2 |
| **REWIRE_TO_V3** | 47 | Function still needed — repoint to V3 DB / V3 backend URL |
| **KEEP_V3** | 0 | Already on V3 |
| **KEEP_INDEPENDENT** | 24 | No V2 or V3 dependencies — safe to leave alone |
| **INSPECT** | 5 | Mixed signals — manual review |

---


## KILL_V2_API (82)

_V2 REST API webhook surface — replaced by V3 backend routes_

- **GDA.api.action-history** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.action-items 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.agentic-chat** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.ai-agent-upload** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.ai-feedback** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.aop-definitions** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.aop-tracker** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.approvals-queue** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.bd-activity-log** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.black-hat** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.capture-hub** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.capture-intel** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.capture-intel-modules** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.capture-plan** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.chat-simple** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.clause-library** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.comp-intel 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.competitor-field** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.competitor-threat-score** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.competitor-watchlist** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.compliance-matrix** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.contacts** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.contracts** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.daily-actions** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.daily-brief** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.daily-brief-reader** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.dashboard-intel 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.dashboard-mega** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.data-learn** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.deep-research-history** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.discussions** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.doc-compare** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.doc-ingest** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.e2e-reports** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.email-drafter** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.embed-and-store** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.error-log** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.export-engine** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.export-excel** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.external-control** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.fast-track-needs** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.govtribe-cache** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.govwin-feed** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.health-scan** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.idiq-tracker** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.incumbent-analysis** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.intel-feed** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.knowledge-base** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.launchpad** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.launchpad-funnel** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.meeting-notes 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.morning-briefing** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.naics 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.ndaa-far-ingest** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.ooda-loop 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.opp-search** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.opp-tracker 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.opportunity-detail** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.ops-dashboard-data** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.pipeline** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.platform-health** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.pptx-gen** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.predictive-intel** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.proactive-scan** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.prompt-architect** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.proposals** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.pwin-calculator** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.rag-query** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.red-team** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.relationship-tracker** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.report-builder** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.risk-intel** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.save-opp** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.saved-opps** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.semantic-search** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.sitrep 2** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.teaming-finder** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.teaming-scorer** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.trends** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.vehicle-tracker** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.wargame** — V2 REST API webhook handler — V3 backend replaces this surface
- **GDA.api.win-loss-db** — V2 REST API webhook handler — V3 backend replaces this surface

## KILL_V2_DEAD (2)

_Utility/other workflow pointing at dead V2_

- **GDA.maint.knowledge-reembed-sweep** — Maint util pointing at dead V2
- **GDA.ops.pinecone-backfill** — Ops util pointing at dead V2

## REWIRE_TO_V3 (47)

_Function still needed — repoint to V3 DB / V3 backend URL_

- **GDA.agent.opp-classifier** — Agent flow with V2 deps — repoint to V3
- **GDA.auto.e2e-gemini-report** — Auto flow with V2 deps — repoint to V3
- **GDA.auto.feedback-collector** — Auto flow with V2 deps — repoint to V3
- **GDA.cron.amendment-monitor** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.auto-capture-plan** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.auto-index-docs** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.auto-opp-analysis** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.auto-risk-generation** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.broad-opp-search** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.capture-gate-review** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.capture-milestone-alerts** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.capture-opp-sync** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.change-detector** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.comp-intel-daily-growth** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.competitor-crawler** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.daily-trends-collect** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.data-retention** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.data-sync** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.deadline-escalation** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.fast-track-ingest** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.fpds-enrichment** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.idiq-task-order-alert** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.learning-engine** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.master-scanner** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.morning-intel-briefing** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.nightly-fy-revenue-calc** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.nightly-perplexity-research** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.on-ramp-scanner** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.pipeline-coverage-check** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.pipeline-health-digest** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.pwin-daily-loop** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.recompete-early-warning** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.stage-auto-promote** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.system-watchdog** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.weekly-comp-scan** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.cron.win-rate-weekly-digest** — Scheduled job (cron) reading V2 DB — repoint to V3 staging DB
- **GDA.doctrine.pr-merge-draft** — Doctrine flow with V2 deps — repoint to V3
- **GDA.enrichment.capture-plan-cards** — Enrichment flow with V2 deps — repoint to V3
- **GDA.intel.an1-incumbent-win-themes** — Intel flow with V2 deps — repoint to V3
- **GDA.intel.morning-briefing-v1** — Intel flow with V2 deps — repoint to V3
- **GDA.research.deep-research** — Research flow with V2 deps — repoint to V3
- **GDA.sched.dept-market-refresh** — Scheduled job (sched) reading V2 DB — repoint to V3 staging DB
- **GDA.sched.dept-opp-sweep** — Scheduled job (sched) reading V2 DB — repoint to V3 staging DB
- **GDA.sched.dhs-industry-day-monitor** — Scheduled job (sched) reading V2 DB — repoint to V3 staging DB
- **GDA.sched.dpc-forecast-scraper** — Scheduled job (sched) reading V2 DB — repoint to V3 staging DB
- **GDA.sched.idiq-to-monitor** — Scheduled job (sched) reading V2 DB — repoint to V3 staging DB
- **GDA.sched.opp-refresh** — Scheduled job (sched) reading V2 DB — repoint to V3 staging DB

## KEEP_INDEPENDENT (24)

_No V2 or V3 dependencies — safe to leave alone_

- **GDA GitHub Bridge — Production** — No deps detected
- **GDA.auto.e2e-test** — Auto flow, no V2 deps
- **GDA.auto.gist-update** — Auto flow, no V2 deps
- **GDA.auto.learning-capture** — Auto flow, no V2 deps
- **GDA.auto.pattern-extractor** — Auto flow, no V2 deps
- **GDA.controlled-fix-agent** — controlled-fix-agent flow
- **GDA.cron.competitor-auto-enrichment** — Scheduled cron with no DB/V2 dependency
- **GDA.cron.health-scan-daily** — Scheduled cron with no DB/V2 dependency
- **GDA.cron.ndaa-ingest** — Scheduled cron with no DB/V2 dependency
- **GDA.cron.nightly-pattern-and-enrichment** — Scheduled cron with no DB/V2 dependency
- **GDA.deploy.frontend** — Deploy utility
- **GDA.dev.deploy** — Dev utility
- **GDA.mcp.proxy** — Mcp utility
- **GDA.notify.telegram** — Notify utility
- **GDA.ops.gist-session-update** — Ops utility
- **GDA.qa.agent-runner** — Qa utility
- **GDA.qa.computer-operator** — Qa utility
- **GDA.qa.fix-runner** — Qa utility
- **GDA.qa.latest-failures** — Qa utility
- **GDA.sched.golden-dome-monitor** — Scheduled sched with no DB/V2 dependency
- **GDA.util.gist-update** — Util utility
- **GDA.util.gist-update** — Util utility
- **GDA.util.smoke-test** — Util utility
- **GDA.util.ssh-read-file** — Util utility

## INSPECT (5)

_Mixed signals — manual review_

- **GDA.bot.telegram-chat** — bot flow with deps — manual review
- **GDA.error.handler** — error flow with deps — manual review
- **GDA.event.bidirectional-sync** — event flow with deps — manual review
- **GDA.form.quick-entry** — form flow with deps — manual review
- **GDA.sub.dashboard-intel-deep** — sub flow with deps — manual review
