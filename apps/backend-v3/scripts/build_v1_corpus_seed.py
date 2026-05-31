#!/usr/bin/env python3
"""
Build the V1 session-history corpus seed for F-301 RAG.

Source: /home/user/workspace/feb_apr_uploads/**/*.md (42 V1 session-state files)
Output: corpus_seed_v1.jsonl

Schema matches corpus_seed.jsonl from build_rag_corpus_seed.py:
  doc_id, doc_title, doc_kind, section, chunk_idx, text, source_uri,
  evidence_grade, page, ingested_at, owner_ou

Evidence grade: B (secondary — V1 decision history, not primary doctrine)
Doc kind: v1_session_state
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

V1_ROOT = Path("/home/user/workspace/feb_apr_uploads")
OUT = Path("/home/user/workspace/corpus_seed_v1.jsonl")

CHUNK_TARGET_CHARS = 3200
CHUNK_OVERLAP_CHARS = 200
MIN_CHUNK_CHARS = 250


def detect_heading(text: str) -> str | None:
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            return s.lstrip("# ").strip()[:120]
        return None
    return None


def split_into_chunks(body: str) -> list[tuple[str, str | None]]:
    chunks = []
    i = 0
    n = len(body)
    while i < n:
        end = min(i + CHUNK_TARGET_CHARS, n)
        if end < n:
            window = body[i:end]
            br = window.rfind("\n\n")
            if br > CHUNK_TARGET_CHARS * 0.5:
                end = i + br
            else:
                m = re.search(r"[.!?]\s+[^.!?]*$", window)
                if m and m.start() > CHUNK_TARGET_CHARS * 0.5:
                    end = i + m.start() + 1
        chunk_text = body[i:end].strip()
        if len(chunk_text) >= MIN_CHUNK_CHARS or (i == 0 and chunk_text):
            chunks.append((chunk_text, detect_heading(chunk_text)))
        if end >= n:
            break
        i = max(end - CHUNK_OVERLAP_CHARS, i + 1)
    return chunks


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def main():
    written = 0
    docs = 0
    md_files = sorted(V1_ROOT.glob("*/*.md"))
    with OUT.open("w", encoding="utf-8") as f_out:
        for md in md_files:
            rel = md.relative_to(V1_ROOT)
            body = md.read_text(encoding="utf-8", errors="replace")
            if len(body) < 100:
                continue
            doc_id = "v1_" + slugify(str(rel)).replace(".md", "")[:80]
            doc_title = f"V1 Session — {rel}"
            chunks = split_into_chunks(body)
            for idx, (text, heading) in enumerate(chunks):
                rec = {
                    "doc_id": doc_id,
                    "doc_title": doc_title,
                    "doc_kind": "v1_session_state",
                    "section": heading,
                    "chunk_idx": idx,
                    "text": text,
                    "source_uri": f"internal://v1_archive/{rel}",
                    "evidence_grade": "B",
                    "page": None,
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                    "owner_ou": "enterprise",
                }
                f_out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                written += 1
            docs += 1
            print(f"OK  {rel.parent}/{rel.name:50s} {len(chunks):3d} chunks")
    print(f"\nDocs processed: {docs}")
    print(f"Total chunks written: {written}")
    print(f"Output: {OUT}")


if __name__ == "__main__":
    main()
