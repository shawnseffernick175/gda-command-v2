import { Router } from "express";
import { successEnvelope } from "../middleware/envelope";
import { MOCK_ENTITIES, MOCK_GLOSSARY, MOCK_SOURCES } from "../data/book-of-truths-mock";

const router = Router();

// GET /api/book-of-truths — full data dictionary
router.get("/", (req, res) => {
  const { search, category, module: mod } = req.query;

  let entities = [...MOCK_ENTITIES];
  let glossary = [...MOCK_GLOSSARY];
  let sources = [...MOCK_SOURCES];

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

  const allEntities = MOCK_ENTITIES;
  const categoryCounts = {
    entity: allEntities.filter((e) => e.category === "entity").length,
    rule: allEntities.filter((e) => e.category === "rule").length,
    glossary: MOCK_GLOSSARY.length,
    source: MOCK_SOURCES.length,
  };

  const modules = [...new Set(allEntities.map((e) => e.module))];

  res.json(
    successEnvelope("GDA.book-of-truths", "list", {
      entities,
      glossary,
      sources,
      categoryCounts,
      modules,
      source: "mock" as const,
    })
  );
});

export default router;
