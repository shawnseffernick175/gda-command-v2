import { useState } from 'react';
import { Switch } from '../../components/Switch/Switch';
import { getTheme, setTheme } from '../../lib/theme';

export function Appearance() {
  const [isLight, setIsLight] = useState(getTheme() === 'light');

  const toggle = (checked: boolean) => {
    setIsLight(checked);
    setTheme(checked ? 'light' : 'dark');
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-semibold text-ink-primary mb-6">Appearance</h2>
      <div className="flex items-center justify-between p-4 rounded-md border border-border bg-surface">
        <div>
          <p className="text-sm font-medium text-ink-primary">Light theme</p>
          <p className="text-xs text-ink-muted mt-0.5">Switch to light mode. Dark is default.</p>
        </div>
        <Switch checked={isLight} onChange={toggle} label="" />
      </div>
    </div>
  );
}
