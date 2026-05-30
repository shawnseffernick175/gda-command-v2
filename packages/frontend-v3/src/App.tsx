import { AppShell } from './components/AppShell/AppShell';
import { LeftRail } from './components/LeftRail/LeftRail';
import { MainCanvas } from './components/MainCanvas/MainCanvas';
import { useState } from 'react';

export function App() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <AppShell>
      <LeftRail collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <MainCanvas>
        <h1 className="text-2xl font-semibold text-ink-primary">GDA Command V3</h1>
        <p className="text-sm text-ink-muted mt-2">Design system loaded. Surfaces are scaffolded in F-219 through F-225.</p>
      </MainCanvas>
    </AppShell>
  );
}
