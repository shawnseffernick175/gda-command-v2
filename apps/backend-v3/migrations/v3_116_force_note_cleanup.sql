-- CW-4: FORCE task order now linked to vault doc 194 (was 120).
-- Update the notes text and source_vault_doc_id accordingly.
UPDATE task_orders
   SET notes = 'Source: CEO hand-corrected PoP. Vault ID 194.',
       source_vault_doc_id = 194,
       updated_at = NOW()
 WHERE to_name = 'FORCE'
   AND to_number = 'W56KGU26FA010';
