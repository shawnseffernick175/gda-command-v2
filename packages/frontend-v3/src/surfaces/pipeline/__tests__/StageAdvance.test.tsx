import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StageSelector } from '../StageSelector';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('StageAdvance', () => {
  it('renders stage selector with current value', () => {
    render(
      wrap(<StageSelector currentStage="capture" onAdvance={vi.fn()} />),
    );
    const select = screen.getByTestId('stage-selector') as HTMLSelectElement;
    expect(select.value).toBe('capture');
  });

  it('non-terminal stage change fires onAdvance immediately', () => {
    const onAdvance = vi.fn();
    render(wrap(<StageSelector currentStage="identified" onAdvance={onAdvance} />));
    fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'qualified' } });
    expect(onAdvance).toHaveBeenCalledWith('qualified');
  });

  it('terminal stage (awarded) requires confirm modal', () => {
    const onAdvance = vi.fn();
    render(wrap(<StageSelector currentStage="submitted" onAdvance={onAdvance} />));
    fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'awarded' } });
    expect(onAdvance).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Move to Awarded?')).toBeInTheDocument();
  });

  it('terminal stage (lost) requires confirm modal', () => {
    const onAdvance = vi.fn();
    render(wrap(<StageSelector currentStage="submitted" onAdvance={onAdvance} />));
    fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'lost' } });
    expect(onAdvance).not.toHaveBeenCalled();
    expect(screen.getByText('Move to Lost?')).toBeInTheDocument();
  });

  it('terminal stage (no-bid) requires confirm modal', () => {
    const onAdvance = vi.fn();
    render(wrap(<StageSelector currentStage="identified" onAdvance={onAdvance} />));
    fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'no-bid' } });
    expect(onAdvance).not.toHaveBeenCalled();
    expect(screen.getByText('Move to No-Bid?')).toBeInTheDocument();
  });

  it('clicking Confirm in modal fires onAdvance', () => {
    const onAdvance = vi.fn();
    render(wrap(<StageSelector currentStage="submitted" onAdvance={onAdvance} />));
    fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'awarded' } });
    fireEvent.click(screen.getByText('Confirm'));
    expect(onAdvance).toHaveBeenCalledWith('awarded');
  });

  it('clicking Cancel in modal does not fire onAdvance', () => {
    const onAdvance = vi.fn();
    render(wrap(<StageSelector currentStage="submitted" onAdvance={onAdvance} />));
    fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'awarded' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('same-stage selection does nothing', () => {
    const onAdvance = vi.fn();
    render(wrap(<StageSelector currentStage="capture" onAdvance={onAdvance} />));
    fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'capture' } });
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
