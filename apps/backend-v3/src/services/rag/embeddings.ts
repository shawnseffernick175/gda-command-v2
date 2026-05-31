import { logger } from '../../lib/logger.js';

const EMBED_MODEL = 'text-embedding-3-large';
const EMBED_DIMENSIONS = 3072;
const BATCH_SIZE = 100;

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

function getApiKey(): string {
  const key = process.env['OPENAI_API_KEY'];
  if (!key) throw new Error('OPENAI_API_KEY environment variable is required for RAG embeddings');
  return key;
}

/** Generate embeddings for a batch of texts using OpenAI API. */
async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = getApiKey();
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
      dimensions: EMBED_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embedding API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as EmbeddingResponse;
  const sorted = json.data.sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/**
 * Generate embeddings for an array of texts, batching in groups of BATCH_SIZE.
 * Returns one embedding vector per input text.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.info({ batch_start: i, batch_size: batch.length, total: texts.length }, 'Generating embeddings batch');
    const embeddings = await embedBatch(batch);
    results.push(...embeddings);
  }

  return results;
}

/** Generate a single embedding for a query string. */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const [embedding] = await embedBatch([query]);
  return embedding;
}

export { EMBED_MODEL, EMBED_DIMENSIONS };
