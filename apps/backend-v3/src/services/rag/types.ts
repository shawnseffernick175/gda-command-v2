export type DocType =
  | 'ceo_doctrine'
  | 'business_plan'
  | 'capabilities'
  | 'past_performance'
  | 'cpar'
  | 'workflow_spec'
  | 'rfp'
  | 'proposal_draft'
  | 'capture_plan'
  | 'partner_intel'
  | 'financial'
  | 'news_article'
  | 'meeting_transcript'
  | 'sow'
  | 'awarded_contract'
  | 'other';

export type OuTag = 'gda' | 'envision' | 'pds' | 'riverstone';
export type EvidenceGrade = 'A' | 'B' | 'C';

export interface KbDocument {
  id: string;
  source_filename: string;
  source_url: string | null;
  doc_type: DocType;
  ou_tag: OuTag | null;
  evidence_grade: EvidenceGrade | null;
  title: string | null;
  uploaded_at: string;
  last_chunked_at: string | null;
  chunk_count: number;
  byte_size: number | null;
  sha256: string | null;
  embed_model_version: string;
  metadata: Record<string, unknown> | null;
}

export interface KbChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number | null;
  page_number: number | null;
  section_title: string | null;
  created_at: string;
}

export interface SearchResult {
  chunk_id: string;
  chunk_text: string;
  document_id: string;
  source_filename: string;
  source_url: string | null;
  doc_type: DocType;
  evidence_grade: EvidenceGrade | null;
  page_number: number | null;
  section_title: string | null;
  score: number;
}

export interface IngestRequest {
  source_filename: string;
  source_url?: string;
  doc_type: DocType;
  ou_tag?: OuTag;
  evidence_grade?: EvidenceGrade;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  document_id: string;
  chunk_count: number;
  status: 'created' | 'existing';
}

export interface SearchRequest {
  query: string;
  ou_filter?: OuTag;
  doc_type_filter?: DocType;
  top_k?: number;
  min_score?: number;
}

export interface RagStatus {
  documents: number;
  chunks: number;
  last_ingest: string | null;
  pgvector_version: string;
  embed_model: string;
}

export interface ChunkInput {
  text: string;
  page_number?: number;
  section_title?: string;
}
