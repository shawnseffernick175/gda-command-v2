// ---------------------------------------------------------------------------
// Teaming Worksheet Generator — pulls partner certs, vehicles, and PP
// from Partner Intel to draft a teaming rationale paragraph.
// ---------------------------------------------------------------------------

import type { Pool } from "pg";

export type OuTag = "envision" | "riverstone" | "pd_systems" | "gda_rollup" | "gda_corporate";

export interface TeamingWorksheet {
  partner_ou_tag: string;
  certs_claimed: string[];
  vehicles_listed: string[];
  pp_highlights: string[];
  rationale_paragraph: string;
}

interface PartnerProfile {
  ou_tag: string;
  certs: Array<{ name: string; status: string }>;
  vehicles: Array<{ name: string; contract_number: string | null }>;
  display_name?: string;
}

interface PartnerAward {
  customer: string | null;
  value: number | null;
  awarded_at: string | null;
}

export async function generateTeamingWorksheet(
  captureId: number,
  partnerOuTags: OuTag[],
  pool: Pool,
): Promise<TeamingWorksheet[]> {
  const worksheets: TeamingWorksheet[] = [];

  for (const ouTag of partnerOuTags) {
    const profileResult = await pool.query(
      `SELECT pip.ou_tag, pip.certs, pip.vehicles,
              our.display_name
       FROM partner_intel_profiles pip
       JOIN ou_registry our ON our.ou_tag = pip.ou_tag
       WHERE pip.ou_tag = $1`,
      [ouTag],
    );

    if (profileResult.rows.length === 0) {
      continue;
    }

    const profile: PartnerProfile = profileResult.rows[0];

    const activeCerts = (profile.certs || [])
      .filter((c: { name: string; status: string }) => c.status === "active")
      .map((c: { name: string }) => c.name);

    const vehicleList = (profile.vehicles || []).map(
      (v: { name: string; contract_number: string | null }) =>
        v.contract_number ? `${v.name} (${v.contract_number})` : v.name,
    );

    const awardsResult = await pool.query(
      `SELECT customer, value, awarded_at
       FROM partner_awards
       WHERE partner_ou_tag = $1
       ORDER BY awarded_at DESC
       LIMIT 3`,
      [ouTag],
    );

    const ppHighlights = awardsResult.rows.map((a: PartnerAward) => {
      const year = a.awarded_at
        ? new Date(a.awarded_at).getFullYear().toString()
        : "N/A";
      const val = a.value != null ? `$${Number(a.value).toLocaleString()}` : "$N/A";
      return `${a.customer || "Unknown"} — ${val} — ${year}`;
    });

    const displayName = profile.display_name || ouTag;
    const certStr = activeCerts.length > 0 ? activeCerts.join(", ") : "none listed";
    const vehicleStr = vehicleList.length > 0 ? vehicleList.join(", ") : "none listed";
    const ppStr = ppHighlights.length > 0 ? ppHighlights.join("; ") : "no recent awards";

    const rationale =
      `${displayName} brings ${certStr} certifications and access to ${vehicleStr} contract vehicles. ` +
      `Recent performance includes ${ppStr}. ` +
      `Envision proposes to leverage ${displayName} as a subcontractor to fulfill capability gap.`;

    const worksheet: TeamingWorksheet = {
      partner_ou_tag: ouTag,
      certs_claimed: activeCerts,
      vehicles_listed: vehicleList,
      pp_highlights: ppHighlights,
      rationale_paragraph: rationale,
    };

    worksheets.push(worksheet);
  }

  if (worksheets.length > 0) {
    await pool.query(
      `UPDATE captures SET teaming_worksheet = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(worksheets), captureId],
    );
  }

  return worksheets;
}
