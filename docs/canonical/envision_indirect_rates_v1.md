# Envision Indirect Rates — Forward-Pricing Recommendation (v1)

**Last verified:** 2026-06-25
**Owner:** Shawn Seffernick, President, Envision Innovative Solutions
**Basis:** Trial balance, FY26 YTD (January–May), reconciled to Envision's own cost-pool allocation accounts
**Status:** Book-derived actuals — NOT DCAA-approved. Suitable for forward pricing on proposals; not a substitute for a negotiated rate agreement.

---

## 0. Why this doc exists

The CFO asked for a rate number to use on proposals. Envision has **no provisional or forward-pricing rate agreement** (no DCAA-approved rates). This doc records the recommended indirect rates derived directly from the books, so there is a single source of truth for:

- Proposal pricing (what wrap/bill rate to quote)
- The doctrine rule that flags pursuits with expected gross margin < 8% (which references wrap rates) — see STATUS.md doctrine and `v3_019_doctrine_rules.sql`.

---

## 1. Recommended indirect rates

| Pool | Rate | Applied to (base) |
|---|---|---|
| **Fringe** | **36.0%** | Total labor (direct + indirect) |
| **Overhead — Onsite (client-site)** | **49.6%** | Onsite direct labor |
| **Overhead — Offsite (company)** | **54.7%** | Offsite direct labor |
| **G&A** | **4.7%** | Total cost input (value-added base) |
| **Material Handling** | **1.4%** | Materials + subcontractor cost |

Onsite vs. offsite overhead are split because Envision's chart of accounts maintains separate client-site and company pools. Use the rate matching the work location of the proposed effort.

---

## 2. Wrap rate & recommended bill rates

Fully burdened cost per $1.00 of direct labor (before fee), then loaded with target profit:

| Scenario | Wrap (cost) | Bill @ 8% fee | Bill @ 10% fee |
|---|---|---|---|
| Onsite (client-site) | 1.94x | 2.10x | 2.14x |
| Offsite (company) | 2.00x | 2.16x | 2.20x |

**Wrap buildup — onsite example:**

| Step | Amount |
|---|---|
| Direct labor | $1.0000 |
| + Fringe @ 36.0% | $0.3598 |
| + Overhead @ 49.6% (onsite) | $0.4961 |
| + G&A @ 4.7% on (labor+fringe+OH) | $0.0865 |
| = Fully burdened cost (wrap) | $1.9424 |

Example: an onsite labor category costing $50/hr bare yields a fully burdened cost of ~$97/hr and a bill rate of ~$105/hr at 8% fee.

---

## 3. How these were derived (5-month YTD pools)

| Pool / base | Amount (Jan–May FY26) | Source account |
|---|---|---|
| Fringe pool | $3,202,657 | FRG-CRT |
| Overhead pool — Client (onsite) | $3,186,140 | OHC-CRT |
| Overhead pool — Company (offsite) | $507,188 | OHD-CRT |
| G&A pool | $3,279,393 | ADM-CRT |
| Material Handling pool | $486,297 | MAT-CRT |
| Direct labor — onsite | $6,419,919 | 500-501 |
| Direct labor — offsite | $927,369 | 500-001 |
| Total labor (fringe base) | $8,900,723 | All labor accounts |
| Total cost input (G&A base) | $70,518,508 | Value-added base |

Pools are taken from Envision's own allocation credit accounts (the amounts the company actually spread), not re-built from scratch. The Fringe pool ties exactly to FRG-CRT, which validates the fringe rate.

---

## 4. Caveats & notes

- **Not audited / not DCAA-approved.** Book-derived actuals, appropriate for forward pricing but not a substitute for a negotiated rate agreement.
- **Fringe is high-confidence.** The 36.0% fringe pool ties exactly to Envision's own Fringe allocation account.
- **G&A appears low (4.7%).** The G&A base (total cost input) includes ~$33.5M of subcontractor/material pass-through, which dilutes the rate. For labor-only bids, request a separate value-added G&A view — the effective burden on labor is higher.
- **YTD basis.** Rates reflect Jan–May FY26 actuals. Refresh at fiscal year-end and once a full 12-month cycle is available for greater stability.

---

## 5. Fiscal year reference

FY26 = Oct 2025 – Sep 2026. Q1 Oct–Dec, Q2 Jan–Mar, Q3 Apr–Jun, Q4 Jul–Sep. (June = FY Q3, CY Q2.) The Financial Bible KPI header reports CY-to-date by default with a CY/FY selector.
