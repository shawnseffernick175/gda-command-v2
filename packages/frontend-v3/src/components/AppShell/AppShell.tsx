import type { AppShellProps } from '../../types';
import { TopBar } from '../TopBar/TopBar';

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen bg-canvas text-ink-primary">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
