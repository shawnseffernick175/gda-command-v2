# F-310: Action Item Tracker — AI Drafts Feeding Launchpad

## Status
**Queued** — depends on F-300, F-301. Note: F-226 (PR #468) shipped the action items surface scaffold; this F-310 layers the AI draft + Launchpad-feeding behavior on top.

## Why this exists
Action items currently exist but require Shawn to write the response from scratch every time. The tool has the context (RAG corpus, similar past actions, decision memory) — it should pre-draft every response and let Shawn approve/edit, not write-from-zero.

## Objective

Every action item carries an **agent-drafted suggested next step**: email reply, decision memo, color-review request, capability check, doctrine adjudication, etc. The draft is grounded in RAG (F-301) and previous decisions (F-302). Drafts feed into the Launchpad "What Needs Me Today" panel (F-308).

## Hard rules

1. **Every action item gets a draft.** If F-300 can't produce a draft (insufficient context), the action item explicitly says "no draft — needs human" with the reason.
2. **R1 cited in drafts.** Every claim in a draft links to its source — a doc, a prior decision, a CEO doctrine doc, a SAM/USAspending record.
3. **No auto-send.** Drafts are never sent automatically. Shawn approves or edits, then commits.
4. **Decision Memory hook.** Edits + approvals feed F-302 — the agent learns Shawn's voice + decision patterns.

## Acceptance criteria

### Backend
- [ ] Migration: extend `action_items` with `draft_text`, `draft_evidence_ids`, `draft_generated_at`, `draft_status (pending|ready|approved|sent|rejected)`
- [ ] Worker: on action item creation → F-300 generates draft → updates row
- [ ] `POST /v3/action-items/:id/approve-draft` — marks approved (does not send)
- [ ] `POST /v3/action-items/:id/reject-draft` — captures rejection reason → F-302 training
- [ ] `POST /v3/action-items/:id/edit-draft` — diff stored → F-302 voice training

### Frontend
- [ ] Action item detail surface shows draft in a side panel with R1 evidence citations inline
- [ ] Approve / Reject / Edit buttons
- [ ] Edit mode is a rich text editor; diff against draft auto-captured on save
- [ ] Drafts visible in Launchpad "What Needs Me Today" via expandable row

## Tests
- [ ] Draft generation test: fixture action items get drafts within 30s of creation
- [ ] Citation test: every claim in a draft must resolve to at least one evidence_id
- [ ] No-context test: action items with insufficient context produce explicit "no draft" state, not made-up drafts

## Risks
- Draft hallucination: F-300 must refuse to draft when RAG returns < N similar contexts. Threshold tunable.
- Voice mismatch: until F-302 has ≥50 approved/edited drafts, voice will sound generic. Acceptable trade-off — improves with use.

## Definition of done
- New action item created → draft generated within 30s with R1 citations → visible in `/action-items/:id` + Launchpad → Shawn approves or edits → edits captured for F-302 training → no auto-sends ever.
