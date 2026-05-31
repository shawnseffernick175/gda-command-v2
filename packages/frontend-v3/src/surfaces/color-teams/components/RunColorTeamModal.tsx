import { useState } from 'react';
import { Dialog } from '../../../components/Dialog/Dialog';
import { Button } from '../../../components/Button/Button';
import { Checkbox } from '../../../components/Checkbox/Checkbox';
import { Switch } from '../../../components/Switch/Switch';
import { ALL_COLORS } from '../types';
import type { ColorTeamColor } from '../types';

const colorLabels: Record<ColorTeamColor, string> = {
  pink: 'Pink — Storyboard / Outline',
  red: 'Red — Draft Proposal Evaluation',
  black: 'Black — Adversarial Competitor Sim',
  blue: 'Blue — Customer Perspective',
  white: 'White — Compliance Sweep',
  green: 'Green — Executive / Final Pass',
};

interface RunColorTeamModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (colors: ColorTeamColor[], linkedRfpId?: string) => void;
  loading?: boolean;
}

export function RunColorTeamModal({ open, onClose, onSubmit, loading }: RunColorTeamModalProps) {
  const [selected, setSelected] = useState<Set<ColorTeamColor>>(new Set());
  const [runAll, setRunAll] = useState(false);

  const handleToggleAll = (checked: boolean) => {
    setRunAll(checked);
    if (checked) {
      setSelected(new Set(ALL_COLORS));
    } else {
      setSelected(new Set());
    }
  };

  const handleToggleColor = (color: ColorTeamColor, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(color);
    } else {
      next.delete(color);
    }
    setSelected(next);
    setRunAll(next.size === ALL_COLORS.length);
  };

  const handleSubmit = () => {
    const colors = runAll ? [...ALL_COLORS] : [...selected];
    if (colors.length === 0) return;
    onSubmit(colors);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Run Color Team Review"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={loading ?? false}
            disabled={selected.size === 0 && !runAll}
          >
            Run {runAll ? 'All Colors' : `${selected.size} Color${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="pb-3 border-b border-border">
          <Switch
            checked={runAll}
            onChange={handleToggleAll}
            label="Run All Colors"
          />
        </div>

        <div className="flex flex-col gap-3">
          {ALL_COLORS.map((color) => (
            <Checkbox
              key={color}
              checked={selected.has(color)}
              onChange={(checked) => handleToggleColor(color, checked)}
              label={colorLabels[color]}
            />
          ))}
        </div>

        <p className="text-xs text-ink-muted italic mt-2">
          Gold is not available. Green serves as the executive/final pass.
        </p>
      </div>
    </Dialog>
  );
}
