/**
 * Shared handler test suite generator.
 * Each handler file imports this and calls defineHandlerTests() with its config.
 * Produces 3 handler-level scenarios per handler (S1-S3).
 * Router-level scenarios (S4-S8: timeout, fallback, retry, disable_retry) live
 * in tests/router/llm-router.test.ts where route() is exercised directly.
 */

import { describe, it, expect } from 'vitest';
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
  } = config;

  describe(`[Handler] ${task}`, () => {
    // Scenario 1: Success on first call
    it('succeeds on first call with valid output', async () => {
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
  });
}
