-- F-308: Launchpad Daily News, Day-1 Banners, Door Summaries, News Feedback
-- Adds tables for the rebuilt /launchpad page.

-- 1. launchpad_daily_news — materialized news items from SAM, USAspending, FR, GovWin, GovTribe, news
CREATE TABLE IF NOT EXISTS launchpad_daily_news (
  id            SERIAL PRIMARY KEY,
  source        TEXT NOT NULL,               -- sam | usaspending | federal_register | govwin | govtribe | news
  source_id     TEXT,                         -- native id within source
  source_url    TEXT,                         -- direct link per R1
  title         TEXT NOT NULL,
  agency        TEXT,
  dollar_value  BIGINT,                       -- cents
  why_it_matters TEXT,                        -- one-sentence AI summary
  relevance_score DOUBLE PRECISION DEFAULT 0, -- F-302 ranking score
  posted_at     TIMESTAMPTZ,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  doctrine_excluded BOOLEAN NOT NULL DEFAULT FALSE, -- F-303 filter
  exclusion_reason  TEXT,
  dismissed_at  TIMESTAMPTZ,
  clicked_at    TIMESTAMPTZ,
  saved_at      TIMESTAMPTZ,
  naics_code    TEXT,
  set_aside     TEXT,
  is_day1_banner BOOLEAN NOT NULL DEFAULT FALSE, -- meets "big enough to interrupt" threshold
  banner_dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_daily_news_posted     ON launchpad_daily_news (posted_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_news_relevance  ON launchpad_daily_news (relevance_score DESC) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_news_source     ON launchpad_daily_news (source, source_id);
CREATE INDEX IF NOT EXISTS idx_daily_news_banner     ON launchpad_daily_news (is_day1_banner, banner_dismissed_at) WHERE is_day1_banner = TRUE;

-- 2. launchpad_news_feedback — click/dismiss/save events for F-302 training
CREATE TABLE IF NOT EXISTS launchpad_news_feedback (
  id            SERIAL PRIMARY KEY,
  news_id       INTEGER NOT NULL REFERENCES launchpad_daily_news(id),
  action        TEXT NOT NULL CHECK (action IN ('clicked', 'dismissed', 'saved')),
  user_id       TEXT NOT NULL DEFAULT 'anonymous',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_feedback_news ON launchpad_news_feedback (news_id);

-- 3. launchpad_door_summaries — agent-generated one-paragraph summaries per door, cached 1h
CREATE TABLE IF NOT EXISTS launchpad_door_summaries (
  id            SERIAL PRIMARY KEY,
  door_key      TEXT NOT NULL UNIQUE,         -- opportunities | pipeline | capture | action_items | partner_intel | risks | sentinel
  door_label    TEXT NOT NULL,
  summary       TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_door_summaries_key ON launchpad_door_summaries (door_key);
