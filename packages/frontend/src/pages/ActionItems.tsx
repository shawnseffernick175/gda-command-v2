import { useState, useEffect, useCallback } from "react";
import { authenticatedFetch } from "../api/auth";
import ActionItemRow from "../components/capture/ActionItemRow";
import NewActionItemModal from "../components/capture/NewActionItemModal";
import EmailPasteModal from "../components/capture/EmailPasteModal";

interface ActionItem {
  id: number;
  ou_tag: string;
  title: string;
  detail: string | null;
  owner_email: string;
  source: string;
  source_id: string | null;
  due_date: string | null;
  due_inferred_from: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  linked_record_type: string | null;
  linked_record_id: number | null;
  drafts: Draft[] | null;
}

interface Draft {
  id: number;
  action_item_id: number;
  kind: string;
  draft_text: string;
  status: string;
  created_at: string;
}

export default function ActionItems() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const fetchItems = useCallback(async (statusFilter?: string) => {
    try {
      const url = statusFilter
        ? `/api/action-items?status=${statusFilter}`
        : "/api/action-items";
      const res = await authenticatedFetch(url);
      const json = await res.json();
      if (json.success && json.data?.items) {
        return json.data.items as ActionItem[];
      }
      return [];
    } catch (err) {
      setError(String((err as Error).message));
      return [];
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [activeItems, doneItems] = await Promise.all([
      fetchItems(),
      fetchItems("done"),
    ]);
    setItems([...activeItems, ...doneItems]);
    setLoading(false);
  }, [fetchItems]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openItems = items.filter((i) => i.status === "open");
  const blockedItems = items.filter((i) => i.status === "blocked");
  const doneItems = items.filter((i) => i.status === "done");

  const handleStatusChange = async (
    itemId: number,
    newStatus: string,
  ) => {
    try {
      const res = await authenticatedFetch(`/api/action-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-gda-key": "header" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        await loadAll();
      }
    } catch {
      // non-fatal
    }
  };

  const handleApproveDraft = async (
    itemId: number,
    draftId: number,
  ) => {
    try {
      const res = await authenticatedFetch(
        `/api/action-items/${itemId}/approve-draft/${draftId}`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-gda-key": "header" } },
      );
      const json = await res.json();
      if (json.success) {
        await loadAll();
      }
    } catch {
      // non-fatal
    }
  };

  const handleEmailIngest = async (emailText: string) => {
    try {
      const payload = {
        from: "pasted@manual.input",
        to: "shawn@gda-command.local",
        subject: "",
        body_text: emailText,
        received_at: new Date().toISOString(),
      };
      const res = await authenticatedFetch("/api/action-items/ingest-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setShowEmailModal(false);
        await loadAll();
      }
    } catch (err) {
      setError(String((err as Error).message));
    }
  };

  const handleNewItem = async (data: {
    title: string;
    detail: string;
    owner_email: string;
    due_date: string;
  }) => {
    try {
      const res = await authenticatedFetch("/api/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gda-key": "header" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setShowNewModal(false);
        await loadAll();
      }
    } catch (err) {
      setError(String((err as Error).message));
    }
  };

  if (loading) {
    return (
      <div className="container-page py-8">
        <p className="text-muted text-body">Loading action items...</p>
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <h1 className="text-display text-ink">Action Items</h1>
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded bg-accent text-white text-caption font-semibold">
            {openItems.length}
          </span>
        </div>
        <button
          className="h-8 px-4 rounded text-[13px] font-medium bg-accent text-white border border-accent hover:bg-[#015C61] transition-colors duration-[120ms]"
          onClick={() => setShowNewModal(true)}
        >
          New Action Item
        </button>
      </div>
      <p className="text-caption text-muted italic mb-8">
        Doctrine: Relentless Execution &middot; Individual ownership, no
        committees
      </p>

      {error && (
        <div className="card border-l-4 border-l-critical mb-4 p-4">
          <p className="text-body text-ink">{error}</p>
          <button
            className="text-caption text-accent mt-2"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Email drop zone */}
      <div className="card mb-6">
        <div className="border-2 border-dashed border-border rounded p-6 text-center">
          <p className="text-body text-muted mb-2">
            Drop a forwarded email here to extract an action item.
          </p>
          <button
            className="h-8 px-4 rounded text-[13px] font-medium border border-border bg-white text-ink hover:bg-bg transition-colors duration-[120ms]"
            onClick={() => setShowEmailModal(true)}
          >
            Paste email text
          </button>
        </div>
      </div>

      {/* Open items */}
      <div className="mb-6">
        <h2 className="text-section text-ink mb-4">
          Open ({openItems.length})
        </h2>
        {openItems.length === 0 ? (
          <p className="text-body text-muted">No open action items.</p>
        ) : (
          <div className="space-y-2">
            {openItems.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
                onStatusChange={handleStatusChange}
                onApproveDraft={handleApproveDraft}
              />
            ))}
          </div>
        )}
      </div>

      {/* Blocked items */}
      {blockedItems.length > 0 && (
        <div className="mb-6">
          <h2 className="text-section text-ink mb-4">
            Blocked ({blockedItems.length})
          </h2>
          <div className="space-y-2">
            {blockedItems.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
                onStatusChange={handleStatusChange}
                onApproveDraft={handleApproveDraft}
              />
            ))}
          </div>
        </div>
      )}

      {/* Done items */}
      <div className="mb-6">
        {!showDone ? (
          <button
            className="text-body text-accent hover:underline"
            onClick={() => setShowDone(true)}
          >
            Show {doneItems.length} done items
          </button>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-section text-ink">
                Done ({doneItems.length})
              </h2>
              <button
                className="text-caption text-accent hover:underline"
                onClick={() => setShowDone(false)}
              >
                Hide
              </button>
            </div>
            <div className="space-y-2">
              {doneItems.map((item) => (
                <ActionItemRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() =>
                    setExpandedId(expandedId === item.id ? null : item.id)
                  }
                  onStatusChange={handleStatusChange}
                  onApproveDraft={handleApproveDraft}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {showNewModal && (
        <NewActionItemModal
          onClose={() => setShowNewModal(false)}
          onSubmit={handleNewItem}
        />
      )}

      {showEmailModal && (
        <EmailPasteModal
          onClose={() => setShowEmailModal(false)}
          onSubmit={handleEmailIngest}
        />
      )}
    </div>
  );
}
