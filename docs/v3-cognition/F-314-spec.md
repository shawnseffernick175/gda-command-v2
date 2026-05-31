# F-314: V2 Decommission + Final Cutover (HOLD FOR EXPLICIT GO)

## Status
**HARD HOLD — requires explicit "go" from Shawn before any `devin-ready` label is applied.**

Per standing rules: V2 decommission is a "no go without Shawn's go" action. This issue stays open as a tracker but **no Devin session may be triggered until Shawn types the explicit go signal**.

## Why this exists (Completion Plan item #19, final cutover)
V2 must die. The roadmap has been "V3 in parallel, V2 still serving production" for too long. Cost: every fix needs to land twice. Confusion: users see two surfaces. V2 carries debt that V3 explicitly rejected.

## Pre-cutover gate (must all be true)

- [ ] All Track A (Cognition Layer) merged: F-300, F-301, F-302, F-303
- [ ] Track B (Awards #533, Regulatory #534) merged + verified
- [ ] F-304 Universal Ingestion merged
- [ ] F-305 Opportunity Auto-Analysis merged + R2 verified
- [ ] F-306 Capability Matching merged
- [ ] F-307 Risks First Class merged
- [ ] F-308 Launchpad rebuilt merged
- [ ] F-309 Sentinel rebuilt merged
- [ ] F-310 Action Item drafts merged
- [ ] F-311 Financial Bible merged
- [ ] F-312 Partner Profiles merged
- [ ] F-313 Output Generators merged
- [ ] F-Color-Team-Reviews (#539) merged
- [ ] F-Govwin (#541) merged + connector verified live
- [ ] F-Govtribe (#542) merged + connector verified live
- [ ] F-212 parity report (DONE — PR #415 + #420 + #422)
- [ ] 7-day burn-in on V3 in production with no critical issues
- [ ] Shawn signs off explicitly

## Cutover plan

1. **DNS swap.** `gda.csr-llc.tech` (today → V2 frontend) → V3 frontend. `gda-v3.csr-llc.tech` is decommissioned (folded into primary domain).
2. **Backend swap.** V3 backend container becomes the canonical backend. V2 backend stopped + image removed.
3. **DB consolidation.** V3 schema is canonical. V2 schema preserved as `_v2_archive` schema for 90 days then dropped.
4. **Repo cleanup.** Delete V2 packages (`packages/frontend`, `apps/backend`). Delete V2-only docs. Retain `archive/v2/` branch for cold reference.
5. **Workflows.** Repoint any external automation (n8n flows, webhooks) from V2 endpoints to V3.
6. **Communications.** Shawn announces cutover to any stakeholders touching the tool.

## Rollback plan (must be documented before cutover starts)

- Keep V2 image tagged + retrievable for 30 days
- DNS rollback via Hostinger panel: 5-minute swap back if V3 fails hard
- DB rollback: V2 archive schema preserved, can be promoted back to canonical via documented migration

## Acceptance criteria

### Code
- [ ] Delete `packages/frontend/`, `apps/backend/`
- [ ] Remove V2 references from docker-compose.prod.yml
- [ ] Update nginx + Traefik routes
- [ ] Update README + docs to reflect V3-only state

### Operations
- [ ] V2 container stopped + removed
- [ ] V2 DNS records removed
- [ ] V2 nightly crons disabled
- [ ] V2 archive schema in place with 90-day retention timer

### Verification
- [ ] All V3 surfaces accessible at primary domain
- [ ] All R1 (citations) + R2 (auto-analysis) checks pass on production
- [ ] No V2 endpoints reachable

## Risks
- **Data loss.** Migration parity (F-212) already proven, but final cutover needs one more parity run within 24h of switch.
- **External integrations.** Any unknown consumer of V2 endpoints will break. Mitigate with logging on V2 endpoints for 7 days pre-cutover to identify consumers.
- **Rollback complexity.** DB schema rollback is the hardest leg. Test in staging first.

## Definition of done
- Primary domain serves V3 only
- V2 code deleted from repo (archive branch retained)
- V2 DB schema renamed to archive, retention timer set
- Shawn confirms zero V2 references in workflow
- 7-day post-cutover monitoring passes

**Reminder: NO `devin-ready` label without Shawn's explicit go signal.**
