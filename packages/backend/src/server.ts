import express from "express";
import cors from "cors";
import qaRouter from "./routes/qa";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// --- API routes ---
app.use("/api/qa", qaRouter);

// --- Catch-all 404 ---
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    workflow: "gda-gateway",
    action: "not-found",
    dryRun: false,
    data: null,
    meta: { respondedAt: new Date().toISOString() },
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${_req.method} ${_req.originalUrl}`,
      detail: null,
    },
  });
});

app.listen(PORT, () => {
  console.log(`[GDA Backend] listening on http://localhost:${PORT}`);
});

export default app;
