/**
 * FasTrac monitored-source catalog.
 *
 * FasTrac is an early-warning, pre-RFP signal-sensing surface. It monitors DoD
 * military innovation organizations that publish RFIs, CSOs, BAAs, and prize
 * challenges BEFORE a formal SAM.gov solicitation posts. This catalog is the
 * authoritative list of WHAT is monitored and at what cadence — it is
 * configuration (the watch list), not signal data. Live signals sensed from
 * these sources are read from the backend (fast_track_signals).
 *
 * Tiers come from fastrac_spec.md / the DoD innovation-org research file:
 *   Tier 1 — highest signal, monitored weekly (broad industry engagement,
 *            primary CSO/SBIR/OTA vehicles)
 *   Tier 2 — secondary, monitored monthly (narrower / occasional signals)
 */

export type SourceTier = "tier1" | "tier2";

export interface MonitoredSource {
  /** Display name. */
  name: string;
  /** Public homepage / opportunities URL, when one exists. */
  url: string | null;
  /** Primary funding / solicitation mechanisms this org publishes through. */
  mechanism: string;
}

export interface SourceGroup {
  /** Group heading (military branch / category). */
  label: string;
  sources: MonitoredSource[];
}

export interface SourceTierConfig {
  tier: SourceTier;
  label: string;
  cadence: string;
  description: string;
  groups: SourceGroup[];
}

export const MONITORED_SOURCES: SourceTierConfig[] = [
  {
    tier: "tier1",
    label: "Tier 1 — Monitored Weekly",
    cadence: "Weekly",
    description:
      "Highest-signal innovation organizations with broad industry engagement and primary CSO / SBIR / OTA vehicles. These publish RFIs, CSOs, BAAs, and prize challenges that lead formal SAM.gov solicitations.",
    groups: [
      {
        label: "Air & Space Force",
        sources: [
          { name: "AFWERX", url: "https://afwerx.com", mechanism: "SBIR / TACFI / STRATFI" },
          { name: "SpaceWERX", url: "https://spacewerx.us", mechanism: "SBIR / TACFI / STRATFI" },
        ],
      },
      {
        label: "Army",
        sources: [
          { name: "Army Applications Lab (AAL)", url: "https://aal.mil", mechanism: "SBIR / OTA" },
          { name: "xTech", url: "https://xtech.army.mil", mechanism: "Prize Challenge" },
          { name: "Army Futures Command (AFC)", url: "https://armyfuturescommand.com", mechanism: "BAA / OTA" },
          { name: "AI2C", url: null, mechanism: "BAA" },
          { name: "DEVCOM ARL", url: "https://arl.devcom.army.mil", mechanism: "BAA" },
          { name: "DEVCOM AvMC", url: null, mechanism: "BAA" },
          { name: "DEVCOM CBC", url: null, mechanism: "BAA" },
          { name: "PEO IEW&S", url: null, mechanism: "BAA" },
        ],
      },
      {
        label: "Navy & Marine Corps",
        sources: [
          { name: "NavalX", url: "https://www.secnav.navy.mil/agility", mechanism: "CSO / OTA" },
          { name: "NSWC Crane", url: null, mechanism: "BAA / CSO / OT Agreement" },
          { name: "Naval Research Lab (NRL)", url: "https://www.nrl.navy.mil", mechanism: "BAA" },
          { name: "ONR", url: "https://www.onr.navy.mil", mechanism: "BAA" },
          { name: "NAWCWD China Lake", url: null, mechanism: "BAA / OTA" },
        ],
      },
      {
        label: "SOF & Joint Agencies",
        sources: [
          { name: "SOFWERX", url: "https://sofwerx.org", mechanism: "SBIR / OT Agreement" },
          { name: "DIU", url: "https://www.diu.mil/work-with-us/open-solicitations", mechanism: "CSO" },
          { name: "DARPA", url: "https://www.darpa.mil/work-with-us/opportunities", mechanism: "BAA" },
          { name: "IARPA", url: "https://www.iarpa.gov/research-programs", mechanism: "BAA" },
          {
            name: "MIT Lincoln Laboratory",
            url: "https://www.ll.mit.edu/partner-us/small-business-industry/commercial-solutions-opening",
            mechanism: "CSO",
          },
        ],
      },
    ],
  },
  {
    tier: "tier2",
    label: "Tier 2 — Monitored Monthly",
    cadence: "Monthly",
    description:
      "Secondary sources with narrower scope or less frequent signals: service innovation units, combatant-command innovation arms, and FFRDCs / UARCs.",
    groups: [
      {
        label: "Service Innovation Units",
        sources: [
          { name: "75th Innovation Command", url: null, mechanism: "Innovation challenge" },
          { name: "XVIII Airborne Corps (Dragon's Lair)", url: "https://home.army.mil/bragg", mechanism: "Innovation challenge" },
          { name: "Marine Innovation Unit", url: null, mechanism: "Innovation challenge" },
          { name: "MARFORCOM", url: null, mechanism: "Innovation challenge" },
          { name: "Army Software Factory", url: null, mechanism: "Software pipeline" },
          { name: "USCG R&D Center (RDC)", url: null, mechanism: "BAA" },
          { name: "JIDO", url: null, mechanism: "BAA / OTA" },
        ],
      },
      {
        label: "Combatant Command Innovation Arms",
        sources: [
          { name: "INDOPACOM JMAD", url: null, mechanism: "RFI / challenge" },
          { name: "EUCOM BRAVO", url: null, mechanism: "RFI / challenge" },
          { name: "USCYBERCOM CIL", url: null, mechanism: "RFI / challenge" },
          { name: "USSTRATCOM GISC", url: null, mechanism: "RFI / challenge" },
          { name: "USTRANSCOM J9", url: null, mechanism: "RFI / challenge" },
          { name: "AFRICOM WIC", url: null, mechanism: "RFI / challenge" },
          { name: "NORTHCOM", url: null, mechanism: "RFI / challenge" },
        ],
      },
      {
        label: "FFRDCs & UARCs",
        sources: [
          { name: "JHU APL", url: "https://www.jhuapl.edu", mechanism: "Subcontract / CSO" },
          { name: "MITRE", url: "https://www.mitre.org", mechanism: "Subcontract" },
          { name: "IDA", url: "https://www.ida.org", mechanism: "Subcontract" },
          { name: "CMU SEI", url: "https://www.sei.cmu.edu", mechanism: "Subcontract" },
          { name: "GTRI", url: "https://gtri.gatech.edu", mechanism: "Subcontract" },
          { name: "Sandia National Labs", url: "https://www.sandia.gov", mechanism: "Subcontract / CRADA" },
          { name: "LANL", url: "https://www.lanl.gov", mechanism: "Subcontract / CRADA" },
          { name: "INL", url: "https://inl.gov", mechanism: "Subcontract / CRADA" },
          { name: "RAND PAF", url: "https://www.rand.org/paf.html", mechanism: "Subcontract" },
          { name: "Aerospace Corp", url: "https://aerospace.org", mechanism: "Subcontract" },
        ],
      },
    ],
  },
];

export const TOTAL_MONITORED_SOURCES = MONITORED_SOURCES.reduce(
  (sum, t) => sum + t.groups.reduce((g, grp) => g + grp.sources.length, 0),
  0,
);
