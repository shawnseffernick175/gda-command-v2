# FasTrac — Canonical Definition

**Last updated:** 2026-06-26
**Authority:** Shawn Seffernick, President, Envision Innovative Solutions

---

## What FasTrac Is

FasTrac is Envision's emerging-technology matchmaking function. It identifies problems the government has not yet formally solicited — things the DoD needs help with at the capability or technology layer — and matches those needs to niche companies that can solve them. Envision's role is to broker that relationship and put the solution provider on contract.

FasTrac is NOT:
- A procurement tool for equipment or commodity purchases
- A SAM.gov feed or duplicate of the Ops Tracker ingest
- A tool for opportunities Envision will bid and perform directly

FasTrac IS:
- Early-signal sensing for unmet government technology needs
- A matchmaking engine: government problem → niche solution provider → Envision puts them on contract
- Pre-SAM by design — if it is already on SAM.gov as a formal solicitation, it is too late for FasTrac's purpose

---

## The Business Model

1. FasTrac surfaces an emerging tech need from a DoD org, Army installation, or innovation program
2. Envision identifies a niche company (small, specialized) that can solve it
3. Envision brokers the relationship and vehicles the solution provider onto a contract (via RS3, CBM+, GSA, or similar)
4. Envision earns as the prime / contracting vehicle, the niche company performs

This is the same model as FORCE: Envision holds the contract, the specialist delivers.

---

## Signal Sources (what FasTrac monitors)

Sources that publish emerging tech needs before formal SAM posting:
- DoD innovation organizations: AFWERX, SOFWERX, DIU, AFC, DARPA, and 55+ others
- Army installation innovation programs (Tier 1 bases)
- Academia / university research programs tied to DoD
- SBIR/STTR topic lists (pre-solicitation stage)
- CSOs, BAAs, prize challenges, RFIs from innovation orgs

---

## What Gets Surfaced in the UI

- Emerging tech needs scoped to Envision's lanes (defense IT, cyber, C5ISR, SETA)
- NAICS-aware signal scoring: forecast (Pwin >= 70%) or signal (>= 45%)
- Source link for every signal (R1 rule — every value has a clickable source)
- No raw firehose — only signals that score above threshold for Envision's wheelhouse

---

## What FasTrac Is NOT Trying to Do

- Find solicitations for Envision to bid directly (that is Ops Tracker / Pipeline)
- Track equipment procurement or commodity buys
- Surface anything already posted on SAM.gov as a formal solicitation
- Replace the CEO's pipeline judgment — FasTrac signals feed AJ's review, they do not auto-promote to Pipeline

---

## Relationship to Other Modules

| Module | Purpose |
|---|---|
| Ops Tracker | SAM.gov + GovTribe + GovWin ingest — formal solicitations Envision may bid directly |
| Pipeline | CEO-approved pursuits only — what Envision is actively capturing |
| FasTrac | Pre-SAM emerging tech needs — matchmaking plays, not direct bids |
| Contract Waterfall | Signed task orders — revenue already under contract |

---

*This file is the canonical definition of FasTrac. If code, UI labels, or other docs disagree with this file, this file wins.*
