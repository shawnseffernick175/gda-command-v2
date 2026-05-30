import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders message with correct role for error severity', () => {
    render(<Toast severity="error" message="Something went wrong" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders with status role for non-error severity', () => {
    render(<Toast severity="info" message="Update available" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders dismiss button and fires onDismiss', () => {
    const onDismiss = vi.fn();
    render(<Toast severity="info" message="Notice" onDismiss={onDismiss} />);
    const dismissBtn = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('hides dismiss button when dismissible=false', () => {
    render(<Toast severity="info" message="Sticky" dismissible={false} />);
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(<Toast severity="success" message="Done" action={{ label: 'Undo', onClick }} />);
    const actionBtn = screen.getByText('Undo');
    fireEvent.click(actionBtn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
