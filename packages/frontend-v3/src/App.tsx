import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell/AppShell";
import { LeftRail } from "./components/LeftRail/LeftRail";
import { MainCanvas } from "./components/MainCanvas/MainCanvas";
import { PlaceholderSurface } from "./components/PlaceholderSurface/PlaceholderSurface";
import { PipelineSurface } from "./surfaces/pipeline/PipelineSurface";
import { useUiStore } from "./stores/ui-store";

export function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <AppShell>
      <LeftRail collapsed={!sidebarOpen} onToggle={toggleSidebar} />
      <MainCanvas>
        <Routes>
          <Route index element={<Navigate to="/launchpad" replace />} />
          <Route path="/launchpad" element={<PlaceholderSurface name="Launchpad" />} />
          <Route path="/fast-track" element={<PlaceholderSurface name="Fast Track" />} />
          <Route path="/opportunities" element={<PlaceholderSurface name="Opportunities" />} />
          <Route path="/opp/:notice_id" element={<PlaceholderSurface name="Opportunity Detail" />} />
          <Route path="/capture" element={<PlaceholderSurface name="Capture" />} />
          <Route path="/capture/:opp_id" element={<PlaceholderSurface name="Capture Detail" />} />
          <Route path="/pipeline" element={<PipelineSurface />} />
          <Route path="/action-items" element={<PlaceholderSurface name="Action Items" />} />
          <Route path="/settings/*" element={<PlaceholderSurface name="Settings" />} />
        </Routes>
      </MainCanvas>
    </AppShell>
  );
}
