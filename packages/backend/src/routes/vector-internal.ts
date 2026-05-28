// ---------------------------------------------------------------------------
// Internal vector endpoints for n8n workflow writes.
// POST /api/internal/vector-upsert
// POST /api/internal/vector-delete
// POST /api/internal/vector-delete-by-document
//
// Auth: x-gda-key header (same as ingest endpoints).
// Writes land in the existing document_embeddings table — no parallel table.
// ---------------------------------------------------------------------------

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";
import {
  upsertEmbeddings,
  deleteEmbeddings,
  deleteByDocumentId,
} from "../lib/vector-stores/pgvector";
import type { VectorItem } from "../lib/vector-stores/pgvector";

const router = Router();

function verifyInternalKey(
  req: import("express").Request,
  res: import("express").Response,
): boolean {
  const key = process.env.GDA_WEBHOOK_KEY;
  if (!key) {
    res.status(503).json(
      errorEnvelope("vector-internal", "auth", {
        code: "NOT_CONFIGURED",
        message: "GDA_WEBHOOK_KEY not set",
        detail: null,
      }),
    );
    return false;
  }
  const provided = req.headers["x-gda-key"] as string;
  if (provided !== key) {
    res.status(401).json(
      errorEnvelope("vector-internal", "auth", {
        code: "UNAUTHORIZED",
        message: "Invalid or missing x-gda-key header",
        detail: null,
      }),
    );
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/internal/vector-upsert
// Body: { collection: string, items: VectorItem[] }
// ---------------------------------------------------------------------------

router.post("/vector-upsert", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { collection, items } = req.body as {
      collection?: string;
      items?: VectorItem[];
    };

    if (!collection || typeof collection !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "upsert", {
          code: "INVALID_COLLECTION",
          message: "collection is required and must be a string",
          detail: null,
        }),
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "upsert", {
          code: "INVALID_ITEMS",
          message: "items must be a non-empty array",
          detail: null,
        }),
      );
    }

    // Validate each item has id + embedding
    for (const item of items) {
      if (!item.id || !Array.isArray(item.embedding) || item.embedding.length === 0) {
        return res.status(400).json(
          errorEnvelope("vector-internal", "upsert", {
            code: "INVALID_ITEM",
            message: `Each item must have id (string) and embedding (number[])`,
            detail: item.id ?? null,
          }),
        );
      }
    }

    await upsertEmbeddings(collection, items);

    log.info("vector_internal_upsert", {
      collection,
      count: items.length,
    });

    return res.json(
      successEnvelope("vector-internal", "upsert", {
        upserted: items.length,
        collection,
      }),
    );
  } catch (e) {
    log.error("vector_internal_upsert_failed", {
      error: (e as Error).message,
    });
    return res.status(500).json(
      errorEnvelope("vector-internal", "upsert", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-delete
// Body: { ids: string[] }
// ---------------------------------------------------------------------------

router.post("/vector-delete", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { ids } = req.body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json(
        errorEnvelope("vector-internal", "delete", {
          code: "INVALID_IDS",
          message: "ids must be a non-empty string array",
          detail: null,
        }),
      );
    }

    await deleteEmbeddings(ids);

    return res.json(
      successEnvelope("vector-internal", "delete", {
        deleted: ids.length,
      }),
    );
  } catch (e) {
    return res.status(500).json(
      errorEnvelope("vector-internal", "delete", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/internal/vector-delete-by-document
// Body: { documentId: string }
// ---------------------------------------------------------------------------

router.post("/vector-delete-by-document", async (req, res) => {
  if (!verifyInternalKey(req, res)) return;

  try {
    const { documentId } = req.body as { documentId?: string };

    if (!documentId || typeof documentId !== "string") {
      return res.status(400).json(
        errorEnvelope("vector-internal", "delete-by-document", {
          code: "INVALID_DOCUMENT_ID",
          message: "documentId is required",
          detail: null,
        }),
      );
    }

    await deleteByDocumentId(documentId);

    return res.json(
      successEnvelope("vector-internal", "delete-by-document", {
        documentId,
      }),
    );
  } catch (e) {
    return res.status(500).json(
      errorEnvelope("vector-internal", "delete-by-document", {
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
        detail: null,
      }),
    );
  }
});

export default router;
