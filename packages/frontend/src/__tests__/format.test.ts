import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  timeAgo,
  formatCurrency,
  formatPwin,
  formatDate,
  formatBytes,
  formatNumber,
  formatPercent,
  getTimeUntil,
} from "../utils/format";

describe("formatCurrency", () => {
  it("returns dash for null", () => {
    expect(formatCurrency(null)).toBe("-");
  });

  it("formats billions", () => {
    expect(formatCurrency(2_500_000_000)).toBe("$2.5B");
  });

  it("formats millions", () => {
    expect(formatCurrency(4_200_000)).toBe("$4.2M");
  });

  it("formats thousands", () => {
    expect(formatCurrency(50_000)).toBe("$50K");
  });

  it("formats small numbers", () => {
    expect(formatCurrency(500)).toBe("$500");
  });

  it("formats negative values", () => {
    expect(formatCurrency(-1_000_000)).toBe("-$1.0M");
  });
});

describe("formatPwin", () => {
  it("returns dash for null", () => {
    expect(formatPwin(null)).toBe("-");
  });

  it("converts decimal to percentage", () => {
    expect(formatPwin(0.75)).toBe("75%");
  });

  it("rounds correctly", () => {
    expect(formatPwin(0.333)).toBe("33%");
  });
});

describe("formatDate", () => {
  it("returns dash for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("returns dash for empty string", () => {
    expect(formatDate("")).toBe("-");
  });

  it("formats ISO date strings", () => {
    const result = formatDate("2025-06-15T00:00:00Z");
    expect(result).toContain("2025");
    expect(result).toContain("Jun");
    expect(result).toContain("15");
  });

  it("handles date-only strings", () => {
    const result = formatDate("2025-06-15");
    expect(result).toContain("2025");
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for recent timestamps", () => {
    expect(timeAgo("2025-06-15T11:59:45Z")).toBe("just now");
  });

  it("returns minutes ago", () => {
    expect(timeAgo("2025-06-15T11:45:00Z")).toBe("15m ago");
  });

  it("returns hours ago", () => {
    expect(timeAgo("2025-06-15T09:00:00Z")).toBe("3h ago");
  });

  it("returns days ago", () => {
    expect(timeAgo("2025-06-13T12:00:00Z")).toBe("2d ago");
  });

  it("returns empty string for invalid dates", () => {
    expect(timeAgo("not-a-date")).toBe("");
  });
});

describe("formatBytes", () => {
  it("returns dash for null", () => {
    expect(formatBytes(null)).toBe("-");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(5_242_880)).toBe("5.0 MB");
  });
});

describe("formatNumber", () => {
  it("returns dash for null", () => {
    expect(formatNumber(null)).toBe("-");
  });

  it("formats with locale separators", () => {
    const result = formatNumber(1234567);
    expect(result).toContain("1");
    expect(result).toContain("234");
    expect(result).toContain("567");
  });
});

describe("formatPercent", () => {
  it("returns dash for null", () => {
    expect(formatPercent(null)).toBe("-");
  });

  it("formats with default decimals", () => {
    expect(formatPercent(75.5)).toBe("76%");
  });

  it("formats with custom decimals", () => {
    expect(formatPercent(75.5, 1)).toBe("75.5%");
  });
});

describe("getTimeUntil", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows days for future dates", () => {
    expect(getTimeUntil("2025-06-18T12:00:00Z")).toBe("3d");
  });

  it("shows hours for near future", () => {
    expect(getTimeUntil("2025-06-15T15:00:00Z")).toBe("3h");
  });

  it("shows overdue for past dates", () => {
    expect(getTimeUntil("2025-06-13T12:00:00Z")).toBe("2d overdue");
  });

  it("returns empty for invalid dates", () => {
    expect(getTimeUntil("not-a-date")).toBe("");
  });
});
