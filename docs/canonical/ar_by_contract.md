# Accounts Receivable by Contract — Mapping & FY26 YTD

**Last verified:** 2026-06-26
**Source:** `ar_actuals` table (live), FY26 Jan–May
**Owner:** Shawn Seffernick, President, Envision

---

## 1. The decode: invoice number → contract

Army AR invoices use the PIEE submission format **`BVN####-F####`**:
- **`BVN####`** = Envision's own sequential internal invoice number assigned in PIEE.
- **`-F####`** (or `FA###`) suffix = the **task order** the invoice belongs to.

All Army task orders below are draws under **one IDIQ: RS3 — W15P7T-19-D-0206**.

| Suffix | Full Task Order | Contract / Program | Status |
|---|---|---|---|
| **F0016** | W15P7T19D0206 / W56KGU23F0016 | **STEP** | Active (largest) |
| **F0028** | W15P7T-19-D-0206 / W56KGY22F0028 | **PEO IEWS SETA** | Active |
| **F0209** | W15P7T-19-D-0206 / W15P7T21F0209 | **C5ISR** | Ending 6/30/2026 → moving to FORCE |
| **F0038** | W15P7T19D0206 / W56JSR23F0038 | **CECOM** (Gary's TO) | Option not exercised; winding down |
| **FA010** | W15P7T19D0206 / W56KGU26FA010 | **FORCE** | New; revenue starts 7/1/2026 |

Non-RS3 / other receivables (bucket by **customer_name**, NOT invoice prefix — the `INV-` prefix is shared across many customers):
- **GSA FAS AAS Region 03** = **PM Mission Command** (direct, our second-largest receivable).
- **Sev1Tech** = sub.
- **Booz Allen Hamilton** = sub (PDNET).
- **Nakupuna Solutions** = sub.
- **CACI** = sub.
- **Techximius** = sub.
- **Bricklayers & Allied CADC**, **My Energy Game**, **Rowan-Cabarrus CC** = small non-govcon / other.
- Negative `Army-other/adjustment` rows = credits/reversals on Army invoices.

> Example (operator): "F002834 is BVN0034 under the IEWS contract" — i.e. the BVN# is the PIEE invoice ID, the F#### is the task order.

---

## 2. AR by contract — FY26 YTD (Jan–May)

Bucketed by customer + task order (corrected: PM Mission Command split out of the shared `INV-` prefix).

| Contract | Jan | Feb | Mar | Apr | May | Total |
|---|--:|--:|--:|--:|--:|--:|
| STEP (F0016) | 1,826,812 | 2,389,160 | 3,006,538 | 4,324,758 | 1,844,153 | **13,391,421** |
| PEO IEWS SETA (F0028) | 617,754 | 603,827 | 721,885 | 703,809 | 624,421 | **3,271,696** |
| C5ISR (F0209) | 102,558 | 102,604 | 111,576 | 109,014 | 50,167 | **475,919** |
| CECOM (F0038) | 22,992 | 39,295 | 36,318 | 34,420 | 1,082 | **134,107** |
| PM Mission Command (GSA) | 502,700 | 478,030 | 517,298 | 561,552 | 481,383 | **2,540,963** |
| Sev1Tech (sub) | 109,831 | 110,765 | 120,196 | 129,877 | 100,360 | **571,029** |
| Booz Allen (sub) | 61,446 | 57,699 | 58,234 | 57,699 | 56,540 | **291,618** |
| Nakupuna (sub) | 26,587 | 53,934 | 59,632 | 28,297 | 21,650 | **190,100** |
| CACI (sub) | 34,094 | 45,844 | 17,475 | 19,330 | 5,724 | **122,467** |
| Techximius (sub) | — | — | — | 11,437 | 23,476 | **34,913** |
| Army-other/adjustment | -51,250 | -51,250 | -51,250 | -51,250 | — | **-205,000** |
| Bricklayers & Allied CADC | 16,668 | 16,668 | 16,668 | 16,668 | — | **66,672** |
| My Energy Game | 10,690 | 10,691 | — | — | — | **21,381** |
| Rowan-Cabarrus CC | 625 | 625 | — | — | — | **1,250** |
| **TOTAL** | 3,281,507 | 3,857,892 | 4,614,570 | 5,945,611 | 3,208,956 | **20,908,536** |

**RS3 IDIQ prime (4 task orders) Jan–May total: $17,273,143.**

### Observations
- **STEP (F0016)** is the engine — $13.4M, ~64% of all AR.
- **PM Mission Command (GSA)** is the second-largest at $2.54M.
- **C5ISR (F0209)** is winding down ($112K Mar → $50K May), consistent with ending 6/30 and rolling to FORCE.
- **CECOM (F0038)** trailing to ~$0 (option not exercised); $1,082 May is closeout/retention.
- **FORCE (FA010)** shows nothing yet — correct; revenue starts 7/1/2026.

---

## 3. Classification logic (for the AR tab implementation)

Bucket each `ar_actuals` row by regex on `invoice_number`:

| Pattern | Contract label |
|---|---|
| `F?0016` | STEP (F0016) |
| `F?0028` | PEO IEWS SETA (F0028) |
| `F?0209` | C5ISR (F0209) |
| `F?0038` | CECOM (F0038) |
| `FA010` | FORCE (FA010) |
| customer `GSA%` | PM Mission Command (GSA) |
| customer `Sev1%` | Sev1Tech (sub) |
| customer `Booz%` | Booz Allen (sub) |
| customer `Nakupuna%` | Nakupuna (sub) |
| customer `CACI%` | CACI (sub) |
| customer `Techximius%` | Techximius (sub) |
| else | Other: <customer_name> |

**Critical:** bucket the non-Army rows by **`customer_name`, not the `INV-` invoice prefix** — that prefix is shared across GSA, Booz Allen, Nakupuna, CACI, Sev1Tech, and others. The Army task orders bucket by the `F####` suffix + Army customer.

Notes / data-quality:
- One invoice is `0028` without the leading `F` — the `F?` optional-F regex handles it (folds into F0028).
- `R` / `TR` suffixes (e.g. F0209R, F0038R) are retentions/revisions — fold into the base task order.
- The four Army task orders should also roll up under a single **RS3 IDIQ (W15P7T-19-D-0206)** parent grouping in the UI.
