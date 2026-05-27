import { log } from "../logger";
import type { ExtractResult } from "./types";

const MAX_ATTACHMENT_SIZE = 200 * 1024 * 1024; // 200 MB

/**
 * Extract text from EML (message/rfc822) files using mailparser.
 */
async function extractEml(buffer: Buffer): Promise<ExtractResult> {
  const { simpleParser } = await import("mailparser");
  const parsed = await simpleParser(buffer);

  const headerLines: string[] = [];
  if (parsed.from?.text) headerLines.push(`From: ${parsed.from.text}`);
  if (parsed.to) {
    const toText = Array.isArray(parsed.to)
      ? parsed.to.map((a) => a.text).join(", ")
      : parsed.to.text;
    headerLines.push(`To: ${toText}`);
  }
  if (parsed.cc) {
    const ccText = Array.isArray(parsed.cc)
      ? parsed.cc.map((a) => a.text).join(", ")
      : parsed.cc.text;
    headerLines.push(`Cc: ${ccText}`);
  }
  if (parsed.subject) headerLines.push(`Subject: ${parsed.subject}`);
  if (parsed.date) headerLines.push(`Date: ${parsed.date.toISOString()}`);

  let body = "";
  if (parsed.text) {
    body = parsed.text;
  } else if (parsed.html) {
    body = stripHtmlTags(parsed.html);
  }

  const text = [...headerLines, "", body].join("\n").trim();

  const children: ExtractResult["children"] = [];
  if (parsed.attachments) {
    for (const att of parsed.attachments) {
      if (att.size > MAX_ATTACHMENT_SIZE) continue;
      children.push({
        name: att.filename ?? `attachment-${children.length}`,
        buffer: att.content,
        mimeType: att.contentType ?? "application/octet-stream",
      });
    }
  }

  return {
    text,
    metadata: {
      extractionPath: "email-eml",
      subject: parsed.subject ?? null,
      attachmentCount: children.length,
    },
    children: children.length > 0 ? children : undefined,
  };
}

/**
 * Extract text from MSG (application/vnd.ms-outlook) files using @kenjiuno/msgreader.
 */
async function extractMsg(buffer: Buffer): Promise<ExtractResult> {
  const MsgReaderModule = await import("@kenjiuno/msgreader");
  const MsgReader = MsgReaderModule.default ?? MsgReaderModule;
  const ab = new ArrayBuffer(buffer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buffer.length; i++) view[i] = buffer[i];
  const reader = new MsgReader(ab);
  const msgData = reader.getFileData();

  const headerLines: string[] = [];
  if (msgData.senderName || msgData.senderSmtpAddress) {
    headerLines.push(`From: ${msgData.senderName ?? ""} <${msgData.senderSmtpAddress ?? ""}>`);
  }
  if (msgData.recipients && msgData.recipients.length > 0) {
    const toRecipients = msgData.recipients
      .map((r) => `${r.name ?? ""}`)
      .join(", ");
    if (toRecipients) headerLines.push(`To: ${toRecipients}`);
  }
  if (msgData.subject) headerLines.push(`Subject: ${msgData.subject}`);
  if (msgData.creationTime) headerLines.push(`Date: ${msgData.creationTime}`);

  let body = "";
  if (msgData.body) {
    body = msgData.body;
  } else if (msgData.bodyHtml) {
    body = stripHtmlTags(
      typeof msgData.bodyHtml === "string"
        ? msgData.bodyHtml
        : Buffer.from(msgData.bodyHtml).toString("utf-8"),
    );
  }

  const text = [...headerLines, "", body].join("\n").trim();

  const children: ExtractResult["children"] = [];
  if (msgData.attachments && Array.isArray(msgData.attachments)) {
    for (const att of msgData.attachments) {
      try {
        const attData = reader.getAttachment(att);
        if (!attData || !attData.content) continue;
        const attBuffer = Buffer.from(attData.content);
        if (attBuffer.length > MAX_ATTACHMENT_SIZE) continue;
        children.push({
          name: attData.fileName ?? att.fileName ?? att.name ?? `attachment-${children.length}`,
          buffer: attBuffer,
          mimeType: "application/octet-stream",
        });
      } catch (err) {
        log.warn("msg_attachment_extract_error", { error: String(err) });
      }
    }
  }

  return {
    text,
    metadata: {
      extractionPath: "email-msg",
      subject: msgData.subject ?? null,
      attachmentCount: children.length,
    },
    children: children.length > 0 ? children : undefined,
  };
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extract(buffer: Buffer): Promise<ExtractResult> {
  // Try EML first (text-based RFC 822 format)
  const header = buffer.slice(0, 1024).toString("utf-8");
  const isEml =
    header.startsWith("From ") ||
    header.startsWith("From:") ||
    header.startsWith("MIME-Version:") ||
    header.startsWith("Return-Path:") ||
    header.startsWith("Received:") ||
    /^[A-Z][a-zA-Z-]+:\s/m.test(header);

  if (isEml) {
    return extractEml(buffer);
  }

  // Otherwise try MSG (OLE compound document — starts with 0xD0CF11E0)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return extractMsg(buffer);
  }

  // Fallback: try EML parser (more forgiving)
  return extractEml(buffer);
}
