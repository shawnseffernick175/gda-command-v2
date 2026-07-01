/**
 * PDF rendering via PDFKit — converts structured content into a
 * publication-grade PDF with Hydra Teal + Inter aesthetics.
 *
 * F-313: Output Generators
 */

import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import { createWriteStream, mkdirSync } from 'node:fs';

const OUTPUT_DIR = join(process.cwd(), 'data', 'generated-docs');

// Hydra Teal palette
const COLORS = {
  accent: '#01696F',
  ink: '#28251D',
  muted: '#7A7974',
  border: '#D4D1CA',
  bg: '#F7F6F2',
  critical: '#A12C7B',
  white: '#FFFFFF',
} as const;

export interface PdfSection {
  heading: string;
  body: string;
  citations?: Array<{ label: string; url: string }>;
  doctrineRef?: string;
  isDraft?: boolean;
}

export interface PdfMeta {
  title: string;
  subtitle: string;
  fields: Array<{ label: string; value: string }>;
  pwin?: number | null;
}

export interface PdfOptions {
  meta: PdfMeta;
  sections: PdfSection[];
  allCitations: Array<{ label: string; url: string }>;
  generatedAt: string;
}

function ensureOutputDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

export function renderPdf(filename: string, opts: PdfOptions): Promise<{ filePath: string; sizeBytes: number }> {
  ensureOutputDir();
  const filePath = join(OUTPUT_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 56, right: 56 },
      info: {
        Title: opts.meta.title,
        Author: 'Envision Innovative Solutions',
        Subject: opts.meta.subtitle,
      },
    });

    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Header bar
    doc.rect(56, 50, 500, 3).fill(COLORS.accent);
    doc.moveDown(0.5);
    doc.y = 60;

    // Title
    doc.fontSize(20).fillColor(COLORS.accent).text(opts.meta.title, { width: 500 });
    doc.fontSize(11).fillColor(COLORS.muted).text(opts.meta.subtitle);
    doc.moveDown(0.8);

    // Meta grid
    const metaStartY = doc.y;
    const colWidth = 240;
    for (let i = 0; i < opts.meta.fields.length; i++) {
      const field = opts.meta.fields[i]!;
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 56 + col * colWidth;
      const y = metaStartY + row * 16;

      doc.fontSize(8).fillColor(COLORS.muted).text(field.label.toUpperCase(), x, y, { width: 70 });
      doc.fontSize(10).fillColor(COLORS.ink).text(field.value, x + 75, y, { width: colWidth - 80 });
    }

    doc.y = metaStartY + Math.ceil(opts.meta.fields.length / 2) * 16 + 12;

    if (opts.meta.pwin != null) {
      doc.roundedRect(56, doc.y, 60, 22, 4).fill(COLORS.accent);
      doc.fontSize(12).fillColor(COLORS.white).text(`${opts.meta.pwin}%`, 56, doc.y + 4, { width: 60, align: 'center' });
      doc.y += 30;
    }

    // Sections
    for (const section of opts.sections) {
      if (doc.y > 650) doc.addPage();

      // Section heading
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor(COLORS.ink).text(section.heading, { underline: false });
      doc.moveTo(56, doc.y + 2).lineTo(556, doc.y + 2).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      // Body
      doc.fontSize(10).fillColor(COLORS.ink).text(section.body, { width: 500, lineGap: 2 });

      // Doctrine ref
      if (section.doctrineRef) {
        doc.moveDown(0.3);
        doc.fontSize(8).fillColor(COLORS.muted).text(`Doctrine: ${section.doctrineRef}`, { oblique: true });
      }

      // Draft warning
      if (section.isDraft) {
        doc.moveDown(0.3);
        doc.fontSize(8).fillColor(COLORS.critical).text('DRAFT — needs evidence', { oblique: true });
      }

      // Inline citations
      if (section.citations && section.citations.length > 0) {
        doc.moveDown(0.2);
        for (const cit of section.citations) {
          doc.fontSize(7).fillColor(COLORS.muted).text(`[${cit.label}] ${cit.url}`, { link: cit.url });
        }
      }

      doc.moveDown(0.5);
    }

    // Footer citations
    if (opts.allCitations.length > 0) {
      if (doc.y > 600) doc.addPage();
      doc.moveDown(1);
      doc.moveTo(56, doc.y).lineTo(556, doc.y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor(COLORS.ink).text('Sources');
      doc.moveDown(0.3);
      for (let i = 0; i < opts.allCitations.length; i++) {
        const cit = opts.allCitations[i]!;
        doc.fontSize(7).fillColor(COLORS.muted).text(`[${i + 1}] ${cit.label} — ${cit.url}`, { link: cit.url });
      }
    }

    // Footer
    if (doc.y > 680) doc.addPage();
    doc.moveDown(1);
    doc.moveTo(56, doc.y).lineTo(556, doc.y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.moveDown(0.3);
    doc.fontSize(7).fillColor(COLORS.muted).text(
      `Generated ${opts.generatedAt} — Envision Innovative Solutions — CONFIDENTIAL`,
      { align: 'center' }
    );

    doc.end();
    stream.on('finish', () => {
      const written = stream.bytesWritten;
      resolve({ filePath, sizeBytes: written });
    });
    stream.on('error', reject);
  });
}
