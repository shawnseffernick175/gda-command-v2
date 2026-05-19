import { Router } from "express";
import { log } from "../lib/logger";
import { successEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";

const router = Router();

interface BotEntity { name: string; description: string; category: string; module: string; rules?: string[] }
interface BotGlossary { term: string; acronym?: string; definition: string; category?: string; related_entities?: string[] }
interface BotSource { name: string; description: string; type?: string; endpoint?: string; entities_served?: string[]; status?: string; refresh_frequency?: string }

// GET /api/book-of-truths — full data dictionary
router.get("/", async (req, res) => {
  const { search, category, module: mod } = req.query;

  const pool = getPool();
  let allEntities: BotEntity[] = [];
  let allGlossary: BotGlossary[] = [];
  let allSources: BotSource[] = [];
  if (pool) {
    try {
      const [eRes, gRes, sRes] = await Promise.all([
        pool.query("SELECT * FROM bot_entities ORDER BY name"),
        pool.query("SELECT * FROM bot_glossary ORDER BY term"),
        pool.query("SELECT * FROM bot_sources ORDER BY name"),
      ]);
      allEntities = eRes.rows as BotEntity[];
      allGlossary = gRes.rows as BotGlossary[];
      allSources = sRes.rows as BotSource[];
    } catch (err) { log.warn("book-of-truths_fallback", { error: String(err) }); }
  }

  let entities = [...allEntities];
  let glossary = [...allGlossary];
  let sources = [...allSources];

  if (search && typeof search === "string") {
    const q = search.toLowerCase();
    entities = entities.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.rules ?? []).some((r) => r.toLowerCase().includes(q))
    );
    glossary = glossary.filter(
      (g) =>
        g.term.toLowerCase().includes(q) ||
        (g.acronym ?? "").toLowerCase().includes(q) ||
        g.definition.toLowerCase().includes(q)
    );
    sources = sources.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }

  if (category && typeof category === "string") {
    entities = entities.filter((e) => e.category === category);
  }

  if (mod && typeof mod === "string") {
    entities = entities.filter((e) => e.module.toLowerCase() === mod.toLowerCase());
  }

  const categoryCounts: Record<string, number> = {};
  for (const e of allEntities) {
    categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1;
  }
  categoryCounts.glossary = allGlossary.length;
  categoryCounts.source = allSources.length;

  const modules = [...new Set(allEntities.map((e) => e.module))];

  res.json(
    successEnvelope("GDA.book-of-truths", "list", {
      entities,
      glossary,
      sources,
      categoryCounts,
      modules,
      source: "db" as const,
    })
  );
});

export default router;
