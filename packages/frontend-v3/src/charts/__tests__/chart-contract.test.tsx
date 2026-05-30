import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FundingVelocityChart, type FundingVelocityData } from "../FundingVelocityChart";
import { PipelineAgingChart, type PipelineAgingData } from "../PipelineAgingChart";
import { WinProbabilityDistributionChart, type WinProbDistributionData } from "../WinProbabilityDistributionChart";
import { SourceKindContributionChart, type SourceKindContributionData } from "../SourceKindContributionChart";
import { CaptureStageFunnelChart, type CaptureStageData } from "../CaptureStageFunnelChart";

import rawFunding from "../../../tests/fixtures/charts/funding-velocity.json";
import rawAging from "../../../tests/fixtures/charts/pipeline-aging.json";
import rawWinProb from "../../../tests/fixtures/charts/win-probability-distribution.json";
import rawSourceKind from "../../../tests/fixtures/charts/source-kind-contribution.json";
import rawFunnel from "../../../tests/fixtures/charts/capture-stage-funnel.json";

const fundingData = rawFunding as unknown as FundingVelocityData;
const agingData = rawAging as unknown as PipelineAgingData;
const winProbData = rawWinProb as unknown as WinProbDistributionData;
const sourceKindData = rawSourceKind as unknown as SourceKindContributionData;
const funnelData = rawFunnel as unknown as CaptureStageData;

describe("Chart Contract Tests — ECharts only + R1 source links", () => {
  it("FundingVelocityChart renders source links as <a href>", () => {
    render(<FundingVelocityChart data={fundingData} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    }
  });

  it("PipelineAgingChart renders source links as <a href>", () => {
    render(<PipelineAgingChart data={agingData} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("WinProbabilityDistributionChart renders source links as <a href>", () => {
    render(<WinProbabilityDistributionChart data={winProbData} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("SourceKindContributionChart renders source links as <a href>", () => {
    render(<SourceKindContributionChart data={sourceKindData} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("CaptureStageFunnelChart renders source links as <a href>", () => {
    render(<CaptureStageFunnelChart data={funnelData} />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });
});
