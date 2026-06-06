import type { FastifyInstance } from 'fastify';
import { pool } from '../lib/db.js';
import { successEnvelope, errorEnvelope } from '../lib/envelope.js';

export async function promptLibraryRoutes(app: FastifyInstance): Promise<void> {
  // GET /v3/prompts — list all active prompts
  app.get('/v3/prompts', async (req, reply) => {
    const query = req.query as { surface?: string; q?: string };
    const conditions: string[] = ['is_active = true'];
    const params: unknown[] = [];

    if (query.surface) {
      params.push(query.surface);
      conditions.push(`surface = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q}%`);
      conditions.push(`(display_name ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }

    const { rows } = await pool.query(
      `SELECT id, prompt_key, display_name, description, surface, system_prompt,
              user_prompt_template, variables, is_active, version, created_at, updated_at
       FROM prompt_library
       WHERE ${conditions.join(' AND ')}
       ORDER BY surface, display_name`,
      params,
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // GET /v3/prompts/:key — single prompt by key
  app.get('/v3/prompts/:key', async (req, reply) => {
    const { key } = req.params as { key: string };

    const { rows } = await pool.query(
      `SELECT * FROM prompt_library WHERE prompt_key = $1`,
      [key],
    );

    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', `Prompt '${key}' not found`, req.requestId));
    }

    return reply.send(successEnvelope(rows[0], req.requestId));
  });

  // PUT /v3/prompts/:key — update prompt (saves version first)
  app.put('/v3/prompts/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const body = req.body as {
      system_prompt: string;
      user_prompt_template?: string;
      change_note?: string;
    };

    if (!body.system_prompt?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'system_prompt is required', req.requestId));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: existing } = await client.query(
        `SELECT * FROM prompt_library WHERE prompt_key = $1`,
        [key],
      );

      if (!existing.length) {
        await client.query('ROLLBACK');
        return reply.status(404).send(errorEnvelope('NOT_FOUND', `Prompt '${key}' not found`, req.requestId));
      }

      const current = existing[0] as {
        id: number;
        version: number;
        system_prompt: string;
        user_prompt_template: string | null;
      };

      // Save current version to history
      await client.query(
        `INSERT INTO prompt_versions (prompt_id, version, system_prompt, user_prompt_template, changed_by, change_note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [current.id, current.version, current.system_prompt, current.user_prompt_template, 'admin', body.change_note ?? null],
      );

      // Update prompt
      const newVersion = current.version + 1;
      const { rows: updated } = await client.query(
        `UPDATE prompt_library
         SET system_prompt = $1, user_prompt_template = $2, version = $3, updated_at = NOW()
         WHERE prompt_key = $4
         RETURNING *`,
        [body.system_prompt.trim(), body.user_prompt_template ?? null, newVersion, key],
      );

      await client.query('COMMIT');
      return reply.send(successEnvelope(updated[0], req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // GET /v3/prompts/:key/versions — version history
  app.get('/v3/prompts/:key/versions', async (req, reply) => {
    const { key } = req.params as { key: string };

    const { rows: prompt } = await pool.query(
      `SELECT id FROM prompt_library WHERE prompt_key = $1`,
      [key],
    );

    if (!prompt.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', `Prompt '${key}' not found`, req.requestId));
    }

    const promptId = (prompt[0] as { id: number }).id;

    const { rows } = await pool.query(
      `SELECT * FROM prompt_versions WHERE prompt_id = $1 ORDER BY version DESC`,
      [promptId],
    );

    return reply.send(successEnvelope({ items: rows, total: rows.length }, req.requestId));
  });

  // POST /v3/prompts/:key/test — preview a prompt with variable substitution
  app.post('/v3/prompts/:key/test', async (req, reply) => {
    const { key } = req.params as { key: string };
    const body = req.body as { variable_values: Record<string, string> };

    const { rows } = await pool.query(
      `SELECT * FROM prompt_library WHERE prompt_key = $1`,
      [key],
    );

    if (!rows.length) {
      return reply.status(404).send(errorEnvelope('NOT_FOUND', `Prompt '${key}' not found`, req.requestId));
    }

    const prompt = rows[0] as {
      system_prompt: string;
      user_prompt_template: string | null;
    };

    // Substitute variables in user_prompt_template
    let filledUserPrompt = prompt.user_prompt_template ?? '';
    const values = body.variable_values ?? {};
    for (const [varName, varValue] of Object.entries(values)) {
      filledUserPrompt = filledUserPrompt.replaceAll(`{${varName}}`, varValue);
    }

    const startMs = Date.now();

    try {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', 'OPENAI_API_KEY not configured', req.requestId));
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: prompt.system_prompt },
            { role: 'user', content: filledUserPrompt },
          ],
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const durationMs = Date.now() - startMs;
        return reply.status(502).send(errorEnvelope('INTERNAL_ERROR', `OpenAI API error ${response.status}: ${errBody}`, req.requestId));
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model: string;
      };

      const durationMs = Date.now() - startMs;

      return reply.send(successEnvelope({
        input_prompt: filledUserPrompt,
        raw_output: data.choices?.[0]?.message?.content ?? '',
        tokens_used: data.usage?.total_tokens ?? 0,
        model_used: data.model ?? 'gpt-4o-mini',
        duration_ms: durationMs,
      }, req.requestId));
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', `Test failed: ${message}`, req.requestId));
    }
  });

  // POST /v3/prompts/build — AI-generate a prompt from topic + bullet points
  app.post('/v3/prompts/build', async (req, reply) => {
    const body = req.body as { topic?: string; points?: string[]; surface?: string } | undefined;

    if (!body?.topic?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'topic is required', req.requestId));
    }
    if (!body.points?.length) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'at least one point is required', req.requestId));
    }

    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', 'OPENAI_API_KEY not configured', req.requestId));
    }

    const builderSystemPrompt =
      `You are a prompt engineer building precise LLM instructions for a defense contracting intelligence tool called GDA Command.\n` +
      `Never fabricate facts, names, dollar amounts, or dates. If data is unavailable, say so explicitly.\n` +
      `Write as a sharp defense contracting analyst briefing an executive. Be direct, specific, confident. No AI preamble, no hedging language, no bullet soup.\n\n` +
      `The user will give you a topic and a list of bullet points describing what they want the prompt to do.\n` +
      `Build a complete, production-ready prompt from those inputs. Return JSON:\n` +
      `{\n` +
      `  "system_prompt": "full system prompt text",\n` +
      `  "user_prompt_template": "user template with {VARIABLE} placeholders where appropriate",\n` +
      `  "suggested_variables": [{"name": "VARIABLE_NAME", "description": "...", "example": "..."}],\n` +
      `  "display_name": "short display name for the library"\n` +
      `}`;

    const userMessage = `Topic: ${body.topic.trim()}\n\nPoints:\n${body.points.map((p) => `- ${p}`).join('\n')}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: builderSystemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        return reply.status(502).send(errorEnvelope('INTERNAL_ERROR', `OpenAI API error ${response.status}: ${errBody}`, req.requestId));
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        model: string;
      };

      const rawContent = data.choices?.[0]?.message?.content ?? '{}';
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawContent) as Record<string, unknown>;
      } catch {
        return reply.status(502).send(errorEnvelope('INTERNAL_ERROR', 'Failed to parse AI response as JSON', req.requestId));
      }

      return reply.send(successEnvelope({
        system_prompt: parsed.system_prompt ?? '',
        user_prompt_template: parsed.user_prompt_template ?? '',
        suggested_variables: parsed.suggested_variables ?? [],
        display_name: parsed.display_name ?? body.topic.trim(),
        model_used: data.model ?? 'gpt-4o-mini',
      }, req.requestId));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send(errorEnvelope('INTERNAL_ERROR', `Build failed: ${message}`, req.requestId));
    }
  });

  // POST /v3/prompts — create a new prompt in the library
  app.post('/v3/prompts', async (req, reply) => {
    const body = req.body as {
      prompt_key?: string;
      display_name?: string;
      description?: string;
      surface?: string;
      system_prompt?: string;
      user_prompt_template?: string;
      variables?: unknown;
    } | undefined;

    if (!body?.prompt_key?.trim() || !body?.system_prompt?.trim()) {
      return reply.status(400).send(errorEnvelope('VALIDATION_ERROR', 'prompt_key and system_prompt are required', req.requestId));
    }

    // Check for key collision — if key exists, append _2, _3, etc.
    let finalKey = body.prompt_key.trim();
    const { rows: existCheck } = await pool.query(
      `SELECT prompt_key FROM prompt_library WHERE prompt_key LIKE $1 ORDER BY prompt_key`,
      [`${finalKey}%`],
    );
    if (existCheck.length > 0) {
      const existingKeys = new Set(existCheck.map((r) => (r as { prompt_key: string }).prompt_key));
      if (existingKeys.has(finalKey)) {
        let counter = 2;
        while (existingKeys.has(`${finalKey}_${counter}`)) counter++;
        finalKey = `${finalKey}_${counter}`;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO prompt_library (prompt_key, display_name, description, surface, system_prompt, user_prompt_template, variables, is_active, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 1)
       RETURNING *`,
      [
        finalKey,
        body.display_name ?? body.prompt_key,
        body.description ?? null,
        body.surface ?? 'general',
        body.system_prompt.trim(),
        body.user_prompt_template ?? null,
        body.variables ? JSON.stringify(body.variables) : null,
      ],
    );

    return reply.status(201).send(successEnvelope(rows[0], req.requestId));
  });

  // POST /v3/prompts/:key/restore/:version — restore a previous version
  app.post('/v3/prompts/:key/restore/:version', async (req, reply) => {
    const { key, version } = req.params as { key: string; version: string };
    const targetVersion = Number(version);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: current } = await client.query(
        `SELECT * FROM prompt_library WHERE prompt_key = $1`,
        [key],
      );

      if (!current.length) {
        await client.query('ROLLBACK');
        return reply.status(404).send(errorEnvelope('NOT_FOUND', `Prompt '${key}' not found`, req.requestId));
      }

      const currentPrompt = current[0] as {
        id: number;
        version: number;
        system_prompt: string;
        user_prompt_template: string | null;
      };

      const { rows: versionRows } = await client.query(
        `SELECT * FROM prompt_versions WHERE prompt_id = $1 AND version = $2`,
        [currentPrompt.id, targetVersion],
      );

      if (!versionRows.length) {
        await client.query('ROLLBACK');
        return reply.status(404).send(errorEnvelope('NOT_FOUND', `Version ${targetVersion} not found`, req.requestId));
      }

      const restoreFrom = versionRows[0] as {
        system_prompt: string;
        user_prompt_template: string | null;
      };

      // Save current as a version first
      await client.query(
        `INSERT INTO prompt_versions (prompt_id, version, system_prompt, user_prompt_template, changed_by, change_note)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [currentPrompt.id, currentPrompt.version, currentPrompt.system_prompt, currentPrompt.user_prompt_template, 'admin', `Restored from v${targetVersion}`],
      );

      // Restore
      const newVersion = currentPrompt.version + 1;
      const { rows: updated } = await client.query(
        `UPDATE prompt_library
         SET system_prompt = $1, user_prompt_template = $2, version = $3, updated_at = NOW()
         WHERE prompt_key = $4
         RETURNING *`,
        [restoreFrom.system_prompt, restoreFrom.user_prompt_template, newVersion, key],
      );

      await client.query('COMMIT');
      return reply.send(successEnvelope(updated[0], req.requestId));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
}
