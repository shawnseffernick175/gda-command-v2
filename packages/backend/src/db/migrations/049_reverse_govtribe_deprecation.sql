-- Reverse the GovTribe deprecation from migration 047.
-- GovTribe the company is alive with an active paid subscription.
-- The old public REST API (docs.govtribe.com) was deprecated in 2023,
-- but GovTribe now offers an MCP server at govtribe.com/mcp as the
-- current access path. The source should remain enabled.
-- DIBBS deprecation from 047 is unaffected — that finding stands.

UPDATE gov_source_feeds
  SET enabled = true,
      deprecated_at = NULL,
      deprecation_reason = NULL
  WHERE id = 'feed-govtribe';
