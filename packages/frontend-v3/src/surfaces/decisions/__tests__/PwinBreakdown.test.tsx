import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { PwinBreakdown } from "../PwinBreakdown";
import type { PwinScore } from "@/lib/types";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function setup() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
}

function teardown() {
  act(() => root.unmount());
  container.remove();
}

afterEach(teardown);

function renderComponent(pwin: PwinScore | null | undefined) {
  setup();
  act(() => {
    root.render(createElement(PwinBreakdown, { pwin }));
  });
}

const FULL_PWIN: PwinScore = {
  score: 72,
  band: "forecast",
  top_drivers: ["Vehicle access (+10)", "Incumbency bonus (+30)"],
  feature_weights: [
    { name: "base", value: 30, description: "Base score" },
    { name: "incumbency_bonus", value: 30, description: "Incumbency bonus" },
    { name: "vehicle_access", value: 10, description: "Vehicle access" },
  ],
  days_to_due: 45,
  model_version: "rules-v1",
  scored_at: "2026-06-01T00:00:00Z",
};

describe("PwinBreakdown", () => {
  it("renders without crash when pwin is null", () => {
    renderComponent(null);
    expect(container.querySelector('[data-testid="pwin-empty"]')).toBeTruthy();
  });

  it("renders without crash when pwin is undefined", () => {
    renderComponent(undefined);
    expect(container.querySelector('[data-testid="pwin-empty"]')).toBeTruthy();
  });

  it("renders without crash when top_drivers is missing", () => {
    const pwin: PwinScore = {
      score: 55,
      band: "signal",
      days_to_due: 30,
      model_version: "rules-v1",
      scored_at: "2026-06-01T00:00:00Z",
    };
    renderComponent(pwin);
    expect(container.querySelector('[data-testid="pwin-breakdown"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drivers-empty"]')?.textContent).toBe(
      "No driver data available."
    );
  });

  it("renders without crash when feature_weights is missing", () => {
    const pwin: PwinScore = {
      score: 55,
      band: "signal",
      top_drivers: ["Vehicle access (+10)"],
      days_to_due: 30,
      model_version: "rules-v1",
      scored_at: "2026-06-01T00:00:00Z",
    };
    renderComponent(pwin);
    expect(container.querySelector('[data-testid="pwin-breakdown"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="weights-empty"]')?.textContent).toBe(
      "No feature weight data available."
    );
  });

  it("renders without crash when both top_drivers and feature_weights are missing", () => {
    const pwin: PwinScore = {
      score: 40,
      band: "discovery",
      days_to_due: null,
      model_version: "rules-v1",
      scored_at: "2026-06-01T00:00:00Z",
    };
    renderComponent(pwin);
    expect(container.querySelector('[data-testid="pwin-breakdown"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="drivers-empty"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="weights-empty"]')).toBeTruthy();
  });

  it("renders the full happy-path breakdown correctly", () => {
    renderComponent(FULL_PWIN);
    expect(container.querySelector('[data-testid="pwin-breakdown"]')).toBeTruthy();
    expect(container.textContent).toContain("72%");
    expect(container.textContent).toContain("Vehicle access (+10)");
    expect(container.textContent).toContain("Incumbency bonus (+30)");
    expect(container.textContent).toContain("Incumbency bonus");
    expect(container.textContent).toContain("+30");
    expect(container.querySelector('[data-testid="drivers-empty"]')).toBeNull();
    expect(container.querySelector('[data-testid="weights-empty"]')).toBeNull();
  });
});
