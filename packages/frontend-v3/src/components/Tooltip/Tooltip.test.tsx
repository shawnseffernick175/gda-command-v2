import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(<Tooltip content="Help text"><button>Hover me</button></Tooltip>);
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('does not show tooltip initially', () => {
    render(<Tooltip content="Help text"><span>Target</span></Tooltip>);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows tooltip on hover after delay', () => {
    render(<Tooltip content="Help text" delay={200}><span>Target</span></Tooltip>);
    const wrapper = screen.getByText('Target').closest('span')!;
    fireEvent.mouseEnter(wrapper);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Help text');
  });

  it('hides tooltip on mouse leave', () => {
    render(<Tooltip content="Help text" delay={0}><span>Target</span></Tooltip>);
    const wrapper = screen.getByText('Target').closest('span')!;
    fireEvent.mouseEnter(wrapper);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
