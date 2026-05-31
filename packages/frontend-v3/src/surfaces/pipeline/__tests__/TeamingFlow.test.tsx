import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamingEditor } from '../TeamingEditor';
import type { PipelinePartner } from '../types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const existingPartner: PipelinePartner = {
  id: 'p1',
  name: 'Riverstone Solutions',
  role: 'partner',
  source_url: 'https://sam.gov/entity/riverstone',
};

describe('TeamingFlow', () => {
  it('renders sentinel banner when editor is open', () => {
    render(
      wrap(
        <TeamingEditor
          teaming="prime"
          partners={[]}
          onSave={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('sentinel-banner')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only add partners we are actively teaming with. No speculative partner entries.',
      ),
    ).toBeInTheDocument();
  });

  it('renders existing partners with source link', () => {
    render(
      wrap(
        <TeamingEditor
          teaming="prime"
          partners={[existingPartner]}
          onSave={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('Riverstone Solutions')).toBeInTheDocument();
    const sourceLink = screen.getByText('source →');
    expect(sourceLink).toHaveAttribute('data-source-url', 'https://sam.gov/entity/riverstone');
  });

  it('remove partner fires onSave with updated partner array', () => {
    const onSave = vi.fn();
    render(
      wrap(
        <TeamingEditor
          teaming="prime"
          partners={[existingPartner]}
          onSave={onSave}
        />,
      ),
    );
    fireEvent.click(screen.getByLabelText('Remove Riverstone Solutions'));
    fireEvent.click(screen.getByText('Save Teaming'));
    expect(onSave).toHaveBeenCalledWith('prime', []);
  });

  it('changing teaming role enables Save button', () => {
    const onSave = vi.fn();
    render(
      wrap(
        <TeamingEditor
          teaming="prime"
          partners={[]}
          onSave={onSave}
        />,
      ),
    );
    const saveBtn = screen.getByText('Save Teaming');
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Teaming role'), { target: { value: 'sub' } });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledWith('sub', []);
  });

  it('sentinel banner has role=alert', () => {
    render(
      wrap(
        <TeamingEditor
          teaming="prime"
          partners={[]}
          onSave={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
