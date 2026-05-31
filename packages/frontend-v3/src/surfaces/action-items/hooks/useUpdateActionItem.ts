import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActionItemUpdatePayload, ActionItemMutationResponse, ActionItem } from '../types';

async function patchActionItem(
  id: string,
  payload: ActionItemUpdatePayload,
): Promise<ActionItem> {
  const res = await fetch(`/v3/action-items/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, unknown>).message as string ?? `PATCH failed: ${res.status}`);
  }
  const json: ActionItemMutationResponse = await res.json();
  return json.data;
}

export function useUpdateActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ActionItemUpdatePayload }) =>
      patchActionItem(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-items'] });
    },
  });
}
