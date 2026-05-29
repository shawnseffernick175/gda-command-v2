/**
 * F-102 Sprint 3: Action Items route tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockQuery = vi.fn();
vi.mock("../lib/db", () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock("../lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import actionItemsRouter from "../routes/action-items";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/action-items", actionItemsRouter);
  return app;
}

describe("Action Items Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GDA_WEBHOOK_KEY = "test-key";
  });

  it("POST /api/action-items with blank owner_email returns 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/action-items")
      .set("x-gda-key", "test-key")
      .send({ title: "Test", owner_email: "" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("POST /api/action-items creates item with owner_email='shawn' as default", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          title: "Test item",
          owner_email: "shawn",
          source: "manual",
          status: "open",
          ou_tag: "envision",
        },
      ],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/action-items")
      .set("x-gda-key", "test-key")
      .send({ title: "Test item" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const insertCall = mockQuery.mock.calls[0];
    expect(insertCall[1]).toContain("shawn");
  });

  it("POST /api/action-items/ingest-email with valid EmailPayload creates action_item + draft", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            title: "Review the proposal",
            owner_email: "shawn",
            source: "email",
            status: "open",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            action_item_id: 1,
            kind: "reply",
            draft_text: "Hi John, Understood...",
            status: "pending",
          },
        ],
      });

    const app = buildApp();
    const res = await request(app)
      .post("/api/action-items/ingest-email")
      .send({
        from: "John <john@example.com>",
        to: "shawn@gda-command.local",
        subject: "Review the proposal",
        body_text: "Please reply with your review by end of week.",
        received_at: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.action_item).toBeDefined();
    expect(res.body.data.draft).toBeDefined();
  });

  it("POST /api/action-items/ingest-email extracts due date from 'by end of week'", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            title: "Submit report",
            due_date: "2026-05-29",
            due_inferred_from: "by end of week",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 2, kind: "reply", status: "pending" }],
      });

    const app = buildApp();
    const res = await request(app)
      .post("/api/action-items/ingest-email")
      .send({
        from: "sender@example.com",
        to: "shawn@gda-command.local",
        subject: "Submit report",
        body_text: "Need the report by end of week please.",
        received_at: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    const insertCall = mockQuery.mock.calls[0];
    expect(insertCall[1]).toContain("by end of week");
  });

  it("PATCH /api/action-items/:id with {status:'done'} sets completed_at", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          status: "done",
          completed_at: new Date().toISOString(),
        },
      ],
    });

    const app = buildApp();
    const res = await request(app)
      .patch("/api/action-items/1")
      .set("x-gda-key", "test-key")
      .send({ status: "done" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const updateCall = mockQuery.mock.calls[0][0] as string;
    expect(updateCall).toContain("completed_at = NOW()");
  });

  it("POST /api/action-items/:id/approve-draft/:draft_id sets draft status to 'approved'", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          action_item_id: 1,
          status: "approved",
          kind: "reply",
          draft_text: "Draft text",
        },
      ],
    });

    const app = buildApp();
    const res = await request(app)
      .post("/api/action-items/1/approve-draft/1")
      .set("x-gda-key", "test-key");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("approved");
  });

  it("GET /api/action-items default returns only non-done items", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, title: "Open item", status: "open" },
      ],
    });

    const app = buildApp();
    const res = await request(app).get("/api/action-items");

    expect(res.status).toBe(200);
    const queryCall = mockQuery.mock.calls[0][0] as string;
    expect(queryCall).toContain("status != 'done'");
  });

  it("GET /api/action-items?status=done returns only done items", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 2, title: "Done item", status: "done" },
      ],
    });

    const app = buildApp();
    const res = await request(app).get("/api/action-items?status=done");

    expect(res.status).toBe(200);
    const queryCall = mockQuery.mock.calls[0][0] as string;
    expect(queryCall).toContain("ai.status = $");
  });
});
