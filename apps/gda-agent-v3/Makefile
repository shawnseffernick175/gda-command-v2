# GDA Agent V3 — Makefile

.PHONY: seed-rag test lint dev

# Seed the RAG knowledge base from the corpus_seed_combined.jsonl file.
# Requires: DATABASE_URL and OPENAI_API_KEY environment variables.
# Calls the backend-v3 ingest script which reads files from CORPUS_DIR.
seed-rag:
	@echo "=== Seeding RAG corpus via backend-v3 ingest script ==="
	cd ../backend-v3 && \
		npx tsx scripts/ingest_initial_corpus.ts $${CORPUS_DIR:-/srv/gda-agent-v3/initial_corpus}

test:
	python -m pytest tests/ -v

lint:
	python -m ruff check src/ tests/
	python -m ruff format --check src/ tests/

dev:
	uvicorn src.main:app --host 0.0.0.0 --port 8100 --reload
