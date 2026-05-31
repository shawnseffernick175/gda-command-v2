import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Draft, DraftResponse } from '../types';

async function regenerateDraft(
  actionItemId: string,
  kind: 'reply' | 'research' | 'milestone',
): Promise<Draft> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`/v3/action-items/${actionItemId}/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
      signal: controller.signal,
    });

    if (res.status === 503) {
      throw new Error('ANALYSIS_TIMEOUT');
    }
    if (!res.ok) {
      throw new Error(`Regenerate failed: ${res.status}`);
    }

    const json: DraftResponse = await res.json();
    return json.data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('ANALYSIS_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function useRegenerateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actionItemId, kind }: { actionItemId: string; kind: 'reply' | 'research' | 'milestone' }) =>
      regenerateDraft(actionItemId, kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-items'] });
    },
  });
}
