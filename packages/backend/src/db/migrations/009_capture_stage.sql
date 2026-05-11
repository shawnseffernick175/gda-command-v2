-- Add capture_stage column to opportunities table for Shipley pipeline tracking
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS capture_stage TEXT DEFAULT 'interest';

-- Map existing statuses to capture stages
UPDATE opportunities SET capture_stage = 'interest' WHERE status = 'discovery' AND capture_stage = 'interest';
UPDATE opportunities SET capture_stage = 'qualify' WHERE status = 'qualified' AND capture_stage = 'interest';
UPDATE opportunities SET capture_stage = 'pursue' WHERE status = 'pipeline' AND capture_stage = 'interest';
UPDATE opportunities SET capture_stage = 'won' WHERE status = 'won' AND capture_stage = 'interest';
UPDATE opportunities SET capture_stage = 'lost' WHERE status = 'lost' AND capture_stage = 'interest';
