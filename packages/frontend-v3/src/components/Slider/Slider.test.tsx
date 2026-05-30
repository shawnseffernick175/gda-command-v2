import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Slider } from './Slider';

describe('Slider', () => {
  it('renders range input with correct attributes', () => {
    render(<Slider min={0} max={100} value={50} onChange={() => {}} />);
    const input = screen.getByRole('slider');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
    expect(input).toHaveValue('50');
  });

  it('calls onChange with new value', () => {
    const onChange = vi.fn();
    render(<Slider min={0} max={100} value={50} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('renders label when provided', () => {
    render(<Slider min={0} max={100} value={50} onChange={() => {}} label="Volume" />);
    expect(screen.getByText('Volume')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('renders as disabled', () => {
    render(<Slider min={0} max={100} value={50} onChange={() => {}} disabled />);
    expect(screen.getByRole('slider')).toBeDisabled();
  });
});
