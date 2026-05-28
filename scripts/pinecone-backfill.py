#!/usr/bin/env python3
"""
Phase 2C PR 2b: Pinecone → pgvector historical backfill.

Exports all vectors from Pinecone and upserts them into document_embeddings
via /api/internal/vector-upsert. Safe to re-run (UPSERT deduplicates on id).

Usage:
  DRY_RUN_LIMIT=10 python3 pinecone-backfill.py   # dry-run: 10 vectors per namespace
  python3 pinecone-backfill.py                      # full run: all vectors

Requires env vars: PINECONE_API_KEY, PINECONE_HOST, GDA_WEBHOOK_KEY, BACKEND_URL
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse

PINECONE_HOST = os.environ.get("PINECONE_HOST", "https://ai-assistant-ezysp85.svc.aped-4627-b74a.pinecone.io")
PINECONE_KEY = os.environ.get("PINECONE_API_KEY", "")
GDA_KEY = os.environ.get("GDA_WEBHOOK_KEY", "")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://172.22.0.3:3001")
DRY_RUN_LIMIT = int(os.environ.get("DRY_RUN_LIMIT", "0"))
BATCH_SIZE = 100

# Namespace → collection mapping
NAMESPACE_MAP = {
    "gda-documents": "gda-documents",
    "": "ai-agent-attachments",
}


def api_call(url, method="GET", data=None, headers=None):
    """Make an HTTP request and return parsed JSON."""
    hdrs = headers or {}
    if data is not None:
        body = json.dumps(data).encode()
        hdrs["Content-Type"] = "application/json"
    else:
        body = None
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else ""
        print(f"  HTTP {e.code}: {err_body[:500]}", file=sys.stderr)
        raise


def describe_index_stats():
    """Get Pinecone index stats."""
    return api_call(
        f"{PINECONE_HOST}/describe_index_stats",
        method="POST",
        data={},
        headers={"Api-Key": PINECONE_KEY},
    )


def list_vectors(namespace, pagination_token=None):
    """List vector IDs in a namespace (paginated)."""
    url = f"{PINECONE_HOST}/vectors/list?namespace={urllib.parse.quote(namespace)}&limit={BATCH_SIZE}"
    if pagination_token:
        url += f"&paginationToken={urllib.parse.quote(pagination_token)}"
    return api_call(url, headers={"Api-Key": PINECONE_KEY})


def fetch_vectors(ids, namespace):
    """Fetch full vectors (values + metadata) by ID."""
    params = "&".join(f"ids={urllib.parse.quote(vid)}" for vid in ids)
    ns_param = f"&namespace={urllib.parse.quote(namespace)}" if namespace else ""
    return api_call(
        f"{PINECONE_HOST}/vectors/fetch?{params}{ns_param}",
        method="GET",
        headers={"Api-Key": PINECONE_KEY},
    )


def upsert_to_pgvector(collection, items):
    """POST batch to /api/internal/vector-upsert."""
    return api_call(
        f"{BACKEND_URL}/api/internal/vector-upsert",
        method="POST",
        data={"collection": collection, "items": items},
        headers={"x-gda-key": GDA_KEY, "Content-Type": "application/json"},
    )


def transform_vector(vec_id, vec_data, collection):
    """Transform a Pinecone vector to VectorItem shape."""
    meta = vec_data.get("metadata", {})
    # Backend VectorItem interface: { id, content, embedding, metadata }
    # - document_id read from metadata.document_id (NOT NULL in schema)
    # - chunk_text read from item.content
    # - chunk_index, page_number, section_title read from metadata
    doc_id = meta.get("document_id") or meta.get("source") or vec_id.rsplit("_chunk_", 1)[0]
    raw_text = meta.get("text", "") or meta.get("chunk_text", "") or "(no text)"
    # Strip null bytes that cause PostgreSQL UTF-8 encoding errors
    chunk_text = raw_text.replace("\x00", "")

    # Ensure metadata has document_id (the backend reads it from there)
    # Also strip null bytes from all string values in metadata
    enriched_meta = {}
    for k, v in meta.items():
        enriched_meta[k] = v.replace("\x00", "") if isinstance(v, str) else v
    enriched_meta["document_id"] = doc_id
    enriched_meta.setdefault("chunk_index", 0)
    if meta.get("page") or meta.get("page_number"):
        enriched_meta["page_number"] = meta.get("page") or meta.get("page_number")
    if meta.get("section_title") or meta.get("heading"):
        enriched_meta["section_title"] = meta.get("section_title") or meta.get("heading")

    return {
        "id": vec_id,
        "content": chunk_text,
        "embedding": vec_data.get("values", []),
        "metadata": enriched_meta,
    }


def backfill_namespace(namespace, collection, expected_count):
    """Backfill one namespace from Pinecone → pgvector."""
    print(f"\n{'='*60}")
    print(f"Namespace: '{namespace}' → collection: '{collection}'")
    print(f"Expected: {expected_count} vectors")
    print(f"{'='*60}")

    total_fetched = 0
    total_upserted = 0
    errors = []
    batch_num = 0
    pagination_token = None

    while True:
        # List vector IDs
        list_data = list_vectors(namespace, pagination_token)
        vector_ids = [v["id"] for v in list_data.get("vectors", [])]
        pagination_token = (list_data.get("pagination") or {}).get("next")

        if not vector_ids:
            break

        # Fetch full vectors
        fetch_data = fetch_vectors(vector_ids, namespace)
        vectors = fetch_data.get("vectors", {})

        # Transform and collect
        items = []
        for vid, vdata in vectors.items():
            items.append(transform_vector(vid, vdata, collection))

        # Upsert in sub-batches of 10 to avoid request body size limits
        UPSERT_CHUNK = 10
        if items:
            for i in range(0, len(items), UPSERT_CHUNK):
                chunk = items[i:i + UPSERT_CHUNK]
                try:
                    upsert_to_pgvector(collection, chunk)
                    total_upserted += len(chunk)
                except Exception as e:
                    errors.append(f"Batch {batch_num} chunk {i//UPSERT_CHUNK}: {e}")
                    print(f"  ERROR batch {batch_num} chunk {i//UPSERT_CHUNK}: {e}",
                          file=sys.stderr)

        total_fetched += len(vector_ids)
        batch_num += 1
        print(f"  Batch {batch_num}: fetched={len(vector_ids)}, upserted={len(items)}, "
              f"total={total_fetched}/{expected_count}")

        if DRY_RUN_LIMIT > 0 and total_fetched >= DRY_RUN_LIMIT:
            print(f"  DRY_RUN_LIMIT={DRY_RUN_LIMIT} reached, stopping early")
            break

        if not pagination_token:
            break

    status = "success" if not errors else "partial"
    print(f"\nResult: {status} — fetched={total_fetched}, upserted={total_upserted}, "
          f"errors={len(errors)}")
    return {
        "namespace": namespace,
        "collection": collection,
        "expected_count": expected_count,
        "total_fetched": total_fetched,
        "total_upserted": total_upserted,
        "batches": batch_num,
        "errors": errors,
        "status": status,
    }


def main():
    if not PINECONE_KEY:
        print("ERROR: PINECONE_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    if not GDA_KEY:
        print("ERROR: GDA_WEBHOOK_KEY not set", file=sys.stderr)
        sys.exit(1)

    mode = f"DRY RUN (limit={DRY_RUN_LIMIT})" if DRY_RUN_LIMIT > 0 else "FULL RUN"
    print(f"Pinecone → pgvector backfill ({mode})")
    print(f"Host: {PINECONE_HOST}")
    print(f"Backend: {BACKEND_URL}")

    # Describe index
    stats = describe_index_stats()
    print(f"\nIndex stats: {stats.get('totalVectorCount')} total vectors, "
          f"dimension={stats.get('dimension')}")
    print(f"Namespaces: {json.dumps({k: v['vectorCount'] for k, v in stats.get('namespaces', {}).items()})}")

    # Build namespace list
    results = []
    for ns, info in stats.get("namespaces", {}).items():
        collection = NAMESPACE_MAP.get(ns, ns)
        if collection == ns and ns not in NAMESPACE_MAP:
            print(f"  WARNING: unmapped namespace '{ns}' → using as collection name")
        result = backfill_namespace(ns, collection, info["vectorCount"])
        results.append(result)

    # Summary
    print(f"\n{'='*60}")
    print("BACKFILL SUMMARY")
    print(f"{'='*60}")
    for r in results:
        print(f"  {r['collection']:30s} fetched={r['total_fetched']:>6d}  "
              f"upserted={r['total_upserted']:>6d}  expected={r['expected_count']:>6d}  "
              f"status={r['status']}")

    total_upserted = sum(r["total_upserted"] for r in results)
    total_errors = sum(len(r["errors"]) for r in results)
    print(f"\nTotal upserted: {total_upserted}")
    print(f"Total errors: {total_errors}")

    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
