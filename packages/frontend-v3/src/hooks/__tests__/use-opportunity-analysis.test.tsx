import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import {
  useOpportunityAnalysis,
  type UseOpportunityAnalysisReturn,
} from "../use-opportunity-analysis";
import { sseFetch, ApiError } from "@/lib/api";

/**
 * #1123 — acceptance criterion 3: an analysis SSE failure must NEVER blank the
 * whole opportunity view. On a hard 401 the hook surfaces an inline
 * "unavailable" error (the list + detail keep rendering); a stream-level error
 * that arrives AFTER a section has streamed must not discard the sections that
 * already rendered (#1119).
 *
 * sseFetch owns the token-attach + refresh-before-request + refresh-on-401
 * behaviour (covered in lib/__tests__/sse-fetch.test.ts). Here we mock it so we
 * can drive the hook's consumption of the stream and its error handling.
 */

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return { ...actual, sseFetch: vi.fn() };
});

const mockedSseFetch = vi.mocked(sseFetch);

// createRoot + act() require this flag to be set for React 19 in a test env.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let latest: UseOpportunityAnalysisReturn;

function renderAnalysisHook(id: string): void {
  function Harness() {
    latest = useOpportunityAnalysis(id);
    return null;
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Harness));
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !predicate(); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(predicate()).toBe(true);
}

beforeEach(() => {
  mockedSseFetch.mockReset();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  vi.clearAllMocks();
});

describe("useOpportunityAnalysis — #1123 never blank the view", () => {
  it("streams every section and finishes on the done event", async () => {
    mockedSseFetch.mockResolvedValue(
      sseResponse(
        'data: {"section":"pwin","data":{"score":72,"grade":"Go","top_drivers":[]},"sources":[]}\n\n' +
          'data: {"section":"doctrine","data":{"alignment_total":28,"max_score":40,"principle_scores":{},"exclusions_triggered":[],"margin_check":null,"evidence_grades":{},"recommendations":[]},"sources":[]}\n\n' +
          "event: done\ndata: {}\n\n",
      ),
    );

    renderAnalysisHook("1");
    await waitFor(() => latest.isDone);

    expect(latest.sections.pwin?.data.score).toBe(72);
    expect(latest.sections.doctrine?.data.alignment_total).toBe(28);
    expect(latest.error).toBeNull();
    expect(latest.isStreaming).toBe(false);
  });

  it("renders an inline unavailable error (no blank, no redirect) on a hard 401", async () => {
    mockedSseFetch.mockRejectedValue(
      new ApiError("UNAUTHORIZED", "Session expired", 401),
    );

    renderAnalysisHook("1");
    await waitFor(() => latest.error !== null);

    expect(latest.error).toBe("Analysis unavailable — please reload or re-login");
    expect(latest.isStreaming).toBe(false);
    // The hook never flips to "done" on an auth failure; the caller keeps the
    // list + detail mounted and shows the inline error inside the panel only.
    expect(latest.isDone).toBe(false);
  });

  it("keeps already-streamed sections when a stream-level error arrives after them", async () => {
    mockedSseFetch.mockResolvedValue(
      sseResponse(
        'data: {"section":"pwin","data":{"score":55,"grade":"Reconsider","top_drivers":[]},"sources":[]}\n\n' +
          'event: error\ndata: {"message":"upstream blew up"}\n\n',
      ),
    );

    renderAnalysisHook("1");
    await waitFor(() => latest.isDone);

    // The section that already arrived stays visible…
    expect(latest.sections.pwin?.data.score).toBe(55);
    // …and a late stream error does NOT surface as a view-blanking error.
    expect(latest.error).toBeNull();
  });
});
