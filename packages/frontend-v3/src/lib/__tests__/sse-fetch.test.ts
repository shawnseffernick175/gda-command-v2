import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sseFetch, setToken, ApiError } from "@/lib/api";

/**
 * #1118 — the opportunity Decision Brief SSE stream must silently refresh a
 * stale access token and retry once (mirroring apiFetch), and on a genuine
 * auth failure redirect to /login instead of blanking the Opportunities view.
 */

function sseResponse(status = 200): Response {
  return new Response("event: done\n", {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function refreshOk(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: { token: "fresh-token" },
      meta: { generatedAt: "now", source: "test", requestId: "r1" },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchSpy: ReturnType<typeof vi.fn>;
const originalLocation = window.location;

beforeEach(() => {
  setToken("stale-token");
  // jsdom's window.location is not writable by default — replace with a stub.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, href: "" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  setToken(null);
});

describe("sseFetch", () => {
  it("attaches the Bearer token and returns the stream on success", async () => {
    fetchSpy = vi.fn(async () => sseResponse());
    vi.stubGlobal("fetch", fetchSpy);

    const res = await sseFetch("/v3/opportunities/1/analysis");

    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer stale-token");
    expect(headers.Accept).toBe("text/event-stream");
  });

  it("refreshes and retries once with the fresh token on a 401", async () => {
    fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/v3/auth/refresh")) return refreshOk();
      // First stream attempt 401s (stale token), retry succeeds.
      const call = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes("/analysis"),
      ).length;
      return call <= 1 ? sseResponse(401) : sseResponse(200);
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await sseFetch("/v3/opportunities/1/analysis");

    expect(res.ok).toBe(true);
    const refreshCall = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes("/v3/auth/refresh"),
    );
    expect(refreshCall).toBeTruthy();
    const retryHeaders = fetchSpy.mock.calls
      .filter((c) => String(c[0]).includes("/analysis"))
      .at(-1)![1].headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer fresh-token");
  });

  it("redirects to /login and throws when refresh also fails", async () => {
    fetchSpy = vi.fn(async (url: string) => {
      if (url.includes("/v3/auth/refresh")) return new Response("no", { status: 401 });
      return sseResponse(401);
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(sseFetch("/v3/opportunities/1/analysis")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    } satisfies Partial<ApiError>);
    expect(window.location.href).toBe("/login");
  });
});
