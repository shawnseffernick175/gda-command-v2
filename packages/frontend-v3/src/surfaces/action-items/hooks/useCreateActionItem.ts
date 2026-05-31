import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActionItemCreatePayload, ActionItemMutationResponse, ActionItem } from '../types';

async function createActionItem(payload: ActionItemCreatePayload): Promise<ActionItem> {
  const res = await fetch('/v3/action-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, unknown>).message as string ?? `POST failed: ${res.status}`);
  }
  const json: ActionItemMutationResponse = await res.json();
  return json.data;
}

export function useCreateActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createActionItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-items'] });
    },
  });
}
