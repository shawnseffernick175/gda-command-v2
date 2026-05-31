import { useState } from 'react';
import type { FastTrackInput } from './types';

const SET_ASIDE_OPTIONS = [
  '8(a)',
  'SDVOSB',
  'WOSB',
  'HUBZone',
  'Small',
  'Full & Open',
  'Other',
  'None',
] as const;

const NAICS_RE = /^\d{6}$/;

interface InputFormProps {
  onSubmit: (input: FastTrackInput) => void;
  disabled: boolean;
  isSubmitting: boolean;
}

export function InputForm({ onSubmit, disabled, isSubmitting }: InputFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [naicsInput, setNaicsInput] = useState('');
  const [naicsCodes, setNaicsCodes] = useState<string[]>([]);
  const [setAside, setSetAside] = useState<string | null>(null);
  const [pop, setPop] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim() || title.length > 500) e.title = 'Title is required (1-500 chars)';
    if (!description.trim() || description.length > 50000) e.description = 'Description is required (1-50,000 chars)';
    if (naicsCodes.length === 0) e.naics = 'At least one NAICS code is required';
    if (naicsCodes.length > 10) e.naics = 'Maximum 10 NAICS codes';
    if (pop.length > 200) e.pop = 'Max 200 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleAddNaics() {
    const code = naicsInput.trim();
    if (!NAICS_RE.test(code)) {
      setErrors((prev) => ({ ...prev, naics: 'NAICS code must be exactly 6 digits' }));
      return;
    }
    if (naicsCodes.includes(code)) {
      setErrors((prev) => ({ ...prev, naics: 'Code already added' }));
      return;
    }
    if (naicsCodes.length >= 10) {
      setErrors((prev) => ({ ...prev, naics: 'Maximum 10 codes' }));
      return;
    }
    setNaicsCodes((prev) => [...prev, code]);
    setNaicsInput('');
    setErrors((prev) => {
      const next = { ...prev };
      delete next.naics;
      return next;
    });
  }

  function handleRemoveNaics(code: string) {
    setNaicsCodes((prev) => prev.filter((c) => c !== code));
  }

  function handleNaicsKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddNaics();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      naics_codes: naicsCodes,
      set_aside: setAside,
      place_of_performance: pop.trim() || null,
    });
  }

  const formDisabled = disabled || isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="ft-title" className="text-xs text-ink-muted">Title *</label>
        <input
          id="ft-title"
          type="text"
          className={`h-8 rounded-sm border bg-surface px-2 text-sm text-ink-primary placeholder:text-ink-dim outline-none transition-colors ${errors.title ? 'border-critical' : 'border-border hover:border-border-strong focus:border-accent'} ${formDisabled ? 'opacity-50 pointer-events-none' : ''}`}
          placeholder="Opportunity title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={formDisabled}
          maxLength={500}
          aria-describedby={errors.title ? 'ft-title-error' : undefined}
          aria-invalid={!!errors.title}
        />
        {errors.title && <p id="ft-title-error" className="text-xs text-critical">{errors.title}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ft-description" className="text-xs text-ink-muted">Description *</label>
        <textarea
          id="ft-description"
          className={`rounded-sm border bg-surface px-2 py-2 text-sm text-ink-primary placeholder:text-ink-dim outline-none transition-colors resize-y min-h-[192px] ${errors.description ? 'border-critical' : 'border-border hover:border-border-strong focus:border-accent'} ${formDisabled ? 'opacity-50 pointer-events-none' : ''}`}
          placeholder="Paste opportunity description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={formDisabled}
          rows={8}
          aria-describedby={errors.description ? 'ft-description-error' : undefined}
          aria-invalid={!!errors.description}
        />
        {errors.description && <p id="ft-description-error" className="text-xs text-critical">{errors.description}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ft-naics" className="text-xs text-ink-muted">NAICS Codes * (6 digits each, Enter to add)</label>
        <div className="flex items-center gap-2">
          <input
            id="ft-naics"
            type="text"
            className={`flex-1 h-8 rounded-sm border bg-surface px-2 text-sm text-ink-primary placeholder:text-ink-dim outline-none transition-colors ${errors.naics ? 'border-critical' : 'border-border hover:border-border-strong focus:border-accent'} ${formDisabled ? 'opacity-50 pointer-events-none' : ''}`}
            placeholder="e.g. 541330"
            value={naicsInput}
            onChange={(e) => setNaicsInput(e.target.value)}
            onKeyDown={handleNaicsKeyDown}
            disabled={formDisabled}
            maxLength={6}
            aria-describedby={errors.naics ? 'ft-naics-error' : undefined}
            aria-invalid={!!errors.naics}
          />
          <button
            type="button"
            className="h-8 px-3 rounded-sm border border-border bg-surface text-sm text-ink-primary hover:bg-canvas transition-colors disabled:opacity-40 disabled:pointer-events-none"
            onClick={handleAddNaics}
            disabled={formDisabled}
          >
            Add
          </button>
        </div>
        {naicsCodes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {naicsCodes.map((code) => (
              <span key={code} className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border bg-surface-raised text-xs font-medium text-ink-primary">
                {code}
                {!formDisabled && (
                  <button
                    type="button"
                    className="text-ink-dim hover:text-ink-primary"
                    onClick={() => handleRemoveNaics(code)}
                    aria-label={`Remove ${code}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {errors.naics && <p id="ft-naics-error" className="text-xs text-critical">{errors.naics}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ft-set-aside" className="text-xs text-ink-muted">Set-aside</label>
        <select
          id="ft-set-aside"
          className={`h-8 rounded-sm border border-border bg-surface px-2 text-sm text-ink-primary outline-none transition-colors hover:border-border-strong focus:border-accent ${formDisabled ? 'opacity-50 pointer-events-none' : ''}`}
          value={setAside || ''}
          onChange={(e) => setSetAside(e.target.value || null)}
          disabled={formDisabled}
        >
          <option value="">None selected</option>
          {SET_ASIDE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ft-pop" className="text-xs text-ink-muted">Place of Performance</label>
        <input
          id="ft-pop"
          type="text"
          className={`h-8 rounded-sm border bg-surface px-2 text-sm text-ink-primary placeholder:text-ink-dim outline-none transition-colors ${errors.pop ? 'border-critical' : 'border-border hover:border-border-strong focus:border-accent'} ${formDisabled ? 'opacity-50 pointer-events-none' : ''}`}
          placeholder="e.g. Fort Belvoir, VA"
          value={pop}
          onChange={(e) => setPop(e.target.value)}
          disabled={formDisabled}
          maxLength={200}
          aria-describedby={errors.pop ? 'ft-pop-error' : undefined}
          aria-invalid={!!errors.pop}
        />
        {errors.pop && <p id="ft-pop-error" className="text-xs text-critical">{errors.pop}</p>}
      </div>

      <button
        type="submit"
        className="h-8 px-4 rounded-sm border border-accent bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"
        disabled={formDisabled}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <span className="inline-flex items-center gap-2">
            <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
            Analyzing…
          </span>
        ) : (
          'Triage Opportunity'
        )}
      </button>
    </form>
  );
}
