# Devin Prompts — F-XXX Series

Standardized prompts for Devin sessions. Each prompt follows the structure: Why · What to build · Constraints · Deliverable · Out of scope.

## Convention

- File name: `F-{number}_{ShortName}_DevinPrompt.md`
- Branch name (Devin opens this): `feature/F-{number}-{short-name}`
- Repo: `shawnseffernick175/gda-command-v2`
- PR: one PR per F-prompt
- CI: must be 5/5 green before review

## Active series

| F-# | Title | Status |
|---|---|---|
| F-039 | Health Sentinel (single always-on system status) | Shipped |
| F-040 | Secret Rotation | Shipped |
| F-100 | Sprint 1 — OU Tag + Sentinel skeleton + Launchpad + Company Profile | Shipped (PR #363 merged) |
| F-100.5 | Sprint 1 Visual Reskin (Hydra Teal / Inter / 8px grid) | **Ready to fire** — must merge before F-101 |
| F-101 | Sprint 2 — Opportunities + Pipeline + Partner Intel | Drafted, blocked on F-100.5 |
| F-102 | Sprint 3 — Capture + Action Items | Drafted, blocked on F-101 |

## How to fire a prompt

1. Open the F-XXX prompt file in this folder
2. Paste the body into a new Devin session
3. Devin opens the branch named in the prompt header
4. Devin opens a PR when CI is green
5. Shawn reviews and merges

## Reference docs Devin should always read first

- `docs/canonical/gda_company_profile_v1.md`
- `docs/canonical/doctrine_to_doors_map.md`
- `docs/canonical/tool_ownership_model_v1.md`
- `docs/canonical/partner_intel_spec_v1.md`
- `docs/canonical/aesthetics_canonical_v1.md` — non-negotiable design tokens (color, type, spacing, severity badges)

Each F-prompt lists which canonical docs it depends on at the bottom.
