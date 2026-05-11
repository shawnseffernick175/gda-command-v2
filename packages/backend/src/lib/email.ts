// ---------------------------------------------------------------------------
// Email Service — SMTP-based email delivery via nodemailer
// Supports transactional notifications and digest emails.
// Falls back gracefully when SMTP is not configured.
// ---------------------------------------------------------------------------

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { getPool } from "./db";
import { log } from "./logger";

// ---------------------------------------------------------------------------
// SMTP Configuration
// ---------------------------------------------------------------------------

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function getSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return {
    host,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user,
    pass,
    from: process.env.SMTP_FROM || `GDA Command <${user}>`,
  };
}

export function isEmailConfigured(): boolean {
  return getSmtpConfig() !== null;
}

// ---------------------------------------------------------------------------
// Transporter (singleton)
// ---------------------------------------------------------------------------

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const cfg = getSmtpConfig();
  if (!cfg) return null;

  _transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  return _transporter;
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

type TemplateId =
  | "approval_required"
  | "approval_resolved"
  | "deadline_approaching"
  | "anomaly_detected"
  | "daily_digest"
  | "weekly_digest"
  | "welcome"
  | "generic";

interface TemplateData {
  [key: string]: string | number | boolean | undefined | TemplateData[] | TemplateData;
}

function renderTemplate(
  templateId: TemplateId,
  data: TemplateData,
): { subject: string; html: string } {
  const appUrl = process.env.APP_URL || "https://gda.csr-llc.tech";

  const header = `
    <div style="background:#1e293b;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h1 style="color:#fff;margin:0;font-size:18px;font-family:system-ui,sans-serif;">
        ⚡ GDA Command
      </h1>
    </div>`;

  const footer = `
    <div style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;font-family:system-ui,sans-serif;">
      <p style="margin:4px 0;">You received this because email notifications are enabled in your
        <a href="${appUrl}/settings" style="color:#3b82f6;">GDA Command settings</a>.</p>
    </div>`;

  const wrap = (body: string, subject: string) => ({
    subject,
    html: `<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;font-family:system-ui,sans-serif;">
      ${header}
      <div style="padding:24px;">${body}</div>
      ${footer}
    </div>`,
  });

  switch (templateId) {
    case "approval_required":
      return wrap(
        `<h2 style="color:#1e293b;margin:0 0 12px;">Approval Required</h2>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           <strong>${data.title}</strong> needs your review.
         </p>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           Type: ${data.type}<br/>
           Priority: <span style="color:${data.priority === "critical" ? "#ef4444" : "#f59e0b"};font-weight:600;">${data.priority}</span>
         </p>
         <a href="${appUrl}/approvals" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
           Review Now
         </a>`,
        `[GDA] Approval Required: ${data.title}`,
      );

    case "approval_resolved":
      return wrap(
        `<h2 style="color:#1e293b;margin:0 0 12px;">Approval ${data.decision === "approved" ? "Approved" : "Rejected"}</h2>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           <strong>${data.title}</strong> was <span style="color:${data.decision === "approved" ? "#22c55e" : "#ef4444"};font-weight:600;">${data.decision}</span>.
         </p>
         ${data.notes ? `<p style="color:#475569;line-height:1.6;margin:0 0 16px;">Notes: ${data.notes}</p>` : ""}`,
        `[GDA] Approval ${data.decision === "approved" ? "Approved" : "Rejected"}: ${data.title}`,
      );

    case "deadline_approaching":
      return wrap(
        `<h2 style="color:#f59e0b;margin:0 0 12px;">⏰ Deadline Approaching</h2>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           <strong>${data.title}</strong> is due in <strong>${data.days_remaining} day(s)</strong>.
         </p>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           Due date: ${data.due_date}
         </p>
         <a href="${appUrl}${data.link || "/pipeline"}" style="display:inline-block;background:#f59e0b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
           View Details
         </a>`,
        `[GDA] Deadline in ${data.days_remaining} days: ${data.title}`,
      );

    case "anomaly_detected":
      return wrap(
        `<h2 style="color:#ef4444;margin:0 0 12px;">⚠ Anomaly Detected</h2>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           <strong>${data.title}</strong>
         </p>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           Severity: <span style="color:#ef4444;font-weight:600;">${data.severity}</span><br/>
           ${data.description}
         </p>
         <a href="${appUrl}/anomalies" style="display:inline-block;background:#ef4444;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
           Investigate
         </a>`,
        `[GDA] Anomaly: ${data.title}`,
      );

    case "daily_digest":
    case "weekly_digest": {
      const period = templateId === "daily_digest" ? "Daily" : "Weekly";
      const items = (data.items as TemplateData[] | undefined) ?? [];
      const itemsHtml = items
        .map(
          (item) =>
            `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${item.icon || "📌"}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#1e293b;">${item.title}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;">${item.detail || ""}</td>
            </tr>`,
        )
        .join("");

      return wrap(
        `<h2 style="color:#1e293b;margin:0 0 12px;">${period} Digest</h2>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           Here's your ${period.toLowerCase()} summary from GDA Command.
         </p>
         ${data.summary ? `<p style="color:#475569;line-height:1.6;margin:0 0 16px;">${data.summary}</p>` : ""}
         ${items.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemsHtml}</table>` : ""}
         <a href="${appUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
           Open GDA Command
         </a>`,
        `[GDA] ${period} Digest — ${data.date || new Date().toLocaleDateString()}`,
      );
    }

    case "welcome":
      return wrap(
        `<h2 style="color:#1e293b;margin:0 0 12px;">Welcome to GDA Command!</h2>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           Hi <strong>${data.display_name}</strong>, your account has been created.
         </p>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">
           You can configure your email notification preferences in Settings.
         </p>
         <a href="${appUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
           Get Started
         </a>`,
        `[GDA] Welcome to GDA Command`,
      );

    default:
      return wrap(
        `<h2 style="color:#1e293b;margin:0 0 12px;">${data.title || "Notification"}</h2>
         <p style="color:#475569;line-height:1.6;margin:0 0 16px;">${data.message || ""}</p>
         ${data.link ? `<a href="${appUrl}${data.link}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View</a>` : ""}`,
        `[GDA] ${data.title || "Notification"}`,
      );
  }
}

// ---------------------------------------------------------------------------
// Send Email
// ---------------------------------------------------------------------------

export async function sendEmail(
  to: string,
  templateId: TemplateId,
  data: TemplateData,
  opts?: { userId?: string; notificationId?: string },
): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter();
  const cfg = getSmtpConfig();

  if (!transporter || !cfg) {
    log.warn("email_not_configured", { template: templateId, to });
    return { success: false, error: "SMTP not configured" };
  }

  const { subject, html } = renderTemplate(templateId, data);

  try {
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
    });

    // Log delivery
    const pool = getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO email_log (user_id, recipient_email, subject, template, status, notification_id)
         VALUES ($1, $2, $3, $4, 'sent', $5)`,
        [opts?.userId ?? null, to, subject, templateId, opts?.notificationId ?? null],
      ).catch(() => {});
    }

    log.info("email_sent", { template: templateId, to, subject });
    return { success: true };
  } catch (e) {
    const errMsg = (e as Error).message;

    // Log failure
    const pool = getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO email_log (user_id, recipient_email, subject, template, status, error_message, notification_id)
         VALUES ($1, $2, $3, $4, 'failed', $5, $6)`,
        [opts?.userId ?? null, to, subject, templateId, errMsg, opts?.notificationId ?? null],
      ).catch(() => {});
    }

    log.error("email_send_failed", { template: templateId, to, error: errMsg });
    return { success: false, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// Notify — create in-app notification + optionally send email
// ---------------------------------------------------------------------------

interface NotifyOpts {
  userId?: string;
  title: string;
  message: string;
  severity?: "critical" | "warning" | "info" | "success";
  category?: string;
  link?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  emailTemplate?: TemplateId;
  emailData?: TemplateData;
}

export async function notify(opts: NotifyOpts): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  // Create in-app notification
  const notifResult = await pool.query(
    `INSERT INTO notifications (user_id, title, message, severity, category, related_entity_id, related_entity_type, link)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      opts.userId ?? null,
      opts.title,
      opts.message,
      opts.severity ?? "info",
      opts.category ?? null,
      opts.relatedEntityId ?? null,
      opts.relatedEntityType ?? null,
      opts.link ?? null,
    ],
  );

  const notificationId = notifResult.rows[0]?.id;

  // Check if user has email notifications enabled for this category
  if (opts.userId && opts.emailTemplate) {
    try {
      const userResult = await pool.query(
        `SELECT email, email_notifications_enabled, notification_categories
         FROM users WHERE id = $1`,
        [opts.userId],
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        const categories = user.notification_categories ?? [];
        const categoryMatch = !opts.category || categories.includes(opts.category);

        if (user.email_notifications_enabled && categoryMatch) {
          await sendEmail(
            user.email,
            opts.emailTemplate,
            opts.emailData ?? { title: opts.title, message: opts.message, link: opts.link },
            { userId: opts.userId, notificationId },
          );
        }
      }
    } catch (e) {
      log.warn("email_notify_check_failed", { userId: opts.userId, error: (e as Error).message });
    }
  }

  // If no specific userId, broadcast to all users with email enabled for this category
  if (!opts.userId && opts.emailTemplate) {
    try {
      const usersResult = await pool.query(
        `SELECT id, email, notification_categories
         FROM users
         WHERE email_notifications_enabled = true AND is_active = true`,
      );

      for (const user of usersResult.rows) {
        const categories = user.notification_categories ?? [];
        const categoryMatch = !opts.category || categories.includes(opts.category);
        if (categoryMatch) {
          await sendEmail(
            user.email,
            opts.emailTemplate,
            opts.emailData ?? { title: opts.title, message: opts.message, link: opts.link },
            { userId: user.id, notificationId },
          );
        }
      }
    } catch (e) {
      log.warn("email_broadcast_failed", { error: (e as Error).message });
    }
  }
}

// ---------------------------------------------------------------------------
// Email Status — for Settings page
// ---------------------------------------------------------------------------

export async function getEmailStatus(): Promise<{
  configured: boolean;
  smtp_host: string | null;
  total_sent: number;
  total_failed: number;
  recent: Array<{
    id: string;
    recipient_email: string;
    subject: string;
    template: string;
    status: string;
    created_at: string;
  }>;
}> {
  const cfg = getSmtpConfig();
  const pool = getPool();

  let totalSent = 0;
  let totalFailed = 0;
  let recent: Array<{
    id: string;
    recipient_email: string;
    subject: string;
    template: string;
    status: string;
    created_at: string;
  }> = [];

  if (pool) {
    try {
      const countResult = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
         FROM email_log`,
      );
      totalSent = countResult.rows[0]?.sent ?? 0;
      totalFailed = countResult.rows[0]?.failed ?? 0;

      const recentResult = await pool.query(
        `SELECT id, recipient_email, subject, template, status, created_at
         FROM email_log ORDER BY created_at DESC LIMIT 10`,
      );
      recent = recentResult.rows;
    } catch {
      // Table may not exist yet
    }
  }

  return {
    configured: cfg !== null,
    smtp_host: cfg?.host ?? null,
    total_sent: totalSent,
    total_failed: totalFailed,
    recent,
  };
}

// ---------------------------------------------------------------------------
// Test SMTP Connection
// ---------------------------------------------------------------------------

export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, error: "SMTP not configured" };
  }

  try {
    await transporter.verify();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
