/**
 * Phase 2C PR 2b: Backfill transformation + upsert logic tests.
 *
 * Skipped unless RUN_BACKFILL_TEST=1.
 *
 * Tests:
 * - Pinecone vector → VectorItem transformation (document_id derivation)
 * - Null byte stripping from text content
 * - Namespace → collection mapping
 * - UPSERT idempotency (no duplicates on re-run)
 * - Vectors land with correct chunk_text, embedding, metadata
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const SKIP = !process.env.RUN_BACKFILL_TEST;

// ---------------------------------------------------------------------------
// Transformation logic (mirrors scripts/pinecone-backfill.py transform)
// ---------------------------------------------------------------------------

const NAMESPACE_MAP: Record<string, string> = {
  "gda-documents": "gda-documents",
  "": "ai-agent-attachments",
};

interface PineconeVector {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

interface VectorItem {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

function mapNamespaceToCollection(ns: string): string {
  return NAMESPACE_MAP[ns] ?? ns;
}

function transformVector(vecId: string, vec: PineconeVector): VectorItem {
  const meta = vec.metadata ?? {};
  const docId =
    (meta.document_id as string) ||
    (meta.source as string) ||
    vecId.split("_chunk_")[0];
  const rawText =
    (meta.text as string) || (meta.chunk_text as string) || "(no text)";
  const chunkText = rawText.replace(/\0/g, "");

  const enriched: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    enriched[k] = typeof v === "string" ? v.replace(/\0/g, "") : v;
  }
  enriched.document_id = docId;
  if (enriched.chunk_index === undefined) enriched.chunk_index = 0;

  return {
    id: vecId,
    content: chunkText,
    embedding: vec.values,
    metadata: enriched,
  };
}

// ---------------------------------------------------------------------------
// 1. Namespace → collection mapping
// ---------------------------------------------------------------------------

describe("backfill: namespace → collection mapping", () => {
  it("maps empty string to ai-agent-attachments", () => {
    expect(mapNamespaceToCollection("")).toBe("ai-agent-attachments");
  });

  it("maps gda-documents to gda-documents", () => {
    expect(mapNamespaceToCollection("gda-documents")).toBe("gda-documents");
  });

  it("maps unknown namespace to itself", () => {
    expect(mapNamespaceToCollection("financial")).toBe("financial");
    expect(mapNamespaceToCollection("Shawn Offer.pdf")).toBe(
      "Shawn Offer.pdf",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Vector transformation
// ---------------------------------------------------------------------------

describe("backfill: vector transformation", () => {
  it("extracts document_id from metadata", () => {
    const item = transformVector("vec-1", {
      id: "vec-1",
      values: [0.1, 0.2],
      metadata: { document_id: "doc-abc", text: "hello" },
    });
    expect(item.metadata.document_id).toBe("doc-abc");
    expect(item.content).toBe("hello");
  });

  it("derives document_id from vec_id when metadata lacks it", () => {
    const item = transformVector("doc_123_chunk_0", {
      id: "doc_123_chunk_0",
      values: [0.1],
      metadata: { text: "content" },
    });
    expect(item.metadata.document_id).toBe("doc_123");
  });

  it("falls back to source field for document_id", () => {
    const item = transformVector("some-id", {
      id: "some-id",
      values: [0.1],
      metadata: { source: "my-source", text: "content" },
    });
    expect(item.metadata.document_id).toBe("my-source");
  });

  it("strips null bytes from text content", () => {
    const item = transformVector("vec-2", {
      id: "vec-2",
      values: [0.1],
      metadata: { document_id: "d1", text: "hello\x00world\x00" },
    });
    expect(item.content).toBe("helloworld");
    expect(item.content).not.toContain("\x00");
  });

  it("strips null bytes from all string metadata values", () => {
    const item = transformVector("vec-3", {
      id: "vec-3",
      values: [0.1],
      metadata: {
        document_id: "d1",
        text: "ok\x00",
        source: "file\x00.pdf",
      },
    });
    expect(item.metadata.source).toBe("file.pdf");
  });

  it("defaults chunk_text to (no text) when metadata has no text field", () => {
    const item = transformVector("vec-4", {
      id: "vec-4",
      values: [0.1],
      metadata: { document_id: "d1" },
    });
    expect(item.content).toBe("(no text)");
  });

  it("preserves embedding values unchanged", () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const item = transformVector("vec-5", {
      id: "vec-5",
      values: embedding,
      metadata: { document_id: "d1", text: "t" },
    });
    expect(item.embedding).toEqual(embedding);
  });
});

// ---------------------------------------------------------------------------
// 3. Upsert via mocked pgvector (idempotency)
// ---------------------------------------------------------------------------

describe("backfill: upsert idempotency", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.skipIf(SKIP)(
    "5 vectors land in document_embeddings with correct fields",
    async () => {
      const insertedRows: unknown[][] = [];
      const mockQuery = vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes("INSERT INTO document_embeddings")) {
          insertedRows.push(params as unknown[]);
        }
        return { rows: [], rowCount: 1 };
      });
      vi.doMock("../lib/db", () => ({
        getPool: () => ({ query: mockQuery }),
      }));

      const { upsertEmbeddings } = await import(
        "../lib/vector-stores/pgvector"
      );

      const items: VectorItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: `backfill-test-${i}`,
        content: `chunk text ${i}`,
        embedding: Array(1536).fill(0.01),
        metadata: {
          document_id: `doc-${i}`,
          chunk_index: i,
          source: "backfill-test",
        },
      }));

      await upsertEmbeddings("gda-documents", items);
      expect(insertedRows).toHaveLength(5);

      // Verify first item params: id, document_id, chunk_index, content, ...
      expect(insertedRows[0][0]).toBe("backfill-test-0"); // id
      expect(insertedRows[0][1]).toBe("doc-0"); // document_id
      expect(insertedRows[0][2]).toBe(0); // chunk_index
      expect(insertedRows[0][3]).toBe("chunk text 0"); // chunk_text (from content)
    },
  );

  it.skipIf(SKIP)(
    "re-upsert same 5 vectors produces no duplicates (ON CONFLICT UPDATE)",
    async () => {
      let callCount = 0;
      const mockQuery = vi.fn().mockImplementation(() => {
        callCount++;
        return { rows: [], rowCount: 1 };
      });
      vi.doMock("../lib/db", () => ({
        getPool: () => ({ query: mockQuery }),
      }));

      const { upsertEmbeddings } = await import(
        "../lib/vector-stores/pgvector"
      );

      const items: VectorItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: `backfill-dup-${i}`,
        content: `text ${i}`,
        embedding: [0.1],
        metadata: { document_id: `doc-${i}` },
      }));

      // First upsert
      await upsertEmbeddings("test", items);
      const firstCallCount = callCount;

      // Second upsert (same items)
      await upsertEmbeddings("test", items);
      const secondCallCount = callCount - firstCallCount;

      // Both runs should execute the same number of queries (5 each)
      // ON CONFLICT handles deduplication at the DB level
      expect(firstCallCount).toBe(5);
      expect(secondCallCount).toBe(5);

      // Verify SQL uses ON CONFLICT
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    },
  );
});
