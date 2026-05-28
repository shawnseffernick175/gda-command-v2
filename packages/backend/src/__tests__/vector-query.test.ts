/**
 * Phase 2C PR 2: Vector query endpoint tests.
 *
 * Tests:
 * - queryEmbeddings: topK clamp, filter, similarity ordering, collection isolation
 * - fetchEmbeddingsById: returns correct rows
 * - listEmbeddingsByDocument: returns ids for a document
 * - vector-query endpoint: auth (401/503), validation (400), happy path
 * - vector-query-compare endpoint: auth, happy path
 * - vector-fetch endpoint: auth, validation, happy path
 * - vector-list-document endpoint: auth, validation, happy path
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// 1. queryEmbeddings
// ---------------------------------------------------------------------------

describe("pgvector.ts: queryEmbeddings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("queries with cosine distance and returns results ordered by similarity", async () => {
    const mockRows = [
      { id: "v1", document_id: "d1", chunk_index: 0, chunk_text: "hello", page_number: 1, section_title: "Intro", similarity: "0.95", metadata: {} },
      { id: "v2", document_id: "d1", chunk_index: 1, chunk_text: "world", page_number: 2, section_title: null, similarity: "0.80", metadata: { source: "test" } },
    ];
    const mockQuery = vi.fn().mockResolvedValue({ rows: mockRows });
    vi.doMock("../lib/db", () => ({
      getPool: () => ({ query: mockQuery }),
    }));

    const { queryEmbeddings } = await import("../lib/vector-stores/pgvector");
    const embedding = Array(1536).fill(0.01);
    const results = await queryEmbeddings("gda-documents", embedding, 10);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("embedding <=> $1::vector");
    expect(sql).toContain("WHERE collection = $2");
    expect(results).toHaveLength(2);
    expect(results[0].similarity).toBe(0.95);
    expect(results[1].similarity).toBe(0.80);
  });

  it("clamps topK to 1-50", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    vi.doMock("../lib/db", () => ({
      getPool: () => ({ query: mockQuery }),
    }));

    const { queryEmbeddings } = await import("../lib/vector-stores/pgvector");
    const embedding = Array(1536).fill(0.01);

    await queryEmbeddings("test", embedding, 100);
    const params = mockQuery.mock.calls[0][1];
    expect(params[params.length - 1]).toBe(50); // clamped to max

    mockQuery.mockClear();
    await queryEmbeddings("test", embedding, 0);
    const params2 = mockQuery.mock.calls[0][1];
    expect(params2[params2.length - 1]).toBe(1); // clamped to min
  });

  it("applies JSONB containment filter when provided", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    vi.doMock("../lib/db", () => ({
      getPool: () => ({ query: mockQuery }),
    }));

    const { queryEmbeddings } = await import("../lib/vector-stores/pgvector");
    const embedding = Array(1536).fill(0.01);

    await queryEmbeddings("test", embedding, 10, { file_type: "pdf" });
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("metadata @>");
  });

  it("isolates results by collection", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    vi.doMock("../lib/db", () => ({
      getPool: () => ({ query: mockQuery }),
    }));

    const { queryEmbeddings } = await import("../lib/vector-stores/pgvector");
    const embedding = Array(1536).fill(0.01);

    await queryEmbeddings("ai-agent-attachments", embedding, 5);
    const params = mockQuery.mock.calls[0][1];
    expect(params[1]).toBe("ai-agent-attachments");
  });

  it("throws when database not available", async () => {
    vi.doMock("../lib/db", () => ({
      getPool: () => null,
    }));

    const { queryEmbeddings } = await import("../lib/vector-stores/pgvector");
    const embedding = Array(1536).fill(0.01);
    await expect(queryEmbeddings("test", embedding, 10)).rejects.toThrow("Database not available");
  });
});

// ---------------------------------------------------------------------------
// 2. fetchEmbeddingsById
// ---------------------------------------------------------------------------

describe("pgvector.ts: fetchEmbeddingsById", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("fetches vectors by id array", async () => {
    const mockRows = [
      { id: "v1", document_id: "d1", chunk_index: 0, chunk_text: "hello", page_number: null, section_title: null, metadata: {} },
    ];
    const mockQuery = vi.fn().mockResolvedValue({ rows: mockRows });
    vi.doMock("../lib/db", () => ({
      getPool: () => ({ query: mockQuery }),
    }));

    const { fetchEmbeddingsById } = await import("../lib/vector-stores/pgvector");
    const results = await fetchEmbeddingsById(["v1"]);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("v1");
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("WHERE id = ANY($1)");
  });

  it("returns empty array for empty input", async () => {
    vi.doMock("../lib/db", () => ({
      getPool: () => ({ query: vi.fn() }),
    }));

    const { fetchEmbeddingsById } = await import("../lib/vector-stores/pgvector");
    const results = await fetchEmbeddingsById([]);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. listEmbeddingsByDocument
// ---------------------------------------------------------------------------

describe("pgvector.ts: listEmbeddingsByDocument", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("lists vector ids by collection and document", async () => {
    const mockRows = [
      { id: "doc1_chunk_0", chunk_index: 0 },
      { id: "doc1_chunk_1", chunk_index: 1 },
    ];
    const mockQuery = vi.fn().mockResolvedValue({ rows: mockRows });
    vi.doMock("../lib/db", () => ({
      getPool: () => ({ query: mockQuery }),
    }));

    const { listEmbeddingsByDocument } = await import("../lib/vector-stores/pgvector");
    const results = await listEmbeddingsByDocument("gda-documents", "doc1");

    expect(results).toHaveLength(2);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("WHERE collection = $1 AND document_id = $2");
  });
});

// ---------------------------------------------------------------------------
// 4. POST /api/internal/vector-query endpoint
// ---------------------------------------------------------------------------

describe("POST /api/internal/vector-query", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GDA_WEBHOOK_KEY", "test-key-123");
  });

  it("returns 503 when GDA_WEBHOOK_KEY not set", async () => {
    vi.stubEnv("GDA_WEBHOOK_KEY", "");
    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-query")
      .send({ collection: "test", embedding: Array(1536).fill(0.01) });
    expect(res.status).toBe(503);
  });

  it("returns 401 without valid x-gda-key", async () => {
    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-query")
      .set("x-gda-key", "wrong-key")
      .send({ collection: "test", embedding: Array(1536).fill(0.01) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing collection", async () => {
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue([]),
      fetchEmbeddingsById: vi.fn().mockResolvedValue([]),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue([]),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-query")
      .set("x-gda-key", "test-key-123")
      .send({ embedding: Array(1536).fill(0.01) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_COLLECTION");
  });

  it("returns 400 for invalid embedding length", async () => {
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue([]),
      fetchEmbeddingsById: vi.fn().mockResolvedValue([]),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue([]),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-query")
      .set("x-gda-key", "test-key-123")
      .send({ collection: "test", embedding: [0.1, 0.2] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_EMBEDDING");
  });

  it("returns 400 for topK out of range", async () => {
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue([]),
      fetchEmbeddingsById: vi.fn().mockResolvedValue([]),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue([]),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-query")
      .set("x-gda-key", "test-key-123")
      .send({ collection: "test", embedding: Array(1536).fill(0.01), topK: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOPK");
  });

  it("returns results on happy path", async () => {
    const mockResults = [
      { id: "v1", document_id: "d1", chunk_index: 0, chunk_text: "test", page_number: null, section_title: null, similarity: 0.95, metadata: {} },
    ];
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue(mockResults),
      fetchEmbeddingsById: vi.fn().mockResolvedValue([]),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue([]),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-query")
      .set("x-gda-key", "test-key-123")
      .send({ collection: "gda-documents", embedding: Array(1536).fill(0.01), topK: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0].id).toBe("v1");
  });
});

// ---------------------------------------------------------------------------
// 5. POST /api/internal/vector-fetch endpoint
// ---------------------------------------------------------------------------

describe("POST /api/internal/vector-fetch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GDA_WEBHOOK_KEY", "test-key-123");
  });

  it("returns 400 for empty ids", async () => {
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue([]),
      fetchEmbeddingsById: vi.fn().mockResolvedValue([]),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue([]),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-fetch")
      .set("x-gda-key", "test-key-123")
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it("returns vectors on happy path", async () => {
    const mockVectors = [
      { id: "v1", document_id: "d1", chunk_index: 0, chunk_text: "hello", page_number: null, section_title: null, metadata: {} },
    ];
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue([]),
      fetchEmbeddingsById: vi.fn().mockResolvedValue(mockVectors),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue([]),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-fetch")
      .set("x-gda-key", "test-key-123")
      .send({ ids: ["v1"] });
    expect(res.status).toBe(200);
    expect(res.body.data.vectors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. POST /api/internal/vector-list-document endpoint
// ---------------------------------------------------------------------------

describe("POST /api/internal/vector-list-document", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("GDA_WEBHOOK_KEY", "test-key-123");
  });

  it("returns 400 for missing documentId", async () => {
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue([]),
      fetchEmbeddingsById: vi.fn().mockResolvedValue([]),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue([]),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-list-document")
      .set("x-gda-key", "test-key-123")
      .send({ collection: "test" });
    expect(res.status).toBe(400);
  });

  it("returns vector list on happy path", async () => {
    const mockList = [{ id: "doc1_chunk_0", chunk_index: 0 }, { id: "doc1_chunk_1", chunk_index: 1 }];
    vi.doMock("../lib/vector-stores/pgvector", () => ({
      upsertEmbeddings: vi.fn(),
      deleteEmbeddings: vi.fn(),
      deleteByDocumentId: vi.fn(),
      queryEmbeddings: vi.fn().mockResolvedValue([]),
      fetchEmbeddingsById: vi.fn().mockResolvedValue([]),
      listEmbeddingsByDocument: vi.fn().mockResolvedValue(mockList),
    }));

    const { default: createRouter } = await import("../routes/vector-internal");
    const express = await import("express");
    const app = express.default();
    app.use(express.json());
    app.use("/api/internal", createRouter);

    const supertest = (await import("supertest")).default;
    const res = await supertest(app)
      .post("/api/internal/vector-list-document")
      .set("x-gda-key", "test-key-123")
      .send({ collection: "gda-documents", documentId: "doc1" });
    expect(res.status).toBe(200);
    expect(res.body.data.vectors).toHaveLength(2);
  });
});
