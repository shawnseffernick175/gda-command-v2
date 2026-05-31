export type ActionItemStatus = 'open' | 'in_progress' | 'done';
export type ActionItemPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type ActionItemSource = 'email' | 'capture' | 'pipeline' | 'opportunity' | 'system' | 'manual' | 'sentinel' | 'n8n';

export interface DraftSource {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface Draft {
  id: string;
  action_item_id: string;
  kind: 'reply' | 'research' | 'milestone';
  draft_text: string;
  sources: DraftSource[];
  status: 'generating' | 'approved' | 'rejected';
  created_at: string;
}

export interface SourceRef {
  kind: string;
  title: string;
  url: string;
  retrieved_at: string;
}

export interface ActionItem {
  id: string;
  title: string;
  title_sources: SourceRef[];
  detail: string | null;
  detail_sources: SourceRef[];
  owner: string;
  owner_sources: SourceRef[];
  status: ActionItemStatus;
  due_date: string | null;
  due_date_sources: SourceRef[];
  source: string;
  linked_record_type: string | null;
  linked_record_id: string | null;
  drafts: Draft[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionItemListResponse {
  success: boolean;
  data: {
    items: ActionItem[];
    pagination: {
      limit: number;
      cursor: string | null;
      hasMore: boolean;
    };
  };
}

export interface ActionItemMutationResponse {
  success: boolean;
  data: ActionItem;
}

export interface DraftResponse {
  success: boolean;
  data: Draft;
}

export interface ActionItemCreatePayload {
  title: string;
  detail?: string;
  owner: string;
  source?: string;
  due_date?: string;
  linked_record_type?: string;
  linked_record_id?: string;
}

export interface ActionItemUpdatePayload {
  status?: ActionItemStatus;
  owner?: string;
  due_date?: string | null;
  linked_record_type?: string | null;
  linked_record_id?: string | null;
  force?: boolean;
}

export type SortField = 'due_date' | 'created_at' | 'title' | 'status' | 'source';
export type SortDir = 'asc' | 'desc';

export interface ActionItemFilters {
  status?: string;
  source?: string;
  owner?: string;
  linked_record_type?: string;
}
