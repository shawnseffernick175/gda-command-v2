import { describe, it, expect } from "vitest";
import { toCSV } from "../lib/csv-export";

describe("toCSV", () => {
  it("returns empty string for empty array", () => {
    expect(toCSV([])).toBe("");
  });

  it("converts simple objects to CSV with header", () => {
    const rows = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    const csv = toCSV(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("name,age");
    expect(lines[1]).toBe("Alice,30");
    expect(lines[2]).toBe("Bob,25");
  });

  it("escapes commas in values", () => {
    const rows = [{ city: "Washington, DC", state: "DC" }];
    const csv = toCSV(rows);
    expect(csv).toContain('"Washington, DC"');
  });

  it("escapes double quotes in values", () => {
    const rows = [{ note: 'He said "hello"' }];
    const csv = toCSV(rows);
    expect(csv).toContain('"He said ""hello"""');
  });

  it("escapes newlines in values", () => {
    const rows = [{ desc: "line1\nline2" }];
    const csv = toCSV(rows);
    expect(csv).toContain('"line1\nline2"');
  });

  it("handles null and undefined values", () => {
    const rows = [{ a: null, b: undefined, c: "ok" }];
    const csv = toCSV(rows);
    const lines = csv.split("\n");
    expect(lines[1]).toBe(",,ok");
  });

  it("handles Date values", () => {
    const d = new Date("2025-01-15T12:00:00Z");
    const rows = [{ date: d }];
    const csv = toCSV(rows);
    expect(csv).toContain("2025-01-15T12:00:00.000Z");
  });

  it("handles object values as JSON", () => {
    const rows = [{ meta: { key: "val" } }];
    const csv = toCSV(rows);
    expect(csv).toContain('"{""key"":""val""}"');
  });

  it("respects custom column order", () => {
    const rows = [{ b: 2, a: 1, c: 3 }];
    const csv = toCSV(rows, ["c", "a"]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("c,a");
    expect(lines[1]).toBe("3,1");
  });
});
