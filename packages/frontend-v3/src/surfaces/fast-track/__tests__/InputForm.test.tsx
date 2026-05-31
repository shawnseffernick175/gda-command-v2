import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InputForm } from '../InputForm';

function renderForm(props?: Partial<Parameters<typeof InputForm>[0]>) {
  const defaultProps = {
    onSubmit: vi.fn(),
    disabled: false,
    isSubmitting: false,
  };
  return render(<InputForm {...defaultProps} {...props} />);
}

describe('InputForm', () => {
  it('has visible labels with matching htmlFor for all fields', () => {
    renderForm();
    const titleLabel = screen.getByText('Title *');
    expect(titleLabel.tagName).toBe('LABEL');
    expect(titleLabel).toHaveAttribute('for', 'ft-title');

    const descLabel = screen.getByText('Description *');
    expect(descLabel.tagName).toBe('LABEL');
    expect(descLabel).toHaveAttribute('for', 'ft-description');
  });

  it('disables submit when form is submitting', () => {
    renderForm({ isSubmitting: true });
    const btn = screen.getByRole('button', { name: /analyzing/i });
    expect(btn).toBeDisabled();
  });

  it('shows validation error when submitting empty form', () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.click(screen.getByRole('button', { name: /triage opportunity/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });

  it('adds NAICS code chip on Enter', () => {
    renderForm();
    const input = screen.getByLabelText(/naics/i);
    fireEvent.change(input, { target: { value: '541330' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('541330')).toBeInTheDocument();
  });

  it('rejects invalid NAICS code (not 6 digits)', () => {
    renderForm();
    const input = screen.getByLabelText(/naics/i);
    fireEvent.change(input, { target: { value: '123' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText(/must be exactly 6 digits/i)).toBeInTheDocument();
  });

  it('aria-busy is set on submit button when submitting', () => {
    renderForm({ isSubmitting: true });
    const btn = screen.getByRole('button', { name: /analyzing/i });
    expect(btn).toHaveAttribute('aria-busy', 'true');
  });
});
