/**
 * Raw arXiv Atom entry shape parsed from the arXiv API response.
 * All text fields are whitespace-collapsed after parsing.
 */

export interface ArxivEntryRaw {
  arxivId: string;           // "2606.02111v1"
  title: string;
  summary: string;
  published: string;         // ISO datetime
  updated: string;           // ISO datetime
  absUrl: string;            // https://arxiv.org/abs/...
  pdfUrl: string | null;
  primaryCategory: string | null;
  categories: string[];
  authors: string[];
}
