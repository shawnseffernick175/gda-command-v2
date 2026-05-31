import type { ActionItem } from '../types';

/**
 * Detail is resolved from the list cache — no dedicated GET /:id route.
 * The caller passes the selected item from the list data.
 */
export function useActionItemDetail(item: ActionItem | null) {
  return { data: item, isLoading: false };
}
