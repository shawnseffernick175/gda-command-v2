import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOpportunitiesPaged } from "../use-opportunities";
import { setToken } from "@/lib/api";

function jsonEnvelope(data: unknown): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data,
      meta: { generatedAt: "now", source: "test", requestId: "r1" },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchSpy: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  setToken("test-token");
  fetchSpy = vi.fn(async () =>
    jsonEnvelope({ items: [], total: 0, page: 1, totalPages: 1 }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * Render the hook through a real React tree (createRoot, not
 * @testing-library/react — that is hoisted to the monorepo root next to
 * React 18 and conflicts with this package's React 19). We don't assert on
 * what the hook returns; we only care about the URL it asks `fetch` for.
 */
function renderSortHook(sort_by: string, sort_dir: "asc" | "desc"): void {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Harness() {
    useOpportunitiesPaged({ sort_by, sort_dir });
    return null;
  }

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      createElement(QueryClientProvider, { client: qc }, createElement(Harness)),
    );
  });
}

async function waitForFetch(): Promise<string> {
  for (let i = 0; i < 50 && fetchSpy.mock.calls.length === 0; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(fetchSpy).toHaveBeenCalled();
  return String(fetchSpy.mock.calls[0][0]);
}

describe("useOpportunitiesPaged — sort contract", () => {
  it("sorts Pwin via the list endpoint query string, not a /pwin path", async () => {
    renderSortHook("pwin", "desc");
    const url = await waitForFetch();

    // Hits the canonical list endpoint…
    expect(url).toContain("/v3/opportunities?");
    // …with the sort expressed as query params the backend understands.
    expect(url).toContain("sort_by=pwin");
    expect(url).toContain("sort_dir=desc");
    // Regression guard: the old bug appended the field to the path, which 404s.
    expect(url).not.toMatch(/\/v3\/opportunities\/pwin/);
  });

  it("uses the same query contract for other sortable columns", async () => {
    renderSortHook("value", "asc");
    const url = await waitForFetch();

    expect(url).toContain("/v3/opportunities?");
    expect(url).toContain("sort_by=value");
    expect(url).toContain("sort_dir=asc");
    expect(url).not.toMatch(/\/v3\/opportunities\/value/);
  });
});
