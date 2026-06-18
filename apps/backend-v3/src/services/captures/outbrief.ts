/**
 * Color Team Review Outbrief builders — F-868
 *
 * Generates a professional Color Team Review Outbrief as either a Word (.docx)
 * or PDF document, fully in memory, returning a Buffer for the route to stream.
 *
 * Both formats present the SAME information:
 *   1. Cover/header (title, capture/opportunity, color label + phase + completion %,
 *      doctrine focus, scheduled/completed dates, overall rating/score/pwin impact)
 *   2. Reviewers table (name, role, submitted_at)
 *   3. Section scorecard (per section: criterion, weight, avg score, and each
 *      reviewer's color rating / strengths / weaknesses / recommendations)
 *   4. Compliance matrix (shall statement, RFP reference, compliant Yes/No, notes)
 *   5. Back-Review Findings (only when is_cumulative) grouping the
 *      "[Back-review: <Prior>]" sections by the prior color phase
 *   6. Footer (generated timestamp + "GDA Command")
 *
 * No external font downloads: docx uses Calibri, pdf uses built-in Helvetica.
 * No decorative graphics — clean, professional layout only.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';
import PDFDocument from 'pdfkit';
import { doctrineFor } from './color-review-doctrine.js';

// ── Data shapes (a thin view of the DB rows the route already loads) ─────────

export interface OutbriefReviewer {
  id: number;
  reviewer_name: string;
  reviewer_email?: string | null;
  role?: string | null;
  submitted_at?: string | Date | null;
}

export interface OutbriefSection {
  id: number;
  section_name: string;
  section_m_criterion?: string | null;
  section_l_requirement?: string | null;
  weight_pct?: number | string | null;
  display_order: number;
}

export interface OutbriefScore {
  section_id: number;
  reviewer_id: number;
  score?: number | string | null;
  color_rating?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  recommendations?: string | null;
}

export interface OutbriefCompliance {
  id: number;
  shall_statement: string;
  rfp_reference?: string | null;
  proposal_addressed_in?: string | null;
  is_compliant?: boolean | null;
  notes?: string | null;
}

export interface OutbriefData {
  review: {
    id: number;
    color: string;
    status: string;
    scheduled_date?: string | Date | null;
    completed_date?: string | Date | null;
    rubric?: string | null;
    overall_color_rating?: string | null;
    overall_score?: number | string | null;
    pwin_impact?: number | string | null;
    is_cumulative?: boolean | null;
  };
  captureTitle: string;
  reviewers: OutbriefReviewer[];
  sections: OutbriefSection[];
  scores: OutbriefScore[];
  compliance: OutbriefCompliance[];
}

// ── Shared helpers ───────────────────────────────────────────────────────────

const BACK_REVIEW_PREFIX = '[Back-review:';

function isBackReviewSection(s: OutbriefSection): boolean {
  return s.section_name.startsWith(BACK_REVIEW_PREFIX);
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toISOString().slice(0, 10);
}

function fmtNum(n?: number | string | null, digits = 2): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'string' ? parseFloat(n) : n;
  if (typeof v !== 'number' || isNaN(v)) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

function complianceText(c?: boolean | null): string {
  if (c === true) return 'Yes';
  if (c === false) return 'No';
  return '—';
}

function avgScore(scores: OutbriefScore[], sectionId: number): string {
  const vals = scores
    .filter((s) => s.section_id === sectionId && s.score !== null && s.score !== undefined && s.score !== '')
    .map((s) => (typeof s.score === 'string' ? parseFloat(s.score) : (s.score as number)))
    .filter((v) => typeof v === 'number' && !isNaN(v));
  if (vals.length === 0) return '—';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return avg.toFixed(2);
}

function reviewerName(reviewers: OutbriefReviewer[], reviewerId: number): string {
  const r = reviewers.find((x) => x.id === reviewerId);
  return r ? r.reviewer_name : `Reviewer #${reviewerId}`;
}

/** A stripped doctrine label for a back-review section_name, e.g. "[Back-review: Blue] Win Themes" -> "Blue". */
function backReviewGroupLabel(sectionName: string): string {
  const m = sectionName.match(/^\[Back-review:\s*([^\]]+)\]/);
  return m ? m[1].trim() : 'Prior';
}

function buildHeaderFacts(data: OutbriefData): Array<[string, string]> {
  const { review } = data;
  const d = doctrineFor(review.color);
  const colorLabel = d ? d.label : review.color;
  const phase = d ? (d.phase === 'pre_rfp' ? 'Pre-RFP' : 'Post-RFP') : '—';
  const completion = d && d.completion_pct ? d.completion_pct : '—';
  const facts: Array<[string, string]> = [
    ['Capture / Opportunity', data.captureTitle],
    ['Color Team', `${colorLabel} (${review.color})`],
    ['Phase', phase],
    ['Target Completion', completion],
    ['Review Status', review.status],
    ['Cumulative Back-Review', review.is_cumulative ? 'Yes' : 'No'],
    ['Scheduled', fmtDate(review.scheduled_date)],
    ['Completed', fmtDate(review.completed_date)],
    ['Overall Rating', review.overall_color_rating ?? '—'],
    ['Overall Score', fmtNum(review.overall_score)],
    ['Pwin Impact', fmtNum(review.pwin_impact)],
  ];
  return facts;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORD (.docx)
// ─────────────────────────────────────────────────────────────────────────────

const ACCENT = '1F4E5F'; // deep teal-slate, professional
const MUTED = '595959';

function pLabel(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: ACCENT })],
  });
}

function cell(text: string, opts: { bold?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || '—', bold: opts.bold, size: 20 })],
      }),
    ],
  });
}

function simpleTable(headers: string[], rows: string[][], colWidths?: number[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        width: colWidths ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
        shading: { fill: ACCENT },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 20 })] })],
      }),
    ),
  });
  const bodyRows = rows.map(
    (r) => new TableRow({ children: r.map((c, i) => cell(c, colWidths ? { width: colWidths[i] } : {})) }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

export async function buildOutbriefDocx(data: OutbriefData): Promise<Buffer> {
  const { review, reviewers, sections, scores, compliance } = data;
  const d = doctrineFor(review.color);
  const children: (Paragraph | Table)[] = [];

  // Cover / header
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'Color Team Review Outbrief', bold: true, size: 44, color: ACCENT })],
    }),
  );
  if (d) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: d.focus, italics: true, size: 22, color: MUTED })],
      }),
    );
  }

  const facts = buildHeaderFacts(data);
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'D9D9D9' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D9D9D9' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EFEFEF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: facts.map(
        ([k, v]) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 35, type: WidthType.PERCENTAGE },
                margins: { top: 40, bottom: 40, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 20, color: MUTED })] })],
              }),
              new TableCell({
                width: { size: 65, type: WidthType.PERCENTAGE },
                margins: { top: 40, bottom: 40, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: v || '—', size: 20 })] })],
              }),
            ],
          }),
      ),
    }),
  );

  // Reviewers
  children.push(pLabel('Reviewers'));
  if (reviewers.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'No reviewers assigned.', size: 20, color: MUTED })] }));
  } else {
    children.push(
      simpleTable(
        ['Name', 'Role', 'Submitted'],
        reviewers.map((r) => [r.reviewer_name, r.role ?? '—', fmtDate(r.submitted_at)]),
        [50, 25, 25],
      ),
    );
  }

  // Section scorecard — primary sections (non back-review)
  const primarySections = sections.filter((s) => !isBackReviewSection(s)).sort((a, b) => a.display_order - b.display_order);
  children.push(pLabel('Section Scorecard'));
  if (primarySections.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'No sections seeded for this review.', size: 20, color: MUTED })] }));
  } else {
    for (const s of primarySections) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [
            new TextRun({ text: s.section_name, bold: true, size: 22 }),
            ...(s.section_m_criterion ? [new TextRun({ text: `  ·  ${s.section_m_criterion}`, size: 18, color: MUTED })] : []),
            ...(s.weight_pct !== null && s.weight_pct !== undefined
              ? [new TextRun({ text: `  ·  weight ${fmtNum(s.weight_pct)}%`, size: 18, color: MUTED })]
              : []),
            new TextRun({ text: `  ·  avg score ${avgScore(scores, s.id)}`, size: 18, color: ACCENT, bold: true }),
          ],
        }),
      );
      const secScores = scores.filter((sc) => sc.section_id === s.id);
      if (secScores.length === 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: 'Not yet scored.', italics: true, size: 18, color: MUTED })] }));
      } else {
        children.push(
          simpleTable(
            ['Reviewer', 'Rating', 'Strengths', 'Weaknesses', 'Recommendations'],
            secScores.map((sc) => [
              reviewerName(reviewers, sc.reviewer_id),
              sc.color_rating ?? '—',
              sc.strengths ?? '—',
              sc.weaknesses ?? '—',
              sc.recommendations ?? '—',
            ]),
            [16, 10, 25, 25, 24],
          ),
        );
      }
    }
  }

  // Compliance matrix
  children.push(pLabel('Compliance Matrix'));
  if (compliance.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'No compliance items recorded.', size: 20, color: MUTED })] }));
  } else {
    children.push(
      simpleTable(
        ['Shall Statement', 'RFP Ref', 'Compliant', 'Notes'],
        compliance.map((c) => [c.shall_statement, c.rfp_reference ?? '—', complianceText(c.is_compliant), c.notes ?? '—']),
        [42, 14, 14, 30],
      ),
    );
  }

  // Back-review findings (cumulative only)
  if (review.is_cumulative) {
    const backSections = sections.filter(isBackReviewSection).sort((a, b) => a.display_order - b.display_order);
    children.push(pLabel('Back-Review Findings'));
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text:
              'This is a cumulative review. The items below are catch-up checks the earlier-phase color reviews should have surfaced before this stage.',
            italics: true,
            size: 18,
            color: MUTED,
          }),
        ],
      }),
    );
    if (backSections.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: 'No back-review sections present.', size: 20, color: MUTED })] }));
    } else {
      // Group by prior color label
      const groups = new Map<string, OutbriefSection[]>();
      for (const s of backSections) {
        const g = backReviewGroupLabel(s.section_name);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(s);
      }
      for (const [label, secs] of groups) {
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 40 },
            children: [new TextRun({ text: `${label} (prior phase)`, bold: true, size: 22, color: ACCENT })],
          }),
        );
        children.push(
          simpleTable(
            ['Check', 'Avg Score'],
            secs.map((s) => [s.section_name.replace(/^\[Back-review:[^\]]*\]\s*/, ''), avgScore(scores, s.id)]),
            [78, 22],
          ),
        );
      }
    }
  }

  // Footer
  children.push(
    new Paragraph({
      spacing: { before: 360 },
      border: { top: { style: BorderStyle.SINGLE, size: 1, color: 'D9D9D9', space: 8 } },
      children: [
        new TextRun({ text: `Generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC  ·  GDA Command`, size: 16, color: MUTED }),
      ],
    }),
  );

  const doc = new Document({
    creator: 'GDA Command',
    title: `Color Team Review Outbrief — Review ${review.id}`,
    styles: { default: { document: { run: { font: 'Calibri' } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
  });

  return Packer.toBuffer(doc);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF (pdfkit, built-in Helvetica)
// ─────────────────────────────────────────────────────────────────────────────

const PDF_ACCENT = '#1F4E5F';
const PDF_MUTED = '#595959';
const PDF_BORDER = '#D9D9D9';

export function buildOutbriefPdf(data: OutbriefData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const { review, reviewers, sections, scores, compliance } = data;
      const d = doctrineFor(review.color);
      const doc = new PDFDocument({ size: 'LETTER', margin: 50, bufferPages: true });
      doc.info.Title = `Color Team Review Outbrief — Review ${review.id}`;
      doc.info.Author = 'GDA Command';

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageLeft = doc.page.margins.left;
      const pageRight = doc.page.width - doc.page.margins.right;
      const contentWidth = pageRight - pageLeft;

      const ensureSpace = (needed: number) => {
        if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
      };

      const sectionLabel = (text: string) => {
        ensureSpace(40);
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(PDF_ACCENT).text(text, pageLeft, doc.y);
        doc.moveTo(pageLeft, doc.y + 2).lineTo(pageRight, doc.y + 2).lineWidth(0.5).strokeColor(PDF_BORDER).stroke();
        doc.moveDown(0.4);
        doc.fillColor('black');
      };

      // Simple table renderer with wrapping cells
      const drawTable = (headers: string[], rows: string[][], widths: number[]) => {
        const colX: number[] = [];
        let x = pageLeft;
        const pxWidths = widths.map((w) => (w / 100) * contentWidth);
        for (let i = 0; i < pxWidths.length; i++) {
          colX.push(x);
          x += pxWidths[i];
        }
        const padding = 4;

        const rowHeight = (cells: string[], font: string, fontSize: number): number => {
          doc.font(font).fontSize(fontSize);
          let maxH = 0;
          for (let i = 0; i < cells.length; i++) {
            const h = doc.heightOfString(cells[i] || '—', { width: pxWidths[i] - 2 * padding });
            if (h > maxH) maxH = h;
          }
          return maxH + 2 * padding;
        };

        // header
        const hH = rowHeight(headers, 'Helvetica-Bold', 9);
        ensureSpace(hH);
        let y = doc.y;
        doc.rect(pageLeft, y, contentWidth, hH).fill(PDF_ACCENT);
        doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], colX[i] + padding, y + padding, { width: pxWidths[i] - 2 * padding });
        }
        y += hH;
        doc.fillColor('black');

        // body
        for (const row of rows) {
          const rH = rowHeight(row, 'Helvetica', 9);
          if (y + rH > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.y;
          }
          doc.font('Helvetica').fontSize(9).fillColor('black');
          for (let i = 0; i < row.length; i++) {
            doc.text(row[i] || '—', colX[i] + padding, y + padding, { width: pxWidths[i] - 2 * padding });
          }
          // row bottom border
          doc.moveTo(pageLeft, y + rH).lineTo(pageRight, y + rH).lineWidth(0.3).strokeColor('#EFEFEF').stroke();
          y += rH;
        }
        doc.y = y + 4;
        doc.x = pageLeft;
        doc.fillColor('black');
      };

      // Cover / header
      doc.font('Helvetica-Bold').fontSize(22).fillColor(PDF_ACCENT).text('Color Team Review Outbrief', pageLeft, doc.y);
      doc.moveDown(0.3);
      if (d) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor(PDF_MUTED).text(d.focus, { width: contentWidth });
      }
      doc.moveDown(0.6);
      doc.fillColor('black');

      // header facts as two-column rows
      const facts = buildHeaderFacts(data);
      doc.fontSize(10);
      for (const [k, v] of facts) {
        ensureSpace(16);
        const yy = doc.y;
        doc.font('Helvetica-Bold').fillColor(PDF_MUTED).text(k, pageLeft, yy, { width: contentWidth * 0.35 });
        doc.font('Helvetica').fillColor('black').text(v || '—', pageLeft + contentWidth * 0.35, yy, { width: contentWidth * 0.65 });
        doc.y = Math.max(doc.y, yy) ;
        doc.moveDown(0.15);
      }

      // Reviewers
      sectionLabel('Reviewers');
      if (reviewers.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor(PDF_MUTED).text('No reviewers assigned.');
        doc.fillColor('black');
      } else {
        drawTable(
          ['Name', 'Role', 'Submitted'],
          reviewers.map((r) => [r.reviewer_name, r.role ?? '—', fmtDate(r.submitted_at)]),
          [50, 25, 25],
        );
      }

      // Section scorecard
      const primarySections = sections.filter((s) => !isBackReviewSection(s)).sort((a, b) => a.display_order - b.display_order);
      sectionLabel('Section Scorecard');
      if (primarySections.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor(PDF_MUTED).text('No sections seeded for this review.');
        doc.fillColor('black');
      } else {
        for (const s of primarySections) {
          ensureSpace(30);
          const meta: string[] = [];
          if (s.section_m_criterion) meta.push(s.section_m_criterion);
          if (s.weight_pct !== null && s.weight_pct !== undefined) meta.push(`weight ${fmtNum(s.weight_pct)}%`);
          meta.push(`avg score ${avgScore(scores, s.id)}`);
          doc.moveDown(0.3);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('black').text(s.section_name, { continued: false });
          doc.font('Helvetica').fontSize(8.5).fillColor(PDF_MUTED).text(meta.join('  ·  '));
          doc.fillColor('black').moveDown(0.2);
          const secScores = scores.filter((sc) => sc.section_id === s.id);
          if (secScores.length === 0) {
            doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(PDF_MUTED).text('Not yet scored.');
            doc.fillColor('black');
          } else {
            drawTable(
              ['Reviewer', 'Rating', 'Strengths', 'Weaknesses', 'Recommendations'],
              secScores.map((sc) => [
                reviewerName(reviewers, sc.reviewer_id),
                sc.color_rating ?? '—',
                sc.strengths ?? '—',
                sc.weaknesses ?? '—',
                sc.recommendations ?? '—',
              ]),
              [16, 10, 25, 25, 24],
            );
          }
        }
      }

      // Compliance matrix
      sectionLabel('Compliance Matrix');
      if (compliance.length === 0) {
        doc.font('Helvetica').fontSize(9).fillColor(PDF_MUTED).text('No compliance items recorded.');
        doc.fillColor('black');
      } else {
        drawTable(
          ['Shall Statement', 'RFP Ref', 'Compliant', 'Notes'],
          compliance.map((c) => [c.shall_statement, c.rfp_reference ?? '—', complianceText(c.is_compliant), c.notes ?? '—']),
          [42, 14, 14, 30],
        );
      }

      // Back-review findings
      if (review.is_cumulative) {
        const backSections = sections.filter(isBackReviewSection).sort((a, b) => a.display_order - b.display_order);
        sectionLabel('Back-Review Findings');
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(PDF_MUTED).text(
          'This is a cumulative review. The items below are catch-up checks the earlier-phase color reviews should have surfaced before this stage.',
          { width: contentWidth },
        );
        doc.fillColor('black').moveDown(0.3);
        if (backSections.length === 0) {
          doc.font('Helvetica').fontSize(9).fillColor(PDF_MUTED).text('No back-review sections present.');
          doc.fillColor('black');
        } else {
          const groups = new Map<string, OutbriefSection[]>();
          for (const s of backSections) {
            const g = backReviewGroupLabel(s.section_name);
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g)!.push(s);
          }
          for (const [label, secs] of groups) {
            ensureSpace(24);
            doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_ACCENT).text(`${label} (prior phase)`);
            doc.fillColor('black').moveDown(0.2);
            drawTable(
              ['Check', 'Avg Score'],
              secs.map((s) => [s.section_name.replace(/^\[Back-review:[^\]]*\]\s*/, ''), avgScore(scores, s.id)]),
              [78, 22],
            );
          }
        }
      }

      // Footer on every page
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const fy = doc.page.height - doc.page.margins.bottom + 10;
        doc.font('Helvetica').fontSize(7.5).fillColor(PDF_MUTED).text(
          `Generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC  ·  GDA Command`,
          pageLeft,
          fy,
          { width: contentWidth, align: 'left', lineBreak: false },
        );
      }

      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
