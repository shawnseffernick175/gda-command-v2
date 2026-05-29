// Fixture: simulates src-like module code that uses a forbidden token.
// The gate MUST flag this as a violation.

import { Router } from 'express';

const router = Router();

router.get('/opportunities/:id', async (req, res) => {
  const opp = await db.query('SELECT * FROM opportunities WHERE id = $1', [req.params.id]);

  // This is the violation: exposing analysis_status in API response
  res.json({
    id: opp.id,
    title: opp.title,
    analysis_status: opp.analysis_status,
    analysis: opp.analysis,
  });
});

export default router;
