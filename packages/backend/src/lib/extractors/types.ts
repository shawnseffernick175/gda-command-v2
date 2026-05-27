/** Result of extracting text from a document. */
export interface ExtractResult {
  text: string;
  metadata: Record<string, unknown>;
  children?: { name: string; buffer: Buffer; mimeType: string }[];
}
