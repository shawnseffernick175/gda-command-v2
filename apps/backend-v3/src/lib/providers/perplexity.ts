/**
 * Provider adapter — Perplexity (Source Research)
 *
 * Uses raw fetch to https://api.perplexity.ai/chat/completions.
 * No SDK installed per spec. Handles: source_research task only.
 *
 * PERPLEXITY_API_KEY is optional at startup — only throws at call time
 * if source_research is actually invoked without the key.
 */

export interface PerplexityCallResult {
  text: string;
  tokens_input: number;
  tokens_output: number;
  model: string;
}

/**
 * Call Perplexity sonar-pro for source research.
 * Throws if PERPLEXITY_API_KEY is missing (only at call time, not startup).
 */
export async function callPerplexity(opts: {
  model: string;
  query: string;
  context: string | null;
  timeout_ms: number;
}): Promise<PerplexityCallResult> {
  const apiKey = process.env['PERPLEXITY_API_KEY'];
  if (!apiKey) {
    throw Object.assign(
      new Error('PERPLEXITY_API_KEY not configured — source_research unavailable'),
      { status: 401, __routerNoRetry: true }
    );
  }

  const systemContent = 'You are a research assistant. Find relevant government contracting sources and return structured findings. Return JSON matching SourceResearchOutput: findings (array of {title, url, snippet, relevance_score}), summary, sources_consulted count.';

  const userContent = opts.context
    ? `Query: ${opts.query}\nContext: ${opts.context}`
    : `Query: ${opts.query}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout_ms);

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text().catch(() => '');
      throw Object.assign(new Error(`Perplexity API error: ${status} ${body}`), {
        status,
        code: status >= 500 ? 'PROVIDER_5XX' : undefined,
      });
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
      model: string;
    };

    const text = data.choices[0]?.message?.content ?? '';

    return {
      text,
      tokens_input: data.usage?.prompt_tokens ?? 0,
      tokens_output: data.usage?.completion_tokens ?? 0,
      model: data.model ?? opts.model,
    };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    const e = err as { name?: string; message?: string };
    if (e.name === 'AbortError') {
      throw Object.assign(new Error('Perplexity request timed out'), {
        code: 'ETIMEDOUT',
      });
    }
    throw Object.assign(new Error(e.message ?? 'Perplexity network error'), {
      code: 'ECONNRESET',
    });
  } finally {
    clearTimeout(timer);
  }
}
