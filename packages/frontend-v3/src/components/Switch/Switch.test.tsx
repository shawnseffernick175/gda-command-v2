import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('renders with label', () => {
    render(<Switch checked={false} onChange={() => {}} label="Dark mode" />);
    expect(screen.getByText('Dark mode')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('reflects checked state via aria-checked', () => {
    const { rerender } = render(<Switch checked={false} onChange={() => {}} label="Toggle" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch checked={true} onChange={() => {}} label="Toggle" />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange on click', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Toggle" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders as disabled', () => {
    render(<Switch checked={false} onChange={() => {}} label="Toggle" disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
