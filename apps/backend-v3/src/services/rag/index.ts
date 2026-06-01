export {
  ingestFromPath,
  ingestFromBuffer,
  reingestDocument,
  search,
  getStatus,
  listDocuments,
  deleteDocument,
  getDocument,
  getDocumentChunks,
  computeSha256,
} from './store.js';

export { chunkText } from './chunker.js';
export { generateEmbeddings, generateQueryEmbedding, EMBED_MODEL, EMBED_DIMENSIONS } from './embeddings.js';
export { parseFile, parseBuffer } from './parser.js';

export type {
  KbDocument,
  KbChunk,
  SearchResult,
  IngestResult,
  IngestRequest,
  SearchRequest,
  RagStatus,
  DocType,
  OuTag,
  EvidenceGrade,
  ChunkInput,
} from './types.js';
