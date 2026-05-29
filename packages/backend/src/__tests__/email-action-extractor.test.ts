/**
 * F-102 Sprint 3: Email Action Extractor unit tests.
 */

import { describe, it, expect } from "vitest";
import { extractActionFromEmail, type EmailPayload } from "../lib/email-action-extractor";

describe("Email Action Extractor", () => {
  it("extracts title from subject, stripping Re:/Fwd:/FW: prefixes", async () => {
    const payload: EmailPayload = {
      from: "john@example.com",
      to: "shawn@gda-command.local",
      subject: "Re: Fwd: Review the proposal draft",
      body_text: "Please review by end of week.",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.title).toBe("Review the proposal draft");
    expect(result.source).toBe("email");
  });

  it("infers due date from 'by EOD' pattern", async () => {
    const payload: EmailPayload = {
      from: "boss@example.com",
      to: "shawn@gda-command.local",
      subject: "Finish report",
      body_text: "Please complete this by EOD.",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.due_date).toBeDefined();
    expect(result.due_inferred_from).toBe("by EOD");
  });

  it("infers due date from 'by end of week' pattern", async () => {
    const payload: EmailPayload = {
      from: "boss@example.com",
      to: "shawn@gda-command.local",
      subject: "Submit deliverable",
      body_text: "Need this by end of week.",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.due_date).toBeDefined();
    expect(result.due_inferred_from).toBe("by end of week");
  });

  it("assigns owner=shawn when Shawn/you mentioned", async () => {
    const payload: EmailPayload = {
      from: "client@example.com",
      to: "shawn@gda-command.local",
      subject: "Action needed from you",
      body_text: "Shawn, can you follow up on this?",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.owner_email).toBe("shawn");
  });

  it("assigns ou_tag=riverstone when Angela mentioned", async () => {
    const payload: EmailPayload = {
      from: "client@example.com",
      to: "shawn@gda-command.local",
      subject: "Angela needs to review",
      body_text: "Please have Angela take a look at the pricing sheet.",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.ou_tag).toBe("riverstone");
  });

  it("detects draft kind=reply from body keywords", async () => {
    const payload: EmailPayload = {
      from: "client@example.com",
      to: "shawn@gda-command.local",
      subject: "Quick question",
      body_text: "Can you reply with the latest status update?",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.draft.kind).toBe("reply");
  });

  it("detects draft kind=research from body keywords", async () => {
    const payload: EmailPayload = {
      from: "client@example.com",
      to: "shawn@gda-command.local",
      subject: "Vehicle info",
      body_text: "Can you look into the OASIS vehicle ceiling amounts?",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.draft.kind).toBe("research");
  });

  it("defaults to draft kind=milestone when no keywords match", async () => {
    const payload: EmailPayload = {
      from: "pm@example.com",
      to: "shawn@gda-command.local",
      subject: "Project update",
      body_text: "The project milestone is approaching. Please ensure deliverables are ready.",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.draft.kind).toBe("milestone");
  });

  it("truncates detail to first 500 chars of body", async () => {
    const longBody = "A".repeat(1000);
    const payload: EmailPayload = {
      from: "sender@example.com",
      to: "shawn@gda-command.local",
      subject: "Long email",
      body_text: longBody,
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.detail!.length).toBeLessThanOrEqual(500);
  });

  it("uses body first line as title when subject is empty", async () => {
    const payload: EmailPayload = {
      from: "sender@example.com",
      to: "shawn@gda-command.local",
      subject: "",
      body_text: "This is the first line of the email body that should become the title.\nAnd here is more content.",
      received_at: new Date().toISOString(),
    };

    const result = await extractActionFromEmail(payload);
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.title.length).toBeLessThanOrEqual(120);
  });
});
