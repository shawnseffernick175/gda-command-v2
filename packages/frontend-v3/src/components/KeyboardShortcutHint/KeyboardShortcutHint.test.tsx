import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { KeyboardShortcutHint } from './KeyboardShortcutHint';

describe('KeyboardShortcutHint', () => {
  it('renders keys as kbd elements', () => {
    render(<KeyboardShortcutHint keys={['Ctrl', 'K']} />);
    const kbds = screen.getAllByText(/Ctrl|K/);
    expect(kbds).toHaveLength(2);
    kbds.forEach((el) => expect(el.tagName).toBe('KBD'));
  });

  it('renders label when provided', () => {
    render(<KeyboardShortcutHint keys={['Ctrl', 'P']} label="Print" />);
    expect(screen.getByText('Print')).toBeInTheDocument();
  });

  it('renders without label', () => {
    const { container } = render(<KeyboardShortcutHint keys={['Esc']} />);
    expect(container.querySelector('kbd')).toBeInTheDocument();
    expect(screen.getByText('Esc')).toBeInTheDocument();
  });
});
