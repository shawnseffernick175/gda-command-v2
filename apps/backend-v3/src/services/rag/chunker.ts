import type { ChunkInput } from './types.js';

const TARGET_CHUNK_TOKENS = 500;
const MAX_CHUNK_TOKENS = 600;
const OVERLAP_TOKENS = 50;

/** Rough token count: ~4 chars per token for English text. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split text on sentence boundaries. */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/** Split text on paragraph boundaries. */
function splitParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
}

/**
 * Semantic chunking with overlap.
 * Splits text into chunks of TARGET_CHUNK_TOKENS with OVERLAP_TOKENS overlap.
 * Respects paragraph and sentence boundaries where possible.
 */
export function chunkText(
  fullText: string,
  pageNumber?: number,
  sectionTitle?: string,
): ChunkInput[] {
  const trimmed = fullText.trim();
  if (!trimmed) return [];

  const totalTokens = estimateTokens(trimmed);
  if (totalTokens <= MAX_CHUNK_TOKENS) {
    return [{
      text: trimmed,
      page_number: pageNumber,
      section_title: sectionTitle,
    }];
  }

  const paragraphs = splitParagraphs(trimmed);
  const chunks: ChunkInput[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (paraTokens > MAX_CHUNK_TOKENS) {
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.join('\n\n'),
          page_number: pageNumber,
          section_title: sectionTitle,
        });
        currentChunk = [];
        currentTokens = 0;
      }
      const sentences = splitSentences(para);
      let sentGroup: string[] = [];
      let sentTokens = 0;
      for (const sent of sentences) {
        const st = estimateTokens(sent);
        if (sentTokens + st > TARGET_CHUNK_TOKENS && sentGroup.length > 0) {
          chunks.push({
            text: sentGroup.join(' '),
            page_number: pageNumber,
            section_title: sectionTitle,
          });
          const overlapText = sentGroup.slice(-2).join(' ');
          sentGroup = [overlapText, sent];
          sentTokens = estimateTokens(overlapText) + st;
        } else {
          sentGroup.push(sent);
          sentTokens += st;
        }
      }
      if (sentGroup.length > 0) {
        chunks.push({
          text: sentGroup.join(' '),
          page_number: pageNumber,
          section_title: sectionTitle,
        });
      }
      continue;
    }

    if (currentTokens + paraTokens > TARGET_CHUNK_TOKENS && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n\n'),
        page_number: pageNumber,
        section_title: sectionTitle,
      });
      const lastPara = currentChunk[currentChunk.length - 1];
      const lastTokens = estimateTokens(lastPara);
      if (lastTokens <= OVERLAP_TOKENS) {
        currentChunk = [lastPara];
        currentTokens = lastTokens;
      } else {
        currentChunk = [];
        currentTokens = 0;
      }
    }

    currentChunk.push(para);
    currentTokens += paraTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join('\n\n'),
      page_number: pageNumber,
      section_title: sectionTitle,
    });
  }

  return chunks;
}
