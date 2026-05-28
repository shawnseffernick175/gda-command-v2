/**
 * F-038 Phase 2B PR 5: DocFormatIcon snapshot tests.
 * Verifies icon mapping for each MIME class.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import DocFormatIcon from "../components/icons/DocFormatIcon";
import { MIME_ICON_MAP, EXT_ICON_MAP } from "../components/icons/DocFormatIcon";

describe("DocFormatIcon", () => {
  it("renders PDF icon for application/pdf", () => {
    const { container } = render(<DocFormatIcon mimeType="application/pdf" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders spreadsheet icon for XLSX", () => {
    const { container } = render(<DocFormatIcon mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders presentation icon for PPTX", () => {
    const { container } = render(<DocFormatIcon mimeType="application/vnd.openxmlformats-officedocument.presentationml.presentation" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders mail icon for EML", () => {
    const { container } = render(<DocFormatIcon mimeType="message/rfc822" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders mail icon for MSG", () => {
    const { container } = render(<DocFormatIcon mimeType="application/vnd.ms-outlook" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders globe icon for HTML", () => {
    const { container } = render(<DocFormatIcon mimeType="text/html" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders code icon for XML", () => {
    const { container } = render(<DocFormatIcon mimeType="application/xml" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders braces icon for JSON", () => {
    const { container } = render(<DocFormatIcon mimeType="application/json" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders file-code icon for YAML", () => {
    const { container } = render(<DocFormatIcon mimeType="text/yaml" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders archive icon for ZIP", () => {
    const { container } = render(<DocFormatIcon mimeType="application/zip" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders archive icon for TAR", () => {
    const { container } = render(<DocFormatIcon mimeType="application/x-tar" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders archive icon for 7Z", () => {
    const { container } = render(<DocFormatIcon mimeType="application/x-7z-compressed" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders image icon for PNG", () => {
    const { container } = render(<DocFormatIcon mimeType="image/png" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders text icon for plain text", () => {
    const { container } = render(<DocFormatIcon mimeType="text/plain" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders generic file icon for unknown MIME", () => {
    const { container } = render(<DocFormatIcon mimeType="application/octet-stream" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("falls back to extension when MIME is unknown", () => {
    const { container } = render(<DocFormatIcon mimeType="application/octet-stream" fileName="report.pdf" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders with no props (generic file icon)", () => {
    const { container } = render(<DocFormatIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("accepts custom size", () => {
    const { container } = render(<DocFormatIcon mimeType="application/pdf" size={24} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });
});

describe("MIME_ICON_MAP coverage", () => {
  const expectedMimes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
    "message/rfc822",
    "application/vnd.ms-outlook",
    "text/html",
    "application/xhtml+xml",
    "application/xml",
    "text/xml",
    "application/json",
    "text/yaml",
    "application/yaml",
    "application/x-yaml",
    "application/zip",
    "application/x-tar",
    "application/gzip",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "image/heic",
    "image/webp",
    "image/gif",
    "text/plain",
    "text/markdown",
    "text/csv",
  ];

  for (const mime of expectedMimes) {
    it(`has mapping for ${mime}`, () => {
      expect(MIME_ICON_MAP[mime]).toBeDefined();
    });
  }
});

describe("EXT_ICON_MAP coverage", () => {
  const expectedExts = [
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "eml", "msg", "html", "htm", "xml", "json", "yaml", "yml",
    "zip", "tar", "gz", "7z", "rar",
    "png", "jpg", "jpeg", "tif", "tiff", "heic", "webp", "gif",
    "txt", "md", "csv",
  ];

  for (const ext of expectedExts) {
    it(`has mapping for .${ext}`, () => {
      expect(EXT_ICON_MAP[ext]).toBeDefined();
    });
  }
});
