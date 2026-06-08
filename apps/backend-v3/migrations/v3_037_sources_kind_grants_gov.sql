-- F-470: add grants_gov to sources.kind check constraint
-- Drops and recreates the constraint to include 'grants_gov'.

ALTER TABLE sources DROP CONSTRAINT sources_kind_check;

ALTER TABLE sources ADD CONSTRAINT sources_kind_check CHECK (
  kind = ANY (ARRAY[
    'sam_gov', 'fpds', 'usaspending', 'govwin', 'govtribe',
    'news', 'doctrine', 'partner_site', 'internal', 'manual',
    'n8n_workflow', 'dibbs', 'neco', 'sbir', 'federal_register',
    'color_team', 'nsf', 'dod_rss', 'nih', 'arxiv', 'grants_gov'
  ])
);
