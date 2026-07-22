"""Probability of Win scoring tool.

Reads the authoritative Pwin that backend-v3 computes and caches per
opportunity on analysis (R2), via the read-only DB role. The backend cache
stores a single 0–1 probability, not a feature-weighted model, so
feature_weights is left empty and confidence null rather than fabricated. The
score is sourced (R1) to the opportunity's origin URL.
"""

from __future__ import annotations

from src.config import BACKEND_V3_URL
from src.db import fetch_readonly
from src.tools.schemas import PwinResult, PwinScoreInput, PwinScoreOutput

_PWIN_SQL = """
SELECT
  ac.pwin::float8      AS pwin,
  ac.version           AS version,
  o.id::text           AS opp_pk,
  o.sam_notice_id      AS sam_notice_id,
  s.url                AS source_url
FROM opportunity_analysis_cache ac
JOIN opportunities o ON o.id = ac.opportunity_id
LEFT JOIN sources s ON s.id = o.source_id
WHERE (o.id::text = %(opp)s OR o.sam_notice_id = %(opp)s)
  AND o.deleted_at IS NULL
ORDER BY ac.generated_at DESC
LIMIT 1
"""


async def pwin_score(inp: PwinScoreInput) -> PwinScoreOutput:
    rows = await fetch_readonly(_PWIN_SQL, {"opp": inp.opp_id})
    if not rows:
        return PwinScoreOutput(
            warning=f"No cached analysis found for opportunity '{inp.opp_id}'.",
        )

    row = rows[0]
    pwin = row.get("pwin")
    if pwin is None:
        return PwinScoreOutput(
            warning=f"Opportunity '{inp.opp_id}' has been analyzed but has no Pwin value.",
        )

    source_url = row.get("source_url")
    if not source_url and row.get("sam_notice_id"):
        source_url = f"https://sam.gov/opp/{row['sam_notice_id']}/view"
    if not source_url:
        source_url = f"{BACKEND_V3_URL}/v3/opportunities/{row.get('opp_pk', '')}"

    return PwinScoreOutput(
        result=PwinResult(
            score=round(float(pwin) * 100),
            model_version=f"analysis-cache:{row.get('version', 'unknown')}",
            source_url=source_url,
        )
    )
