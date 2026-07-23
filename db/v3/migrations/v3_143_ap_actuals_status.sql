-- F-625 accuracy fix: capture the Open AP report's payment Status (HOLD / PAID /
-- PPHOLD) alongside each voucher. The source workbook carries a Status column
-- that was previously discarded, so the Financial Bible AP view could not show
-- the payment-status breakdown (~92% of open AP is on HOLD). Nullable + additive:
-- existing rows keep NULL until the doc is re-ingested through the fixed parser.
ALTER TABLE ap_actuals
  ADD COLUMN IF NOT EXISTS status TEXT;

COMMENT ON COLUMN ap_actuals.status IS
  'Payment status from the Open AP report Status column (e.g. HOLD, PAID, PPHOLD). NULL when the source did not provide one.';
