# F-309: Sentinel Handoff Monitor — Plain Language + GovTribe Credit Ledger Pacing

## Status
**Queued** — depends on F-300, F-Govtribe (#542). Do NOT add `devin-ready` until those merge.

## Why this exists
The current Sentinel surface is technical (DB up, API up, cron last ran). Shawn doesn't read that. He needs **plain-language handoff status** — "I tried to do X but I'm waiting on Y. You need to do Z." And he needs **GovTribe credit pacing** visible — credits are finite, expensive, and easy to burn.

## Objective

Sentinel becomes the **operations door** that says, in plain English:
1. What I'm waiting on (auth, credits, human approval, external API throttle)
2. What I just did successfully (last 24h, summarized, not log-dump)
3. What's about to break (credits running low, certs expiring, secrets near rotation)
4. What I need a human to unblock

## Hard rules

1. **No log dumps.** Every Sentinel card is a sentence written by the F-300 agent, not raw log lines. Raw logs available behind "show details" disclosure but never default visible.
2. **Plain language only.** "GovTribe API failed" → "GovTribe is throttling us. We've used 87% of this month's credits. At current pace we run out in 4 days. Slow down ingest or top up credits."
3. **Action-first.** Each card ends with the action Shawn would take. "Top up credits via [link]." "Approve workflow PR #X." "Rotate SECRET_NAME by [date]."
4. **GovTribe credit ledger (#542 spec).** Sentinel shows: credits used MTD, daily burn rate, projected exhaustion date, top consuming queries, alert when burn rate > monthly_budget / days_remaining.

## Acceptance criteria

### Backend
- [ ] `GET /v3/sentinel/handoffs` — list of open handoffs (waiting on, due-by, action-needed)
- [ ] `GET /v3/sentinel/credit-pacing/govtribe` — credits used / remaining / burn rate / exhaustion date / top queries
- [ ] `GET /v3/sentinel/credit-pacing/govwin` — same shape (GovWin is flat-rate but still track API call volume)
- [ ] `GET /v3/sentinel/recent-wins` — what completed successfully last 24h
- [ ] `GET /v3/sentinel/upcoming-breaks` — credentials expiring, secrets stale, certs near renewal
- [ ] F-300 tool: `sentinel.summarize_event(event_json) → plain_english_sentence`

### Frontend
- [ ] `/sentinel` page rebuilt with 4 sections: Waiting on you · Recent wins · About to break · Credit pacing
- [ ] Each card: title (plain), one-line context, action button or link
- [ ] Credit pacing card shows: bar chart (used/total), burn rate trend (7-day sparkline), top 3 query types

### Hooks
- [ ] Every plumbing failure (cron miss, API 429, auth 401, secret expiry warning) creates a `sentinel_event` that gets summarized
- [ ] Existing technical health checks remain in DB but are NOT default-rendered — moved behind "show technical details"

## Tests
- [ ] Plain-language test: every sentinel card output must pass a "no jargon" gate (no "ECONNRESET", "401", "stale_lag_seconds", "schema_drift" in user-facing text)
- [ ] Credit pacing test: with mocked usage data, burn-rate projection matches manual calculation within 5%

## Risks
- Over-summarization losing signal: keep raw logs accessible. Disclosure pattern must be one-click.
- Plain-language hallucination: F-300 must cite the underlying event_id in every summary so user can verify.

## Definition of done
- Shawn opens Sentinel → sees ≤5 "waiting on you" cards in plain English → sees GovTribe burn rate + projected exhaustion → sees zero raw stack traces or HTTP codes in default view → can disclose technical detail per card when needed.
