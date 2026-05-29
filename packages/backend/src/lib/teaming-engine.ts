import type { Pool } from "pg";
import { log } from "./logger";

export interface TeamingFlag {
  opportunity_id: number;
  suggested_partner: "riverstone" | "pd_systems";
  reason: string;
  detail: string;
}

const IC_KEYWORDS = [
  "NSA", "NRO", "NGA", "USCYBERCOM",
  "intelligence community", "classified", "SCIFs",
];

const TRAINING_KEYWORDS = [
  "training", "simulation", "immersive",
  "digital twin", "SERE", "battlefield effects",
  "live virtual constructive",
];

const TRAINING_ACRONYMS = ["XR", "VR", "AR", "LVC"];

function textContainsAny(text: string | null, keywords: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function textContainsAcronym(text: string | null, acronyms: string[]): boolean {
  if (!text) return false;
  return acronyms.some((acr) => {
    const re = new RegExp(`\\b${acr}\\b`, "i");
    return re.test(text);
  });
}

interface PartnerCert {
  name: string;
  status: string;
}

async function getPartnerCerts(
  pool: Pool,
  ouTag: string,
): Promise<PartnerCert[]> {
  const result = await pool.query(
    "SELECT certs FROM partner_intel_profiles WHERE ou_tag = $1",
    [ouTag],
  );
  if (result.rows.length === 0) return [];
  const certs = result.rows[0].certs;
  return Array.isArray(certs) ? certs : [];
}

function hasCert(certs: PartnerCert[], name: string): boolean {
  return certs.some(
    (c) =>
      c.name.toLowerCase() === name.toLowerCase() && c.status === "active",
  );
}

export async function evaluateTeamingFlags(
  opportunityId: number,
  pool: Pool,
): Promise<TeamingFlag[]> {
  const oppResult = await pool.query(
    "SELECT id, title, description, set_aside, naics, agency FROM opportunities WHERE id = $1",
    [opportunityId],
  );
  if (oppResult.rows.length === 0) return [];
  const opp = oppResult.rows[0];

  const flags: TeamingFlag[] = [];

  const [riverstoneCerts, pdCerts] = await Promise.all([
    getPartnerCerts(pool, "riverstone"),
    getPartnerCerts(pool, "pd_systems"),
  ]);

  // 1. HUBZone check
  if (
    opp.set_aside &&
    opp.set_aside.toLowerCase().includes("hubzone") &&
    hasCert(riverstoneCerts, "HUBZone")
  ) {
    flags.push({
      opportunity_id: opportunityId,
      suggested_partner: "riverstone",
      reason: "hubzone",
      detail:
        "This opp is HUBZone set-aside. Riverstone (HUBZone certified) unlocks the bid.",
    });
  }

  // 2. V3 Veteran check
  const setAsideLower = (opp.set_aside ?? "").toLowerCase();
  const descLower = (opp.description ?? "").toLowerCase();
  if (
    (setAsideLower.includes("v3") || descLower.includes("veteran")) &&
    hasCert(pdCerts, "V3 Veteran")
  ) {
    flags.push({
      opportunity_id: opportunityId,
      suggested_partner: "pd_systems",
      reason: "v3_veteran",
      detail:
        "This opp wants V3 Veteran preference. PD Systems (V3 Veteran) strengthens the bid.",
    });
  }

  // 3. IC clearance check
  if (
    textContainsAny(opp.title, IC_KEYWORDS) ||
    textContainsAny(opp.description, IC_KEYWORDS) ||
    textContainsAcronym(opp.title, ["IC"]) ||
    textContainsAcronym(opp.description, ["IC"])
  ) {
    flags.push({
      opportunity_id: opportunityId,
      suggested_partner: "riverstone",
      reason: "ic_clearance",
      detail:
        "Scope requires IC access or TechSIGINT. Riverstone (IC customer base, classified DevSecOps) is the natural sub.",
    });
  }

  // 4. Training depth check
  if (
    textContainsAny(opp.title, TRAINING_KEYWORDS) ||
    textContainsAny(opp.description, TRAINING_KEYWORDS) ||
    textContainsAcronym(opp.title, TRAINING_ACRONYMS) ||
    textContainsAcronym(opp.description, TRAINING_ACRONYMS)
  ) {
    flags.push({
      opportunity_id: opportunityId,
      suggested_partner: "pd_systems",
      reason: "training_depth",
      detail:
        "Scope includes immersive training or LVC integration. PD Systems (300+ heads, XR/AR/VR depth) is the natural sub.",
    });
  }

  // 5. De-confliction check
  const twentyFourMonthsAgo = new Date();
  twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
  const deconflictResult = await pool.query(
    `SELECT pa.partner_ou_tag, pa.contract_id, pa.awarded_at
     FROM partner_awards pa
     WHERE pa.awarded_at > $1
       AND ($2::text IS NULL OR pa.customer ILIKE '%' || $2 || '%')
     ORDER BY pa.awarded_at DESC
     LIMIT 5`,
    [twentyFourMonthsAgo.toISOString(), opp.agency],
  );

  for (const award of deconflictResult.rows) {
    const partner = award.partner_ou_tag as "riverstone" | "pd_systems";
    const partnerName =
      partner === "riverstone" ? "Riverstone" : "PD Systems";
    const awardDate = award.awarded_at
      ? new Date(award.awarded_at).toLocaleDateString("en-US")
      : "unknown date";
    flags.push({
      opportunity_id: opportunityId,
      suggested_partner: partner,
      reason: "de_confliction",
      detail: `${partnerName} won similar scope under ${award.contract_id ?? "unknown"} on ${awardDate}. Team or de-conflict?`,
    });
  }

  // Upsert: delete prior flags for this opportunity, insert fresh
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM teaming_flags WHERE opportunity_id = $1",
      [opportunityId],
    );
    for (const flag of flags) {
      await client.query(
        `INSERT INTO teaming_flags (opportunity_id, suggested_partner, reason, detail)
         VALUES ($1, $2, $3::teaming_flag_reason, $4)`,
        [
          flag.opportunity_id,
          flag.suggested_partner,
          flag.reason,
          flag.detail,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    log.error("teaming_flags_upsert_error", {
      error: String((err as Error).message),
    });
    throw err;
  } finally {
    client.release();
  }

  return flags;
}
