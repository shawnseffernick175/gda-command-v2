/**
 * Briefing email delivery — sends the daily brief as a formatted email.
 * Only fires if SMTP_HOST is configured; otherwise logs a skip.
 */

import nodemailer from 'nodemailer';
import { logger } from '../../lib/logger.js';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT ?? '587');
const smtpUser = process.env.SMTP_USER ?? '';
const smtpPass = process.env.SMTP_PASS ?? '';
const smtpFrom = process.env.SMTP_FROM ?? 'briefing@gda-command.local';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface BriefingEmailData {
  headline: string;
  priority_actions: Array<{ action: string; urgency: string; related_entity?: string }>;
  risk_flags: string[];
  market_intel_summary: string;
  cert_expiration_warnings: string[];
  generated_at: string;
}

function buildHtml(data: BriefingEmailData, dateLabel: string): string {
  const actionsHtml = data.priority_actions.length > 0
    ? `<h2 style="margin-top:24px;font-size:14px;font-weight:bold">PRIORITY ACTIONS</h2>
       <ul style="padding-left:20px;font-size:13px">
         ${data.priority_actions.map((a) => {
           const tag = a.urgency === 'immediate' ? '<b>[IMMEDIATE]</b>'
             : a.urgency === 'today' ? '[TODAY]' : '[THIS WEEK]';
           const entity = a.related_entity ? `<br/><span style="color:#888;font-size:12px">${escapeHtml(a.related_entity)}</span>` : '';
           return `<li>${tag} ${escapeHtml(a.action)}${entity}</li>`;
         }).join('')}
       </ul>`
    : '';

  const risksHtml = data.risk_flags.length > 0
    ? `<h2 style="margin-top:24px;font-size:14px;font-weight:bold;color:#c53030">RISK FLAGS</h2>
       <ul style="padding-left:20px;font-size:13px">
         ${data.risk_flags.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
       </ul>`
    : '';

  const intelHtml = data.market_intel_summary
    ? `<h2 style="margin-top:24px;font-size:14px;font-weight:bold">MARKET INTELLIGENCE</h2>
       <p style="font-size:13px;white-space:pre-wrap">${escapeHtml(data.market_intel_summary)}</p>`
    : '';

  const certsHtml = data.cert_expiration_warnings.length > 0
    ? `<h2 style="margin-top:24px;font-size:14px;font-weight:bold;color:#d69e2e">CERTIFICATION WARNINGS</h2>
       <ul style="padding-left:20px;font-size:13px">
         ${data.cert_expiration_warnings.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}
       </ul>`
    : '';

  return `
    <div style="max-width:640px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">
      <h1 style="text-align:center;font-size:18px;margin-bottom:4px">DAILY INTELLIGENCE BRIEF</h1>
      <p style="text-align:center;font-size:12px;color:#888">${dateLabel}</p>
      <p style="text-align:center;font-size:16px;font-weight:bold;margin-top:8px">${escapeHtml(data.headline)}</p>
      ${actionsHtml}
      ${risksHtml}
      ${intelHtml}
      ${certsHtml}
      <hr style="margin-top:32px;border:none;border-top:1px solid #eee"/>
      <p style="font-size:10px;color:#999;text-align:center">
        Generated ${new Date(data.generated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
      </p>
    </div>
  `;
}

export async function sendBriefingEmail(
  to: string,
  data: BriefingEmailData,
): Promise<void> {
  if (!smtpHost) {
    logger.info({ to }, '[briefing-email] SMTP not configured — skipping send');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/New_York',
  });

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: `Daily Intelligence Brief — ${dateLabel}`,
    html: buildHtml(data, dateLabel),
  });

  logger.info({ to }, '[briefing-email] sent');
}
