import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InputForm } from './InputForm';
import { ResultPanel } from './ResultPanel';
import { HistoryList } from './HistoryList';
import { TimeoutBanner } from './TimeoutBanner';
import { useFastTrackSubmit } from './api';
import { useRecentHistory, useFastTrackById } from './hooks';
import type { FastTrackInput, FastTrackResult } from './types';

type ViewState =
  | { kind: 'empty' }
  | { kind: 'result'; data: FastTrackResult }
  | { kind: 'timeout'; lastInput: FastTrackInput };

export function FastTrack() {
  const [searchParams] = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>({ kind: 'empty' });
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [lastInput, setLastInput] = useState<FastTrackInput | null>(null);

  const submitMutation = useFastTrackSubmit();
  const history = useRecentHistory(cursor);
  const byIdQuery = useFastTrackById(selectedId);

  useEffect(() => {
    if (byIdQuery.data) {
      setViewState({ kind: 'result', data: byIdQuery.data });
    }
  }, [byIdQuery.data]);

  const handleSubmit = useCallback((input: FastTrackInput) => {
    setLastInput(input);
    setSelectedId(null);
    submitMutation.mutate(input, {
      onSuccess: (outcome) => {
        if (outcome.kind === 'result') {
          setViewState({ kind: 'result', data: outcome.data });
        } else {
          setViewState({ kind: 'timeout', lastInput: input });
        }
      },
    });
  }, [submitMutation]);

  const handleRetry = useCallback(() => {
    if (viewState.kind === 'timeout') {
      handleSubmit(viewState.lastInput);
    } else if (lastInput) {
      handleSubmit(lastInput);
    }
  }, [viewState, lastInput, handleSubmit]);

  const handleCancel = useCallback(() => {
    setViewState({ kind: 'empty' });
  }, []);

  const handleSelectHistory = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (history.data?.next_cursor) {
      setCursor(history.data.next_cursor);
    }
  }, [history.data?.next_cursor]);

  const isSubmitting = submitMutation.isPending;

  return (
    <div className="flex flex-col gap-6 py-6">
      <h1 className="text-xl font-semibold text-ink-primary">Fast Track</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <InputForm
            onSubmit={handleSubmit}
            disabled={isSubmitting}
            isSubmitting={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-4">
          {viewState.kind === 'result' && (
            <ResultPanel result={viewState.data} />
          )}

          {viewState.kind === 'timeout' && (
            <TimeoutBanner onRetry={handleRetry} onCancel={handleCancel} />
          )}

          {viewState.kind === 'empty' && (
            <HistoryList
              items={history.data?.items || []}
              isLoading={history.isLoading}
              nextCursor={history.data?.next_cursor || null}
              onLoadMore={handleLoadMore}
              onSelect={handleSelectHistory}
            />
          )}
        </div>
      </div>
    </div>
  );
}
