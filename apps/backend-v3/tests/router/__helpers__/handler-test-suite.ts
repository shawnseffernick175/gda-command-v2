/**
 * Shared handler test suite generator.
 * Each handler file imports this and calls defineHandlerTests() with its config.
 * Produces 8 standardized scenarios per handler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockProvider, chatResponse, embedResponse } from './mock-provider.js';
import type { Task, TaskInputMap } from '../../../src/lib/llm-router.types.js';
import type { HandlerContext, HandlerResult } from '../../../src/lib/router/handlers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/llm-mock');

function loadFixtureOutput(taskFile: string): unknown {
  const raw = readFileSync(join(FIXTURE_DIR, `${taskFile}.json`), 'utf-8');
  const fixture = JSON.parse(raw) as { output: unknown };
  return fixture.output;
}

/** Returns a promise that rejects with AbortError when signal fires. */
function abortableNever(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }, { once: true });
  });
}

export interface HandlerTestConfig<T extends Task> {
  task: T;
  fixtureFile: string;
  handler: (input: TaskInputMap[T], ctx: HandlerContext) => Promise<HandlerResult<T>>;
  schema: { safeParse(data: unknown): { success: boolean; data?: unknown; error?: unknown } };
  sampleInput: TaskInputMap[T];
  assertionKey: string;
  isEmbedHandler?: boolean;
  primaryModel?: string;
  fallbackModel?: string | null;
  timeoutMs?: number;
}

export function defineHandlerTests<T extends Task>(config: HandlerTestConfig<T>) {
  const {
    task,
    fixtureFile,
    handler,
    schema,
    sampleInput,
    assertionKey,
    isEmbedHandler = false,
    primaryModel = 'mock-model',
    fallbackModel = null,
  } = config;

  describe(`[Handler] ${task}`, () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // Scenario 1: Success on first call
    it('succeeds on first call with valid output', async () => {
      vi.useRealTimers();
      const fixtureOutput = loadFixtureOutput(fixtureFile);
      const { ctx, chatFn, embedFn } = createMockProvider({ model: primaryModel });

      if (isEmbedHandler) {
        const output = fixtureOutput as { embedding: number[]; dimensions: number };
        embedFn.mockResolvedValueOnce(embedResponse(output.embedding, {
          tokens_in: 50,
          model: primaryModel,
        }));
      } else {
        chatFn.mockResolvedValueOnce(chatResponse(fixtureOutput, {
          tokens_in: 100,
          tokens_out: 200,
          model: primaryModel,
        }));
      }

      const result = await handler(sampleInput, ctx);

      expect(result.output).toBeDefined();
      expect((result.output as Record<string, unknown>)[assertionKey]).toBeDefined();
      expect(result.model_used).toBe(primaryModel);
      expect(result.tokens_in).toBeGreaterThan(0);

      const validation = schema.safeParse(result.output);
      expect(validation.success).toBe(true);
    });

    // Scenario 2: Validation fail → re-prompt → success
    it('re-prompts on validation failure and succeeds on retry', async () => {
      vi.useRealTimers();
      if (isEmbedHandler) return;

      const fixtureOutput = loadFixtureOutput(fixtureFile);
      const { ctx, chatFn } = createMockProvider({ model: primaryModel });

      chatFn.mockResolvedValueOnce(chatResponse({ invalid: 'data' }, {
        tokens_in: 50, tokens_out: 100, model: primaryModel,
      }));
      chatFn.mockResolvedValueOnce(chatResponse(fixtureOutput, {
        tokens_in: 100, tokens_out: 200, model: primaryModel,
      }));

      const result = await handler(sampleInput, ctx);

      expect(chatFn).toHaveBeenCalledTimes(2);
      const secondCall = chatFn.mock.calls[1]!;
      const secondReq = secondCall[0] as { messages: Array<{ role: string; content: string }> };
      const lastMsg = secondReq.messages[secondReq.messages.length - 1]!;
      expect(lastMsg.content).toContain('Schema validation failed');
      expect(result.output).toBeDefined();
    });

    // Scenario 3: Validation fail → re-prompt → still invalid → throws INVALID_OUTPUT
    it('throws INVALID_OUTPUT after double validation failure', async () => {
      vi.useRealTimers();
      if (isEmbedHandler) return;

      const { ctx, chatFn } = createMockProvider({ model: primaryModel });

      chatFn.mockResolvedValueOnce(chatResponse({ bad: true }, {
        tokens_in: 50, tokens_out: 100, model: primaryModel,
      }));
      chatFn.mockResolvedValueOnce(chatResponse({ still_bad: true }, {
        tokens_in: 50, tokens_out: 100, model: primaryModel,
      }));

      await expect(handler(sampleInput, ctx)).rejects.toThrow('INVALID_OUTPUT');
      expect(chatFn).toHaveBeenCalledTimes(2);
    });

    // Scenario 4: Primary times out → handler aborts via AbortSignal
    it('aborts when signal fires (simulating wall-clock timeout)', async () => {
      vi.useRealTimers();
      const { ctx, chatFn, embedFn } = createMockProvider({ model: primaryModel });

      // Mock provider returns a promise that rejects on abort
      if (isEmbedHandler) {
        embedFn.mockImplementationOnce((_req: unknown, signal?: AbortSignal) => {
          return abortableNever(signal!);
        });
      } else {
        chatFn.mockImplementationOnce((_req: unknown, signal?: AbortSignal) => {
          return abortableNever(signal!);
        });
      }

      const controller = new AbortController();
      const ctxWithSignal: HandlerContext = { ...ctx, signal: controller.signal };

      const p = handler(sampleInput, ctxWithSignal);
      controller.abort();

      await expect(p).rejects.toThrow();
    });

    // Scenario 5: Primary fails → fallback fires when budget remains
    it('throws on primary failure so router can trigger fallback', async () => {
      vi.useRealTimers();
      if (!fallbackModel) return;

      const { ctx, chatFn, embedFn } = createMockProvider({ model: primaryModel });

      const primaryError = new Error('Provider unavailable') as NodeJS.ErrnoException;
      primaryError.code = 'ECONNRESET';

      if (isEmbedHandler) {
        embedFn.mockRejectedValueOnce(primaryError);
        await expect(handler(sampleInput, ctx)).rejects.toThrow('Provider unavailable');
      } else {
        chatFn.mockRejectedValueOnce(primaryError);
        await expect(handler(sampleInput, ctx)).rejects.toThrow('Provider unavailable');
      }
    });

    // Scenario 6: Primary fails → no fallback invoked at handler level
    it('only calls provider once on failure (fallback is router-level)', async () => {
      vi.useRealTimers();
      if (!fallbackModel) return;

      const { ctx, chatFn, embedFn } = createMockProvider({ model: primaryModel });

      const err = new Error('timeout') as NodeJS.ErrnoException;
      err.code = 'ETIMEDOUT';

      if (isEmbedHandler) {
        embedFn.mockRejectedValueOnce(err);
        await expect(handler(sampleInput, ctx)).rejects.toThrow();
        expect(embedFn).toHaveBeenCalledTimes(1);
      } else {
        chatFn.mockRejectedValueOnce(err);
        await expect(handler(sampleInput, ctx)).rejects.toThrow();
        expect(chatFn).toHaveBeenCalledTimes(1);
      }
    });

    // Scenario 7: Retry backoff is router-level; handler throws on single failure
    it('handler does not retry internally (retry is router-level)', async () => {
      vi.useRealTimers();

      const { ctx, chatFn, embedFn } = createMockProvider({ model: primaryModel });

      const transientError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });

      if (isEmbedHandler) {
        embedFn.mockRejectedValueOnce(transientError);
        await expect(handler(sampleInput, ctx)).rejects.toThrow('connection reset');
        expect(embedFn).toHaveBeenCalledTimes(1);
      } else {
        chatFn.mockRejectedValueOnce(transientError);
        await expect(handler(sampleInput, ctx)).rejects.toThrow('connection reset');
        expect(chatFn).toHaveBeenCalledTimes(1);
      }
    });

    // Scenario 8: Single provider call on error (disable_router_retry is router-level)
    it('provider called exactly once on error (retry suppression is router-level)', async () => {
      vi.useRealTimers();

      const { ctx, chatFn, embedFn } = createMockProvider({ model: primaryModel });

      const err = Object.assign(new Error('server error'), { status: 500 });

      if (isEmbedHandler) {
        embedFn.mockRejectedValueOnce(err);
        await expect(handler(sampleInput, ctx)).rejects.toThrow('server error');
        expect(embedFn).toHaveBeenCalledTimes(1);
      } else {
        chatFn.mockRejectedValueOnce(err);
        await expect(handler(sampleInput, ctx)).rejects.toThrow('server error');
        expect(chatFn).toHaveBeenCalledTimes(1);
      }
    });
  });
}
