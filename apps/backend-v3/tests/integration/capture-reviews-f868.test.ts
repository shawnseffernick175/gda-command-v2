/**
 * Integration tests for F-868 — Capture Review Engine enhancements:
 *   Feature 1: start-at-any-color with cumulative back-review
 *   Feature 2: professional Word/PDF outbrief export
 *
 * Covers:
 *   (a) creating a `red` review with cumulative:true seeds primary red sections
 *       PLUS back-review sections for black/blue/pink/green
 *   (b) cumulative:false seeds only the color's doctrine sections
 *   (c) GET /v3/reviews/:id/outbrief?format=docx returns a non-empty docx buffer
 *   (d) format=pdf returns a PDF buffer
 *   (e) invalid format -> 400
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, closeApp, getPool, authHeader, getSeedIds } from './helpers.js';
import type { FastifyInstance } from 'fastify';
import {
  COLOR_DOCTRINE,
  doctrineFor,
  priorColors,
} from '../../src/services/captures/color-review-doctrine.js';

let app: FastifyInstance;
let pool: ReturnType<typeof getPool>;
let captureId: string;

beforeAll(async () => {
  app = await getApp();
  pool = getPool();
  captureId = getSeedIds().captureId;
});

afterAll(async () => {
  await closeApp();
});

describe('F-868 color review doctrine', () => {
  it('has all 6 colors in strict order', () => {
    expect(COLOR_DOCTRINE.map((d) => d.color)).toEqual([
      'black',
      'blue',
      'pink',
      'green',
      'red',
      'white',
    ]);
  });

  it('priorColors(red) returns black, blue, pink, green in order', () => {
    expect(priorColors('red').map((d) => d.color)).toEqual(['black', 'blue', 'pink', 'green']);
  });

  it('priorColors(black) is empty', () => {
    expect(priorColors('black')).toEqual([]);
  });
});

describe('F-868 Feature 1 — cumulative back-review', () => {
  it('cumulative:true on a red review seeds primary red sections PLUS back-review sections for all prior colors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/captures/${captureId}/reviews`,
      headers: authHeader(),
      payload: {
        color: 'red',
        cumulative: true,
        reviewers: [{ name: 'Test Lead', role: 'lead' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.is_cumulative).toBe(true);
    const reviewId = body.data.id;

    const detail = await app.inject({
      method: 'GET',
      url: `/v3/reviews/${reviewId}`,
      headers: authHeader(),
    });
    expect(detail.statusCode).toBe(200);
    const sections = JSON.parse(detail.payload).data.sections as Array<{
      section_name: string;
      display_order: number;
    }>;

    const red = doctrineFor('red')!;
    const priors = priorColors('red');
    const expectedTotal =
      red.seeded_sections.length +
      priors.reduce((sum, p) => sum + p.seeded_sections.length, 0);
    expect(sections.length).toBe(expectedTotal);

    // Primary red sections present and come first
    for (const name of red.seeded_sections) {
      expect(sections.some((s) => s.section_name === name)).toBe(true);
    }
    // Back-review sections present for every prior color
    for (const prior of priors) {
      for (const name of prior.seeded_sections) {
        const labeled = `[Back-review: ${prior.label}] ${name}`;
        expect(sections.some((s) => s.section_name === labeled)).toBe(true);
      }
    }

    // Ordering: primary sections (no back-review prefix) occupy the lowest display_orders
    const sorted = [...sections].sort((a, b) => a.display_order - b.display_order);
    for (let i = 0; i < red.seeded_sections.length; i++) {
      expect(sorted[i].section_name.startsWith('[Back-review:')).toBe(false);
    }
    expect(sorted[red.seeded_sections.length].section_name.startsWith('[Back-review:')).toBe(true);
  });

  it('cumulative:false seeds only the color doctrine sections (no back-review)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/captures/${captureId}/reviews`,
      headers: authHeader(),
      payload: { color: 'green', cumulative: false },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.is_cumulative).toBe(false);
    const reviewId = body.data.id;

    const detail = await app.inject({
      method: 'GET',
      url: `/v3/reviews/${reviewId}`,
      headers: authHeader(),
    });
    const sections = JSON.parse(detail.payload).data.sections as Array<{ section_name: string }>;
    const green = doctrineFor('green')!;
    expect(sections.length).toBe(green.seeded_sections.length);
    expect(sections.every((s) => !s.section_name.startsWith('[Back-review:'))).toBe(true);
    for (const name of green.seeded_sections) {
      expect(sections.some((s) => s.section_name === name)).toBe(true);
    }
  });

  it('omitting cumulative defaults to non-cumulative', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/captures/${captureId}/reviews`,
      headers: authHeader(),
      payload: { color: 'blue' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.payload).data.is_cumulative).toBe(false);
  });
});

describe('F-868 Feature 2 — outbrief export', () => {
  let reviewId: number;

  beforeAll(async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v3/captures/${captureId}/reviews`,
      headers: authHeader(),
      payload: {
        color: 'red',
        cumulative: true,
        reviewers: [
          { name: 'Eval Lead', role: 'lead' },
          { name: 'Tech Reviewer', role: 'technical' },
        ],
      },
    });
    reviewId = JSON.parse(res.payload).data.id;
  });

  it('GET /v3/reviews/:id/outbrief?format=docx returns a non-empty docx buffer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v3/reviews/${reviewId}/outbrief?format=docx`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.headers['content-disposition']).toContain(
      `outbrief-red-review-${reviewId}.docx`,
    );
    const buf = res.rawPayload;
    expect(buf.length).toBeGreaterThan(0);
    // .docx is a ZIP — first two bytes are "PK"
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });

  it('GET /v3/reviews/:id/outbrief?format=pdf returns a PDF buffer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v3/reviews/${reviewId}/outbrief?format=pdf`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`outbrief-red-review-${reviewId}.pdf`);
    const buf = res.rawPayload;
    expect(buf.length).toBeGreaterThan(0);
    // PDF magic header "%PDF"
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('defaults to docx when no format is provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v3/reviews/${reviewId}/outbrief`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('wordprocessingml.document');
  });

  it('invalid format returns 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v3/reviews/${reviewId}/outbrief?format=xlsx`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
  });

  it('returns 404 for an unknown review id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v3/reviews/99999999/outbrief?format=docx`,
      headers: authHeader(),
    });
    expect(res.statusCode).toBe(404);
  });
});
