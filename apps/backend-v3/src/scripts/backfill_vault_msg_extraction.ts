/**
 * F-861: Backfill vault .msg extraction for IDs 117, 118, 121, 123, 125, 126.
 * Run with: npx tsx src/scripts/backfill_vault_msg_extraction.ts
 */
import { pool } from '../lib/db.js';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const AFFECTED_IDS = [117, 118, 121, 123, 125, 126];

async function extractTextFromBuffer(buf: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'msg') {
    const mod = await import('@kenjiuno/msgreader');
    const MsgReader = mod.default as unknown as new (buf: ArrayBuffer | DataView) => { getFileData(): Record<string, unknown> };
    const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const msg = new MsgReader(arrayBuf);
    const fileData = msg.getFileData() as {
      senderName?: string;
      senderEmail?: string;
      recipients?: { name?: string; email?: string; recipType?: string }[];
      subject?: string;
      messageDeliveryTime?: string;
      creationTime?: string;
      body?: string;
      attachments?: { fileName?: string; contentLength?: number }[];
    };

    const parts: string[] = [];
    if (fileData.senderName || fileData.senderEmail) {
      parts.push(`FROM: ${fileData.senderName ?? ''} <${fileData.senderEmail ?? ''}>`);
    }
    const recipients = fileData.recipients ?? [];
    const toList = recipients.filter((r) => !r.recipType || r.recipType === 'to');
    const ccList = recipients.filter((r) => r.recipType === 'cc');
    if (toList.length > 0) {
      parts.push(`TO: ${toList.map((r) => r.name || r.email || '').join(', ')}`);
    }
    if (ccList.length > 0) {
      parts.push(`CC: ${ccList.map((r) => r.name || r.email || '').join(', ')}`);
    }
    if (fileData.subject) parts.push(`SUBJECT: ${fileData.subject}`);
    if (fileData.messageDeliveryTime || fileData.creationTime) {
      parts.push(`DATE: ${fileData.messageDeliveryTime ?? fileData.creationTime ?? ''}`);
    }
    const attachments = fileData.attachments ?? [];
    if (attachments.length > 0) {
      const attList = attachments.map((a) => {
        const name = a.fileName ?? 'unnamed';
        const size = a.contentLength ? `(${Math.round(a.contentLength / 1024)} KB)` : '';
        return `${name} ${size}`.trim();
      });
      parts.push(`ATTACHMENTS: [${attList.join(', ')}]`);
    }
    parts.push('');
    parts.push('--- BODY ---');
    parts.push(fileData.body ?? '');

    return parts.join('\n');
  }

  return '';
}

async function main() {
  console.log('=== Backfill Vault .msg Extraction ===');
  console.log(`Target IDs: ${AFFECTED_IDS.join(', ')}\n`);

  for (const docId of AFFECTED_IDS) {
    const res = await pool.query<{ id: number; filename: string; file_path: string | null; file_size_bytes: string | null }>(
      `SELECT id, filename, file_path, file_size_bytes FROM vault_documents WHERE id = $1`,
      [docId],
    );

    if (!res.rows[0]) {
      console.log(`[ID ${docId}] NOT FOUND in database — skipping`);
      continue;
    }

    const doc = res.rows[0];
    console.log(`[ID ${docId}] ${doc.filename}`);

    if (!doc.file_path) {
      console.log(`  → No file_path stored — marking as failed`);
      await pool.query(
        `UPDATE vault_documents SET extraction_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [docId],
      );
      continue;
    }

    const filePath = join(process.cwd(), 'data', doc.file_path);
    if (!existsSync(filePath)) {
      console.log(`  → File not on disk at ${filePath} — marking as failed`);
      await pool.query(
        `UPDATE vault_documents SET extraction_status = 'failed', updated_at = NOW() WHERE id = $1`,
        [docId],
      );
      continue;
    }

    const buf = readFileSync(filePath);
    if (buf.length === 0) {
      console.log(`  → File is 0 bytes — marking as failed`);
      await pool.query(
        `UPDATE vault_documents SET extraction_status = 'failed', file_size_bytes = 0, updated_at = NOW() WHERE id = $1`,
        [docId],
      );
      continue;
    }

    let extractedText = '';
    try {
      extractedText = await extractTextFromBuffer(buf, doc.filename);
    } catch (err) {
      console.log(`  → Extraction error: ${err}`);
    }

    const status = extractedText.trim().length > 0 ? 'success' : 'failed';

    await pool.query(
      `UPDATE vault_documents
       SET extracted_text = $1, extraction_status = $2, file_size_bytes = $3, updated_at = NOW()
       WHERE id = $4`,
      [extractedText || null, status, buf.length, docId],
    );

    await pool.query(
      `INSERT INTO vault_audit_trail (document_id, action, actor, detail) VALUES ($1, $2, $3, $4)`,
      [docId, 'backfill_re_extracted', 'system', `F-861 backfill: status=${status}, text_len=${extractedText.length}`],
    );

    console.log(`  → ${status} (${extractedText.length} chars extracted)`);
  }

  console.log('\n=== Backfill complete ===');
  await pool.end();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
