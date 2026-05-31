import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Textarea } from '../../components/Textarea/Textarea';
import { Dialog } from '../../components/Dialog/Dialog';

interface DoctrineOverrideModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (rationale: string) => void;
  title: string;
  description: string;
}

export function DoctrineOverrideModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
}: DoctrineOverrideModalProps) {
  const [rationale, setRationale] = useState('');
  const isValid = rationale.trim().length >= 50;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm(rationale.trim());
    setRationale('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{description}</p>
        <Textarea
          label="Override rationale (minimum 50 characters)"
          value={rationale}
          onChange={(val) => setRationale(val)}
          rows={4}
          placeholder="Provide written justification for overriding this doctrine rule..."
        />
        <p className="text-xs text-ink-muted">
          {rationale.trim().length}/50 characters minimum
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!isValid}>
            Submit Override
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
