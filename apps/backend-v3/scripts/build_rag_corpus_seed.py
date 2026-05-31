#!/usr/bin/env python3
"""
Build the GDA Command V3 RAG corpus seed.

Output: corpus_seed.jsonl — one JSON object per chunk.
Schema per chunk:
  {
    "doc_id":        "ceo_doc_3_op_doctrine",
    "doc_title":     "AJ Op Doctrine",
    "doc_kind":      "doctrine | strategy | business_plan | transcript | slides",
    "section":       "Principle 1 — Alignment",   # best-effort heading
    "chunk_idx":     17,
    "text":          "...",
    "source_uri":    "internal://ceo_docs/3_-AJ-OP-Doctorine.pdf#page=12",
    "evidence_grade":"A",                          # all CEO docs are primary
    "page":          12,                           # if extractable
    "ingested_at":   "2026-05-31T20:25:00Z"
  }

Chunking strategy:
  - Split on blank lines first; then merge to ~800-token (~3200 char) chunks with ~150-char overlap.
  - Keep page markers (--- PAGE N ---) as metadata; don't include them in chunk text.
  - Best-effort heading detection (lines that are short, ALL-CAPS, or numbered).
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path("/home/user/workspace")
OUT = WORKSPACE / "corpus_seed.jsonl"

DOCS = [
    {
        "txt": "ceo_1_AJ-Insight-Into-Future.txt",
        "doc_id": "ceo_doc_1_insight_into_future",
        "doc_title": "AJ — Insight Into the Future (Pre-Interview Context)",
        "doc_kind": "strategy",
        "source_uri_base": "internal://ceo_docs/1_AJ_Insight-Into-Future.pdf",
    },
    {
        "txt": "ceo_2_AJ-Strat-Op-Plan.txt",
        "doc_id": "ceo_doc_2_strat_op_plan",
        "doc_title": "AJ Strategic Operating Plan FY26-FY28",
        "doc_kind": "strategy",
        "source_uri_base": "internal://ceo_docs/2_AJ-Strat-Op-Plan.pdf",
    },
    {
        "txt": "ceo_3_-AJ-OP-Doctorine.txt",
        "doc_id": "ceo_doc_3_op_doctrine",
        "doc_title": "AJ Operating Doctrine (8 Principles + 6 Exclusions)",
        "doc_kind": "doctrine",
        "source_uri_base": "internal://ceo_docs/3_-AJ-OP-Doctorine.pdf",
    },
    {
        "txt": "ceo_4_Meeting_Op-Doctrine-and-Strategic-Vision-transcript.txt",
        "doc_id": "ceo_doc_4_meeting_transcript",
        "doc_title": "Meeting Transcript — Op Doctrine & Strategic Vision",
        "doc_kind": "transcript",
        "source_uri_base": "internal://ceo_docs/4_Meeting_Op-Doctrine-and-Strategic-Vision-transcript.pdf",
    },
    {
        "txt": "ceo_5_AJ_Business-Plan-Slides.txt",
        "doc_id": "ceo_doc_5_business_plan_slides",
        "doc_title": "AJ Business Plan — Slides",
        "doc_kind": "slides",
        "source_uri_base": "internal://ceo_docs/5_AJ_Business-Plan-Slides.pdf",
    },
    {
        "txt": "ceo_06_pptx.txt",
        "doc_id": "ceo_doc_6_business_plan_pptx",
        "doc_title": "GDA Business Plan FY26-FY28 (PPTX, 61 slides)",
        "doc_kind": "business_plan",
        "source_uri_base": "internal://ceo_docs/6_GDA_Business_Plan_FY26_FY28_0408-26.pptx",
    },
    {
        "txt": "ceo_07_docx.txt",
        "doc_id": "ceo_doc_7_business_plan_docx",
        "doc_title": "GDA Business Plan FY26-FY28 (DOCX, definitive)",
        "doc_kind": "business_plan",
        "source_uri_base": "internal://ceo_docs/7_GDA_Business_Plan_FY26_FY28_0408-26.docx",
    },
]

CHUNK_TARGET_CHARS = 3200      # ~800 tokens
CHUNK_OVERLAP_CHARS = 200
MIN_CHUNK_CHARS = 250          # don't emit chunks smaller than this (merge upward)

PAGE_RE = re.compile(r"^---\s*PAGE\s+(\d+)\s*---\s*$", re.IGNORECASE | re.MULTILINE)
SLIDE_RE = re.compile(r"^---\s*SLIDE\s+(\d+)\s*---\s*$", re.IGNORECASE | re.MULTILINE)

def detect_heading(text: str) -> str | None:
    """Best-effort heading detection from the first non-empty line of a chunk."""
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        # Numbered principle / section
        m = re.match(r"^(Principle\s+\d+|Exclusion\s+\d+|Section\s+\d+|\d+\.\s+\S+|[A-Z][A-Z \-]{6,})", s)
        if m:
            return s[:120]
        return None
    return None

def split_into_chunks(body: str) -> list[tuple[str, str | None, int | None]]:
    """
    Split body into chunks of roughly CHUNK_TARGET_CHARS with overlap.
    Returns list of (chunk_text, heading, page_num).
    Page numbers are tracked via PAGE/SLIDE markers if present.
    """
    # Track page markers
    page_markers = []  # list of (char_offset_in_clean_text, page_num)
    cleaned = []
    cursor = 0
    last_page = None
    for line in body.splitlines(keepends=True):
        m = PAGE_RE.match(line) or SLIDE_RE.match(line)
        if m:
            last_page = int(m.group(1))
            page_markers.append((cursor, last_page))
            continue
        cleaned.append(line)
        cursor += len(line)
    clean_text = "".join(cleaned)

    def page_at(offset: int) -> int | None:
        last = None
        for off, p in page_markers:
            # page markers were taken before lines were removed; rough approx is fine
            if off <= offset:
                last = p
            else:
                break
        return last

    # Now slide a window over clean_text
    chunks = []
    i = 0
    n = len(clean_text)
    while i < n:
        end = min(i + CHUNK_TARGET_CHARS, n)
        # try to break on a paragraph or sentence boundary near `end`
        if end < n:
            window = clean_text[i:end]
            # Prefer last double-newline
            br = window.rfind("\n\n")
            if br > CHUNK_TARGET_CHARS * 0.5:
                end = i + br
            else:
                # Fall back to last sentence end
                m = re.search(r"[.!?]\s+[^.!?]*$", window)
                if m and m.start() > CHUNK_TARGET_CHARS * 0.5:
                    end = i + m.start() + 1
        chunk_text = clean_text[i:end].strip()
        if len(chunk_text) >= MIN_CHUNK_CHARS or (i == 0 and chunk_text):
            heading = detect_heading(chunk_text)
            chunks.append((chunk_text, heading, page_at(i)))
        if end >= n:
            break
        i = max(end - CHUNK_OVERLAP_CHARS, i + 1)
    return chunks

def main():
    written = 0
    with OUT.open("w", encoding="utf-8") as f_out:
        for doc in DOCS:
            txt_path = WORKSPACE / doc["txt"]
            if not txt_path.exists():
                print(f"SKIP (missing): {txt_path}", file=sys.stderr)
                continue
            body = txt_path.read_text(encoding="utf-8", errors="replace")
            chunks = split_into_chunks(body)
            for idx, (text, heading, page) in enumerate(chunks):
                rec = {
                    "doc_id": doc["doc_id"],
                    "doc_title": doc["doc_title"],
                    "doc_kind": doc["doc_kind"],
                    "section": heading,
                    "chunk_idx": idx,
                    "text": text,
                    "source_uri": doc["source_uri_base"] + (f"#page={page}" if page else ""),
                    "evidence_grade": "A",
                    "page": page,
                    "ingested_at": datetime.now(timezone.utc).isoformat(),
                    "owner_ou": "enterprise",   # CEO docs apply to all OUs
                }
                f_out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                written += 1
            print(f"OK  {doc['doc_id']:40s} {len(chunks):4d} chunks  ({txt_path.stat().st_size:>7d} bytes)")
    print(f"\nTotal chunks written: {written}")
    print(f"Output: {OUT}")

if __name__ == "__main__":
    main()
