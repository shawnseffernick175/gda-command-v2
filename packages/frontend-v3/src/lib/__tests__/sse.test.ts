import { describe, it, expect } from "vitest";
import { splitSSEBuffer, parseSSERecord } from "@/lib/sse";

/**
 * #1125 — the analysis Decision Brief stream emits ONE `data:` record per
 * section (pwin, doctrine, incumbent, similar_awards, competitors, ...),
 * terminated with `event: done`. The parser must dispatch EVERY section, not
 * just the last, and must reassemble records that straddle chunk boundaries.
 */

const SECTION_STREAM =
  'data: {"section":"pwin","data":{"score":0},"sources":[],"trace_id":"t1"}\n\n' +
  'data: {"section":"doctrine","data":{"alignment_total":28},"sources":[],"trace_id":"t1"}\n\n' +
  'data: {"section":"incumbent","data":{"name":null},"sources":[],"trace_id":"t1"}\n\n' +
  "event: done\ndata: {}\n\n";

describe("parseSSERecord", () => {
  it("parses a single data record", () => {
    expect(parseSSERecord('data: {"section":"pwin"}')).toEqual({
      event: null,
      data: '{"section":"pwin"}',
    });
  });

  it("parses an event + data record", () => {
    expect(parseSSERecord("event: done\ndata: {}")).toEqual({
      event: "done",
      data: "{}",
    });
  });

  it("concatenates multiple data lines within one record", () => {
    expect(parseSSERecord('data: {"a":1,\ndata: "b":2}')).toEqual({
      event: null,
      data: '{"a":1,\n"b":2}',
    });
  });

  it("strips a single leading space after the field colon (data: vs data:)", () => {
    expect(parseSSERecord("data:no-space")).toEqual({ event: null, data: "no-space" });
    expect(parseSSERecord("data:  two")).toEqual({ event: null, data: " two" });
  });

  it("ignores comment / keep-alive lines", () => {
    expect(parseSSERecord(":keep-alive")).toBeNull();
  });
});

describe("splitSSEBuffer", () => {
  it("splits every complete section record — not just the last (#1125)", () => {
    const { records, rest } = splitSSEBuffer(SECTION_STREAM);
    const sections = records
      .map((r) => (r.data ? (JSON.parse(r.data) as { section?: string }).section : null))
      .filter(Boolean);
    expect(sections).toEqual(["pwin", "doctrine", "incumbent"]);
    expect(records.some((r) => r.event === "done")).toBe(true);
    expect(rest).toBe("");
  });

  it("keeps a partial trailing record in `rest` and reassembles it next chunk", () => {
    const boundary = Math.floor(SECTION_STREAM.length / 2);
    const chunkA = SECTION_STREAM.slice(0, boundary);
    const chunkB = SECTION_STREAM.slice(boundary);

    let buffer = "";
    const seen: string[] = [];
    for (const chunk of [chunkA, chunkB]) {
      buffer += chunk;
      const { records, rest } = splitSSEBuffer(buffer);
      buffer = rest;
      for (const r of records) {
        if (r.data && r.data !== "{}") {
          const p = JSON.parse(r.data) as { section?: string };
          if (p.section) seen.push(p.section);
        }
      }
    }
    // flush any trailing record without a final blank line
    const tail = parseSSERecord(buffer);
    if (tail?.data && tail.data !== "{}") {
      const p = JSON.parse(tail.data) as { section?: string };
      if (p.section) seen.push(p.section);
    }
    expect(seen).toEqual(["pwin", "doctrine", "incumbent"]);
  });

  it("normalizes CRLF line endings", () => {
    const { records } = splitSSEBuffer(
      'data: {"section":"pwin"}\r\n\r\ndata: {"section":"doctrine"}\r\n\r\n',
    );
    const sections = records.map(
      (r) => (JSON.parse(r.data) as { section: string }).section,
    );
    expect(sections).toEqual(["pwin", "doctrine"]);
  });
});
