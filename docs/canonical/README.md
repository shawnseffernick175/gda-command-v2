# Canonical Docs — Source of Truth

This folder holds the **ground-truth strategic documents** for GDA Command v2. Every door in the tool must enforce something in here. If something on screen disagrees with these docs, the docs win.

**Authority:** Effective 1/19/2026 (Doctrine) · Owned by CEO Alexander Johnson (AJ).
**Tool ownership:** Envision-operated, team-aware. The tool is Shawn's workspace for OU-I (Envision). Riverstone (OU-II) and PD Systems (OU-III) are tracked as teaming partners via the Partner Intel door, not as co-equal tenants.

## Documents

### Authority docs (doctrine, identity, ownership)

| File | What it is |
|---|---|
| `gda_company_profile_v1.md` | Identity, doctrine, 3 OUs, FY26-FY28 financials, risks, what the doctrine demands of the tool |
| `doctrine_to_doors_map.md` | The 13-door rebuild map — each door is anchored to a doctrine principle it enforces |
| `tool_ownership_model_v1.md` | Why the tool is Envision-primary and partners are intel (the decision log) |
| `partner_intel_spec_v1.md` | Door 12 spec — Partner Intel teaming radar |
| `aesthetics_canonical_v1.md` | Visual + UX standards (6-color palette: Pink/Red/Black/Blue/White/Green — NO gold) |
| `launchpad_summary_spec.md` | Launchpad summary contract |
| `product_rules.md` | Cross-cutting product rules |

### Roadmap + architecture (V3 build plan)

| File | What it is | Added |
|---|---|---|
| `north_star_roadmap_v3.md` | V3 North Star — supersedes April 27 stabilization roadmap. Current architecture across 7 layers, F-400 5-phase plan, status as of 2026-06-01 | 2026-06-01 |
| `unified_opportunity_architecture_v1.md` | F-400 epic design doc — unified `opportunities` table, lifecycle stages, matching engine, field merge precedence, source adapter pattern, Fast Track catalog | 2026-06-01 |
| `v3_completion_plan_v4_1.md` | Tactical V3 completion plan (rev 4.1) — milestone-by-milestone | 2026-06-01 |
| `fast_track_sources_v1.md` | Fast Track source catalog — 8 free public APIs for signal/forecast ingestion (SBIR, SAM Sources Sought, NIH RePORTER, NSF, USAspending, DARPA/ONR BAA, DoD RSS, arXiv) | 2026-06-01 |

### Superseded (kept for reference outside `canonical/`)

- `gda-north-star-roadmap.md` (April 27, 2026) — V2 stabilization plan, superseded by `north_star_roadmap_v3.md`. Lives in the Space file repository, not in `canonical/`.

## How to use

- **Building a feature?** Find the door in `doctrine_to_doors_map.md`, confirm what it must enforce, then build.
- **Adding data to a page?** If it's company identity / certs / vehicles / customers / financials → pull from `gda_company_profile_v1.md`.
- **Writing a Devin prompt?** Reference these files by relative path in the prompt so Devin reads them directly. The roadmap + architecture docs (`north_star_roadmap_v3.md`, `unified_opportunity_architecture_v1.md`) provide build context; the authority docs (`gda_company_profile_v1.md`, `doctrine_to_doors_map.md`) provide doctrinal context.
- **Disagreement?** Open a PR against these files. Doctrine doesn't drift in silence.

## Authority statements (verbatim from doctrine)

> "This is not aspirational. It is the standard by which we will operate and be judged."

> "Strategy tells us what to do. Doctrine tells us how we behave while doing it — especially when it's hard."

> "If a decision fails any filter, it stops."

> "The standard you walk past is the standard you accept."

> "Value is created or destroyed at the handoff points."
