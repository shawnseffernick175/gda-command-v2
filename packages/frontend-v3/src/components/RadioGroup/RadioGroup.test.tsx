import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RadioGroup } from './RadioGroup';

const options = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C', disabled: true },
];

describe('RadioGroup', () => {
  it('renders all options', () => {
    render(<RadioGroup value="a" onChange={() => {}} options={options} name="test" />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText('Option C')).toBeInTheDocument();
  });

  it('marks selected option as checked', () => {
    render(<RadioGroup value="a" onChange={() => {}} options={options} name="test" />);
    const radios = screen.getAllByRole('radio');
    const checkedRadio = radios.find((r) => r.getAttribute('aria-checked') === 'true');
    expect(checkedRadio).toBeDefined();
  });

  it('calls onChange when option clicked', () => {
    const onChange = vi.fn();
    render(<RadioGroup value="a" onChange={onChange} options={options} name="test" />);
    fireEvent.click(screen.getByText('Option B'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('disabled option does not trigger onChange', () => {
    const onChange = vi.fn();
    render(<RadioGroup value="a" onChange={onChange} options={options} name="test" />);
    const disabledLabel = screen.getByText('Option C').closest('label');
    expect(disabledLabel).toHaveClass('pointer-events-none');
  });
});
