-- Seed default knowledge collections so document uploads don't fail on FK constraint
INSERT INTO knowledge_collections (id, name, description, document_count, total_chunks, created_at)
VALUES
  ('col-past-perf',    'Past Performance',      'Historical contract performance records, CPARS, and past performance narratives', 0, 0, NOW()),
  ('col-proposals',    'Proposals',             'Submitted proposals, technical volumes, management plans, and cost volumes',      0, 0, NOW()),
  ('col-compliance',   'Compliance',            'FAR/DFARS clause responses, compliance matrices, and regulatory guidance',        0, 0, NOW()),
  ('col-capture',      'Capture Plans',         'Capture strategies, competitive analyses, and win theme documentation',           0, 0, NOW()),
  ('col-capabilities', 'Capability Statements', 'Corporate capability statements, past performance summaries, and qualifications', 0, 0, NOW()),
  ('col-contracts',    'Contracts & Memos',     'Active contracts, modifications, task orders, and internal memos',                0, 0, NOW())
ON CONFLICT (id) DO NOTHING;
