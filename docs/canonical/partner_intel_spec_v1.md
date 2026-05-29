# Partner Intel — Door 12 Spec v1

**Purpose:** The teaming radar. Envision uses this door to decide WHEN to team with Riverstone or PD Systems and to avoid stepping on the same opportunity.

**Doctrine anchor:** Principle 3 — Teamwork (cross-OU collaboration, no silo behavior).

**Ownership:** Read-only intel maintained by Envision (Shawn). Riverstone and PD Systems do not input data. Envision ingests their public posture.

---

## What the door shows

### Two partner cards (Riverstone, PD Systems), each containing:

**Identity block**
- Anchor company name, CEO, HQ, founded
- UEI / CAGE / DUNS / NAICS

**Capability block**
- Focus areas (TechSIGINT/cyber vs. XR/sim/training)
- Differentiating products (Oxbow, SecurScale / digital twin platforms)
- Top customers

**Certification block** (the teaming-lever data)
- HUBZone, WOSB, SDB, V3 Veteran, CMMC level, ISO, CMMI
- Cert expiration tracked — partner certs Envision can claim on a teaming proposal

**Vehicle block**
- Prime IDIQs and GSA schedules they hold
- Task order capacity / ceiling remaining where known
- MDA SHIELD prime status (Riverstone)

**Recent activity feed**
- Awards (SAM.gov / USAspending pull)
- Public news mentions
- Pipeline they've publicly signaled

**Teaming history with Envision**
- Past joint pursuits (win/loss)
- Active joint pursuits
- Past performance value of joint work

---

## What the door does (the active part — not just a profile)

### 1. Opportunity de-confliction

When a new opportunity lands in door 1, the tool checks against partner public pipeline / award history. If Riverstone or PD Systems is pursuing or recently won similar scope, Envision sees:

> ⚠️ Riverstone won similar scope under HQ085926DF469 (MDA SHIELD) on 12/2/2025. Team or de-conflict?

### 2. Cert / vehicle unlock flags

When an opportunity requires a set-aside Envision lacks, the tool flags the partner who unlocks it:

> 🤝 This opp is HUBZone set-aside. Riverstone (HUBZone certified) unlocks the bid.

> 🤝 This opp wants V3 Veteran preference. PD Systems (V3 Veteran) strengthens the bid.

### 3. Capacity / scope unlock flags

When an opportunity scope exceeds Envision's bench, the tool flags the partner who fills the gap:

> 🤝 Scope includes immersive training / LVC integration. PD Systems (300+ heads, XR/AR/VR depth) is the natural sub.

> 🤝 Scope requires IC clearance / TechSIGINT. Riverstone (IC customer base, classified DevSecOps) is the natural sub.

### 4. Teaming worksheet generator

From a flagged opp, Envision can click "Generate teaming worksheet" — the tool pulls partner certs, vehicles, PP highlights, and drafts a teaming-rationale paragraph for the proposal.

### 5. Cross-OU action items

Push to door 10 — e.g., "Ask Angela for SHIELD task order capacity numbers — due [date]."

---

## What the door does NOT do

- ❌ Show partner financials (we don't have them; they're not consolidated here)
- ❌ Show partner internal pipeline (we only see public signal)
- ❌ Let partners log in / edit
- ❌ Roll partner numbers into Envision's Financial Bible
- ❌ Claim partner certs on Envision-only (non-teaming) proposals

---

## Data sources (auto-ingested)

| Source | What we pull | Cadence |
|---|---|---|
| SAM.gov | Cert status, registration, NAICS | Weekly |
| USAspending.gov | Awards, contract values | Weekly |
| GovTribe / GovWin (if subscribed) | Public pipeline | Daily |
| OrangeSlices feed | News mentions of partner names | Daily (already in inbox) |
| Manual ingestion email | Anything Shawn forwards | Real-time |

---

## Future-proofing

When AJ approves enterprise rollout, this door is the seed of the federated workspace:

- Riverstone logs in → their data flips from "intel" (read-only, public-signal) to "operated" (Angela's team inputs pipeline).
- PD Systems same.
- The 13 doors carry OU tags already → permissions split by OU + role with no schema change.

Until then: Envision-only operation, Partner Intel as the radar.
