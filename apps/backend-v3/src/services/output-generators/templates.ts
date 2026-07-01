/**
 * F-313: Output Generators — HTML templates for PDF generation
 *
 * Templates use Hydra Teal (#01696F) + Inter font per aesthetics canonical.
 * Citations are clickable footnotes with full URLs (R1 compliance).
 */

import type {
  BriefingData,
  CapturePlanData,
  WinThemeData,
  Citation,
  DoctrineRef,
} from './types.js';

const HYDRA_TEAL = '#01696F';
const INK = '#28251D';
const MUTED = '#7A7974';
const BORDER = '#D4D1CA';
const BG = '#F7F6F2';
const CRITICAL = '#A12C7B';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(value: number | null): string {
  if (value === null || value === undefined) return 'N/A';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  } catch {
    return dateStr;
  }
}

function renderCitationFootnotes(citations: Citation[]): string {
  if (citations.length === 0) return '';
  const items = citations
    .map(
      (c) =>
        `<li id="fn-${c.index}" style="font-size:11px;color:${MUTED};margin:2px 0;">` +
        `<a href="${escapeHtml(c.url)}" style="color:${HYDRA_TEAL};text-decoration:underline;">${escapeHtml(c.source)}</a>` +
        ` <span style="color:${MUTED};">(retrieved ${formatDate(c.retrieved_at)})</span></li>`,
    )
    .join('\n');
  return `<ol style="padding-left:20px;margin-top:4px;">${items}</ol>`;
}

function renderDoctrineRefs(refs: DoctrineRef[]): string {
  if (refs.length === 0) return '';
  const items = refs
    .map(
      (r) =>
        `<span style="display:inline-block;background:${HYDRA_TEAL}15;color:${HYDRA_TEAL};padding:2px 8px;border-radius:3px;font-size:11px;font-style:italic;margin:2px 4px 2px 0;">${escapeHtml(r.principle)}</span>`,
    )
    .join('');
  return `<div style="margin-top:8px;">${items}</div>`;
}

function baseStyle(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    body {
      font-family: Inter, system-ui, sans-serif;
      color: ${INK};
      background: #FFFFFF;
      margin: 0;
      padding: 32px;
      max-width: 900px;
      margin: 0 auto;
      font-size: 15px;
      line-height: 24px;
    }
    h1 { color: ${HYDRA_TEAL}; font-size: 20px; line-height: 28px; font-weight: 600; margin: 0 0 8px 0; }
    h2 { color: ${HYDRA_TEAL}; font-size: 16px; line-height: 24px; font-weight: 600; margin: 24px 0 8px 0; }
    h3 { color: ${INK}; font-size: 15px; font-weight: 600; margin: 16px 0 4px 0; }
    .meta { color: ${MUTED}; font-size: 12px; line-height: 16px; margin-bottom: 16px; }
    .section { border: 1px solid ${BORDER}; border-radius: 4px; padding: 20px; margin-top: 16px; }
    .section-accent { border-left: 4px solid ${HYDRA_TEAL}; }
    .kv { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; border-bottom: 1px solid ${BG}; }
    .kv-label { color: ${MUTED}; }
    .kv-value { font-variant-numeric: tabular-nums; }
    .badge { display: inline-block; background: ${HYDRA_TEAL}15; color: ${HYDRA_TEAL}; padding: 2px 8px; border-radius: 3px; font-size: 11px; }
    .badge-critical { background: ${CRITICAL}15; color: ${CRITICAL}; }
    .risk-item { border-left: 3px solid ${CRITICAL}; padding: 4px 12px; margin: 4px 0; font-size: 13px; background: ${BG}; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid ${BORDER}; color: ${MUTED}; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 6px 8px; color: ${MUTED}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; border-bottom: 1px solid ${BORDER}; }
    td { padding: 6px 8px; border-bottom: 1px solid ${BG}; }
    sup a { color: ${HYDRA_TEAL}; text-decoration: none; font-size: 10px; }
    a { color: ${HYDRA_TEAL}; }
  `;
}

export function generateBriefingHtml(data: BriefingData): string {
  const citationRefs = data.analysis_sections
    .flatMap((s) => s.citations)
    .filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i);

  let citationIdx = 0;
  const allCitations: Citation[] = citationRefs.map((c) => ({
    ...c,
    index: ++citationIdx,
  }));

  const valueDisplay =
    data.value_max && data.value_min
      ? `${formatMoney(data.value_min)} – ${formatMoney(data.value_max)}`
      : formatMoney(data.value_max ?? data.value_min);

  let sectionsHtml = '';
  for (const section of data.analysis_sections) {
    const sectionCites = section.citations
      .map((c) => {
        const idx = allCitations.find((ac) => ac.url === c.url)?.index ?? 0;
        return `<sup><a href="#fn-${idx}">[${idx}]</a></sup>`;
      })
      .join(' ');
    sectionsHtml += `
      <div class="section section-accent">
        <h3>${escapeHtml(section.heading)}</h3>
        <p style="font-size:13px;">${escapeHtml(section.content)} ${sectionCites}</p>
      </div>`;
  }

  const risksHtml =
    data.risks.length > 0
      ? data.risks.map((r) => `<div class="risk-item">${escapeHtml(r)}</div>`).join('')
      : '<p style="font-size:13px;color:' + MUTED + ';">No key risks identified.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><style>${baseStyle()}</style><title>Opportunity Briefing — ${escapeHtml(data.title)}</title></head>
<body>
<h1>Opportunity Briefing</h1>
<div class="meta">
  Generated ${formatDate(new Date().toISOString())} | Georgetown Defense Analytics — Envision LLC
</div>

<div class="section">
  <h2 style="margin-top:0;">Executive Summary</h2>
  <div class="kv"><span class="kv-label">Title</span><span class="kv-value">${escapeHtml(data.title)}</span></div>
  <div class="kv"><span class="kv-label">Agency</span><span class="kv-value">${escapeHtml(data.agency ?? 'N/A')}</span></div>
  <div class="kv"><span class="kv-label">Department</span><span class="kv-value">${escapeHtml(data.department ?? 'N/A')}</span></div>
  <div class="kv"><span class="kv-label">NAICS</span><span class="kv-value" style="font-family:monospace;">${escapeHtml(data.naics ?? 'N/A')}</span></div>
  <div class="kv"><span class="kv-label">Set-Aside</span><span class="kv-value">${escapeHtml(data.set_aside ?? 'None')}</span></div>
  <div class="kv"><span class="kv-label">Estimated Value</span><span class="kv-value" style="font-family:monospace;">${valueDisplay}</span></div>
  <div class="kv"><span class="kv-label">Solicitation</span><span class="kv-value" style="font-family:monospace;">${escapeHtml(data.solicitation_number ?? 'N/A')}</span></div>
  <div class="kv"><span class="kv-label">Response Due</span><span class="kv-value">${formatDate(data.response_due_at)}</span></div>
  <div class="kv"><span class="kv-label">Posted</span><span class="kv-value">${formatDate(data.posted_at)}</span></div>
  <div class="kv"><span class="kv-label">Place of Performance</span><span class="kv-value">${escapeHtml(data.place_of_performance ?? 'N/A')}</span></div>
  <div class="kv"><span class="kv-label">PWin</span><span class="kv-value" style="font-family:monospace;font-weight:600;color:${HYDRA_TEAL};">${data.pwin != null ? `${data.pwin}%` : 'N/A'}</span></div>
  ${data.source_uri ? `<div class="kv"><span class="kv-label">Source</span><span class="kv-value"><a href="${escapeHtml(data.source_uri)}">${escapeHtml(data.source_uri)}</a></span></div>` : ''}
</div>

<h2>Doctrine Alignment</h2>
${renderDoctrineRefs(data.doctrine_alignment)}
${data.doctrine_alignment.length > 0 ? data.doctrine_alignment.map((d) => `<p style="font-size:13px;margin:4px 0;"><strong>${escapeHtml(d.principle)}:</strong> ${escapeHtml(d.relevance)}</p>`).join('') : '<p style="font-size:13px;color:' + MUTED + ';">No doctrine alignment data available.</p>'}

<h2>Analysis</h2>
${sectionsHtml || '<p style="font-size:13px;color:' + MUTED + ';">No cached analysis available.</p>'}

<h2>Key Risks</h2>
${risksHtml}

${data.recommended_action ? `<div class="section section-accent"><h3>Recommended Action</h3><p style="font-size:13px;">${escapeHtml(data.recommended_action)}</p></div>` : ''}

${allCitations.length > 0 ? `<h2>Sources</h2>${renderCitationFootnotes(allCitations)}` : ''}

<div class="footer">
  Generated by GDA Command — Output Generators (F-313) | Envision Innovative Solutions
</div>
</body>
</html>`;
}

export function generateCapturePlanHtml(data: CapturePlanData): string {
  const citationRefs = data.analysis_sections
    .flatMap((s) => s.citations)
    .filter((c, i, arr) => arr.findIndex((x) => x.url === c.url) === i);
  let citationIdx = 0;
  const allCitations: Citation[] = citationRefs.map((c) => ({
    ...c,
    index: ++citationIdx,
  }));

  let analysisHtml = '';
  for (const section of data.analysis_sections) {
    const sectionCites = section.citations
      .map((c) => {
        const idx = allCitations.find((ac) => ac.url === c.url)?.index ?? 0;
        return `<sup><a href="#fn-${idx}">[${idx}]</a></sup>`;
      })
      .join(' ');
    analysisHtml += `
      <div class="section section-accent">
        <h3>${escapeHtml(section.heading)}</h3>
        <p style="font-size:13px;">${escapeHtml(section.content)} ${sectionCites}</p>
      </div>`;
  }

  const competitorsHtml =
    data.competitors.length > 0
      ? `<table>
          <thead><tr><th>Competitor</th><th>Strengths</th><th>Weaknesses</th></tr></thead>
          <tbody>${data.competitors
            .map(
              (c) =>
                `<tr><td style="font-weight:500;">${escapeHtml(c.name)}</td><td>${c.strengths.map((s) => escapeHtml(s)).join('; ')}</td><td>${c.weaknesses.map((w) => escapeHtml(w)).join('; ')}</td></tr>`,
            )
            .join('')}</tbody>
        </table>`
      : `<p style="font-size:13px;color:${MUTED};">No competitor data available.</p>`;

  const winThemesHtml =
    data.win_themes.length > 0
      ? `<ul style="padding-left:20px;">${data.win_themes.map((t) => `<li style="font-size:13px;margin:4px 0;">${escapeHtml(t)}</li>`).join('')}</ul>`
      : `<p style="font-size:13px;color:${MUTED};">No win themes documented.</p>`;

  const risksHtml =
    data.risks.length > 0
      ? data.risks.map((r) => `<div class="risk-item">${escapeHtml(r)}</div>`).join('')
      : `<p style="font-size:13px;color:${MUTED};">No risks identified.</p>`;

  const teamingHtml =
    data.teaming_partners.length > 0
      ? `<ul style="padding-left:20px;">${data.teaming_partners.map((p) => `<li style="font-size:13px;">${escapeHtml(p)}</li>`).join('')}</ul>`
      : `<p style="font-size:13px;color:${MUTED};">No teaming partners identified.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><style>${baseStyle()}</style><title>Capture Plan — ${escapeHtml(data.title)}</title></head>
<body>
<h1>Capture Plan</h1>
<div class="meta">
  Generated ${formatDate(new Date().toISOString())} | Georgetown Defense Analytics — Envision LLC
</div>

<div class="section">
  <h2 style="margin-top:0;">Pursuit Overview</h2>
  <div class="kv"><span class="kv-label">Program</span><span class="kv-value">${escapeHtml(data.title)}</span></div>
  <div class="kv"><span class="kv-label">Agency</span><span class="kv-value">${escapeHtml(data.agency ?? 'N/A')}</span></div>
  <div class="kv"><span class="kv-label">Value</span><span class="kv-value" style="font-family:monospace;">${formatMoney(data.value)}</span></div>
  <div class="kv"><span class="kv-label">Stage</span><span class="kv-value">${escapeHtml(data.stage)}</span></div>
  <div class="kv"><span class="kv-label">PWin</span><span class="kv-value" style="font-family:monospace;font-weight:600;color:${HYDRA_TEAL};">${data.pwin != null ? `${data.pwin}%` : 'N/A'}</span></div>
  ${data.incumbent ? `<div class="kv"><span class="kv-label">Incumbent</span><span class="kv-value">${escapeHtml(data.incumbent)}</span></div>` : ''}
</div>

<h2>Agency Intelligence</h2>
${analysisHtml || `<p style="font-size:13px;color:${MUTED};">No agency analysis cached.</p>`}

<h2>Win Strategy</h2>
<div class="section section-accent">
  ${data.win_strategy ? `<p style="font-size:13px;">${escapeHtml(data.win_strategy)}</p>` : `<p style="font-size:13px;color:${MUTED};">No win strategy documented.</p>`}
  ${data.discriminators.length > 0 ? `<div style="margin-top:8px;">${data.discriminators.map((d) => `<span class="badge" style="margin:2px 4px 2px 0;">${escapeHtml(d)}</span>`).join('')}</div>` : ''}
</div>

<h2>Competitive Landscape</h2>
${competitorsHtml}

<h2>Win Themes</h2>
${winThemesHtml}

<h2>Teaming Strategy</h2>
${teamingHtml}

<h2>Schedule & Milestones</h2>
${data.schedule_milestones.length > 0 ? `<ol style="padding-left:20px;font-size:13px;">${data.schedule_milestones.map((m) => `<li style="margin:4px 0;">${escapeHtml(m)}</li>`).join('')}</ol>` : `<p style="font-size:13px;color:${MUTED};">No milestones defined.</p>`}

<h2>Risks</h2>
${risksHtml}

<h2>Decision Factors</h2>
${data.decision_factors.length > 0 ? `<ul style="padding-left:20px;">${data.decision_factors.map((f) => `<li style="font-size:13px;margin:4px 0;">${escapeHtml(f)}</li>`).join('')}</ul>` : `<p style="font-size:13px;color:${MUTED};">No decision factors recorded.</p>`}

<h2>Doctrine Alignment</h2>
${renderDoctrineRefs(data.doctrine_alignment)}
${data.doctrine_alignment.length > 0 ? data.doctrine_alignment.map((d) => `<p style="font-size:13px;margin:4px 0;"><strong>${escapeHtml(d.principle)}:</strong> ${escapeHtml(d.relevance)}</p>`).join('') : `<p style="font-size:13px;color:${MUTED};">No doctrine alignment data.</p>`}

${allCitations.length > 0 ? `<h2>Sources</h2>${renderCitationFootnotes(allCitations)}` : ''}

<div class="footer">
  Generated by GDA Command — Output Generators (F-313) | Envision Innovative Solutions
</div>
</body>
</html>`;
}

export function generateWinThemesHtml(data: WinThemeData): string {
  const allCitations: Citation[] = [];

  const themesHtml = data.themes
    .map((theme, idx) => {
      const evidenceHtml = theme.evidence.length > 0
        ? theme.evidence
            .map((e) => `<li style="font-size:12px;margin:2px 0;">${escapeHtml(e)}</li>`)
            .join('')
        : '';

      const draftLabel = !theme.has_evidence
        ? `<span class="badge badge-critical" style="margin-left:8px;">draft — needs evidence</span>`
        : '';

      const doctrineTag = theme.doctrine_principle
        ? `<span class="badge" style="font-style:italic;margin-left:4px;">${escapeHtml(theme.doctrine_principle)}</span>`
        : `<span class="badge badge-critical" style="font-style:italic;margin-left:4px;">needs doctrine alignment review</span>`;

      return `
        <div class="section section-accent">
          <h3>Theme ${idx + 1}: ${escapeHtml(theme.theme_title)} ${draftLabel}</h3>
          <p style="font-size:13px;">${escapeHtml(theme.narrative)}</p>
          ${doctrineTag}
          ${evidenceHtml ? `<h3 style="font-size:12px;margin-top:12px;">Supporting Evidence</h3><ul style="padding-left:20px;">${evidenceHtml}</ul>` : '<p style="font-size:12px;color:' + MUTED + ';margin-top:8px;">No evidence cited. This theme requires past performance documentation.</p>'}
        </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><style>${baseStyle()}</style><title>Win Themes — ${escapeHtml(data.title)}</title></head>
<body>
<h1>Win Theme Deck</h1>
<div class="meta">
  Generated ${formatDate(new Date().toISOString())} | Georgetown Defense Analytics — Envision LLC
</div>

<div class="section">
  <div class="kv"><span class="kv-label">Program</span><span class="kv-value">${escapeHtml(data.title)}</span></div>
  <div class="kv"><span class="kv-label">Agency</span><span class="kv-value">${escapeHtml(data.agency ?? 'N/A')}</span></div>
  <div class="kv"><span class="kv-label">Themes</span><span class="kv-value" style="font-family:monospace;">${data.themes.length}</span></div>
</div>

${themesHtml || `<p style="font-size:13px;color:${MUTED};">No win themes defined for this capture.</p>`}

<h2>Doctrine Alignment</h2>
${renderDoctrineRefs(data.doctrine_alignment)}

${allCitations.length > 0 ? `<h2>Sources</h2>${renderCitationFootnotes(allCitations)}` : ''}

<div class="footer">
  Generated by GDA Command — Output Generators (F-313) | Envision Innovative Solutions
</div>
</body>
</html>`;
}
