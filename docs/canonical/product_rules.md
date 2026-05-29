# Product Rules — GDA Command

Updated 2026-05-29 per Shawn directive.

## R1 — Every data point has a searchable source

Every value rendered to the user must include a `SourceRef` with a clickable URL back to the original record. Bare numbers, AI-only claims, and unsourced strings are forbidden in the UI and the API.

Acceptable source kinds: `sam_gov`, `fpds`, `usaspending`, `govwin`, `news`, `doctrine`, `partner_site`, `internal`.

If a field has no source, the API omits it from the response. The UI never renders an unsourced value.

## R2 — Analysis is automatic on opportunity open

Opening any opportunity detail page automatically triggers full analysis (pwin, incumbent, competitors, blackhat, wargame, timeline). There is no "Run Analysis" or "Click to Analyze" button anywhere in the application. Results are cached on `(opp_id, opp.updated_at)`; re-runs are silent and background.
