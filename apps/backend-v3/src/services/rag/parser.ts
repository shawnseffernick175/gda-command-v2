import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { logger } from '../../lib/logger.js';

interface ParsedContent {
  text: string;
  pages?: Array<{ page: number; text: string }>;
}

/** Extract text from a file buffer based on extension. */
export async function parseFile(filePath: string): Promise<ParsedContent> {
  const ext = extname(filePath).toLowerCase();
  const buffer = await readFile(filePath);

  switch (ext) {
    case '.txt':
    case '.md':
      return { text: buffer.toString('utf-8') };

    case '.pdf':
      return parsePdf(buffer);

    case '.docx':
      return parseDocx(buffer);

    case '.pptx':
      return parsePptx(buffer);

    case '.xlsx':
      return parseXlsx(buffer);

    case '.eml':
    case '.msg':
      return { text: buffer.toString('utf-8') };

    default:
      logger.warn({ ext, filePath }, 'Unknown file extension, treating as plain text');
      return { text: buffer.toString('utf-8') };
  }
}

/** Extract text from a raw buffer, auto-detecting format by extension name. */
export async function parseBuffer(data: Buffer, filename: string): Promise<ParsedContent> {
  const ext = extname(filename).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md':
      return { text: data.toString('utf-8') };

    case '.pdf':
      return parsePdf(data);

    case '.docx':
      return parseDocx(data);

    case '.pptx':
      return parsePptx(data);

    case '.xlsx':
      return parseXlsx(data);

    case '.eml':
    case '.msg':
      return { text: data.toString('utf-8') };

    default:
      logger.warn({ ext, filename }, 'Unknown file extension, treating as plain text');
      return { text: data.toString('utf-8') };
  }
}

async function parsePdf(buffer: Buffer): Promise<ParsedContent> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();

    const pages: Array<{ page: number; text: string }> = [];
    if (textResult.pages) {
      for (let i = 0; i < textResult.pages.length; i++) {
        const pageText = textResult.pages[i].text?.trim() ?? '';
        if (pageText) {
          pages.push({ page: i + 1, text: pageText });
        }
      }
    }

    const fullText = textResult.text ?? '';
    await parser.destroy();

    return {
      text: fullText,
      pages: pages.length > 0 ? pages : undefined,
    };
  } catch (err) {
    logger.error({ err }, 'PDF parse failed');
    throw new Error(`PDF parsing failed: ${(err as Error).message}`);
  }
}

async function parseDocx(buffer: Buffer): Promise<ParsedContent> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value };
  } catch (err) {
    logger.error({ err }, 'DOCX parse failed');
    throw new Error(`DOCX parsing failed: ${(err as Error).message}`);
  }
}

async function parsePptx(buffer: Buffer): Promise<ParsedContent> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0', 10);
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0', 10);
        return numA - numB;
      });

    const pages: Array<{ page: number; text: string }> = [];
    const allText: string[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]].async('text');
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) {
        pages.push({ page: i + 1, text });
        allText.push(text);
      }
    }

    return {
      text: allText.join('\n\n'),
      pages: pages.length > 0 ? pages : undefined,
    };
  } catch (err) {
    logger.error({ err }, 'PPTX parse failed');
    throw new Error(`PPTX parsing failed: ${(err as Error).message}`);
  }
}

async function parseXlsx(buffer: Buffer): Promise<ParsedContent> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const texts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        texts.push(`[Sheet: ${sheetName}]\n${csv}`);
      }
    }

    return { text: texts.join('\n\n') };
  } catch (err) {
    logger.error({ err }, 'XLSX parse failed');
    throw new Error(`XLSX parsing failed: ${(err as Error).message}`);
  }
}
