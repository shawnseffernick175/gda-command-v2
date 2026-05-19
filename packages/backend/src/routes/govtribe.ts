import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import {
  searchGovTribeAwards,
  searchGovTribeForecasts,
  searchGovTribeContacts,
  searchGovTribeVendors,
  searchGovTribeVehicles,
  searchGovTribeLaborRates,
  checkGovTribeHealth,
  getGovTribeCreditUsage,
  resetGovTribeCreditCycle,
} from "../lib/gov-sources";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/govtribe/health — automated MCP endpoint + API key validation
// Same pattern as SAM verify — no manual curl needed.
// ---------------------------------------------------------------------------
router.get("/health", async (_req, res) => {
  try {
    const result = await checkGovTribeHealth();
    const credits = getGovTribeCreditUsage();
    res.json(
      successEnvelope("GDA.govtribe", "health", { ...result, credits }, {
        hint: result.status === "no_key"
          ? "Set GOVTRIBE_API_KEY environment variable"
          : result.status === "error"
            ? "MCP endpoint unreachable or API key invalid"
            : `MCP endpoint healthy — ${result.toolCount} tools available, ${credits.totalCredits} credits used this cycle`,
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.govtribe", "health", {
        code: "INTERNAL",
        message: (e as Error).message,
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/govtribe/credits — credit usage this cycle
// ---------------------------------------------------------------------------
router.get("/credits", (_req, res) => {
  const usage = getGovTribeCreditUsage();
  res.json(
    successEnvelope("GDA.govtribe.credits", "usage", usage, {
      hint: usage.budgetExceeded
        ? `Budget exceeded: ${usage.totalCredits}/${usage.budgetLimit} credits`
        : usage.budgetLimit != null
          ? `${usage.totalCredits}/${usage.budgetLimit} credits used (${Math.round((usage.totalCredits / usage.budgetLimit) * 100)}%)`
          : `${usage.totalCredits} credits used (no budget limit set — set GOVTRIBE_CREDIT_BUDGET)`,
    })
  );
});

// ---------------------------------------------------------------------------
// POST /api/govtribe/credits/reset — reset credit cycle counter
// ---------------------------------------------------------------------------
router.post("/credits/reset", (_req, res) => {
  resetGovTribeCreditCycle();
  res.json(
    successEnvelope("GDA.govtribe.credits", "reset", { reset: true }, {
      hint: "Credit cycle counter reset to zero",
    })
  );
});

// ---------------------------------------------------------------------------
// GET /api/govtribe/awards — search federal contract awards
// ---------------------------------------------------------------------------
router.get("/awards", async (req, res) => {
  try {
    const query = String(req.query.q ?? req.query.query ?? "");
    const per_page = req.query.per_page ? Number(req.query.per_page) : 25;
    const page = req.query.page ? Number(req.query.page) : 1;
    const date_range = req.query.date_range ? String(req.query.date_range) : undefined;

    const result = await searchGovTribeAwards(query, { per_page, page, date_range });
    res.json(
      successEnvelope("GDA.govtribe.awards", "search", result, {
        count: result.data.length,
        hint: `${result.total} total awards matching query`,
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.govtribe.awards", "search", {
        code: "MCP_ERROR",
        message: (e as Error).message,
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/govtribe/forecasts — search federal forecasts (pre-solicitation)
// ---------------------------------------------------------------------------
router.get("/forecasts", async (req, res) => {
  try {
    const query = String(req.query.q ?? req.query.query ?? "");
    const per_page = req.query.per_page ? Number(req.query.per_page) : 25;
    const page = req.query.page ? Number(req.query.page) : 1;

    const result = await searchGovTribeForecasts(query, { per_page, page });
    res.json(
      successEnvelope("GDA.govtribe.forecasts", "search", result, {
        count: result.data.length,
        hint: `${result.total} total forecasts matching query`,
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.govtribe.forecasts", "search", {
        code: "MCP_ERROR",
        message: (e as Error).message,
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/govtribe/contacts — search government buyer contacts
// ---------------------------------------------------------------------------
router.get("/contacts", async (req, res) => {
  try {
    const query = String(req.query.q ?? req.query.query ?? "");
    const per_page = req.query.per_page ? Number(req.query.per_page) : 25;
    const page = req.query.page ? Number(req.query.page) : 1;
    const agency_ids = req.query.agency_ids
      ? String(req.query.agency_ids).split(",")
      : undefined;

    const result = await searchGovTribeContacts(query, { per_page, page, agency_ids });
    res.json(
      successEnvelope("GDA.govtribe.contacts", "search", result, {
        count: result.data.length,
        hint: `${result.total} total contacts matching query`,
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.govtribe.contacts", "search", {
        code: "MCP_ERROR",
        message: (e as Error).message,
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/govtribe/vendors — search vendor profiles
// ---------------------------------------------------------------------------
router.get("/vendors", async (req, res) => {
  try {
    const query = String(req.query.q ?? req.query.query ?? "");
    const per_page = req.query.per_page ? Number(req.query.per_page) : 25;
    const page = req.query.page ? Number(req.query.page) : 1;

    const result = await searchGovTribeVendors(query, { per_page, page });
    res.json(
      successEnvelope("GDA.govtribe.vendors", "search", result, {
        count: result.data.length,
        hint: `${result.total} total vendors matching query`,
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.govtribe.vendors", "search", {
        code: "MCP_ERROR",
        message: (e as Error).message,
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/govtribe/vehicles — search federal contract vehicles
// ---------------------------------------------------------------------------
router.get("/vehicles", async (req, res) => {
  try {
    const query = String(req.query.q ?? req.query.query ?? "");
    const per_page = req.query.per_page ? Number(req.query.per_page) : 25;
    const page = req.query.page ? Number(req.query.page) : 1;

    const result = await searchGovTribeVehicles(query, { per_page, page });
    res.json(
      successEnvelope("GDA.govtribe.vehicles", "search", result, {
        count: result.data.length,
        hint: `${result.total} total vehicles matching query`,
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.govtribe.vehicles", "search", {
        code: "MCP_ERROR",
        message: (e as Error).message,
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/govtribe/labor-rates — search GSA MAS labor rate benchmarks
// ---------------------------------------------------------------------------
router.get("/labor-rates", async (req, res) => {
  try {
    const keyword = String(req.query.q ?? req.query.keyword ?? "");
    if (!keyword) {
      return res.status(400).json(
        errorEnvelope("GDA.govtribe.labor-rates", "search", {
          code: "MISSING_KEYWORD",
          message: "Labor rate search requires a keyword (e.g., 'program manager')",
          detail: null,
        })
      );
    }

    const worksite = req.query.worksite
      ? String(req.query.worksite).split(",")
      : undefined;
    const business_size = req.query.business_size
      ? String(req.query.business_size).split(",")
      : undefined;
    const contract_year = req.query.contract_year
      ? String(req.query.contract_year)
      : undefined;

    const result = await searchGovTribeLaborRates(keyword, {
      worksite,
      business_size,
      contract_year,
    });
    res.json(
      successEnvelope("GDA.govtribe.labor-rates", "search", result, {
        count: result.items.length,
        hint: "GSA MAS labor ceiling-rate benchmarks — not-to-exceed rates, not wages",
      })
    );
  } catch (e: unknown) {
    res.status(500).json(
      errorEnvelope("GDA.govtribe.labor-rates", "search", {
        code: "MCP_ERROR",
        message: (e as Error).message,
        detail: null,
      })
    );
  }
});

export default router;
