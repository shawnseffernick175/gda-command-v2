-- F-611: GovCon News items table for the Digest page.
-- Stores ingested news articles from public GovCon sources (OrangeSlices,
-- Federal News Network, GovConWire). Upsert on url to deduplicate.
-- Daily cron refresh populates this table; the frontend reads it via
-- GET /v3/digest/news.

CREATE TABLE IF NOT EXISTS news_items (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  blurb         TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  source_name   TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_wheelhouse BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_items_published
  ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_wheelhouse
  ON news_items (is_wheelhouse, published_at DESC);
