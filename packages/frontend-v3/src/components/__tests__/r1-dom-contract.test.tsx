import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Stat } from "../Stat/Stat";
import { Metric } from "../Metric/Metric";
import { Field } from "../Field/Field";
import { SourceUrlChip } from "../SourceUrlChip/SourceUrlChip";

const FIXTURE_URL = "https://sam.gov/opp/abc123";

describe("R1 DOM Contract — sourceUrl components render <a href>", () => {
  it("Stat renders as <a href> with target=_blank", () => {
    render(<Stat label="Revenue" value="$5.2M" sourceUrl={FIXTURE_URL} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", FIXTURE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("Metric renders as <a href> with target=_blank", () => {
    render(<Metric label="Pipeline" value="12" sourceUrl={FIXTURE_URL} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", FIXTURE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("Field renders as <a href> with target=_blank", () => {
    render(<Field label="NAICS" value="541330" sourceUrl={FIXTURE_URL} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", FIXTURE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("SourceUrlChip renders as <a href> with target=_blank", () => {
    render(
      <SourceUrlChip
        url={FIXTURE_URL}
        source_kind="sam_gov"
        retrieved_at={new Date().toISOString()}
      />
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", FIXTURE_URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
