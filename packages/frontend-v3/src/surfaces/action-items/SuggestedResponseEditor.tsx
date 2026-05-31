import { useState } from 'react';
import { Button, Textarea } from '../../components';
import type { Draft, ActionItem } from './types';
import { useUpdateActionItem } from './hooks/useUpdateActionItem';
import { useRegenerateDraft } from './hooks/useRegenerateDraft';

interface SuggestedResponseEditorProps {
  item: ActionItem;
  draft: Draft | null;
}

export function SuggestedResponseEditor({ item, draft }: SuggestedResponseEditorProps) {
  const [text, setText] = useState(draft?.draft_text ?? '');
  const [dirty, setDirty] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const updateMutation = useUpdateActionItem();
  const regenerateMutation = useRegenerateDraft();

  const handleChange = (value: string) => {
    setText(value);
    setDirty(true);
  };

  const handleSave = () => {
    updateMutation.mutate({ id: item.id, payload: {} });
    setDirty(false);
  };

  const handleUseResponse = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard not available in some envs
    }
    if (item.status === 'open') {
      updateMutation.mutate({ id: item.id, payload: { status: 'in_progress' } });
    }
  };

  const handleRegenerate = () => {
    setRegenerateError(null);
    regenerateMutation.mutate(
      { actionItemId: item.id, kind: draft?.kind ?? 'reply' },
      {
        onSuccess: (newDraft) => {
          setText(newDraft.draft_text);
          setDirty(false);
        },
        onError: (err) => {
          if (err instanceof Error && err.message === 'ANALYSIS_TIMEOUT') {
            setRegenerateError('Analysis timed out. Please try again.');
          } else {
            setRegenerateError('Failed to regenerate draft.');
          }
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="suggested-response-editor">
      <label className="text-xs uppercase tracking-[0.04em] text-ink-muted font-semibold">
        AI Suggested Response
      </label>
      <Textarea
        value={text}
        onChange={handleChange}
        rows={6}
        placeholder="No draft available"
      />
      {regenerateError && (
        <div className="text-xs text-critical" data-testid="regenerate-error">
          {regenerateError}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleUseResponse}
          disabled={!text}
        >
          Use this response
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={!dirty}
          loading={updateMutation.isPending}
        >
          Save
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRegenerate}
          loading={regenerateMutation.isPending}
        >
          Regenerate
        </Button>
      </div>
    </div>
  );
}
