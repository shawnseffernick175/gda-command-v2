/**
 * Doctrine Settings (admin) — /v3/settings/doctrine
 * Lists all principles, exclusions, and config with inline editing.
 */

import { useState, useEffect } from 'react';
import { Button } from '../../components/Button/Button';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import { Textarea } from '../../components/Textarea/Textarea';
import {
  fetchPrinciples,
  fetchExclusions,
  fetchDoctrineConfig,
  updateDoctrineConfig,
} from './api';
import type { DoctrinePrinciple, DoctrineExclusion, DoctrineConfigRow } from './types';

function PrincipleCard({ principle }: { principle: DoctrinePrinciple }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="border border-border rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink-muted tabular-nums">
            #{principle.display_order}
          </span>
          <h4 className="text-sm font-semibold text-ink-primary">{principle.name}</h4>
        </div>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Close' : 'View prompt'}
        </button>
      </div>
      <p className="text-xs text-ink-muted italic">{principle.short_form}</p>
      <p className="text-xs text-ink-primary mt-1">{principle.long_form}</p>
      {editing && (
        <div className="mt-3 p-3 bg-bg rounded border border-border">
          <p className="text-[11px] text-ink-muted uppercase font-semibold mb-1">Evaluation Prompt</p>
          <p className="text-xs text-ink-primary whitespace-pre-wrap">{principle.evaluation_prompt}</p>
        </div>
      )}
    </div>
  );
}

function ExclusionCard({ exclusion }: { exclusion: DoctrineExclusion }) {
  const [showLogic, setShowLogic] = useState(false);

  return (
    <div className="border border-border rounded p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {exclusion.is_hard_block && (
            <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold border border-critical text-critical">
              HARD BLOCK
            </span>
          )}
          <h4 className="text-sm font-semibold text-ink-primary">{exclusion.name}</h4>
        </div>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => setShowLogic(!showLogic)}
        >
          {showLogic ? 'Close' : 'View trigger logic'}
        </button>
      </div>
      <p className="text-xs text-ink-primary">{exclusion.description}</p>
      <p className="text-[11px] text-ink-muted mt-1">
        Applies to: {exclusion.applies_to_ous.join(', ')}
        {exclusion.override_requires && ` · Override: ${exclusion.override_requires}`}
      </p>
      {showLogic && (
        <div className="mt-3 p-3 bg-bg rounded border border-border">
          <p className="text-[11px] text-ink-muted uppercase font-semibold mb-1">Trigger Logic Prompt</p>
          <p className="text-xs text-ink-primary whitespace-pre-wrap">{exclusion.trigger_logic_prompt}</p>
        </div>
      )}
    </div>
  );
}

function ConfigEditor({ row, onSave }: { row: DoctrineConfigRow; onSave: (key: string, value: unknown) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(JSON.stringify(row.value, null, 2));

  const handleSave = () => {
    try {
      const parsed = JSON.parse(draft) as unknown;
      onSave(row.key, parsed);
      setEditing(false);
    } catch {
      // invalid JSON — don't save
    }
  };

  return (
    <div className="border border-border rounded p-4">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-medium text-ink-primary font-mono">{row.key}</h4>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>
      {row.description && (
        <p className="text-xs text-ink-muted mb-2">{row.description}</p>
      )}
      {!editing ? (
        <p className="text-xs text-ink-primary font-mono bg-bg rounded p-2">
          {JSON.stringify(row.value)}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            label="Value (JSON)"
            value={draft}
            onChange={(val) => setDraft(val)}
            rows={3}
          />
          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSave}>Save</Button>
          </div>
        </div>
      )}
      <p className="text-[11px] text-ink-muted mt-1">
        Updated: {new Date(row.updated_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
      </p>
    </div>
  );
}

export function DoctrineSettings() {
  const [principles, setPrinciples] = useState<DoctrinePrinciple[]>([]);
  const [exclusions, setExclusions] = useState<DoctrineExclusion[]>([]);
  const [configRows, setConfigRows] = useState<DoctrineConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'principles' | 'exclusions' | 'config'>('principles');

  useEffect(() => {
    void (async () => {
      try {
        const [p, e, c] = await Promise.all([
          fetchPrinciples(),
          fetchExclusions(),
          fetchDoctrineConfig(),
        ]);
        setPrinciples(p);
        setExclusions(e);
        setConfigRows(c);
      } catch {
        // error handled by ApiError
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleConfigSave = async (key: string, value: unknown) => {
    try {
      const updated = await updateDoctrineConfig(key, value);
      setConfigRows((prev) => prev.map((r) => (r.key === key ? updated : r)));
    } catch {
      // error handled by ApiError
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton lines={6} />
      </div>
    );
  }

  const tabs = [
    { id: 'principles' as const, label: `Principles (${principles.length})` },
    { id: 'exclusions' as const, label: `Exclusions (${exclusions.length})` },
    { id: 'config' as const, label: 'Config' },
  ];

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="doctrine-settings">
      <div>
        <h2 className="text-xl font-semibold text-ink-primary">Doctrine Rules Engine</h2>
        <p className="text-sm text-ink-muted mt-1">
          8 Doctrine Principles + 6 Strategic Exclusions + Margin Floor + Evidence Rubric
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-ink-primary border-b-2 border-accent'
                : 'text-ink-muted hover:text-ink-primary'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'principles' && (
        <div className="flex flex-col gap-3">
          {principles.map((p) => (
            <PrincipleCard key={p.id} principle={p} />
          ))}
        </div>
      )}

      {activeTab === 'exclusions' && (
        <div className="flex flex-col gap-3">
          {exclusions.map((e) => (
            <ExclusionCard key={e.id} exclusion={e} />
          ))}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="flex flex-col gap-3">
          {configRows.map((r) => (
            <ConfigEditor key={r.key} row={r} onSave={handleConfigSave} />
          ))}
        </div>
      )}
    </div>
  );
}
