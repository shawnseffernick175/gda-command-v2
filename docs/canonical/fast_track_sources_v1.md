# GDA Command — Fast Track Source Discovery
### Leading-Indicator Data Sources for Federal Defense Contracting Opportunities
**Prepared for:** CSR LLC, Alexandria VA — GDA Command Intelligence Platform  
**Purpose:** Architecture design reference for the Fast Track capability (signals surfacing 6–24 months before formal SAM.gov solicitations)  
**Date:** June 2026

---

## Overview

The Fast Track capability is designed to surface procurement opportunity signals **before** they appear as formal solicitations on SAM.gov, GovTribe, or GovWin. The core thesis is that federal acquisitions follow a predictable research-to-procurement pipeline: basic research is funded → SBIR topics are issued → strategy documents signal priorities → RFIs probe industry → budget exhibits reveal program elements → the formal solicitation appears.

Every stage of that pipeline leaves a digital footprint. This document catalogs the data sources for each stage, with full technical access details and Day 1 prioritization for the GDA Command Fast Track rollout.

**Signal timeline model:**

```
Basic Research Grant    SBIR Topic Opens   Budget Exhibit    RFI/Sources Sought    Formal RFP
     (T-18 to T-24 mo)    (T-12 to T-18)   (T-12 to T-18)    (T-3 to T-12)        (T-0)
           ↓                    ↓                  ↓                  ↓                ↓
  NSF/NIH/DOE Awards      SBIR.gov API       OUSD Budget       SAM.gov (r/p)      SAM.gov (o)
  NIH Reporter API        DoD BAAs           USAspending        Fed Register       GovTribe
  NTRS / arXiv            ONR/AFRL BAA       GovInfo CHRG       DARPA BAA          GovWin
```

---

## Category 1 — Government Research Funding

Research grants are the earliest-stage signal in the procurement pipeline. When DoD-adjacent agencies fund basic research on a topic, commercial procurement typically follows 18–24 months later. These sources reveal what the government is investing in scientifically — before any acquisition action is taken.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 1.1 | **NSF Awards API** — All NSF-funded research grants by topic, PI, institution, division. ~$9B/yr across all fields. | Public REST API | None (no key required) | Free | Not published; reasonable use expected | Varies (grants loaded at award) | 18–24 mo | Moderate — filterable by program (CISE, ENG divisions align with DoD tech areas). Keyword/abstract search available. | Topic keywords + PI affiliation match to SBIR topics and eventual SAM solicitation keywords | **HIGH** |
| 1.2 | **NIH RePORTER API v2** — All NIH-funded research projects. ~$42B/yr. Covers biodefense, CBRN, neuroscience-for-combat, and HHS SBIR overlap. | Public REST API (POST) | None | Free | 500 records/page; paginated | Near-real-time at award | 18–24 mo | Moderate-High — filter by agency="DOD" sub-fields; CFDA codes; keyword search of abstracts | Opportunity Number field links directly to SAM.gov solicitation number when applicable | **HIGH** |
| 1.3 | **DOE OSTI API** — DOE Office of Scientific and Technical Information. Covers energy, nuclear, advanced computing, materials. Full text search of STI records. | Public REST API | None | Free | Not published | Irregular | 18–24 mo | Moderate — nuclear, quantum, directed energy overlap. Filter by DOE program offices. | DOI and award ID fields; keyword matching to program elements | **MEDIUM** |
| 1.4 | **NASA NTRS OpenAPI** — NASA Technical Reports Server. All public NASA STI: research reports, conference papers, patents, technical videos. | OpenAPI + bulk ndjson download | None | Free | Not published; bulk download available by year | Irregular | 12–24 mo | Moderate — aerospace, autonomy, sensors, ISR overlap. Keyword + category search. | Report number, contract number fields enable FPDS/SAM linkage | **MEDIUM** |
| 1.5 | **DARPA BAAs (via SAM.gov)** — Office-wide and program-specific Broad Agency Announcements. Each BAA defines areas of interest. Programs refresh annually. | SAM.gov API (ptype=k,o) + DARPA website | API key (SAM.gov) | Free | 1,000/day (registered) | Real-time as posted | 6–18 mo | **Very High** — DARPA BAAs are the canonical signal for emerging defense technology investment areas | solicitation_number field → direct SAM.gov linkage | **HIGH** |
| 1.6 | **ONR Long-Range BAA** — Office of Naval Research annual BAA covers all S&T investment areas for Navy/Marines. FY25 BAA covers 6 areas. | SAM.gov API + ONR website PDF | API key | Free | 1,000/day (registered) | Annual refresh | 12–24 mo | **Very High** — direct Navy/USMC S&T alignment | Solicitation number → SAM | **HIGH** |
| 1.7 | **AFRL / ARL BAAs** — Air Force Research Laboratory and Army Research Laboratory post topic-specific and broad BAAs. | SAM.gov API (organizationName filter) | API key | Free | 1,000/day | Varies | 12–24 mo | **Very High** | Solicitation number → SAM | **MEDIUM** |

### Key API Calls

```bash
# NSF Awards — defense-adjacent keyword search (no key needed)
curl "http://api.nsf.gov/services/v1/awards.json?keyword=autonomous+systems&agency=DARPA"

# NIH RePORTER v2 — filter by DOD as funding agency
curl -X POST https://api.reporter.nih.gov/v2/projects/search \
  -H "Content-Type: application/json" \
  -d '{"criteria":{"agencies":["DOD"],"fiscal_years":[2025]},"offset":0,"limit":500}'

# DARPA BAAs via SAM.gov
curl "https://api.sam.gov/prod/opportunities/v2/search?api_key=YOUR_KEY&ptype=k&title=DARPA&postedFrom=01/01/2025&postedTo=12/31/2025&limit=100&offset=0"
```

**Documentation:**
- NSF Awards API: https://www.research.gov/common/webapi/awardapisearch-v1.htm
- NIH RePORTER API v2: https://api.reporter.nih.gov
- DOE OSTI API: https://www.osti.gov/pages/api/v1/docs
- NASA NTRS Harvesting: https://sti.nasa.gov/harvesting-data-from-ntrs/
- DARPA BAAs: https://www.darpa.mil/research/opportunities/baa
- ONR Funding Opportunities: https://www.onr.navy.mil/work-with-us/funding-opportunities/announcements

---

## Category 2 — SBIR/STTR Ecosystem

The DoD SBIR/STTR program is one of the highest-fidelity leading indicators for defense procurement. A Phase I topic signals agency intent to develop a technology area. Phase II awards indicate maturing investment. Phase III transitions represent direct procurement pathways — often without competition. The typical pipeline from SBIR topic open to production contract is 24–48 months, but SBIR award data can be ingested starting at Phase I award.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 2.1 | **SBIR.gov Awards API** — All Phase I/II/III SBIR and STTR awards across all agencies since 1983. Fields: firm, topic_code, abstract, solicitation_number, award_year, agency, branch, PI. | Public REST API | None | Free | 100 rows/request; paginated via `start=` | Varies; awards loaded after agency reporting | 12–24 mo (Phase I→procurement) | **Very High** — filter by agency=DOD, branch=ARMY/NAVY/AF/etc. | `solicitation_number` → SAM.gov; `topic_code` → links to SBIR solicitation topics; `uei` → SAM entity data | **HIGH** |
| 2.2 | **SBIR.gov Topic API** — Open, Future, and Closed solicitation topics. Shows upcoming DoD SBIR/STTR topic areas before and during open solicitation windows. | REST API (Topic endpoint, CSV download) | None | Free | Not published | Updated as topics open/close | 6–18 mo | **Very High** — DoD opens topics twice/yr; topics reveal specific technology gaps | Topic code → SBIR award linkage | **HIGH** |
| 2.3 | **SBIR.gov Company/Portfolio** — Searchable registry of all firms that have received SBIR awards. Enables tracking of competitor positioning and technology areas. | REST API + bulk download (CSV) | None | Free | 100 rows/request | Periodic | Ongoing | High — identify prime teaming partners and competitors | UEI → SAM entity; award_link → SAM | **MEDIUM** |
| 2.4 | **AFWERX / SpaceWERX / SOFWERX OTAs** — Service innovation offices post open calls and prize challenges via SAM.gov and their own portals. Higher TRL requirements, faster awards (60–90 days). | Website + SAM.gov API | API key (SAM) | Free | 1,000/day (registered) | Real-time | 3–12 mo | **Very High** | SAM solicitation number | **HIGH** |
| 2.5 | **FPDS-NG Phase III contract flags** — FPDS contract data includes a "SBIR/STTR flag" field. Phase III contracts must be coded as such per 15 USC 638. Enables detection of tech transitions. | FPDS Atom Feed (SOAP/XML) or SAM Contract Data API | Free (web) / $2,500 (real-time integration) | Free/Paid | 10 records/request (Atom feed) | Daily | Signal of past transition; useful for competitor intel | Very High | Contract number → SAM; UEI → SBIR award history | **MEDIUM** |

### Key API Calls

```bash
# SBIR.gov — all DOD Phase II awards in 2025
curl "https://api.www.sbir.gov/public/api/awards?agency=DOD&phase=2&year=2025&rows=100"

# SBIR.gov — Army awards with autonomous systems keywords
curl "https://api.www.sbir.gov/public/api/awards?agency=DOD&branch=ARMY&keyword=autonomous"

# SBIR Topic API — Open DoD topics (note: topic endpoint format varies; check SBIR data resources page)
# https://www.sbir.gov/data-resources — download topics CSV or use topic API
```

**Documentation:**
- SBIR.gov API: https://www.sbir.gov/api
- SBIR.gov Data Resources: https://www.sbir.gov/data-resources
- AFWERX Phase III: https://afwerx.com/divisions/sbir-sttr/phase-iii/
- Army SBIR Phase III: https://armysbir.army.mil/phase/phase-iii/

---

## Category 3 — Federal Strategy & Posture Documents

Strategy documents signal priorities 12–24 months before budget exhibits and 24–36 months before procurement. The DoD publishes annual posture statements, service S&T strategies, and OUSD(R&E) critical technology designations. These are largely PDF/web, but can be ingested via document parsing pipelines.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 3.1 | **OUSD(R&E) Critical Technology Areas (CTAs)** — Current 6 CTAs: Applied AI, Biomanufacturing, Contested Logistics, Quantum/Battlefield Info Dominance, Scaled Directed Energy, Scaled Hypersonics. Published at cto.mil. | Web (PDF/HTML scrape) | None | Free | N/A | Annual (or as updated) | 18–36 mo | **Very High** — explicit roadmap for where $$ will flow | Keyword matching to solicitation titles | **HIGH** |
| 3.2 | **DoD Budget Justification Books (R-1 / P-1)** — Annual RDT&E Program Elements (R-1) and Procurement line items (P-1) for each service. Machine-readable XMLs embedded in PDFs. Published at comptroller.defense.gov. | PDF/XML download from OUSD Comptroller website | None | Free | N/A | Annual (February) | 12–18 mo | **Very High** — Program Elements name specific tech areas and dollar amounts | Program Element number links to SAM solicitations; keyword search | **HIGH** |
| 3.3 | **GovInfo API — Congressional Hearings (CHRG)** — Full text of all House/Senate Armed Services Committee hearings, appropriations markup testimony, etc. Covers witness statements revealing priority gaps. | GovInfo REST API | api.data.gov key (free) | Free | Not published | Real-time after publication | 12–24 mo | **Very High** — HASC/SASC testimony reveals committee priorities before NDAA language | Full-text keyword search → match to program areas | **HIGH** |
| 3.4 | **Congress.gov API — Bill Text / NDAA** — Access bill summaries, text, subjects, and amendments. NDAA sections create new program authorities that lead to solicitations. | REST API (api.data.gov key) | api.data.gov key (free) | Free | Not published | Real-time at publication | 6–18 mo | **Very High** — NDAA sections authorize and fund specific programs | Bill number + section → solicitation keyword matching | **HIGH** |
| 3.5 | **OUSD CDAO / DoD CTO Website** — DoD Chief Digital and AI Office, CTO strategic documents, AI adoption roadmaps. Published at ai.mil and cto.mil. | Web (PDF/HTML scrape) | None | Free | N/A | Ad hoc (major updates 1–2x/yr) | 18–36 mo | **Very High** | Keyword topic matching | **MEDIUM** |
| 3.6 | **Service Branch S&T Strategies (Army, Navy, USAF, Space Force)** — Published S&T strategies and science and technology investment plans. PDF documents on service websites. | Web (PDF download) | None | Free | N/A | Annual | 18–36 mo | **Very High** | Keyword matching | **MEDIUM** |
| 3.7 | **GovInfo API — Congressional Record (CREC)** — Floor debates, appropriations riders, congressional adds (earmarks) that create new program funding. | GovInfo REST API | api.data.gov key (free) | Free | Not published | Real-time | 6–18 mo | High | Keyword matching | **LOW** |

### Key API Calls

```bash
# GovInfo API — List recent Armed Services Committee hearings
curl "https://api.govinfo.gov/collections/CHRG/2025-01-01T00:00:00Z?pageSize=20&offsetMark=*&api_key=DEMO_KEY"

# Congress.gov API — Get NDAA bills
curl "https://api.congress.gov/v3/bill?congress=119&type=hr&title=national+defense+authorization&api_key=YOUR_KEY"

# GovInfo — Full text of a specific hearing
curl "https://api.govinfo.gov/packages/CHRG-119shrg12345/summary?api_key=YOUR_KEY"
```

**Documentation:**
- OUSD(R&E) CTAs: https://www.cto.mil/cta/
- DoD Budget Materials: https://comptroller.defense.gov/Budget-Materials/Budget2026/
- GovInfo API: https://www.govinfo.gov/developers
- Congress.gov API: https://www.loc.gov/apis/additional-apis/congress-dot-gov-api/
- GovInfo GitHub: https://github.com/usgpo/api

---

## Category 4 — Pre-Solicitation Signals

Pre-solicitation signals are the closest leading indicators to formal solicitations. They appear on SAM.gov itself but under notice types that precede the full RFP. RFIs (notice type `r`) and Pre-Solicitation notices (type `p`) typically appear 3–12 months before award. GDA already ingests SAM.gov, but filtering specifically for these notice types and monitoring pattern shifts is the Fast Track play here.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 4.1 | **SAM.gov Opportunities API — Sources Sought (ptype=r)** — Sources sought notices signal that an agency is conducting market research before issuing an RFP. Often 6–12 months ahead of solicitation. | REST API v2 | api.data.gov key (free) | Free | 10/day (public); 1,000/day (registered entity) | Real-time | 6–12 mo | **Very High** — filter by organizationName=DOD/Army/Navy etc. + NAICS | noticeId → links to follow-on solicitation (manual tracking needed) | **HIGH** |
| 4.2 | **SAM.gov Opportunities API — Pre-Solicitation (ptype=p)** — Formal notice that a solicitation is coming. Required by FAR Part 5. Contains NAICS, estimated value, projected release date. | REST API v2 | api.data.gov key (free) | Free | 10/day (public); 1,000/day (registered entity) | Real-time | 3–9 mo | **Very High** | Same noticeId / solicitationNumber → track to follow-on | **HIGH** |
| 4.3 | **Federal Register API — RFI Notices** — Agencies sometimes publish RFIs in the Federal Register (NOTICE type) for regulatory or strategy-level market research that doesn't appear on SAM.gov. Also used for major capability gap analyses. | Public REST API (federalregister.gov) | None | Free | Not published; generous limits | Real-time (daily publication) | 6–18 mo | Moderate-High — filter by agency=DOD/Army/DHS + type=NOTICE | Document number + agency + topic → keyword matching to future SAM solicitation | **MEDIUM** |
| 4.4 | **DARPA / DIU Industry Day Announcements** — DIU posts open solicitations via SAM.gov CSO process (ptype=k). DARPA posts Proposer's Day notices. Both precede awards by 60–180 days. | SAM.gov API (ptype=k, organizationName=DIU/DARPA) + diu.mil website | API key | Free | 1,000/day | Real-time | 2–6 mo | **Very High** | solicitation_number → later contract award in FPDS/USAspending | **HIGH** |
| 4.5 | **Draft RFPs (GovTribe / GovWin — existing subscriptions)** — GDA already subscribes to both. Draft RFPs contain draft SOWs, CDRLs, and evaluation criteria — 1–3 months before final RFP. | Existing paid subscriptions | Paid API | Subscription | Per plan | Real-time | 1–3 mo | Very High | Direct solicitation number match | (Already covered) |

### Key API Calls

```bash
# SAM.gov — Sources Sought notices for DoD, last 30 days
curl "https://api.sam.gov/prod/opportunities/v2/search?api_key=YOUR_KEY&ptype=r&organizationName=Department+of+Defense&postedFrom=05/01/2026&postedTo=06/01/2026&limit=100&offset=0"

# SAM.gov — Pre-solicitation notices for Army, last 30 days
curl "https://api.sam.gov/prod/opportunities/v2/search?api_key=YOUR_KEY&ptype=p&organizationName=Army&postedFrom=05/01/2026&postedTo=06/01/2026&limit=100&offset=0"

# Federal Register API — DoD/defense RFI-type notices
curl "https://api.federalregister.gov/v1/documents.json?conditions[type][]=NOTICE&conditions[agencies][]=defense-department&per_page=20&order=newest"
```

**Documentation:**
- SAM.gov Opportunities API: https://open.gsa.gov/api/get-opportunities-public-api/
- SAM.gov API Complete Guide: https://govconapi.com/sam-gov-api-complete-guide
- Federal Register API: https://www.federalregister.gov/developers/documentation/api/v1
- DIU Open Solicitations: https://www.diu.mil/work-with-us/open-solicitations

---

## Category 5 — Oversight and Budget Signals

Budget exhibits, GAO reports, and spending trend analysis reveal program health, capability gaps, and upcoming re-competitions. A GAO report criticizing a program's execution often precedes a re-compete or new acquisition. USAspending obligation patterns reveal which program elements are ramping up and which are winding down.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 5.1 | **USAspending.gov API** — Comprehensive federal spending data: contracts, grants, IDVs. Obligation trends by agency, NAICS, PSC code, recipient. Enables detection of ramp-up/ramp-down patterns. | REST API v2 | None | Free | Not published; generous | Daily | 6–18 mo (trend detection) | **Very High** — filter by awarding_agency=DoD; PSC codes for defense products/services | PIID (contract #) → FPDS; Award ID → SAM; UEI → SBIR database | **HIGH** |
| 5.2 | **GAO Reports** — Government Accountability Office audit reports and recommendations. Reports on program failures, capability gaps, and oversight findings. Often precede re-competes. | GAO.gov website (no native API) — 3rd party: Apify GAO Scraper ($19/1,000 results) | None (GAO website); API key (Apify) | Free / ~$19/1k records | Apify rate limits | Weekly (reports issued) | 6–18 mo (gap → solicitation) | **Very High** | Keyword matching to agency + program area → USAspending / SAM search | **MEDIUM** |
| 5.3 | **DoD Inspector General Reports** — IG reports on contract performance, acquisition deficiencies, program assessments. Signal re-competes and corrective actions. | dodig.mil website; GovInfo API (CRPT collection) | GovInfo: api.data.gov key | Free | Not published | Irregular | 6–18 mo | **Very High** | Keyword matching to contractor + program → USAspending | **MEDIUM** |
| 5.4 | **DoD R-1 / P-1 Budget Justification Books** — Annual exhibits submitted to Congress (February). R-1 = RDT&E program elements by service. P-1 = Procurement line items. Machine-readable XML embedded in PDFs. | OUSD Comptroller website (direct PDF/XML download) | None | Free | N/A | Annual | 12–18 mo | **Very High** | Program Element Number (PE#) → FPDS contract data; line item names | **HIGH** |
| 5.5 | **GovInfo API — Congressional Budget Hearings** — Appropriations committee hearings where service secretaries and chiefs testify on priorities. Reveal congressional additions and program emphasis. | GovInfo REST API (CHRG collection) | api.data.gov key (free) | Free | Not published | Real-time | 12–24 mo | **Very High** | Full-text search → keyword matching | **MEDIUM** |
| 5.6 | **CRS Reports (Congress.gov / FAS)** — Congressional Research Service analytical reports on defense programs, acquisition strategy, emerging technology. Newly accessible via Congress.gov API (2025). | Congress.gov API (as of March 2025) | api.data.gov key | Free | Not published | Irregular | 12–24 mo | High | Keyword matching | **LOW** |

### Key API Calls

```bash
# USAspending — DoD contract spending over time (quarterly trend)
curl -X POST https://api.usaspending.gov/api/v2/search/spending_over_time/ \
  -H "Content-Type: application/json" \
  -d '{"group":"quarter","filters":{"award_type_codes":["A","B","C","D"],"agencies":[{"type":"awarding","tier":"toptier","name":"Department of Defense"}]}}'

# USAspending — Spending by recipient for specific NAICS (e.g. 541715 R&D)
curl -X POST https://api.usaspending.gov/api/v2/search/spending_by_award/ \
  -H "Content-Type: application/json" \
  -d '{"filters":{"naics_codes":["541715"],"agencies":[{"type":"awarding","tier":"toptier","name":"Department of Defense"}]},"fields":["Award ID","Recipient Name","Award Amount","Awarding Sub Agency"],"page":1,"limit":50,"sort":"Award Amount","order":"desc"}'

# GovInfo — Recent DoD IG reports (CRPT collection includes IG reports)
curl "https://api.govinfo.gov/collections/CRPT/2025-01-01T00:00:00Z?pageSize=20&offsetMark=*&api_key=DEMO_KEY"
```

**Documentation:**
- USAspending API: https://api.usaspending.gov
- USAspending Endpoints: https://api.usaspending.gov/docs/endpoints
- GAO Reports: https://www.gao.gov/reports-testimonies
- DoD Budget Materials: https://comptroller.defense.gov/Budget-Materials/Budget2026/
- Congress.gov CRS Access: https://blogs.loc.gov/law/2025/03/improved-public-access-to-crs-reports-on-congress-gov/

---

## Category 6 — Industry and News Signals

Contract award announcements, prime contractor press releases, and defense trade press coverage surface signals that can be backtracked to identify re-competes, task order opportunities, and partner/competitor positioning. DoD announces contracts over $7.5M daily.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 6.1 | **DoD Contract Announcements (defense.gov/Newsroom/Contracts)** — Daily DoD press releases for contracts ≥$7.5M. Includes contractor, value, description, program office. RSS feed available. | RSS feed + web (structured HTML) | None | Free | N/A | Daily (5pm ET) | Signal of award; follow-on/re-compete indicator | **Very High** | Award description → program keyword matching → USAspending PIID lookup | **HIGH** |
| 6.2 | **DoD RSS Feeds (defense.gov/news/rss)** — News, contracts, and press release feeds from the DoD newsroom. Multiple category feeds available. | RSS | None | Free | N/A | Real-time | Varies | **Very High** | Keyword matching | **HIGH** |
| 6.3 | **BreakingDefense RSS** — Authoritative defense industry trade press. Covers program awards, contract announcements, budget developments, industry day coverage. | RSS feed (breakingdefense.com/full-rss) | None | Free | N/A | Real-time | 3–12 mo (story → solicitation) | **Very High** | Keyword matching to program + agency | **HIGH** |
| 6.4 | **DefenseScoop / FedScoop RSS** — Federal IT and defense technology-focused trade press. Covers DoD digital transformation, AI, cloud, cybersecurity programs. | RSS | None | Free | N/A | Real-time | 3–12 mo | High (IT/cyber/AI-focused) | Keyword matching | **MEDIUM** |
| 6.5 | **Defense One** — Defense policy and technology news with significant reporting on acquisition, program development, and emerging threats. | Web / email alerts | None (public articles) | Free (with registration) | N/A | Real-time | 3–12 mo | **Very High** | Keyword matching | **MEDIUM** |
| 6.6 | **GovConWire / ExecutiveBiz** — Cover contract awards, executive moves at defense primes and mid-tier companies. Signal re-competes when contracts end. | RSS / email | None | Free | N/A | Real-time | 6–18 mo (contract end → re-compete) | High | Contract end date + company tracking | **LOW** |
| 6.7 | **Prime Contractor Press Releases (PR Newswire / Business Wire)** — L3Harris, Leidos, Booz Allen, SAIC, CACI, Palantir announce contracts and partnerships. Signals where primes are winning and sub opportunities exist. | RSS / web search | None | Free | N/A | Real-time | 3–12 mo | High | Company name + award amount + agency → FPDS lookup | **LOW** |

### Key Access Details

```bash
# DoD Contract Announcements RSS
https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10

# DoD News RSS
https://www.defense.gov/news/rss/

# BreakingDefense RSS
https://breakingdefense.com/feed/  (or /full-rss for full content)

# DefenseScoop RSS (FedScoop)
https://defensescoop.com/feed/
```

**Documentation:**
- DoD Contract Announcements: https://www.defense.gov/Newsroom/Contracts/
- DoD RSS Feeds: https://www.defense.gov/news/rss/
- BreakingDefense: https://breakingdefense.com
- DefenseScoop: https://defensescoop.com

---

## Category 7 — Academic and Research Leading Indicators

University research outputs and defense innovation hub activities reveal technologies at TRL 2–4 — the precursor stage before DoD R&D programs formalize. arXiv preprints in defense-adjacent categories (AI, autonomy, quantum, materials) represent the earliest possible signal in the pipeline.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 7.1 | **arXiv API** — Preprint repository covering cs.AI, cs.RO (robotics), eess (electrical engineering/signal processing), physics.quant-ph, math (optimization), and more. 2M+ papers. | Public REST API (Atom/JSON) | None | Free | 3-second delay between calls; max 30,000 results/query; 2,000/slice | Near-real-time (papers appear same day as submission) | 18–36 mo | **Very High** — categories: cs.AI, cs.RO, cs.SY, eess.SP, quant-ph, cs.CR (cybersecurity) | Abstract keyword matching to SBIR topics and NSF/DARPA BAA terminology | **HIGH** |
| 7.2 | **Defense Innovation Unit (DIU) Open Solicitations** — DIU posts Commercial Solutions Openings (CSOs) and prize challenges. Shorter award timelines (60–90 days). Signals high-TRL commercial tech demand. | diu.mil website + SAM.gov API (organizationName=Defense Innovation Unit) | None/API key | Free | SAM: 1,000/day | Real-time | 2–6 mo (to DIU award); 12–24 mo (to production contract) | **Very High** | SAM solicitation number → follow-on contract | **HIGH** |
| 7.3 | **NSIN (National Security Innovation Network)** — Now integrated with AFWERX/OUSD(R&E). Manages university partnerships, accelerator programs, and open calls for academic research with defense application. | Website (fedtech.io/programs/forge) + email newsletters | None | Free | N/A | Quarterly (program cycles) | 12–24 mo | High | Program topic → SBIR/BAA keyword matching | **MEDIUM** |
| 7.4 | **DTIC (Defense Technical Information Center) Technical Reports** — Unclassified, publicly available DoD-funded technical reports. Sitemap at apps.dtic.mil/sitemap.xml enables systematic collection. | Web (sitemap-based) | None (public site) | Free | Not published | Irregular | 12–24 mo | **Very High** — direct DoD R&D output | Document number + contract number fields | **MEDIUM** |
| 7.5 | **semantic scholar / OpenAlex API** — Alternative academic database covering defense-relevant journals. OpenAlex has a fully open API with 200M+ works, filterable by institution, funder, and topic. | REST API | None (OpenAlex) | Free | OpenAlex: 100,000 requests/day (polite pool) | Near-real-time | 18–36 mo | Moderate-High | DOI + funder matching | **LOW** |

### Key API Calls

```bash
# arXiv — autonomous systems papers in last 30 days
curl "http://export.arxiv.org/api/query?search_query=cat:cs.RO+AND+abs:autonomous+systems&start=0&max_results=50&sortBy=submittedDate&sortOrder=descending"

# arXiv — AI for defense/ISR papers
curl "http://export.arxiv.org/api/query?search_query=cat:cs.AI+AND+(abs:ISR+OR+abs:surveillance+OR+abs:target+recognition)&start=0&max_results=50"

# arXiv — quantum sensing papers
curl "http://export.arxiv.org/api/query?search_query=cat:quant-ph+AND+abs:quantum+sensing&start=0&max_results=50"

# DIU solicitations via SAM.gov
curl "https://api.sam.gov/prod/opportunities/v2/search?api_key=YOUR_KEY&organizationName=Defense+Innovation+Unit&postedFrom=01/01/2025&postedTo=06/01/2026&limit=100&offset=0"
```

**Documentation:**
- arXiv API: https://info.arxiv.org/help/api/index.html
- arXiv User Manual: https://info.arxiv.org/help/api/user-manual.html
- DIU Open Solicitations: https://www.diu.mil/work-with-us/open-solicitations
- DTIC Technical Reports: https://discover.dtic.mil/technical-reports/
- OpenAlex API: https://docs.openalex.org/

---

## Category 8 — Standards, Directives, and Capability Gap Documents

DoD instructions, NIST publications, and DHS S&T gap analyses create mandates that generate procurement requirements. When a new DoD instruction mandates a capability (e.g., Zero Trust architecture, AI governance), contracts follow within 12–36 months.

### Source Table

| # | Name & Coverage | API/Access | Auth | Cost | Rate Limits | Freshness | Lead Time | DoD Relevance | Match Feasibility | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 8.1 | **DoD Issuances (directives.defense.gov)** — DoD Instructions (DoDIs), Directives (DoDDs), and manuals. Each new issuance or revision creates implementation requirements that become contracts. | Web (sitemap/RSS) | None | Free | N/A | Irregular | 12–36 mo | **Very High** | Keyword matching (e.g., "zero trust", "AI", "cloud") → follow-on solicitations | **MEDIUM** |
| 8.2 | **NIST CSRC Publications** — NIST Special Publications (SPs) on cybersecurity, AI, and emerging tech that become DoD/federal compliance mandates. SP 800-series, AI RMF, Post-Quantum Cryptography. | NIST website (csrc.nist.gov) | None | Free | N/A | Irregular | 12–36 mo | High (cyber, AI, quantum standards become DoD mandates) | Standard number → FAR/DFARS compliance solicitations | **MEDIUM** |
| 8.3 | **DHS S&T Capability Gap Analyses** — DHS Science and Technology Directorate publishes capability needs, funding opportunity announcements, and the Homeland Security Research Portfolio. | DHS website + SAM.gov BAAs | None | Free | N/A | Annual | 12–24 mo | Moderate (border, cyber, chem-bio overlap with DoD) | Keyword matching | **LOW** |
| 8.4 | **GovInfo API — Code of Federal Regulations (CFR)** — DFARS (48 CFR Chapter 2) amendments add new acquisition requirements. New DFARS clauses often signal mandated capabilities. | GovInfo REST API (CFR collection) | api.data.gov key | Free | Not published | Quarterly | 6–18 mo | High (DFARS changes directly affect defense acquisition) | CFR citation → solicitation clause requirements | **LOW** |
| 8.5 | **Federal Register — Proposed Rules (RULE / PRORULE type)** — Proposed DFARS/FAR rule changes published in FR. Comment period provides advance notice of upcoming acquisition policy changes. | Federal Register API (type=RULE, agency=defense) | None | Free | Not published | Real-time (daily publication) | 6–18 mo | High | Rule RIN → FR tracking → SAM solicitation clause reference | **MEDIUM** |

### Key API Calls

```bash
# GovInfo API — Recent CFR updates for DFARS (48 CFR)
curl "https://api.govinfo.gov/collections/CFR/2025-01-01T00:00:00Z?pageSize=20&offsetMark=*&api_key=DEMO_KEY"

# Federal Register API — DoD proposed rules
curl "https://api.federalregister.gov/v1/documents.json?conditions[agencies][]=defense-department&conditions[type][]=PRORULE&per_page=20&order=newest"

# GovInfo — Recent DoD/DFARS Federal Register issuances
curl "https://api.govinfo.gov/search?query=DFARS&collection=FR&pageSize=20&api_key=DEMO_KEY"
```

**Documentation:**
- DoD Issuances: https://www.esd.whs.mil/DD/DoD-Issuances/
- NIST CSRC: https://csrc.nist.gov/publications
- NIST Critical Technology Publications: https://www.nist.gov
- GovInfo Developer Hub: https://www.govinfo.gov/developers
- Federal Register API Docs: https://www.federalregister.gov/developers/documentation/api/v1

---

## Master Source Reference Table

| Source | Category | Auth | Cost | Freshness | Lead Time | Priority |
|---|---|---|---|---|---|---|
| NSF Awards API | Research Funding | None | Free | Award timing | 18–24 mo | **HIGH** |
| NIH RePORTER API v2 | Research Funding | None | Free | Near-real-time | 18–24 mo | **HIGH** |
| DOE OSTI API | Research Funding | None | Free | Irregular | 18–24 mo | MEDIUM |
| NASA NTRS OpenAPI | Research Funding | None | Free | Irregular | 12–24 mo | MEDIUM |
| DARPA BAAs (SAM.gov) | Research Funding | API key | Free | Real-time | 6–18 mo | **HIGH** |
| ONR Long-Range BAA | Research Funding | API key | Free | Annual | 12–24 mo | **HIGH** |
| AFRL/ARL BAAs | Research Funding | API key | Free | Varies | 12–24 mo | MEDIUM |
| SBIR.gov Awards API | SBIR Ecosystem | None | Free | Award timing | 12–24 mo | **HIGH** |
| SBIR.gov Topic API | SBIR Ecosystem | None | Free | Real-time | 6–18 mo | **HIGH** |
| AFWERX/SpaceWERX OTAs | SBIR Ecosystem | API key | Free | Real-time | 3–12 mo | **HIGH** |
| FPDS Phase III flags | SBIR Ecosystem | Free/Paid | Free/$2,500 | Daily | Retrospective | MEDIUM |
| OUSD(R&E) CTAs | Strategy & Posture | None | Free | Annual | 18–36 mo | **HIGH** |
| DoD R-1/P-1 Budget Books | Strategy & Posture | None | Free | Annual | 12–18 mo | **HIGH** |
| GovInfo CHRG API | Strategy & Posture | api.data.gov key | Free | Real-time | 12–24 mo | **HIGH** |
| Congress.gov NDAA API | Strategy & Posture | api.data.gov key | Free | Real-time | 6–18 mo | **HIGH** |
| OUSD CDAO/CTO Docs | Strategy & Posture | None | Free | Ad hoc | 18–36 mo | MEDIUM |
| SAM.gov Sources Sought | Pre-Solicitation | API key | Free | Real-time | 6–12 mo | **HIGH** |
| SAM.gov Pre-Solicitation | Pre-Solicitation | API key | Free | Real-time | 3–9 mo | **HIGH** |
| Federal Register NOTICE | Pre-Solicitation | None | Free | Daily | 6–18 mo | MEDIUM |
| DIU Open Solicitations | Pre-Solicitation | API key/None | Free | Real-time | 2–6 mo | **HIGH** |
| USAspending.gov API | Oversight & Budget | None | Free | Daily | 6–18 mo | **HIGH** |
| GAO Reports | Oversight & Budget | None/Apify | Free/$19/1k | Weekly | 6–18 mo | MEDIUM |
| DoD IG Reports | Oversight & Budget | api.data.gov key | Free | Irregular | 6–18 mo | MEDIUM |
| DoD R-1/P-1 Budget Books | Oversight & Budget | None | Free | Annual | 12–18 mo | **HIGH** |
| DoD Contract Announcements | Industry & News | None | Free | Daily | Retrospective | **HIGH** |
| DoD RSS Feeds | Industry & News | None | Free | Real-time | 3–12 mo | **HIGH** |
| BreakingDefense RSS | Industry & News | None | Free | Real-time | 3–12 mo | **HIGH** |
| DefenseScoop/FedScoop RSS | Industry & News | None | Free | Real-time | 3–12 mo | MEDIUM |
| arXiv API | Academic/Research | None | Free | Same-day | 18–36 mo | **HIGH** |
| DIU Solicitations | Academic/Research | API key/None | Free | Real-time | 2–24 mo | **HIGH** |
| NSIN / AFWERX Programs | Academic/Research | None | Free | Quarterly | 12–24 mo | MEDIUM |
| DTIC Technical Reports | Academic/Research | None | Free | Irregular | 12–24 mo | MEDIUM |
| DoD Issuances | Standards & Docs | None | Free | Irregular | 12–36 mo | MEDIUM |
| NIST CSRC Publications | Standards & Docs | None | Free | Irregular | 12–36 mo | MEDIUM |
| Federal Register RULE | Standards & Docs | None | Free | Daily | 6–18 mo | MEDIUM |

---

## Recommended Day 1 Set — Fast Track Launch

The following 8 sources are recommended for the first sprint of the GDA Command Fast Track capability. Selection criteria: (a) freely available public API with no registration barriers, (b) highest defense relevance, (c) clearest path to automated ingestion, (d) non-redundant with existing SAM.gov/GovTribe/GovWin coverage, and (e) meaningful lead time before formal solicitation.

| Rank | Source | Why Day 1 |
|---|---|---|
| **1** | **SBIR.gov Awards + Topic APIs** | Zero authentication, immediate access, direct DoD topic-code linkage. Phase II awards are the single highest-fidelity 12–18 month signal. Phase I topics signal 6–18 months out. Two endpoints, one integration. |
| **2** | **SAM.gov Sources Sought + Pre-Solicitation (ptype=r,p)** | GDA already ingest SAM.gov for solicitations (ptype=o). Expanding to r/p filters costs zero additional infrastructure and surfaces signals 3–12 months earlier. Critical gap-filler. |
| **3** | **NIH RePORTER API v2 + NSF Awards API** | Free, no key, high-volume government research grant data. Filter by agency=DOD (NIH) and defense-adjacent NSF divisions. Earliest-stage indicator (18–24 mo). CFDA/opportunity_number fields enable downstream linkage. |
| **4** | **USAspending.gov API — Obligation Trend Analysis** | Reveals which program elements are growing vs. declining. Spending ramp-ups in a NAICS/PSC code + DoD component are reliable 6–18 month re-compete predictors. Free, no auth, excellent API. |
| **5** | **DARPA + ONR BAA Monitoring via SAM.gov** | BAAs are the canonical mid-stage signal between basic research and program acquisition. Filter SAM by organizationName=DARPA, ONR, AFRL, ARL with ptype=k. Requires existing SAM API key (GDA likely already has). |
| **6** | **DoD Contract Announcements RSS** — Daily $7.5M+ awards | The contract announcement is the terminal event — but reading it intelligently (who won? what program? what's the follow-on?) feeds a re-compete calendar. Free, RSS, daily. Zero marginal cost. |
| **7** | **arXiv API — Defense-adjacent category monitoring** | cs.AI, cs.RO, quant-ph, eess.SP daily digest filtered by abstract keywords matching OUSD(R&E) CTAs (autonomous, directed energy, quantum sensing, hypersonics). Free, no auth, same-day. Creates an 18–36 month horizon scan. |
| **8** | **GovInfo API — Congressional Hearings (CHRG) + NDAA Bills** | Armed Services Committee testimony and NDAA section text reveal congressional priorities before budget exhibits and before solicitations. Free, requires api.data.gov key (instant signup). |

### Day 1 Implementation Notes

**Authentication needed:**
- SAM.gov API key: Register at sam.gov → Account Details → API Information (instant for public key; entity registration for 1,000/day limit requires 10–15 business day wait — **start this now**)
- api.data.gov key: Instant signup at https://api.data.gov/signup/ — covers GovInfo, Congress.gov, NSF, and other participating agencies
- arXiv, SBIR.gov, NIH RePORTER, USAspending: No auth required

**n8n workflow design for Day 1 set:**
1. Daily SBIR.gov pull (agency=DOD, sorted by award date) → normalize → Postgres `fast_track_signals` table
2. SAM.gov daily pull (ptype=r,p, organizationName=DoD subtiers) → deduplicate against existing opportunities → Postgres `pre_solicitation_notices`
3. arXiv Atom feed poll (3x weekly) by categories + CTA keywords → AI summary → Postgres `research_signals`
4. USAspending weekly POST to `/spending_over_time/` by NAICS + DoD agency → trend delta calculation → Postgres `spending_trends`
5. DoD RSS + BreakingDefense RSS → daily → AI extraction of contractor + program → Postgres `award_intel`
6. GovInfo CHRG weekly → new hearing granules → AI keyword extraction → Postgres `legislative_signals`
7. SAM.gov BAA sweep (DARPA/ONR/AFRL) → weekly → Postgres `baa_signals`
8. NIH RePORTER + NSF Awards weekly → DOD-flagged grants → Postgres `research_grants`

**Postgres schema recommendation:** All Fast Track signals should carry:
- `signal_id`, `source_name`, `signal_date`, `title`, `summary`, `raw_url`, `lead_time_estimate_months`, `priority_score`, `topic_keywords[]`, `agency`, `linked_sam_notice_id` (nullable), `status` (new/tracked/matched/closed)

---

## Appendix: Authentication Checklist

| Credential | Where to Get | Time to Obtain | Who Needs It |
|---|---|---|---|
| SAM.gov Public API Key | sam.gov → Account → API Info | Instant | GDA n8n workflows |
| SAM.gov Entity Key (1,000/day) | SAM.gov Entity Registration | 10–15 business days | GDA n8n workflows |
| api.data.gov Key | https://api.data.gov/signup/ | Instant | GovInfo, Congress.gov, NSF |
| SBIR.gov | None required | N/A | N/A |
| NIH RePORTER | None required | N/A | N/A |
| arXiv | None required | N/A | N/A |
| USAspending | None required | N/A | N/A |
| NASA NTRS | None required | N/A | N/A |

---

## Sources Referenced

- NSF Awards API: https://www.research.gov/common/webapi/awardapisearch-v1.htm
- NIH RePORTER API v2: https://api.reporter.nih.gov
- DOE OSTI API: https://www.osti.gov/pages/api/v1/docs
- NASA NTRS Harvesting: https://sti.nasa.gov/harvesting-data-from-ntrs/
- SBIR.gov API: https://www.sbir.gov/api
- SBIR.gov Data Resources: https://www.sbir.gov/data-resources
- SAM.gov Opportunities API: https://open.gsa.gov/api/get-opportunities-public-api/
- SAM.gov API Guide: https://govconapi.com/sam-gov-api-complete-guide
- DARPA BAAs: https://www.darpa.mil/research/opportunities/baa
- ONR Funding Opportunities: https://www.onr.navy.mil/work-with-us/funding-opportunities/announcements
- AFWERX Phase III: https://afwerx.com/divisions/sbir-sttr/phase-iii/
- Army SBIR Phase III: https://armysbir.army.mil/phase/phase-iii/
- DIU Open Solicitations: https://www.diu.mil/work-with-us/open-solicitations
- OUSD(R&E) Critical Technology Areas: https://www.cto.mil/cta/
- DoD Budget Materials FY2026: https://comptroller.defense.gov/Budget-Materials/Budget2026/
- GovInfo Developer Hub: https://www.govinfo.gov/developers
- GovInfo GitHub API: https://github.com/usgpo/api
- Congress.gov API: https://www.loc.gov/apis/additional-apis/congress-dot-gov-api/
- CRS Reports (Congress.gov): https://blogs.loc.gov/law/2025/03/improved-public-access-to-crs-reports-on-congress-gov/
- USAspending API: https://api.usaspending.gov
- USAspending Endpoints: https://api.usaspending.gov/docs/endpoints
- Federal Register API: https://www.federalregister.gov/developers/documentation/api/v1
- GAO Reports: https://www.gao.gov/reports-testimonies
- DoD Contract Announcements: https://www.defense.gov/Newsroom/Contracts/
- DoD RSS Feeds: https://www.defense.gov/news/rss/
- BreakingDefense: https://breakingdefense.com
- arXiv API Manual: https://info.arxiv.org/help/api/user-manual.html
- DTIC Technical Reports: https://discover.dtic.mil/technical-reports/
- NIST CSRC: https://csrc.nist.gov/publications
- DoD Issuances Portal: https://www.esd.whs.mil/DD/DoD-Issuances/
- FPDS vs SAM Contract API: https://open.gsa.gov/api/contract-awards/v1/FPDSvsSAM-ContractDataAPI.pdf
- DoD 540co Budget Data (GitHub): https://github.com/540co/dod-president-budget-procurement-rdte-data
