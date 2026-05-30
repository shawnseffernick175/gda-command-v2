import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../Button/Button';
import { IconButton } from '../IconButton/IconButton';
import { Link } from '../Link/Link';
import { TextField } from '../TextField/TextField';
import { Textarea } from '../Textarea/Textarea';
import { Checkbox } from '../Checkbox/Checkbox';
import { Switch } from '../Switch/Switch';
import { Slider } from '../Slider/Slider';
import { Card } from '../Card/Card';
import { Panel } from '../Panel/Panel';
import { Tabs } from '../Tabs/Tabs';
import { Dialog } from '../Dialog/Dialog';
import { Toast } from '../Toast/Toast';
import { KeyboardShortcutHint } from '../KeyboardShortcutHint/KeyboardShortcutHint';
import { EmptyState } from '../EmptyState/EmptyState';
import { ErrorState } from '../ErrorState/ErrorState';
import { Skeleton } from '../Skeleton/Skeleton';
import { StageIndicator } from '../StageIndicator/StageIndicator';
import { Tooltip } from '../Tooltip/Tooltip';
import { Inspector } from '../Inspector/Inspector';
import { AppShell } from '../AppShell/AppShell';
import { TopBar } from '../TopBar/TopBar';
import { LeftRail } from '../LeftRail/LeftRail';
import { MainCanvas } from '../MainCanvas/MainCanvas';

describe('Button', () => {
  it('renders with correct variant', () => {
    render(<Button variant="primary">Click</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button variant="primary" disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    render(<Button variant="primary" loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('IconButton', () => {
  it('renders with aria-label', () => {
    render(<IconButton icon={<span>X</span>} aria-label="Close" />);
    expect(screen.getByLabelText('Close')).toBeInTheDocument();
  });
});

describe('Link', () => {
  it('renders as internal link by default', () => {
    render(<Link href="/test">Test</Link>);
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('target');
  });

  it('renders as external link with target blank', () => {
    render(<Link href="https://sam.gov" external>SAM</Link>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('TextField', () => {
  it('renders with label', () => {
    render(<TextField label="Name" value="" onChange={() => {}} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows error message', () => {
    render(<TextField label="Email" value="" error="Required" onChange={() => {}} />);
    expect(screen.getByText('Required')).toBeInTheDocument();
  });

  it('calls onChange', () => {
    const onChange = vi.fn();
    render(<TextField value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } });
    expect(onChange).toHaveBeenCalledWith('test');
  });
});

describe('Textarea', () => {
  it('renders with label', () => {
    render(<Textarea label="Notes" value="" onChange={() => {}} />);
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });
});

describe('Checkbox', () => {
  it('renders checked state', () => {
    render(<Checkbox checked={true} label="Check" onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Switch', () => {
  it('renders checked state', () => {
    render(<Switch checked={true} label="Toggle" onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Slider', () => {
  it('renders with label', () => {
    render(<Slider min={0} max={100} value={50} label="Volume" onChange={() => {}} />);
    expect(screen.getByText('Volume')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Content</Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('renders title and children', () => {
    render(<Panel title="Summary">Content</Panel>);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('renders tabs with active indicator', () => {
    render(<Tabs items={[{ id: 'a', label: 'Tab A' }, { id: 'b', label: 'Tab B' }]} activeId="a" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Tab A' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Dialog', () => {
  it('renders when open', () => {
    render(<Dialog open title="Test" onClose={() => {}}>Content</Dialog>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<Dialog open={false} title="Test" onClose={() => {}}>Content</Dialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Toast', () => {
  it('renders message', () => {
    render(<Toast severity="info" message="Saved" />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});

describe('KeyboardShortcutHint', () => {
  it('renders keys', () => {
    render(<KeyboardShortcutHint keys={['Ctrl', 'K']} />);
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('renders title', () => {
    render(<ErrorState title="Error occurred" />);
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });
});

describe('Skeleton', () => {
  it('renders without error', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe('StageIndicator', () => {
  it('renders stage label', () => {
    render(<StageIndicator stage={2} />);
    expect(screen.getByText(/Capture Planning/)).toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('renders children', () => {
    render(<Tooltip content="Help"><span>Target</span></Tooltip>);
    expect(screen.getByText('Target')).toBeInTheDocument();
  });
});

describe('Inspector', () => {
  it('renders when open', () => {
    render(<Inspector open title="Detail" onClose={() => {}}>Content</Inspector>);
    expect(screen.getByText('Detail')).toBeInTheDocument();
  });
});

describe('Layout', () => {
  it('AppShell renders children', () => {
    render(<AppShell><div>Content</div></AppShell>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('TopBar renders brand', () => {
    render(<TopBar />);
    expect(screen.getByText('GDA Command')).toBeInTheDocument();
  });

  it('LeftRail renders nav', () => {
    render(<LeftRail>Nav</LeftRail>);
    expect(screen.getByText('Nav')).toBeInTheDocument();
  });

  it('MainCanvas renders content', () => {
    render(<MainCanvas>Main</MainCanvas>);
    expect(screen.getByText('Main')).toBeInTheDocument();
  });
});
