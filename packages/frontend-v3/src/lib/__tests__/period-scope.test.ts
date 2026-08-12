import { describe, it, expect } from "vitest";
import { formatMoney } from "@/lib/format-money";
import {
  periodLabel,
  shortPeriod,
  quarterOfPeriod,
  periodOptionsFrom,
  periodInScope,
  type PeriodScope,
} from "@/components/financials/primitives/PeriodScope";

function scopeAt(period: string): PeriodScope {
  return {
    view: period === "YTD" ? "YTD" : /^Q[1-4]$/.test(period) ? "Quarter" : "Month",
    period,
    label: periodLabel(period),
    month: /^Q[1-4]$/.test(period) || period === "YTD" ? null : period,
    quarter: /^Q[1-4]$/.test(period) ? period : null,
    setView: () => {},
    setMonth: () => {},
    setQuarter: () => {},
  };
}

describe("formatMoney — two decimals", () => {
  it("resolves millions to the hundred-thousandth so $19.03M is not rounded to $19.0M", () => {
    expect(formatMoney(19_031_697.59)).toBe("$19.03M");
    expect(formatMoney(9_177_184.1)).toBe("$9.18M");
  });

  it("keeps the compact unit at each magnitude", () => {
    expect(formatMoney(2_500_000_000)).toBe("$2.50B");
    expect(formatMoney(412_500)).toBe("$412.50K");
    expect(formatMoney(842)).toBe("$842.00");
  });

  it("signs negatives and keeps missing distinct from zero", () => {
    expect(formatMoney(-1_250_000)).toBe("-$1.25M");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });
});

describe("period labels", () => {
  it("spells months, annotates quarters, and leaves YTD alone", () => {
    expect(periodLabel("FY26 Jun")).toBe("June");
    expect(periodLabel("Q2")).toBe("Q2 (Apr–Jun)");
    expect(periodLabel("YTD")).toBe("YTD");
  });

  it("shortens only month periods for axes", () => {
    expect(shortPeriod("FY26 Jun")).toBe("Jun");
    expect(shortPeriod("Q2")).toBe("Q2");
    expect(shortPeriod("YTD")).toBe("YTD");
  });

  it("maps a month to its quarter", () => {
    expect(quarterOfPeriod("FY26 Jan")).toBe("Q1");
    expect(quarterOfPeriod("FY26 Jun")).toBe("Q2");
    expect(quarterOfPeriod("FY26 Dec")).toBe("Q4");
    expect(quarterOfPeriod("YTD")).toBeNull();
  });
});

describe("periodOptionsFrom", () => {
  it("offers only spans the rows actually state, in fiscal order", () => {
    const { months, quarters } = periodOptionsFrom([
      "FY26 Mar",
      "FY26 Jan",
      "FY26 Jun",
      "FY26 Jan",
    ]);
    expect(months).toEqual(["FY26 Jan", "FY26 Mar", "FY26 Jun"]);
    // No Q3/Q4 invented from months the book never stated.
    expect(quarters).toEqual(["Q1", "Q2"]);
  });

  it("ignores periods that are not months (e.g. quarter subtotal rows)", () => {
    expect(periodOptionsFrom(["FY26 Q1", "FY26 Apr"]).months).toEqual(["FY26 Apr"]);
  });

  it("orders across fiscal years", () => {
    expect(periodOptionsFrom(["FY26 Feb", "FY25 Nov"]).months).toEqual([
      "FY25 Nov",
      "FY26 Feb",
    ]);
  });
});

describe("periodInScope", () => {
  it("keeps every stated month under YTD", () => {
    const ytd = scopeAt("YTD");
    expect(periodInScope("FY26 Jan", ytd)).toBe(true);
    expect(periodInScope("FY26 Jun", ytd)).toBe(true);
  });

  it("keeps a quarter's three months and nothing else", () => {
    const q2 = scopeAt("Q2");
    expect(["FY26 Apr", "FY26 May", "FY26 Jun"].every((p) => periodInScope(p, q2))).toBe(true);
    expect(periodInScope("FY26 Mar", q2)).toBe(false);
    expect(periodInScope("FY26 Jul", q2)).toBe(false);
  });

  it("keeps exactly the selected month", () => {
    const jun = scopeAt("FY26 Jun");
    expect(periodInScope("FY26 Jun", jun)).toBe(true);
    expect(periodInScope("FY25 Jun", jun)).toBe(false);
    expect(periodInScope("FY26 May", jun)).toBe(false);
  });
});
